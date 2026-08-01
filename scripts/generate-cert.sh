#!/bin/bash
# Generate self-signed certificate for HTTPS dev server
# Required by Web Crypto API — crypto.subtle needs Secure Context
# F-017 fix | F-018 fix — SAN extension reduces browser cert warnings

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERT_DIR="$PROJECT_DIR/cert"

echo "🔐 Generating self-signed certificate for HTTPS dev server..."
echo "   Required: crypto.subtle (Web Crypto API) needs Secure Context"
echo ""

mkdir -p "$CERT_DIR"

openssl req -x509 -newkey rsa:2048 \
	-keyout "$CERT_DIR/key.pem" \
	-out "$CERT_DIR/cert.pem" \
	-days 365 \
	-nodes \
	-subj "/CN=100.86.66.4" \
	-addext "subjectAltName=IP:100.86.66.4" \
	2>/dev/null

chmod 600 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem"

echo "✅ Done — certificate generated at cert/"
echo "   cert/key.pem  (600)"
echo "   cert/cert.pem (644)"
echo ""
echo "⚠️  Self-signed cert — browser will warn. Accept for development."
echo "   Vite will now serve https://100.86.66.4:5173"
