#!/bin/bash
# =============================================================================
# LnwCash Wallet — Local Deploy Script (DRY-RUN by default)
# =============================================================================
# โดย default script จะทำงานในโหมด DRY-RUN (แสดงเฉพาะสิ่งที่จะทำ ไม่ execute จริง)
#
# วิธีใช้:
#   ./scripts/deploy-local.sh                   # DRY-RUN mode (default)
#   ACTUALLY_DEPLOY=true ./scripts/deploy-local.sh  # Deploy จริง
# =============================================================================

set -euo pipefail

deploy_local() {
    local ACTUAL="${ACTUALLY_DEPLOY:-false}"

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║      LnwCash Wallet — Local Deploy Script (v4)              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""

    if [ "$ACTUAL" = "true" ]; then
        echo "⚠️  WARNING: ACTUALLY_DEPLOY=true — กำลัง deploy จริง"
        echo "   นี่ ไม่ใช่ dry-run — ระบบจะถูกเปลี่ยนแปลง"
        echo ""
    else
        echo "🔍 DRY-RUN MODE — แสดงเฉพาะสิ่งที่จะทำ โดยไม่เปลี่ยนแปลงระบบ"
        echo ""
    fi

    # ── Step 1: ตรวจสอบ ─────────────────────────────────────────────
    echo "🔍 DRY-RUN: กำลังตรวจสอบ..."
    echo "📁 Source: /home/debian/arx-projects/lnw-cash/dist/"
    echo "📁 Target: /var/www/lnw-cash/"
    echo "📋 Config: infra/nginx/nginx-v4-local.conf → /etc/nginx/sites-available/lnw-cash"
    echo ""

    # ── Step 2: คัดลอก build artifact ───────────────────────────────
    if [ "$ACTUAL" = "true" ]; then
        echo "⚡ [ACTUAL] คัดลอก build ไปยัง /var/www/lnw-cash/ ..."
        sudo mkdir -p /var/www/lnw-cash/
        sudo cp -r /home/debian/arx-projects/lnw-cash/dist/* /var/www/lnw-cash/
        sudo chown -R www-data:www-data /var/www/lnw-cash/
        echo "✅ คัดลอกไฟล์เสร็จสิ้น"
    else
        echo "  [DRY-RUN] sudo mkdir -p /var/www/lnw-cash/"
        echo "  [DRY-RUN] sudo cp -r dist/* /var/www/lnw-cash/"
        echo "  [DRY-RUN] sudo chown -R www-data:www-data /var/www/lnw-cash/"
    fi
    echo ""

    # ── Step 3: ติดตั้ง Nginx config ────────────────────────────────
    if [ "$ACTUAL" = "true" ]; then
        echo "⚡ [ACTUAL] ติดตั้ง Nginx config..."
        sudo cp /home/debian/arx-projects/lnw-cash/infra/nginx/nginx-v4-local.conf \
            /etc/nginx/sites-available/lnw-cash
    else
        echo "  [DRY-RUN] sudo cp infra/nginx/nginx-v4-local.conf /etc/nginx/sites-available/lnw-cash"
    fi
    echo ""

    # ── Step 4: Symlink ─────────────────────────────────────────────
    echo "🔗 Symlink: /etc/nginx/sites-enabled/lnw-cash"
    if [ "$ACTUAL" = "true" ]; then
        echo "⚡ [ACTUAL] สร้าง symlink..."
        sudo ln -sf /etc/nginx/sites-available/lnw-cash /etc/nginx/sites-enabled/lnw-cash
        sudo rm -f /etc/nginx/sites-enabled/default
    else
        echo "  [DRY-RUN] sudo ln -sf /etc/nginx/sites-available/lnw-cash /etc/nginx/sites-enabled/lnw-cash"
        echo "  [DRY-RUN] sudo rm -f /etc/nginx/sites-enabled/default"
    fi
    echo ""

    # ── Step 5: ทดสอบ config ───────────────────────────────────────
    echo "🩺 ตรวจสอบความถูกต้องของ config: nginx -t"
    if [ "$ACTUAL" = "true" ]; then
        sudo nginx -t
    else
        echo "  [DRY-RUN] sudo nginx -t"
    fi
    echo ""

    # ── Step 6: Reload Nginx ───────────────────────────────────────
    echo "🔄 Reload Nginx: systemctl reload nginx"
    if [ "$ACTUAL" = "true" ]; then
        sudo systemctl reload nginx
        echo "✅ Nginx reloaded"
    else
        echo "  [DRY-RUN] sudo systemctl reload nginx"
    fi
    echo ""

    # ── Step 7: Health Check ───────────────────────────────────────
    echo "💚 Health check: curl http://localhost:8080/health"
    if [ "$ACTUAL" = "true" ]; then
        if curl -s --fail http://localhost:8080/health; then
            echo ""
            echo "✅ Health check ผ่าน"
        else
            echo ""
            echo "❌ Health check ไม่ผ่าน — กรุณาตรวจสอบ Nginx logs"
            exit 1
        fi
    else
        echo "  [DRY-RUN] curl http://localhost:8080/health"
    fi
    echo ""

    # ── สรุป ────────────────────────────────────────────────────────
    if [ "$ACTUAL" != "true" ]; then
        echo "═══════════════════════════════════════════════════════════════"
        echo "✅ DRY-RUN เสร็จ — ไม่มีการเปลี่ยนแปลงใดๆ กับระบบ"
        echo ""
        echo "💡 หากต้องการ deploy จริงให้ใช้:"
        echo "     ACTUALLY_DEPLOY=true ./scripts/deploy-local.sh"
        echo "═══════════════════════════════════════════════════════════════"
    else
        echo "═══════════════════════════════════════════════════════════════"
        echo "✅ Deploy เสร็จสิ้น — LnwCash Wallet พร้อมให้บริการที่:"
        echo "     http://localhost:8080"
        echo ""
        echo "   Health: http://localhost:8080/health"
        echo "═══════════════════════════════════════════════════════════════"
    fi
}

deploy_local
