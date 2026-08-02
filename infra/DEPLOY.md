# 🚀 คู่มือ Deploy — LNWCASH Wallet

คู่มือนี้ครอบคลุมการ deploy โปรเจกต์ LNWCASH ขึ้น VPS ตั้งแต่ zero จนขึ้น production

---

## 📋 ภาพรวมสถาปัตยกรรม

```
User → Cloudflare (DNS + SSL) → VPS (Nginx) → Static Files (dist/)
                                      ↑
                              GitHub Actions (CI/CD)
```

LNWCASH เป็น SPA (Single Page Application) ที่ build ออกมาเป็น static files เต็มรูปแบบ — ไม่มี backend, ไม่มี server-side rendering ไฟล์ที่ได้จาก `npm run build` จะอยู่ใน `dist/` ทั้งหมด

---

## 🔐 Dev HTTPS Setup

### ทำไมต้อง import cert

Web Crypto API ต้องการ Secure Context — ต้อง HTTPS เท่านั้น เราใช้ self-signed cert ใน dev environment ทำให้ browser ไม่เชื่อถือ cert → Service Worker ลงทะเบียนไม่สำเร็จ → PWA ฟีเจอร์ (offline cache, install) ใช้ไม่ได้ การ import cert เข้า browser trust store จะแก้ปัญหานี้

### Firefox

1. เปิด Preferences (`about:preferences`) → ค้นหา "Certificates" → คลิก "View Certificates"
2. เลือก tab "Servers" → คลิก "Import"
3. เลือกไฟล์ `cert/cert.pem` จากโปรเจกต์
4. ติ๊ก "Trust this CA to identify websites" → OK
5. ปิด Firefox แล้วเปิดใหม่ → เข้า `https://100.86.66.4:5173`
6. ตรวจสอบ: ไม่มีคำเตือน cert, Service Worker ลงทะเบียนแล้ว (DevTools → Application → Service Workers), ติดตั้ง PWA ได้

### Chrome / Chromium

1. เปิด Settings (`chrome://settings`) → Privacy and security → Security → Manage certificates
2. เลือก tab "Authorities" → คลิก "Import"
3. เลือกไฟล์ `cert/cert.pem` จากโปรเจกต์
4. ติ๊ก "Trust this certificate for identifying websites" → OK
5. ปิด Chrome แล้วเปิดใหม่ → เข้า `https://100.86.66.4:5173`
6. ตรวจสอบ: ไม่มีคำเตือน cert, Service Worker ลงทะเบียนแล้ว (DevTools → Application → Service Workers), ติดตั้ง PWA ได้

### การตรวจสอบ

- DevTools → Application → Service Workers → สถานะ "activated and running"
- DevTools → Application → Manifest → แสดง installability
- `isSecureContext === true` (ทดสอบใน Console)

### ปัญหาที่พบบ่อย

| ปัญหา | วิธีแก้ |
|-------|--------|
| Cert หมดอายุ | `openssl x509 -in cert/cert.pem -text -noout \| grep -A2 Validity` |
| SAN ไม่ตรง | รัน `bash scripts/generate-cert.sh` เพื่อสร้าง cert ใหม่ |
| ยังมีคำเตือน cert | เช็คว่า import ไฟล์ถูก — ใช้ `cert/cert.pem` ไม่ใช่ `cert/key.pem` |
| Firefox ยังเตือนหลัง import | ลบ cert เก่าใน Servers tab แล้ว import ใหม่ |

> **หมายเหตุ:** self-signed cert สำหรับ development เท่านั้น — production ใช้ Let's Encrypt หรือ Cloudflare Origin Certificate

---

## 🔧 Prerequisites

### บนเครื่องคุณ (สำหรับ deploy manual):
- **Node.js** >= 20 (ดู `.nvmrc` หรือ `package.json`)
- **npm** >= 10
- **Git**
- **SSH client** (`ssh`, `scp`, `rsync`)

### บน VPS (สำหรับ host):
- **OS:** Ubuntu 22.04 LTS (หรือใหม่กว่า)
- **Nginx** >= 1.24
- **SSH server** (เปิด port 22 หรือ custom port)
- **UFW firewall** (เปิดเฉพาะ port 22, 80, 443)
- **certbot** (สำหรับขอ SSL certificate — จริง ๆ แล้ว Cloudflare จัดการ SSL ให้ จึงอาจไม่ต้องใช้ certbot หากใช้ Cloudflare Origin Certificate)

---

## 🛠️ ขั้นตอนที่ 1: Clone และ Build (Local)

```bash
# Clone repo
git clone https://github.com/lnw-cash/lnw-cash.git
cd lnw-cash

# ติดตั้ง dependencies
npm ci

# Run tests (เช็คว่าทุกอย่างผ่าน)
npm run test

# Lint
npm run lint

# Build production
npm run build

# ตรวจสอบ output
ls -la dist/
# ควรเห็น: index.html, assets/, favicon.svg, sw.js, manifest.webmanifest, icon-*.png
```

---

## 🖥️ ขั้นตอนที่ 2: Setup VPS (ทำครั้งแรก)

### 2.1 SSH เข้า VPS

```bash
ssh root@<VPS_IP_ADDRESS>
```

> เปลี่ยน `<VPS_IP_ADDRESS>` เป็น IP จริงของ VPS

### 2.2 อัปเดตระบบ

```bash
apt update && apt upgrade -y
```

### 2.3 สร้าง user สำหรับ deploy

```bash
# สร้าง user (ไม่ควรใช้ root deploy)
adduser deployer
usermod -aG sudo deployer

# ตั้งค่า SSH key (บนเครื่อง local ของคุณ)
# จากเครื่อง local:
ssh-copy-id deployer@<VPS_IP_ADDRESS>

# ทดสอบ login
ssh deployer@<VPS_IP_ADDRESS>
```

### 2.4 ติดตั้ง Nginx

```bash
sudo apt install nginx -y

# ตรวจสอบว่า nginx ทำงาน
sudo systemctl status nginx

# เปิด firewall สำหรับ HTTP/HTTPS
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable

# ตรวจสอบ firewall
sudo ufw status
```

### 2.5 สร้าง directory สำหรับ deploy

```bash
# สร้าง path ที่จะใช้เก็บไฟล์
sudo mkdir -p /var/www/lnw.cash
sudo chown -R deployer:deployer /var/www/lnw.cash
```

### 2.6 ติดตั้งและตั้งค่า Nginx config

```bash
# คัดลอก nginx config ที่เราเตรียมไว้
sudo cp /home/deployer/lnw-cash/infra/nginx/nginx.conf /etc/nginx/sites-available/lnw.cash

# เปิดใช้งาน site
sudo ln -s /etc/nginx/sites-available/lnw.cash /etc/nginx/sites-enabled/

# ลบ default site
sudo rm /etc/nginx/sites-enabled/default

# ทดสอบ syntax
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## 🌐 ขั้นตอนที่ 3: Setup Cloudflare (ดูรายละเอียดใน `infra/cloudflare/cloudflare-setup.md`)

**สรุปสั้น ๆ:**
1. Add domain `lnw.cash` เข้า Cloudflare
2. เปลี่ยน nameserver ที่ registrar ให้ชี้ไป Cloudflare
3. ตั้ง DNS records:
   - `A` → `lnw.cash` → `<VPS_IP>` (Proxied ✅)
   - `CNAME` → `www` → `lnw.cash` (Proxied ✅)
4. SSL/TLS mode: **Full (strict)**
5. Always Use HTTPS: **ON**
6. ตั้ง Page Rules / Cache Rules สำหรับ SPA

---

## 🚚 ขั้นตอนที่ 4: Deploy (Manual — ครั้งแรก)

```bash
# จากเครื่อง local หลังจาก build แล้ว

# วิธีที่ 1: ใช้ rsync (แนะนำ — incremental, เร็ว)
rsync -avz --delete \
  -e "ssh" \
  ./dist/ \
  deployer@<VPS_IP>:/var/www/lnw.cash/

# วิธีที่ 2: ใช้ scp (ช้ากว่า แต่ไม่มี dependency เพิ่ม)
scp -r ./dist/* deployer@<VPS_IP>:/var/www/lnw.cash/
```

หลังจาก deploy เสร็จ:
```bash
# บน VPS — ตั้ง permission ให้ถูกต้อง
sudo chown -R www-data:www-data /var/www/lnw.cash/
sudo chmod -R 755 /var/www/lnw.cash/

# Reload nginx
sudo systemctl reload nginx
```

---

## ⚡ ขั้นตอนที่ 5: CI/CD (GitHub Actions)

เมื่อ VPS พร้อมแล้ว ให้ตั้งค่า GitHub Actions:

### 5.1 เพิ่ม Secrets ใน GitHub Repository

ไปที่ **Settings → Secrets and variables → Actions** แล้วเพิ่ม secrets ต่อไปนี้:

| Secret Name | คำอธิบาย | ตัวอย่าง |
|---|---|---|
| `SSH_HOST` | IP address ของ VPS | `203.0.113.1` |
| `SSH_USER` | SSH username | `deployer` |
| `SSH_PRIVATE_KEY` | Private SSH key (ใช้สำหรับ authentication) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_DEPLOY_PATH` | Path ที่เก็บไฟล์บน VPS | `/var/www/lnw.cash` |

### 5.2 วิธีสร้าง SSH Key สำหรับ Deploy

```bash
# สร้าง key pair (บนเครื่อง local หรือใน CI environment)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/lnw_cash_deploy

# เอา public key ไปใส่บน VPS
ssh-copy-id -i ~/.ssh/lnw_cash_deploy.pub deployer@<VPS_IP>

# เอา private key (เนื้อหาทั้งหมด) ไปใส่ใน GitHub Secret: SSH_PRIVATE_KEY
cat ~/.ssh/lnw_cash_deploy
```

### 5.3 เปิดใช้งาน Deploy Step

ในไฟล์ `.github/workflows/deploy.yml` — เปลี่ยนจาก `dry-run` เป็นโหมดจริง:

```yaml
# จากเดิม (โหมด dry-run — ไม่ deploy)
- name: Deploy to VPS
  if: false  # ← เปลี่ยนเป็น true หรือ comment บรรทัดนี้ออก
  ...

# เป็น
- name: Deploy to VPS
  run: |
    rsync -avz --delete ...
```

---

## 🏥 Health Check

เมื่อ deploy เสร็จ ทุกครั้งให้ตรวจสอบว่า app ทำงานปกติ:

```bash
# ตรวจสอบว่า Nginx ตอบ 200
curl -I https://lnw.cash/

# ตรวจสอบ health endpoint (static file)
curl -I https://lnw.cash/health

# เช็คว่า SPA routing ทำงาน (fallback to index.html)
curl -I https://lnw.cash/wallet/send
# ควรตอบ 200 (ไม่ใช่ 404) เพราะ SPA fallback
```

> **หมายเหตุ:** ไฟล์ `health` เป็น static file ที่ CI/CD จะสร้างให้อัตโนมัติ (หรือจะสร้างเองก็ได้):
> ```bash
> echo '{"status":"healthy","version":"'"$(git rev-parse --short HEAD)"'"}' > dist/health
> ```
> Nginx config ถูกตั้งค่าให้ `/health` ไม่ถูก cache และตอบด้วย content-type `application/json`

---

## 🔄 Rollback

หากมีปัญหาหลัง deploy:

```bash
# บน VPS — กลับไปใช้ build ก่อนหน้า
# (สมมติว่าเราเก็บ backup ไว้)
ssh deployer@<VPS_IP> "cp -r /var/www/lnw.cash.backup/* /var/www/lnw.cash/"
sudo systemctl reload nginx
```

CI/CD workflow จะสร้าง rollback tag และ backup ให้อัตโนมัติก่อน deploy ทุกครั้ง

---

## 📊 Checklist Deploy

- [ ] VPS provisioned และ SSH เข้าได้
- [ ] Nginx ติดตั้งและ config แล้ว (`nginx -t` ผ่าน)
- [ ] Firewall เปิด port 22, 80, 443
- [ ] Cloudflare DNS ชี้ถูกต้อง, SSL Full (strict)
- [ ] GitHub Secrets ตั้งค่าครบ 4 ตัว
- [ ] CI/CD deploy step เปิดใช้งานแล้ว (เอา `if: false` ออก)
- [ ] `/health` endpoint ตอบ 200
- [ ] SPA routing fallback ทำงาน (refresh หน้าแล้วไม่เป็น 404)

---

## 🔒 ความปลอดภัย

- **ห้าม** ใช้ root user ในการ deploy
- **ห้าม** commit private key หรือ secrets ลง repo
- **ห้าม** bypass Cloudflare SSL — ใช้ Full (strict) เสมอ
- SSH ควรใช้ key authentication เท่านั้น (ปิด password auth)
- หมั่นอัปเดต Nginx และ OS packages เป็นประจำ
