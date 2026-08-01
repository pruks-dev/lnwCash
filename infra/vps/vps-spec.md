# 🖥️ VPS Specification — LnwCash Wallet

เอกสารนี้เสนอสเปก VPS สำหรับ host LnwCash Wallet (Static SPA + Nginx)

---

## 📊 Load Analysis

### LnwCash คืออะไร?

- **Single Page Application** — client-side rendering, static files only
- **ไม่มี backend** — ไม่มี database, ไม่มี API server, ไม่มี server-side compute
- **การสื่อสารภายนอก** — ผู้ใช้เรียก Cashu mint API โดยตรง (client-side) — VPS ไม่ proxy
- **ไฟล์ที่ serve:** HTML, JS, CSS, SVG, PNG, JSON (manifest), SW script
- **ขนาด build output (dist/):** ~200 KB (gzip: ~60 KB)

### ปริมาณ Traffic (ประมาณการ)

| Stage | Concurrent Users | Requests/sec | Bandwidth |
|---|---|---|---|
| ช่วงเริ่มต้น | <100 | ~50 req/s | <1 Mbps |
| เติบโต | 100–500 | ~200 req/s | ~2 Mbps |
| โตเต็มที่ | 500–2,000 | ~500 req/s | ~5 Mbps |

Nginx สามารถ handle ได้หลายพัน req/s บน hardware ขนาดเล็ก — static file serving ใช้ทรัพยากรน้อยมาก

---

## 🎯 Recommended VPS Specs

### Option A: Minimum Spec (เริ่มต้น — พอเพียง)

| Resource | Spec | เหตุผล |
|---|---|---|
| **CPU** | 1 vCPU (shared) | Static file serving ใช้ CPU น้อย — single core ก็พอ |
| **RAM** | 512 MB | Nginx worker processes ใช้ ~20–50 MB, OS overhead ~200 MB |
| **Storage** | 10 GB SSD | ไฟล์ project <1 MB, OS + Nginx ~3 GB, log files |
| **Bandwidth** | 1 TB/month | เพียงพอสำหรับ traffic ระดับเริ่มต้น |
| **OS** | Ubuntu 22.04 LTS | Stable, LTS support ถึง 2032, community support ดี |
| **ราคาต่อเดือน** | ~150–250 THB | |

### Option B: Recommended Spec (แนะนำ — เผื่อโต)

| Resource | Spec | เหตุผล |
|---|---|---|
| **CPU** | 2 vCPU (shared) | เผื่อ HTTPS handshake, gzip compression, log rotation |
| **RAM** | 1 GB | เผื่อ buffer cache (Nginx ใช้ filesystem cache) และ OS updates |
| **Storage** | 25 GB SSD | เผื่อ log files ใหญ่ขึ้น, backup files, OS updates |
| **Bandwidth** | 2 TB/month | รองรับ traffic โต |
| **OS** | Ubuntu 24.04 LTS | ล่าสุด, support ถึง 2036 |
| **ราคาต่อเดือน** | ~300–500 THB | |

### Option C: Production Plus (ถ้า traffic โตมาก — ภายหลัง)

| Resource | Spec |
|---|---|
| **CPU** | 2 vCPU (dedicated) |
| **RAM** | 2 GB |
| **Storage** | 40 GB SSD |
| **Bandwidth** | 4 TB/month |
| **OS** | Ubuntu 24.04 LTS |
| **ราคาต่อเดือน** | ~600–900 THB |

---

## 🏢 Recommended VPS Providers

### 1. Vultr — Cloud Compute (Regular Performance)

| Plan | CPU | RAM | Storage | Bandwidth | ราคา/เดือน |
|---|---|---|---|---|---|
| **Starter** (minimum) | 1 vCPU | 512 MB | 10 GB | 0.5 TB | ~$6 (~210 THB) |
| **Basic** (recommended) | 1 vCPU | 1 GB | 25 GB | 2 TB | ~$12 (~420 THB) |

**ข้อดี:** Data center ใน Singapore (latency ต่ำ), Deploy เร็ว, UI ดี

### 2. DigitalOcean — Droplets

| Plan | CPU | RAM | Storage | Bandwidth | ราคา/เดือน |
|---|---|---|---|---|---|
| **Basic (minimum)** | 1 vCPU | 512 MB | 10 GB | 500 GB | ~$4 (~140 THB) |
| **Basic (recommended)** | 1 vCPU | 1 GB | 25 GB | 1 TB | ~$6 (~210 THB) |

**ข้อดี:** Data center ใน Singapore, Documentation ดี, Marketplace มี image pre-configured, Monitoring ฟรี

### 3. AWS Lightsail (ถ้าต้องการ AWS ecosystem)

| Plan | CPU | RAM | Storage | Bandwidth | ราคา/เดือน |
|---|---|---|---|---|---|
| **Minimum** | 1 vCPU | 512 MB | 20 GB | 1 TB | ~$3.50 (~120 THB) |
| **Recommended** | 1 vCPU | 1 GB | 40 GB | 2 TB | ~$5 (~175 THB) |

**ข้อดี:** Singapore region, Static IP ฟรี (1 ตัว), DNS management ในตัว, scaling ไป EC2 ได้

> **💡 แนะนำ DigitalOcean** — ราคาถูกที่สุด, setup ง่าย, มี marketplace สำหรับ Nginx, และ documentation ครอบคลุม

---

## ⚙️ VPS Setup Checklist (หลัง Provision)

เมื่อ Commander provision VPS แล้ว ให้ทำตาม checklist นี้:

- [ ] สร้าง VPS ใน data center **Singapore** (latency ต่ำสำหรับผู้ใช้ไทย)
- [ ] ตั้ง hostname: `lnw-cash`
- [ ] เพิ่ม SSH key (อย่าใช้ password login)
- [ ] Update packages: `apt update && apt upgrade -y`
- [ ] ตั้ง timezone: `timedatectl set-timezone Asia/Bangkok`
- [ ] ติดตั้ง Nginx: `apt install nginx -y`
- [ ] ตั้งค่า UFW firewall:
  ```bash
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw enable
  ```
- [ ] สร้าง deploy user: `adduser deployer && usermod -aG sudo deployer`
- [ ] เพิ่ม SSH key สำหรับ deployer
- [ ] ปิด SSH password authentication:
  ```bash
  # ใน /etc/ssh/sshd_config
  PasswordAuthentication no
  PubkeyAuthentication yes
  ```
- [ ] Setup unattended-upgrades (auto security patches):
  ```bash
  apt install unattended-upgrades -y
  dpkg-reconfigure --priority=low unattended-upgrades
  ```
- [ ] ติดตั้งและตั้งค่า logrotate สำหรับ Nginx logs
- [ ] Setup swap file (เผื่อ RAM ไม่พอ — 1 GB swap):
  ```bash
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```
- [ ] ติดตั้ง SSL certificate (Cloudflare Origin หรือ certbot — ดู `cloudflare-setup.md`)
- [ ] Deploy `nginx.conf` จาก repo → `/etc/nginx/sites-available/lnw.cash`
- [ ] `nginx -t` → `systemctl reload nginx`
- [ ] ทดสอบ: `curl -I http://<VPS_IP>/` → 200

---

## 📈 Scaling Plan (อนาคต)

เมื่อ traffic โตขึ้น — ทำตามลำดับนี้:

### Phase 1: Optimize Nginx
- เพิ่ม `worker_processes auto;`
- เพิ่ม `worker_connections 4096;`
- เพิ่ม `sendfile on; tcp_nopush on;`

### Phase 2: CDN (Cloudflare)
- เปิด Argo Smart Routing (เสียเงิน — $5/month + usage)
- ใช้ Cloudflare Workers หรือ Pages (ย้ายไป Cloudflare โดยตรง — ถ้า static ทั้งหมด)

### Phase 3: Load Balancer
- เพิ่ม VPS ตัวที่ 2
- ตั้ง Cloudflare Load Balancing (2 origins)
- ใช้ rsync หรือ shared storage

### Phase 4: Containerization (Optional)
- ย้ายไป Docker + Kubernetes (หากต้องการ scaling แบบอัตโนมัติ)

> **สำหรับตอนนี้:** VPS 1 ตัวก็เกินพอ — ไม่ต้องวางแผน scaling มากเกินไปตั้งแต่เริ่ม

---

## 💰 Estimated Monthly Cost Summary

| รายการ | ราคา (THB/เดือน) |
|---|---|
| VPS (DigitalOcean 1 GB) | ~210 |
| Domain `lnw.cash` (ต่อปี ÷ 12) | ~50 |
| Cloudflare (Free plan) | 0 |
| **รวม** | **~260 THB/เดือน** |

> ราคานี้ยังไม่รวมภาษีมูลค่าเพิ่ม (VAT 7% ถ้ามี)

---

> **Commander:** เลือก plan และ provider ที่เหมาะสม แล้วแจ้ง Brick เมื่อ VPS พร้อม — Brick จะดำเนินการ deploy ต่อ
