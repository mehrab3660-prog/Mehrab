# -*- coding: utf-8 -*-
"""
ماژول دیتابیس - مغازه لوازم الکتریکی
از SQLite استفاده می‌کنیم چون نیازی به سرور دیتابیس جدا نداره و فایلی و سبک هست.
"""
import sqlite3
import os
import secrets
from datetime import datetime
from paths import get_base_dir

DB_PATH = os.path.join(get_base_dir(), "accounting.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        category_id INTEGER,
        unit TEXT NOT NULL DEFAULT 'عدد',
        purchase_price REAL NOT NULL DEFAULT 0,
        sale_price REAL NOT NULL DEFAULT 0,
        stock_qty REAL NOT NULL DEFAULT 0,
        min_stock REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        type TEXT NOT NULL DEFAULT 'customer',  -- customer یا supplier
        balance REAL NOT NULL DEFAULT 0          -- مثبت = بدهکار به ما
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_type TEXT NOT NULL,   -- sale یا purchase
        number TEXT,
        party_id INTEGER,
        date TEXT NOT NULL,
        total REAL NOT NULL DEFAULT 0,
        paid REAL NOT NULL DEFAULT 0,
        payment_type TEXT NOT NULL DEFAULT 'cash', -- cash, credit, check
        description TEXT,
        FOREIGN KEY (party_id) REFERENCES parties(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        qty REAL NOT NULL,
        unit_price REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS cash_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        tx_type TEXT NOT NULL,  -- in یا out
        amount REAL NOT NULL,
        description TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER,
        invoice_id INTEGER,
        amount REAL NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, cashed, bounced
        direction TEXT NOT NULL, -- received یا issued
        description TEXT,
        FOREIGN KEY (party_id) REFERENCES parties(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        username TEXT,
        action TEXT NOT NULL,
        details TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        old_purchase_price REAL,
        old_sale_price REAL,
        new_purchase_price REAL,
        new_sale_price REAL,
        changed_at TEXT NOT NULL,
        note TEXT,
        username TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        bank_name TEXT,
        account_number TEXT,
        balance REAL NOT NULL DEFAULT 0,
        created_at TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS bank_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        tx_type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        username TEXT,
        FOREIGN KEY (account_id) REFERENCES bank_accounts(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS security_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        username TEXT,
        event TEXT NOT NULL,
        details TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS cash_closings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        expected_balance REAL NOT NULL,
        counted_balance REAL NOT NULL,
        difference REAL NOT NULL,
        note TEXT,
        username TEXT,
        created_at TEXT NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS invoice_installments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        due_date TEXT NOT NULL,
        amount REAL NOT NULL,
        paid INTEGER NOT NULL DEFAULT 0,
        paid_at TEXT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS warranty_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER,
        serial_number TEXT,
        party_id INTEGER,
        invoice_id INTEGER,
        issue_description TEXT,
        status TEXT NOT NULL DEFAULT 'received',  -- received, in_repair, done, returned
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        note TEXT,
        username TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (party_id) REFERENCES parties(id)
    )""")

    # --- مهاجرت ستون‌های جدید برای دیتابیس‌های قبلی (اگر از قبل ساخته شده باشند) ---
    def add_column_if_missing(table, column, coltype):
        existing = [row["name"] for row in c.execute(f"PRAGMA table_info({table})").fetchall()]
        if column not in existing:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")

    add_column_if_missing("items", "brand", "TEXT")
    add_column_if_missing("invoices", "discount", "REAL NOT NULL DEFAULT 0")
    add_column_if_missing("parties", "note", "TEXT")
    add_column_if_missing("parties", "credit_limit", "REAL NOT NULL DEFAULT 0")
    add_column_if_missing("parties", "is_vip", "INTEGER NOT NULL DEFAULT 0")
    add_column_if_missing("cash_transactions", "invoice_id", "INTEGER")
    add_column_if_missing("users", "must_change_password", "INTEGER NOT NULL DEFAULT 0")
    add_column_if_missing("invoices", "created_by", "TEXT")
    add_column_if_missing("invoice_items", "serial_number", "TEXT")
    add_column_if_missing("invoice_items", "warranty_months", "INTEGER")
    add_column_if_missing("cash_transactions", "expense_category", "TEXT")
    add_column_if_missing("users", "permissions", "TEXT")
    add_column_if_missing("users", "totp_secret", "TEXT")
    add_column_if_missing("users", "totp_enabled", "INTEGER NOT NULL DEFAULT 0")
    add_column_if_missing("invoices", "voided", "INTEGER NOT NULL DEFAULT 0")
    add_column_if_missing("invoices", "void_reason", "TEXT")
    add_column_if_missing("invoices", "voided_by", "TEXT")
    add_column_if_missing("invoices", "voided_at", "TEXT")
    add_column_if_missing("parties", "special_discount_percent", "REAL NOT NULL DEFAULT 0")
    add_column_if_missing("items", "avg_cost", "REAL")
    add_column_if_missing("items", "photo_filename", "TEXT")
    add_column_if_missing("items", "deleted_at", "TEXT")
    add_column_if_missing("bank_accounts", "iban", "TEXT")

    # مهاجرت امنیتی: هش کردن رمزهایی که هنوز به‌صورت متن ساده ذخیره شده‌اند
    from werkzeug.security import generate_password_hash
    for row in c.execute("SELECT id, password FROM users").fetchall():
        pw = row["password"]
        if not (pw.startswith("pbkdf2:") or pw.startswith("scrypt:")):
            c.execute("UPDATE users SET password=? WHERE id=?", (generate_password_hash(pw), row["id"]))

    # کاربر پیش‌فرض ادمین — به‌جای یک رمز ثابت و شناخته‌شده (که هرکسی می‌تواند حدس بزند)،
    # یک رمز تصادفی امن می‌سازیم و فقط همین یک‌بار آن را نمایش می‌دهیم
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        admin_password = secrets.token_urlsafe(9)
        c.execute("INSERT INTO users (username, password, role, must_change_password) VALUES (?, ?, ?, 1)",
                   ("admin", generate_password_hash(admin_password), "admin"))
        _announce_first_admin_password(admin_password)

    conn.commit()
    conn.close()


def _announce_first_admin_password(password):
    """نمایش رمز اولیه‌ی مدیر: هم در کنسول و هم در یک فایل متنی کنار برنامه،
    چون این برنامه ممکن است به‌صورت exe بدون پنجره کنسول اجرا شود."""
    lines = [
        "=" * 60,
        "کاربر مدیر پیش‌فرض ساخته شد:",
        "  نام کاربری: admin",
        f"  رمز عبور اولیه: {password}",
        "این رمز فقط همین یک‌بار نمایش داده می‌شود.",
        "لطفاً همین حالا یادداشتش کنید، با آن وارد شوید و از بخش «مدیریت کاربران»",
        "در اسرع وقت آن را تغییر دهید — سپس فایل زیر را پاک کنید.",
        "=" * 60,
    ]
    print("\n".join(lines))
    try:
        creds_path = os.path.join(get_base_dir(), "FIRST_LOGIN_ADMIN_PASSWORD.txt")
        with open(creds_path, "w", encoding="utf-8") as f:
            f.write(
                "نام کاربری مدیر: admin\n"
                f"رمز عبور اولیه: {password}\n\n"
                "لطفاً پس از اولین ورود، این رمز را از «تنظیمات کلی › کاربران» تغییر دهید\n"
                "و سپس همین فایل را حذف کنید.\n"
            )
    except OSError:
        pass


if __name__ == "__main__":
    init_db()
    print("دیتابیس با موفقیت ساخته شد:", DB_PATH)
