# -*- coding: utf-8 -*-
"""
ماژول گزارش شبانه: ساخت خلاصه فروش روزانه، ارسال به ایمیل، و آپلود نسخه پشتیبان به VPS.
تنظیمات (ایمیل، رمز اپلیکیشن، آدرس VPS، مسیر کلید SSH) در فایل config.json
(کنار همین فایل) قرار می‌گیرد. نمونه آن در config.example.json موجود است.
"""
import json
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime

from paths import get_base_dir

CONFIG_PATH = os.path.join(get_base_dir(), "config.json")


def load_config():
    if not os.path.exists(CONFIG_PATH):
        return None
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_daily_summary(get_connection):
    """خلاصه فروش امروز را از دیتابیس می‌سازد و به‌صورت متن ساده برمی‌گرداند"""
    conn = get_connection()
    today = datetime.now().strftime("%Y-%m-%d")

    sales_today = conn.execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM invoices WHERE invoice_type='sale' AND date LIKE ?",
        (f"{today}%",)).fetchone()
    purchases_today = conn.execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM invoices WHERE invoice_type='purchase' AND date LIKE ?",
        (f"{today}%",)).fetchone()
    cash_balance = conn.execute(
        "SELECT COALESCE(SUM(CASE WHEN tx_type='in' THEN amount ELSE -amount END),0) as bal FROM cash_transactions"
    ).fetchone()["bal"]
    debtors = conn.execute("SELECT COALESCE(SUM(balance),0) as t FROM parties WHERE balance > 0").fetchone()["t"]
    low_stock = conn.execute("SELECT name, stock_qty FROM items WHERE stock_qty <= min_stock").fetchall()

    top_items = conn.execute("""
        SELECT items.name as name, SUM(invoice_items.qty) as qty, SUM(invoice_items.total) as total
        FROM invoice_items
        JOIN invoices ON invoice_items.invoice_id = invoices.id
        JOIN items ON invoice_items.item_id = items.id
        WHERE invoices.invoice_type='sale' AND invoices.date LIKE ?
        GROUP BY items.id ORDER BY total DESC LIMIT 5
    """, (f"{today}%",)).fetchall()

    conn.close()

    lines = [f"خلاصه فروش امروز - {today}", "=" * 40,
             f'تعداد فاکتور فروش: {sales_today["cnt"]}',
             f'جمع فروش امروز: {sales_today["total"]:,.0f} تومان',
             f'تعداد فاکتور خرید: {purchases_today["cnt"]}',
             f'جمع خرید امروز: {purchases_today["total"]:,.0f} تومان',
             f'موجودی فعلی صندوق: {cash_balance:,.0f} تومان',
             f'مجموع طلب از مشتریان: {debtors:,.0f} تومان']

    if top_items:
        lines.append("")
        lines.append("پرفروش‌ترین کالاهای امروز:")
        for it in top_items:
            lines.append(f'  - {it["name"]}: {it["qty"]} عدد/واحد، {it["total"]:,.0f} تومان')

    if low_stock:
        lines.append("")
        lines.append("⚠ کالاهای رو به اتمام:")
        for it in low_stock:
            lines.append(f'  - {it["name"]} (موجودی: {it["stock_qty"]})')

    return "\n".join(lines)


def send_email_summary(summary_text, backup_path=None):
    cfg = load_config()
    if not cfg or not cfg.get("email", {}).get("enabled"):
        return False, "ایمیل در تنظیمات فعال نیست (config.json را بررسی کنید)"

    email_cfg = cfg["email"]
    msg = MIMEMultipart()
    msg["From"] = email_cfg["sender"]
    msg["To"] = email_cfg["recipient"]
    msg["Subject"] = f'گزارش فروش شبانه - {datetime.now().strftime("%Y-%m-%d")}'
    msg.attach(MIMEText(summary_text, "plain", "utf-8"))

    if backup_path and os.path.exists(backup_path) and email_cfg.get("attach_backup", True):
        part = MIMEBase("application", "octet-stream")
        with open(backup_path, "rb") as f:
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{os.path.basename(backup_path)}"')
        msg.attach(part)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(email_cfg["sender"], email_cfg["app_password"])
            server.sendmail(email_cfg["sender"], email_cfg["recipient"], msg.as_string())
        return True, "ایمیل با موفقیت ارسال شد"
    except Exception as e:
        return False, f"خطا در ارسال ایمیل: {e}"


def upload_to_vps(backup_path):
    cfg = load_config()
    if not cfg or not cfg.get("vps", {}).get("enabled"):
        return False, "آپلود VPS در تنظیمات فعال نیست (config.json را بررسی کنید)"

    vps_cfg = cfg["vps"]
    try:
        import paramiko
    except ImportError:
        return False, "کتابخانه paramiko نصب نیست (pip install paramiko)"

    try:
        ssh = paramiko.SSHClient()
        # کلید میزبان VPS باید از قبل شناخته‌شده باشد (با یک اتصال دستی ssh یک‌بار،
        # یا ssh-keyscan، به known_hosts سیستم اضافه شود)، وگرنه اتصال رد می‌شود.
        # AutoAddPolicy قبلی، کلید هر میزبانی را بدون بررسی می‌پذیرفت که راه را برای
        # حمله مرد میانی (MITM) روی بکاپ‌های مالی باز می‌کرد.
        ssh.load_system_host_keys()
        try:
            ssh.load_host_keys(os.path.expanduser("~/.ssh/known_hosts"))
        except (IOError, OSError):
            pass  # فایل known_hosts کاربر هنوز وجود ندارد؛ اتصال به میزبان ناشناس رد می‌شود
        ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
        key = paramiko.RSAKey.from_private_key_file(vps_cfg["key_path"])
        ssh.connect(vps_cfg["host"], port=vps_cfg.get("port", 22), username=vps_cfg["username"], pkey=key, timeout=15)
        sftp = ssh.open_sftp()
        remote_path = vps_cfg["remote_dir"].rstrip("/") + "/" + os.path.basename(backup_path)
        sftp.put(backup_path, remote_path)
        sftp.close()
        ssh.close()
        return True, f"آپلود شد به {vps_cfg['host']}:{remote_path}"
    except paramiko.SSHException as e:
        return False, (
            "کلید میزبان VPS در known_hosts شناخته‌شده نیست (برای جلوگیری از حمله مرد میانی رد شد). "
            "یک‌بار با دستور ssh به همان سرور وصل شو و کلیدش را تأیید کن، یا با "
            f"'ssh-keyscan -p {vps_cfg.get('port', 22)} {vps_cfg['host']} >> ~/.ssh/known_hosts' آن را اضافه کن. "
            f"جزئیات خطا: {e}"
        )
    except Exception as e:
        return False, f"خطا در آپلود به VPS: {e}"
