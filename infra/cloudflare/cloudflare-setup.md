# ☁️ Cloudflare Setup Guide — LnwCash Wallet

คู่มือนี้สำหรับ Commander ใช้ตั้งค่า Cloudflare ด้วยตนเอง — Brick (Deploy Agent) ไม่ดำเนินการตั้งค่า Cloudflare

---

## 🎯 เป้าหมาย

- Domain `lnw.cash` (และ `www.lnw.cash`) ชี้ไป VPS ผ่าน Cloudflare proxy
- SSL/TLS จาก user → Cloudflare → VPS เป็น end-to-end encryption
- ตั้งค่า cache rules ให้เหมาะสมกับ SPA (index.html ไม่ cache, assets cache นาน)
- Always HTTPS, ป้องกัน HTTP access

---

## 📋 ขั้นตอนที่ 1: Add Site เข้า Cloudflare

1. Login เข้า [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. คลิก **Add a Site**
3. ใส่ domain: `lnw.cash`
4. เลือก plan: **Free** (เพียงพอสำหรับ static SPA)
5. Cloudflare จะ scan DNS records เดิม — ข้ามไปก่อน (ยังไม่มี record)
6. Cloudflare จะให้ nameserver ใหม่มา 2 ตัว — ไปตั้งค่าที่ Domain Registrar

**ที่ Domain Registrar (เช่น Namecheap, GoDaddy, ชื่อโดเมน.ไทย):**
- เปลี่ยน nameserver เป็นของ Cloudflare:
  - `xxxx.ns.cloudflare.com`
  - `yyyy.ns.cloudflare.com`
- รอ propagation (อาจใช้เวลา 1-48 ชั่วโมง แต่ปกติ 5-15 นาที)

---

## 📋 ขั้นตอนที่ 2: DNS Records

เมื่อ nameserver propagation เสร็จแล้ว ตั้งค่า DNS records:

### Record 1: Root Domain (Apex)

| Field | Value |
|---|---|
| **Type** | `A` |
| **Name** | `@` (หรือ `lnw.cash`) |
| **IPv4 address** | `<VPS_IP_ADDRESS>` — Commander ใส่ IP VPS จริง |
| **Proxy status** | ✅ **Proxied** (ส้ม/ orange cloud) |
| **TTL** | Auto |

### Record 2: www Subdomain

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Name** | `www` |
| **Target** | `lnw.cash` |
| **Proxy status** | ✅ **Proxied** (ส้ม/ orange cloud) |
| **TTL** | Auto |

> **⚠️ สำคัญ:** ต้องเปิด Proxy (orange cloud) ทั้งสอง record — Cloudflare จะซ่อน IP VPS จริงจาก public

---

## 📋 ขั้นตอนที่ 3: SSL/TLS

ไปที่ **SSL/TLS → Overview**

### โหมดที่ต้องใช้: **Full (strict)**

| โหมด | คำอธิบาย | ใช้หรือไม่? |
|---|---|---|
| Off | ไม่มี HTTPS | ❌ |
| Flexible | Cloudflare → VPS ใช้ HTTP (ไม่เข้ารหัสระหว่างทำ) | ❌ |
| Full | Cloudflare → VPS ใช้ HTTPS (แต่ไม่ตรวจสอบ certificate validity) | ❌ |
| **Full (strict)** | Cloudflare → VPS ใช้ HTTPS **และตรวจสอบ certificate ว่าถูกต้อง** | ✅ **ใช้อันนี้!** |

### ทำไมต้อง Full (strict)?

- **Full (strict)** ตรวจสอบว่า certificate บน VPS เป็น certificate ที่ valid (ออกให้ domain จริง, ไม่ expired, signed by trusted CA)
- ป้องกัน MITM attack ระหว่าง Cloudflare ↔ VPS
- ถ้า certificate บน VPS ไม่ valid — Cloudflare จะปฏิเสธการเชื่อมต่อ (fail closed)
- สำหรับ LnwCash ซึ่งเป็น wallet app — ความปลอดภัยสำคัญที่สุด

### วิธีทำ Certificate บน VPS

**ตัวเลือกที่ 1: Cloudflare Origin Certificate (แนะนำ)**

1. ไปที่ **SSL/TLS → Origin Server**
2. คลิก **Create Certificate**
3. เลือก:
   - Private key type: **RSA (2048)** หรือ **ECDSA**
   - Hostnames: `lnw.cash`, `*.lnw.cash`
   - Certificate Validity: **15 years**
4. คลิก **Create**
5. เก็บ **Origin Certificate** (`.pem`) และ **Private Key** (`.key`) อย่างปลอดภัย
6. นำไปวางบน VPS:
   ```bash
   sudo mkdir -p /etc/nginx/ssl
   sudo nano /etc/nginx/ssl/lnw.cash.pem   # วาง Origin Certificate
   sudo nano /etc/nginx/ssl/lnw.cash.key   # วาง Private Key
   sudo chmod 600 /etc/nginx/ssl/lnw.cash.key
   ```
7. อัปเดต path ใน `nginx.conf` — เปลี่ยน `ssl_certificate` และ `ssl_certificate_key`

**ตัวเลือกที่ 2: Let's Encrypt (certbot)**

```bash
# ต้องปิด Cloudflare proxy ชั่วคราว (เปลี่ยนเป็น grey cloud)
# แล้วรัน:
sudo certbot --nginx -d lnw.cash -d www.lnw.cash
# หลังจากได้ certificate แล้ว ค่อยเปิด proxy กลับ
```

> **แนะนำตัวเลือกที่ 1 (Cloudflare Origin Certificate)** — ง่ายกว่า, ไม่ต้อง renew ทุก 90 วัน, proxy ไว้ตลอดได้

---

## 📋 ขั้นตอนที่ 4: Edge Certificates

ไปที่ **SSL/TLS → Edge Certificates**

ตั้งค่าดังนี้:

| Setting | Value |
|---|---|
| **Always Use HTTPS** | ✅ **ON** |
| **HTTP Strict Transport Security (HSTS)** | ✅ Enable (ดูรายละเอียดด้านล่าง) |
| **Minimum TLS Version** | **1.2** |
| **Opportunistic Encryption** | ON |
| **TLS 1.3** | ✅ **ON** |
| **Automatic HTTPS Rewrites** | ✅ **ON** |
| **Certificate Transparency Monitoring** | ✅ Enable |

### HSTS Settings:

| Field | Value |
|---|---|
| **Max Age** | 6 months (หรือ 12 months — เริ่มสั้นก่อนแล้วค่อยเพิ่ม) |
| **Include subdomains** | ✅ Enable |
| **Preload** | ❌ (ยังไม่ต้อง — รอให้ production stable ก่อน) |

---

## 📋 ขั้นตอนที่ 5: Cache Rules (สำหรับ SPA)

ไปที่ **Caching → Cache Rules**

### Rule 1: Index.html — Bypass Cache

```
When incoming requests match…
  URI Path → equals → /index.html
Then…
  Cache Status → Bypass cache
```

### Rule 2: Hashed Assets — Cache นาน ๆ

```
When incoming requests match…
  URI Path → starts with → /assets/
Then…
  Edge TTL → Override → 30 days
  Browser TTL → Override → 1 year
```

### Rule 3: Service Worker — Bypass Cache

```
When incoming requests match…
  URI Path → contains → sw.js
  OR URI Path → contains → workbox
  OR URI Path → contains → registerSW
Then…
  Cache Status → Bypass cache
```

### Rule 4: /health — Bypass Cache

```
When incoming requests match…
  URI Path → equals → /health
Then…
  Cache Status → Bypass cache
```

---

## 📋 ขั้นตอนที่ 6: Page Rules

> **หมายเหตุ:** Page Rules กำลังถูกแทนที่ด้วย Cache Rules (ขั้นตอนที่ 5) แต่ยังมีประโยชน์สำหรับบางกรณี

ไปที่ **Rules → Page Rules** — สร้าง rule:

### Rule: Cache Everything Except index.html

```
URL: lnw.cash/*
Setting: Cache Level → Cache Everything
Setting: Edge Cache TTL → 2 hours
```

> แต่ Cache Rules (ขั้นตอนที่ 5) จะ override Page Rules เมื่อใช้ร่วมกัน — ดังนั้นตั้ง Cache Rules เป็นหลัก

---

## 📋 ขั้นตอนที่ 7: API Token (สำหรับ CI/CD)

CI/CD workflow อาจต้องการ purge cache หลัง deploy — สร้าง API token:

1. ไปที่ **My Profile → API Tokens** (https://dash.cloudflare.com/profile/api-tokens)
2. คลิก **Create Token**
3. เลือก **Create Custom Token**

ตั้งค่าดังนี้:

| Field | Value |
|---|---|
| **Token name** | `LnwCash Deploy Token` |

**Permissions:**

| Permission Group | Permission | Zone/Account |
|---|---|---|
| Zone → Cache Purge | Purge | Zone: lnw.cash |
| Zone → DNS | Edit | Zone: lnw.cash |

**Zone Resources:** `Include → Specific zone → lnw.cash`

4. คลิก **Continue to summary** → **Create Token**
5. **เก็บ token ไว้ให้ดี** — จะแสดงครั้งเดียว!

จากนั้นเพิ่ม token เข้า GitHub Secrets:

| Secret Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | `<token ที่ได้>` |
| `CLOUDFLARE_ZONE_ID` | Zone ID ของ lnw.cash (ดูที่ Overview page) |

---

## 📋 ขั้นตอนที่ 8: ตรวจสอบความเรียบร้อย

หลังจากตั้งค่าทั้งหมด:

```bash
# 1. DNS ชี้ถูกต้อง (จาก local)
dig lnw.cash +short
# ควรตอบด้วย Cloudflare IP (104.x.x.x หรือ 172.x.x.x) — ไม่ใช่ IP VPS จริง

# 2. HTTPS ทำงาน
curl -I https://lnw.cash/
# ควรตอบ HTTP/2 200

# 3. HTTP redirect → HTTPS
curl -I http://lnw.cash/
# ควรตอบ 301 redirect ไป https://lnw.cash/

# 4. SPA routing ทำงาน
curl -I https://lnw.cash/wallet/send
# ควรตอบ 200 (ไม่ใช่ 404)

# 5. Health check
curl https://lnw.cash/health
# ควรตอบ {"status":"healthy","version":"..."}

# 6. Cloudflare headers ปรากฏ
curl -I https://lnw.cash/ 2>&1 | grep -i cf-
# ควรเห็น cf-ray, cf-cache-status
```

---

## 🚨 ข้อควรระวัง

1. **ห้าม disable Cloudflare proxy** (เปลี่ยนเป็น grey cloud) เป็นเวลานาน — จะ expose IP VPS จริง
2. **เมื่อ purge cache** — ควร purge เฉพาะ `/index.html` และ `/health` — ไม่ต้อง purge `/assets/` (เพราะมี content hash อยู่แล้ว)
3. **API token** มี scope จำกัด — ใช้เฉพาะสิ่งที่จำเป็น (DNS edit + Cache purge) — ไม่ใช้ Global API Key
4. **Development mode** — ถ้าต้อง test ให้เปิด Development Mode ชั่วคราว (ที่ Overview → Quick Actions) — จะ bypass cache ชั่วคราว 3 ชั่วโมง

---

> **Commander เป็นผู้ดำเนินการตั้งค่า Cloudflare เอง** — Brick Deploy Agent จะดูแลเฉพาะ Nginx config, deploy workflow, และ health checks
