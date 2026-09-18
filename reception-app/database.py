# -*- coding: utf-8 -*-
"""
دیتابیس سیستم پذیرش — یک فایل SQLite ساده و سبک، فقط برای پذیرش دستگاه.
عمداً هیچ ارتباطی با برنامه‌ی حسابداری ندارد؛ سبک و مستقل است.
"""
import sqlite3
import os
import secrets
from datetime import datetime
from paths import get_base_dir

DB_PATH = os.path.join(get_base_dir(), "reception.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT UNIQUE,
        customer_name TEXT,
        customer_phone TEXT,
        device_brand TEXT,
        device_model TEXT,
        device_color TEXT,
        imei TEXT,
        device_password TEXT,
        device_condition TEXT,
        accessories TEXT,
        reported_issue TEXT,
        expected_delivery_date TEXT,
        prepayment REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'received',
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        delivered_at TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )""")

    c.execute("SELECT value FROM settings WHERE key='admin_password'")
    if not c.fetchone():
        from werkzeug.security import generate_password_hash
        admin_password = secrets.token_urlsafe(9)
        c.execute("INSERT INTO settings (key, value) VALUES ('admin_password', ?)",
                   (generate_password_hash(admin_password),))
        _announce_first_password(admin_password)

    conn.commit()
    conn.close()


def _announce_first_password(password):
    lines = [
        "=" * 50,
        "رمز عبور اولیه‌ی سیستم پذیرش ساخته شد:",
        f"  رمز عبور: {password}",
        "این رمز فقط همین یک‌بار نمایش داده می‌شود.",
        "همین حالا یادداشتش کن؛ بعداً از «تنظیمات» می‌تونی تغییرش بدی.",
        "=" * 50,
    ]
    print("\n".join(lines))
    try:
        with open(os.path.join(get_base_dir(), "FIRST_LOGIN_PASSWORD.txt"), "w", encoding="utf-8") as f:
            f.write(f"رمز عبور اولیه: {password}\n\nپس از ورود، از «تنظیمات» رمز را تغییر بده و این فایل را حذف کن.\n")
    except OSError:
        pass


if __name__ == "__main__":
    init_db()
    print("دیتابیس با موفقیت ساخته شد:", DB_PATH)
