# คู่มือ Deploy — LNWCASH Wallet (v4 Local)

> สำหรับ deploy บนเครื่อง local ด้วย Nginx  
> Port 8080 | IP access only | ไม่ใช้ domain

---

## 1. ติดตั้ง Nginx

```bash
# ติดตั้ง Nginx (ถ้ายังไม่มี)
sudo apt update
sudo apt install -y nginx

# ตรวจสอบว่า Nginx ทำงานอยู่
sudo systemctl status nginx

# ถ้าไม่ได้ start หรือ disabled ให้ enable และ start
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 2. คัดลอก Config

```bash
# คัดลอก config จาก project ไปยัง Nginx
sudo cp /home/debian/arx-projects/lnw-cash/infra/nginx/nginx-v4-local.conf \
    /etc/nginx/sites-available/lnw-cash

# สร้าง symlink ไปที่ sites-enabled
sudo ln -s /etc/nginx/sites-available/lnw-cash /etc/nginx/sites-enabled/lnw-cash

# ลบ default site (ถ้ามี — ป้องกัน port clash)
sudo rm -f /etc/nginx/sites-enabled/default
```

> **หมายเหตุ:** ถ้ามี site อื่นใน `/etc/nginx/sites-enabled/` ที่ใช้ port 8080  
> ให้ disable หรือลบ site นั้นก่อน

---

## 3. ตรวจสอบ Config

```bash
# ตรวจสอบ syntax ของ config
sudo nginx -t
```

**ผลลัพธ์ที่คาดหวัง:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

> ถ้า test ไม่ผ่าน (fail) — **ห้าม reload/restart Nginx**  
> ให้ตรวจสอบข้อความ error แล้วแก้ config ก่อน

---

## 4. คัดลอก Build Artifact

```bash
# สร้าง directory ปลายทาง (ถ้ายังไม่มี)
sudo mkdir -p /var/www/lnw-cash/

# คัดลอกไฟล์จาก dist/ ไปยัง /var/www/lnw-cash/
sudo cp -r /home/debian/arx-projects/lnw-cash/dist/* /var/www/lnw-cash/

# ตั้งค่า permissions ให้ nginx user อ่านได้
sudo chown -R www-data:www-data /var/www/lnw-cash/
sudo chmod -R 755 /var/www/lnw-cash/
```

**ตรวจสอบว่าไฟล์ครบ:**
```bash
ls -la /var/www/lnw-cash/
# ควรเห็น: index.html, assets/, sw.js, manifest.webmanifest, health, ...
```

---

## 5. Reload/Restart Nginx

```bash
# Reload Nginx (graceful — ไม่ตัดการเชื่อมต่อ)
sudo systemctl reload nginx

# ตรวจสอบว่า Nginx ทำงานปกติ
sudo systemctl status nginx
```

> ถ้า reload ไม่ผ่าน ให้ใช้ `sudo systemctl restart nginx` แทน  
> หรือถ้ายัง fail: ตรวจสอบ error log ที่ `/var/log/nginx/error.log`

---

## 6. ตรวจสอบ Health

```bash
# ตรวจสอบ health endpoint
curl http://localhost:8080/health
```

**ผลลัพธ์ที่คาดหวัง:**
```json
{"status":"healthy","version":"0.1.0","timestamp":"2026-07-30T00:00:00+07:00"}
```

```bash
# ตรวจสอบ HTTP status code (ควรได้ 200)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health
```

```bash
# ตรวจสอบว่า index.html serve ได้
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
```

---

## 7. ทดสอบจาก Browser

เปิด Browser แล้วไปที่:

```
http://100.86.66.4:8080
```

**สิ่งที่ควรเห็น:**
- หน้าเว็บ LNWCASH Wallet แสดงผลถูกต้อง
- ไม่มี error ใน console (F12 → Console)
- Service Worker ลงทะเบียนสำเร็จ (F12 → Application → Service Workers)
- Icon และ assets โหลดครบ

---

## 8. Troubleshooting

### 8.1 Port 8080 ถูกใช้งานอยู่แล้ว

```bash
# ตรวจสอบว่า port 8080 ถูกใช้โดยอะไร
sudo ss -tlnp | grep 8080

# ตัวอย่าง output:
# LISTEN  0  128  0.0.0.0:8080  0.0.0.0:*  users:(("nginx",pid=1234,fd=6))
```

ถ้ามี process อื่นใช้อยู่:
```bash
# หยุด process นั้น (เปลี่ยน PID ตามจริง)
sudo kill 1234
# หรือเปลี่ยน port ใน nginx config แล้ว reload ใหม่
```

### 8.2 Permission Denied

```bash
# ตรวจสอบว่า nginx user (www-data) เข้าถึงไฟล์ได้หรือไม่
sudo -u www-data cat /var/www/lnw-cash/index.html

# ถ้า permission denied:
sudo chown -R www-data:www-data /var/www/lnw-cash/
# ถ้า path parent ไม่สามารถเข้าถึงได้:
sudo chmod 755 /var/www/
sudo chmod 755 /var/www/lnw-cash/
sudo chmod 755 /home/debian/arx-projects/lnw-cash/
sudo chmod 755 /home/debian/arx-projects/lnw-cash/dist/
```

### 8.3 Nginx Config Test Fail

```bash
# ดู error log
sudo tail -50 /var/log/nginx/error.log

# ปัญหาที่พบบ่อย:
# - "unknown directive" → ตรวจสอบ syntax, semicolons
# - "could not build server_names_hash" → เพิ่ม server_names_hash_bucket_size
# - "open() ... failed" → ไฟล์ root path ไม่มีอยู่จริง
```

### 8.4 Firewall บล็อก Port 8080

```bash
# ตรวจสอบ firewall rules
sudo ufw status

# ถ้าเปิด firewall อยู่ ให้ allow port 8080
sudo ufw allow 8080/tcp
sudo ufw reload
```

### 8.5 หน้าเว็บขาว / JavaScript Error

```bash
# ตรวจสอบว่า index.html serve ได้จริง
curl -I http://localhost:8080/

# ตรวจสอบว่า assets/ เข้าถึงได้
curl -I http://localhost:8080/assets/

# ตรวจสอบ SPA routing (path ทั้งหมดต้อง return index.html)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/some-random-path
# ควรได้ 200 (ไม่ใช่ 404)
```

---

## 9. Rollback

หากหลังจาก deploy แล้วเกิดปัญหา ให้ rollback ดังนี้:

### 9.1 กลับไปใช้ Config เดิม

```bash
# ตรวจสอบว่ามี backup config เดิมหรือไม่
ls -la /etc/nginx/sites-available/

# ถ้ามี config เดิม (เช่น lnw-cash.bak) ให้ restore
sudo cp /etc/nginx/sites-available/lnw-cash.bak \
    /etc/nginx/sites-available/lnw-cash

# หรือถ้าไม่มี backup — แก้ไข config กลับไปใช้ค่าเดิม
sudo nano /etc/nginx/sites-available/lnw-cash
```

### 9.2 ทดสอบและ Reload

```bash
# ทดสอบ config ที่แก้ไข
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 9.3 Rollback Build Artifact

```bash
# ถ้ามี backup ของ dist/ เก่า
sudo rm -rf /var/www/lnw-cash/
sudo cp -r /path/to/backup/lnw-cash/ /var/www/lnw-cash/
sudo chown -R www-data:www-data /var/www/lnw-cash/
```

### 9.4 ตรวจสอบหลัง Rollback

```bash
curl http://localhost:8080/health
# ควรได้ status 200
```

---

## สรุปคำสั่งที่ใช้บ่อย

| งาน | คำสั่ง |
|------|--------|
| ทดสอบ config | `sudo nginx -t` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Restart Nginx | `sudo systemctl restart nginx` |
| ดู status | `sudo systemctl status nginx` |
| ดู error log | `sudo tail -50 /var/log/nginx/error.log` |
| ตรวจสอบ health | `curl http://localhost:8080/health` |
| ตรวจสอบ port | `sudo ss -tlnp \| grep 8080` |

---

**Deploy Path:** `/home/debian/arx-projects/lnw-cash/`  
**Config:** `infra/nginx/nginx-v4-local.conf`  
**Target URL:** `http://100.86.66.4:8080`
