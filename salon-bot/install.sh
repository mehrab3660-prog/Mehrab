#!/usr/bin/env bash
# نصب ربات نوبت‌دهی آرایشگاه در پوشه و سرویس جداگانه — به ربات‌های دیگر سرور دست نمی‌زند.
# استفاده (داخل همین پوشه):  sudo bash install.sh
set -euo pipefail

TARGET=${TARGET:-/opt/salon-bot}
SERVICE=salon-bot
SRC="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" != "0" ]; then echo "❗️ با sudo یا کاربر root اجرا کنید: sudo bash install.sh"; exit 1; fi

PY=$(command -v python3 || true)
if [ -z "$PY" ]; then echo "❗️ python3 نصب نیست: apt install python3 python3-venv"; exit 1; fi
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
  echo "❗️ پایتون ۳.۹ یا بالاتر لازم است. نسخه فعلی: $("$PY" --version)"; exit 1
fi

# If a service with this name exists but runs from somewhere else, it's not ours — stop.
UNIT=/etc/systemd/system/$SERVICE.service
if [ -f "$UNIT" ] && ! grep -q "WorkingDirectory=$TARGET" "$UNIT"; then
  echo "❗️ سرویسی به نام $SERVICE از قبل وجود دارد و مال این ربات نیست. کاری انجام نشد."; exit 1
fi

echo "📁 کپی فایل‌ها در $TARGET ..."
mkdir -p "$TARGET"
if [ "$SRC" != "$TARGET" ]; then
  # Never overwrite the live .env or database
  tar -C "$SRC" --exclude=.env --exclude='*.db' --exclude=venv --exclude=__pycache__ -cf - . | tar -C "$TARGET" -xf -
fi
cd "$TARGET"

echo "🐍 ساخت محیط پایتون جداگانه (venv) ..."
if ! "$PY" -m venv venv 2>/dev/null; then
  echo "❗️ ماژول venv نصب نیست. اجرا کنید: apt install python3-venv  و دوباره install.sh را بزنید."; exit 1
fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  read -rp "🔑 توکن ربات جدید (از BotFather — نه توکن ربات قبلی): " TOKEN
  read -rp "🆔 شناسه عددی تلگرام شما (مدیر کل، اگر نمی‌دانید خالی بگذارید): " ADMIN
  read -rp "🌐 پراکسی (اختیاری، مثل socks5://127.0.0.1:1080 — خالی = بدون پراکسی): " PROXY
  sed -i "s|^BOT_TOKEN=.*|BOT_TOKEN=$TOKEN|; s|^SUPER_ADMIN_IDS=.*|SUPER_ADMIN_IDS=$ADMIN|; s|^PROXY_URL=.*|PROXY_URL=$PROXY|" .env
  chmod 600 .env
fi

echo "⚙️ ساخت سرویس $SERVICE ..."
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Salon booking Telegram bot
After=network-online.target

[Service]
WorkingDirectory=$TARGET
ExecStart=$TARGET/venv/bin/python run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
sleep 3
systemctl --no-pager --lines=5 status "$SERVICE" || true

echo
echo "✅ نصب تمام شد. ربات در $TARGET و با سرویس «$SERVICE» اجرا می‌شود."
echo "   لاگ:      journalctl -u $SERVICE -f"
echo "   ریستارت:  systemctl restart $SERVICE"
echo "   تنظیمات:  nano $TARGET/.env   (بعد از تغییر ریستارت کنید)"
