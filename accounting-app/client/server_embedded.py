# -*- coding: utf-8 -*-
"""
سرور حسابداری مغازه الکتریکی
این فایل روی کامپیوتر اصلی (سرور) اجرا میشه و روی شبکه داخلی (LAN) گوش میده.
کاملاً آفلاین کار می‌کنه - هیچ نیازی به اینترنت نداره.
"""
from flask import Flask, request, jsonify, send_file, send_from_directory, g
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from database import init_db, get_connection, DB_PATH
from datetime import datetime, timedelta
import os
import secrets
import shutil
import threading
import time
import tempfile
import json
import notifier
import pdf_generator
import invoice_html
import invoice_ai
import invoice_ocr_free
from paths import get_base_dir, get_bundle_dir

SETTINGS_PATH = os.path.join(get_base_dir(), "shop_settings.json")
ASSETS_DIR = os.path.join(get_base_dir(), "assets")

# اطمینان از وجود پوشه assets و آیکون پیش‌فرض کنار فایل exe (چون پوشه‌ی داخل exe موقتی است)
os.makedirs(ASSETS_DIR, exist_ok=True)
_default_icon_src = os.path.join(get_bundle_dir(), "assets", "icon.png")
_default_icon_dst = os.path.join(ASSETS_DIR, "icon.png")
if os.path.exists(_default_icon_src) and not os.path.exists(_default_icon_dst):
    shutil.copy2(_default_icon_src, _default_icon_dst)


def load_shop_settings():
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"name": "حسابداری", "phones": "", "address": "", "logo_filename": None}


def save_shop_settings(data):
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


WEB_DIR = os.path.join(get_bundle_dir(), "web")
app = Flask(__name__, static_folder=WEB_DIR, static_url_path="")


@app.after_request
def add_no_cache_headers(response):
    """جلوگیری از کش کردن صفحه توسط مرورگر، تا هر تغییری فوراً دیده بشه"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


# ---------- احراز هویت (Session Token) ----------
# چون سرور روی شبکه (LAN) گوش می‌ده، هر درخواستی (به‌جز لاگین و فایل‌های عمومی) باید
# یک توکن معتبر همراه داشته باشه، وگرنه هر دستگاهی تو شبکه بدون لاگین به همه‌ی اطلاعات
# مالی و مدیریتی دسترسی پیدا می‌کرد.
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()

# مسیرهایی که قبل از لاگین هم باید در دسترس باشند (صفحه ورود، فایل‌های استاتیک آن، پینگ)
PUBLIC_ENDPOINTS = {"static", "index", "login", "logout", "ping", "assets", "get_shop_settings"}


def create_session(username, role):
    token = secrets.token_hex(32)
    with SESSIONS_LOCK:
        SESSIONS[token] = {"username": username, "role": role}
    return token


def get_current_session():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[len("Bearer "):].strip()
    with SESSIONS_LOCK:
        return SESSIONS.get(token)


@app.before_request
def require_auth():
    if request.method == "OPTIONS" or request.endpoint in PUBLIC_ENDPOINTS:
        return None
    session = get_current_session()
    if not session:
        return jsonify({"ok": False, "message": "نیاز به ورود مجدد به سیستم است"}), 401
    g.current_user = session


def require_admin():
    """برای مسیرهای مخصوص مدیر؛ اگر کاربر ادمین نباشد پاسخ خطا برمی‌گرداند"""
    if g.current_user.get("role") != "admin":
        return jsonify({"ok": False, "message": "این عملیات فقط برای مدیر سیستم مجاز است"}), 403
    return None


@app.route("/settings/shop", methods=["GET"])
def get_shop_settings():
    s = load_shop_settings()
    s["logo_url"] = f"/assets/{s['logo_filename']}" if s.get("logo_filename") else None
    return jsonify(s)


@app.route("/settings/shop", methods=["POST"])
def update_shop_settings():
    err = require_admin()
    if err:
        return err
    d = request.json
    s = load_shop_settings()
    s["name"] = d.get("name", s.get("name"))
    s["phones"] = d.get("phones", s.get("phones"))
    s["address"] = d.get("address", s.get("address"))
    save_shop_settings(s)
    return jsonify({"ok": True})


@app.route("/settings/shop/logo", methods=["POST"])
def upload_shop_logo():
    err = require_admin()
    if err:
        return err
    if "logo" not in request.files:
        return jsonify({"ok": False, "message": "فایلی ارسال نشده"}), 400
    file = request.files["logo"]
    if not file or file.filename == "":
        return jsonify({"ok": False, "message": "فایلی انتخاب نشده"}), 400
    ext = os.path.splitext(file.filename)[1].lower()
    # svg عمداً مجاز نیست: چون این فایل مستقیماً به‌عنوان یک فایل استاتیک سرو می‌شود،
    # svg با اسکریپت داخلش می‌تواند حمله XSS ذخیره‌شده ایجاد کند
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        return jsonify({"ok": False, "message": "فرمت فایل باید png، jpg، gif یا webp باشد"}), 400
    os.makedirs(ASSETS_DIR, exist_ok=True)
    filename = "shop_logo" + ext
    file.save(os.path.join(ASSETS_DIR, filename))
    s = load_shop_settings()
    s["logo_filename"] = filename
    save_shop_settings(s)
    return jsonify({"ok": True, "logo_url": f"/assets/{filename}"})


@app.route("/settings/shop/logo", methods=["DELETE"])
def delete_shop_logo():
    err = require_admin()
    if err:
        return err
    s = load_shop_settings()
    old = s.get("logo_filename")
    if old:
        old_path = os.path.join(ASSETS_DIR, old)
        if os.path.exists(old_path):
            os.remove(old_path)
    s["logo_filename"] = None
    save_shop_settings(s)
    return jsonify({"ok": True})


BACKUP_DIR = os.path.join(get_base_dir(), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


# ---------- سرو کردن رابط کاربری وب ----------
@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets"), filename)


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log_action(username, action, details=""):
    try:
        conn = get_connection()
        conn.execute("INSERT INTO activity_log (timestamp, username, action, details) VALUES (?,?,?,?)",
                     (now(), username or "نامشخص", action, details))
        conn.commit()
        conn.close()
    except Exception:
        pass


def log_security_event(username, event, details=""):
    try:
        conn = get_connection()
        conn.execute("INSERT INTO security_log (timestamp, username, event, details) VALUES (?,?,?,?)",
                     (now(), username or "نامشخص", event, details))
        conn.commit()
        conn.close()
    except Exception:
        pass


# ---------- ورود ----------
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    conn = get_connection()
    user = conn.execute(
        "SELECT * FROM users WHERE username=?", (data.get("username"),)
    ).fetchone()
    conn.close()
    if user and check_password_hash(user["password"], data.get("password", "")):
        log_action(user["username"], "ورود به سیستم")
        user_dict = dict(user)
        user_dict.pop("password", None)  # رمز هش‌شده هم نباید به کلاینت فرستاده بشه
        token = create_session(user["username"], user["role"])
        return jsonify({"ok": True, "user": user_dict, "token": token})
    log_security_event(data.get("username"), "ورود ناموفق", "نام کاربری یا رمز اشتباه")
    return jsonify({"ok": False, "message": "نام کاربری یا رمز عبور اشتباه است"}), 401


@app.route("/logout", methods=["POST"])
def logout():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):].strip()
        with SESSIONS_LOCK:
            SESSIONS.pop(token, None)
    return jsonify({"ok": True})


# ---------- کالاها ----------
@app.route("/items", methods=["GET"])
def get_items():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM items ORDER BY name").fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    if g.current_user.get("role") != "admin":
        for r in result:
            r["purchase_price"] = None
    return jsonify(result)


@app.route("/items", methods=["POST"])
def add_item():
    d = request.json
    conn = get_connection()
    conn.execute("""INSERT INTO items (code, name, category_id, unit, purchase_price, sale_price, stock_qty, min_stock, brand)
                     VALUES (?,?,?,?,?,?,?,?,?)""",
                 (d.get("code"), d["name"], d.get("category_id"), d.get("unit", "عدد"),
                  d.get("purchase_price", 0), d.get("sale_price", 0),
                  d.get("stock_qty", 0), d.get("min_stock", 0), d.get("brand")))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/items/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    d = request.json
    conn = get_connection()
    conn.execute("""UPDATE items SET code=?, name=?, category_id=?, unit=?, purchase_price=?,
                     sale_price=?, stock_qty=?, min_stock=?, brand=? WHERE id=?""",
                 (d.get("code"), d["name"], d.get("category_id"), d.get("unit", "عدد"),
                  d.get("purchase_price", 0), d.get("sale_price", 0),
                  d.get("stock_qty", 0), d.get("min_stock", 0), d.get("brand"), item_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    conn = get_connection()
    conn.execute("DELETE FROM items WHERE id=?", (item_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ---------- طرف‌حساب‌ها (مشتری/تامین‌کننده) ----------
@app.route("/parties", methods=["GET"])
def get_parties():
    ptype = request.args.get("type")
    conn = get_connection()
    if ptype:
        rows = conn.execute("SELECT * FROM parties WHERE type=? ORDER BY name", (ptype,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM parties ORDER BY name").fetchall()
    result = [dict(r) for r in rows]
    for p in result:
        last = conn.execute(
            "SELECT MAX(date) as d FROM invoices WHERE party_id=? AND invoice_type IN ('sale','purchase')",
            (p["id"],)
        ).fetchone()
        p["last_purchase"] = last["d"] if last else None
    conn.close()
    return jsonify(result)


import re

PHONE_PATTERN = re.compile(r"^(0?9\d{9}|989\d{9})$")


def validate_party_input(d):
    """اعتبارسنجی شماره تماس (۱۱ یا ۱۲ رقم) و اجباری بودن آدرس"""
    phone = (d.get("phone") or "").strip().replace(" ", "").replace("-", "")
    if not phone or not PHONE_PATTERN.match(phone):
        return "شماره تماس نامعتبر است — باید ۱۱ رقم (مثلاً 09123456789) یا ۱۲ رقم با پیش‌شماره کشور باشد"
    if not (d.get("address") or "").strip():
        return "آدرس محل کار یا سکونت الزامی است"
    return None


@app.route("/parties", methods=["POST"])
def add_party():
    d = request.json
    if not d.get("_auto_created"):
        error = validate_party_input(d)
        if error:
            return jsonify({"ok": False, "message": error}), 400
    conn = get_connection()
    cur = conn.execute("""INSERT INTO parties (name, phone, address, type, balance, note, credit_limit, is_vip)
                     VALUES (?,?,?,?,?,?,?,?)""",
                 (d["name"], d.get("phone"), d.get("address"), d.get("type", "customer"), d.get("balance", 0),
                  d.get("note", ""), d.get("credit_limit", 0) or 0, 1 if d.get("is_vip") else 0))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"ok": True, "id": new_id})


@app.route("/parties/<int:party_id>", methods=["PUT"])
def update_party(party_id):
    d = request.json
    conn = get_connection()
    conn.execute("UPDATE parties SET name=?, phone=?, address=? WHERE id=?",
                 (d["name"], d.get("phone"), d.get("address"), party_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/parties/<int:party_id>/payment", methods=["POST"])
def party_payment(party_id):
    """
    ثبت تسویه حساب: دریافت وجه از مشتری بدهکار، یا پرداخت به تامین‌کننده.
    ورودی: {"amount": مبلغ, "description": "..."}
    """
    d = request.json
    amount = d["amount"]
    conn = get_connection()
    party = conn.execute("SELECT * FROM parties WHERE id=?", (party_id,)).fetchone()
    if not party:
        conn.close()
        return jsonify({"ok": False, "message": "طرف حساب پیدا نشد"}), 404

    if party["type"] == "customer":
        new_balance = party["balance"] - amount   # دریافت وجه، بدهی مشتری کم می‌شود
        tx_type = "in"
    else:
        new_balance = party["balance"] + amount   # پرداخت به تامین‌کننده
        tx_type = "out"

    conn.execute("UPDATE parties SET balance=? WHERE id=?", (new_balance, party_id))
    conn.execute("INSERT INTO cash_transactions (date, tx_type, amount, description) VALUES (?,?,?,?)",
                 (now(), tx_type, amount, d.get("description") or f"تسویه حساب با {party['name']}"))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "new_balance": new_balance})


@app.route("/parties/<int:party_id>/ledger", methods=["GET"])
def party_ledger(party_id):
    """ریز فاکتورهای یک طرف‌حساب به‌همراه مانده فعلی"""
    conn = get_connection()
    party = conn.execute("SELECT * FROM parties WHERE id=?", (party_id,)).fetchone()
    if not party:
        conn.close()
        return jsonify({"ok": False, "message": "طرف حساب پیدا نشد"}), 404
    invoices = conn.execute(
        "SELECT * FROM invoices WHERE party_id=? ORDER BY date", (party_id,)
    ).fetchall()
    conn.close()
    return jsonify({"party": dict(party), "invoices": [dict(r) for r in invoices]})


# ---------- دسته‌بندی کالا ----------
@app.route("/categories", methods=["GET"])
def get_categories():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/categories", methods=["POST"])
def add_category():
    d = request.json
    conn = get_connection()
    try:
        conn.execute("INSERT INTO categories (name) VALUES (?)", (d["name"],))
        conn.commit()
        ok, msg = True, "دسته اضافه شد"
    except Exception as e:
        ok = False
        msg = "این دسته قبلاً وجود دارد" if "UNIQUE" in str(e) else str(e)
    conn.close()
    return jsonify({"ok": ok, "message": msg})


# ---------- فاکتورها (فروش / خرید) ----------
@app.route("/invoices", methods=["GET"])
def get_invoices():
    itype = request.args.get("type")
    conn = get_connection()
    q = "SELECT invoices.*, parties.name as party_name FROM invoices LEFT JOIN parties ON invoices.party_id = parties.id"
    params = ()
    if itype:
        q += " WHERE invoice_type=?"
        params = (itype,)
    q += " ORDER BY date DESC, invoices.id DESC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/invoices/<int:inv_id>/items", methods=["GET"])
def get_invoice_items(inv_id):
    conn = get_connection()
    rows = conn.execute("""SELECT invoice_items.*, items.name as item_name FROM invoice_items
                            JOIN items ON invoice_items.item_id = items.id
                            WHERE invoice_id=?""", (inv_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/invoices", methods=["POST"])
def add_invoice():
    """
    ساختار ورودی:
    {
      "invoice_type": "sale" | "purchase" | "sale_return" | "purchase_return",
      "party_id": int یا null,
      "payment_type": "cash" | "credit" | "check",
      "discount": مبلغ تخفیف (اختیاری، پیش‌فرض ۰),
      "description": "...",
      "username": "برای لاگ فعالیت (اختیاری)",
      "items": [{"item_id": 1, "qty": 2, "unit_price": 15000}, ...]
    }
    مرجوعی خرید/فروش موجودی انبار را برعکسِ خرید/فروش عادی تغییر می‌دهد.
    """
    d = request.json
    conn = get_connection()
    c = conn.cursor()

    invoice_type = d["invoice_type"]
    is_return = invoice_type in ("sale_return", "purchase_return")
    discount = d.get("discount", 0) or 0
    subtotal = sum(it["qty"] * it["unit_price"] for it in d["items"])
    total = max(subtotal - discount, 0)
    paid = total if d.get("payment_type") == "cash" else d.get("paid", 0)

    # اعتبارسنجی سقف اعتبار نسیه (اگر برای مشتری تعیین شده باشد)
    if invoice_type == "sale" and d.get("payment_type") == "credit" and d.get("party_id"):
        party = conn.execute("SELECT * FROM parties WHERE id=?", (d["party_id"],)).fetchone()
        if party and party["credit_limit"] and party["credit_limit"] > 0:
            remaining = total - paid
            projected_balance = party["balance"] + remaining
            if projected_balance > party["credit_limit"]:
                conn.close()
                return jsonify({
                    "ok": False,
                    "message": f'این فاکتور از سقف اعتبار «{party["name"]}» عبور می‌کند '
                               f'(سقف: {party["credit_limit"]:,.0f}، بدهی فعلی: {party["balance"]:,.0f}، بعد از این فاکتور: {projected_balance:,.0f})'
                }), 400

    # اعتبارسنجی موجودی کافی برای فاکتور فروش (نباید موجودی منفی بشه)
    if invoice_type == "sale":
        needed = {}
        for it in d["items"]:
            needed[it["item_id"]] = needed.get(it["item_id"], 0) + it["qty"]
        for item_id, qty_needed in needed.items():
            row = conn.execute("SELECT name, stock_qty FROM items WHERE id=?", (item_id,)).fetchone()
            if row and row["stock_qty"] < qty_needed:
                conn.close()
                return jsonify({
                    "ok": False,
                    "message": f'موجودی «{row["name"]}» فقط {row["stock_qty"]:g} عدد است — نمی‌توان {qty_needed:g} تا فروخت'
                }), 400

    # شماره فاکتور خودکار: بعد از درج، بر اساس id ساخته می‌شود
    prefix = {"sale": "SL", "purchase": "PU", "sale_return": "SR", "purchase_return": "PR"}.get(invoice_type, "IN")

    c.execute("""INSERT INTO invoices (invoice_type, number, party_id, date, total, paid, payment_type, description, discount)
                 VALUES (?,?,?,?,?,?,?,?,?)""",
              (invoice_type, None, d.get("party_id"), now(),
               total, paid, d.get("payment_type", "cash"), d.get("description", ""), discount))
    invoice_id = c.lastrowid
    invoice_number = f"{prefix}-{invoice_id:05d}"
    c.execute("UPDATE invoices SET number=? WHERE id=?", (invoice_number, invoice_id))

    for it in d["items"]:
        line_total = it["qty"] * it["unit_price"]
        c.execute("""INSERT INTO invoice_items (invoice_id, item_id, qty, unit_price, total)
                     VALUES (?,?,?,?,?)""",
                  (invoice_id, it["item_id"], it["qty"], it["unit_price"], line_total))
        # به‌روزرسانی موجودی انبار (مرجوعی برعکسِ حالت عادی عمل می‌کند)
        sale_like = invoice_type in ("sale", "purchase_return")
        if sale_like:
            c.execute("UPDATE items SET stock_qty = stock_qty - ? WHERE id=?", (it["qty"], it["item_id"]))
        else:
            c.execute("UPDATE items SET stock_qty = stock_qty + ? WHERE id=?", (it["qty"], it["item_id"]))

    # به‌روزرسانی حساب طرف‌حساب در صورت نسیه (برای مرجوعی، اثر معکوس اعمال می‌شود)
    if d.get("party_id") and d.get("payment_type") in ("credit",):
        remaining = total - paid
        sign = 1 if invoice_type == "sale" else (-1 if invoice_type == "purchase" else 0)
        if invoice_type == "sale_return":
            sign = -1  # بدهی مشتری کم می‌شود
        elif invoice_type == "purchase_return":
            sign = 1  # طلب ما از تامین‌کننده (کاهش بدهی ما) به‌صورت ساده در نظر گرفته می‌شود
        c.execute("UPDATE parties SET balance = balance + ? WHERE id=?", (sign * remaining, d["party_id"]))

    # ثبت در صندوق در صورت نقدی/بخشی نقد
    if paid > 0:
        tx_type = "in" if invoice_type in ("sale", "purchase_return") else "out"
        label = {"sale": "فروش", "purchase": "خرید", "sale_return": "مرجوعی فروش", "purchase_return": "مرجوعی خرید"}[invoice_type]
        c.execute("INSERT INTO cash_transactions (date, tx_type, amount, description, invoice_id) VALUES (?,?,?,?,?)",
                  (now(), tx_type, paid, f"فاکتور {label} شماره {invoice_number}", invoice_id))

    conn.commit()
    conn.close()
    log_action(d.get("username"), f"ثبت فاکتور {invoice_number}", f"جمع کل: {total:,.0f} تومان")
    return jsonify({"ok": True, "invoice_id": invoice_id, "invoice_number": invoice_number, "total": total})


@app.route("/invoices/<int:invoice_id>", methods=["DELETE"])
def delete_invoice(invoice_id):
    """
    حذف کامل یک فاکتور اشتباه: موجودی انبار، مانده حساب طرف‌حساب و تراکنش صندوق مرتبط
    همه به حالت قبل از ثبت این فاکتور برمی‌گردند.
    """
    err = require_admin()
    if err:
        return err
    d = request.json or {}
    conn = get_connection()
    invoice = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
    if not invoice:
        conn.close()
        return jsonify({"ok": False, "message": "فاکتور پیدا نشد"}), 404

    items = conn.execute("SELECT * FROM invoice_items WHERE invoice_id=?", (invoice_id,)).fetchall()
    invoice_type = invoice["invoice_type"]

    # ۱. برگرداندن موجودی انبار (برعکسِ همون منطقی که هنگام ثبت اعمال شده بود)
    sale_like = invoice_type in ("sale", "purchase_return")
    for it in items:
        if sale_like:
            conn.execute("UPDATE items SET stock_qty = stock_qty + ? WHERE id=?", (it["qty"], it["item_id"]))
        else:
            conn.execute("UPDATE items SET stock_qty = stock_qty - ? WHERE id=?", (it["qty"], it["item_id"]))

    # ۲. برگرداندن مانده حساب طرف‌حساب (اگر نسیه بوده)
    if invoice["party_id"] and invoice["payment_type"] == "credit":
        remaining = invoice["total"] - invoice["paid"]
        sign_map = {"sale": 1, "purchase": -1, "sale_return": -1, "purchase_return": 1}
        sign = sign_map.get(invoice_type, 0)
        conn.execute("UPDATE parties SET balance = balance - ? WHERE id=?", (sign * remaining, invoice["party_id"]))

    # ۳. حذف تراکنش صندوق مرتبط (اگر برای فاکتورهای جدیدتر ثبت شده باشد)
    conn.execute("DELETE FROM cash_transactions WHERE invoice_id=?", (invoice_id,))

    # ۳.۵ حذف چک‌های مرتبط با این فاکتور (و برگرداندن اثر صندوقی اگر قبلاً وصول شده بودند)
    related_checks = conn.execute("SELECT * FROM checks WHERE invoice_id=?", (invoice_id,)).fetchall()
    checks_note = ""
    for ch in related_checks:
        if ch["status"] == "cashed":
            conn.execute("DELETE FROM cash_transactions WHERE description=?", (f"وصول چک شماره {ch['id']}",))
            checks_note = " (یک چک وصول‌شده مرتبط هم حذف و اثرش در صندوق برگردانده شد)"
    conn.execute("DELETE FROM checks WHERE invoice_id=?", (invoice_id,))

    # ۴. حذف خود فاکتور و ردیف‌هایش
    conn.execute("DELETE FROM invoice_items WHERE invoice_id=?", (invoice_id,))
    conn.execute("DELETE FROM invoices WHERE id=?", (invoice_id,))
    conn.commit()
    conn.close()

    log_action(d.get("username"), "حذف فاکتور", f'فاکتور شماره {invoice["number"] or invoice_id}{checks_note}')
    log_security_event(d.get("username"), "حذف فاکتور", f'فاکتور شماره {invoice["number"] or invoice_id} — مبلغ {invoice["total"]:,.0f}{checks_note}')
    return jsonify({"ok": True, "message": f"فاکتور و همه موارد مرتبط حذف شد{checks_note}"})


# ---------- صندوق ----------
# ---------- بانک ----------
@app.route("/bank-accounts", methods=["GET"])
def get_bank_accounts():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM bank_accounts ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/bank-accounts", methods=["POST"])
def add_bank_account():
    d = request.json
    if not d.get("name"):
        return jsonify({"ok": False, "message": "نام حساب الزامی است"}), 400
    conn = get_connection()
    conn.execute("INSERT INTO bank_accounts (name, bank_name, account_number, balance, created_at) VALUES (?,?,?,?,?)",
                 (d["name"], d.get("bank_name", ""), d.get("account_number", ""), d.get("balance", 0) or 0, now()))
    conn.commit()
    conn.close()
    log_action(d.get("username"), "افزودن حساب بانکی", d["name"])
    return jsonify({"ok": True})


@app.route("/bank-accounts/<int:account_id>", methods=["DELETE"])
def delete_bank_account(account_id):
    conn = get_connection()
    acc = conn.execute("SELECT * FROM bank_accounts WHERE id=?", (account_id,)).fetchone()
    if acc and acc["balance"] != 0:
        conn.close()
        return jsonify({"ok": False, "message": "فقط حساب با موجودی صفر قابل حذف است"}), 400
    conn.execute("DELETE FROM bank_accounts WHERE id=?", (account_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/bank-accounts/<int:account_id>/transaction", methods=["POST"])
def bank_account_transaction(account_id):
    """واریز یا برداشت مستقیم از یک حساب بانکی (بدون ارتباط با صندوق)"""
    d = request.json
    tx_type = d.get("tx_type")  # deposit یا withdrawal
    amount = d.get("amount", 0)
    if tx_type not in ("deposit", "withdrawal") or amount <= 0:
        return jsonify({"ok": False, "message": "اطلاعات تراکنش نامعتبر است"}), 400

    conn = get_connection()
    acc = conn.execute("SELECT * FROM bank_accounts WHERE id=?", (account_id,)).fetchone()
    if not acc:
        conn.close()
        return jsonify({"ok": False, "message": "حساب پیدا نشد"}), 404
    if tx_type == "withdrawal" and acc["balance"] < amount:
        conn.close()
        return jsonify({"ok": False, "message": f'موجودی حساب کافی نیست (موجودی فعلی: {acc["balance"]:,.0f})'}), 400

    sign = 1 if tx_type == "deposit" else -1
    conn.execute("UPDATE bank_accounts SET balance = balance + ? WHERE id=?", (sign * amount, account_id))
    conn.execute("INSERT INTO bank_transactions (account_id, date, tx_type, amount, description, username) VALUES (?,?,?,?,?,?)",
                 (account_id, now(), tx_type, amount, d.get("description", ""), d.get("username")))
    conn.commit()
    conn.close()
    log_action(d.get("username"), "تراکنش بانکی",
               f'{"واریز" if tx_type == "deposit" else "برداشت"} {amount:,.0f} تومان — {acc["name"]}')
    return jsonify({"ok": True})


@app.route("/bank-accounts/<int:account_id>/statement", methods=["GET"])
def bank_account_statement(account_id):
    conn = get_connection()
    acc = conn.execute("SELECT * FROM bank_accounts WHERE id=?", (account_id,)).fetchone()
    if not acc:
        conn.close()
        return jsonify({"ok": False, "message": "حساب پیدا نشد"}), 404
    rows = conn.execute("SELECT * FROM bank_transactions WHERE account_id=? ORDER BY date DESC, id DESC", (account_id,)).fetchall()
    conn.close()
    return jsonify({"account": dict(acc), "transactions": [dict(r) for r in rows]})


@app.route("/bank-transfer", methods=["POST"])
def bank_transfer():
    """
    انتقال بین صندوق و بانک یا بین دو حساب بانکی.
    ورودی: {"from_type": "cash"|"bank", "from_id": null یا شماره حساب,
             "to_type": "cash"|"bank", "to_id": null یا شماره حساب, "amount": عدد, "description": "..."}
    """
    d = request.json
    amount = d.get("amount", 0)
    from_type, to_type = d.get("from_type"), d.get("to_type")
    if amount <= 0 or from_type == to_type == "cash":
        return jsonify({"ok": False, "message": "اطلاعات انتقال نامعتبر است"}), 400

    conn = get_connection()

    # بررسی موجودی کافی مبدأ
    if from_type == "cash":
        bal = conn.execute("SELECT COALESCE(SUM(CASE WHEN tx_type='in' THEN amount ELSE -amount END),0) as b FROM cash_transactions").fetchone()["b"]
        if bal < amount:
            conn.close()
            return jsonify({"ok": False, "message": f"موجودی صندوق کافی نیست (موجودی فعلی: {bal:,.0f})"}), 400
    else:
        acc = conn.execute("SELECT * FROM bank_accounts WHERE id=?", (d.get("from_id"),)).fetchone()
        if not acc or acc["balance"] < amount:
            conn.close()
            return jsonify({"ok": False, "message": "موجودی حساب بانکی مبدأ کافی نیست"}), 400

    desc = d.get("description") or "انتقال بین صندوق و بانک"

    # کسر از مبدأ
    if from_type == "cash":
        conn.execute("INSERT INTO cash_transactions (date, tx_type, amount, description) VALUES (?,?,?,?)",
                     (now(), "out", amount, desc))
    else:
        conn.execute("UPDATE bank_accounts SET balance = balance - ? WHERE id=?", (amount, d.get("from_id")))
        conn.execute("INSERT INTO bank_transactions (account_id, date, tx_type, amount, description, username) VALUES (?,?,?,?,?,?)",
                     (d.get("from_id"), now(), "transfer_out", amount, desc, d.get("username")))

    # افزودن به مقصد
    if to_type == "cash":
        conn.execute("INSERT INTO cash_transactions (date, tx_type, amount, description) VALUES (?,?,?,?)",
                     (now(), "in", amount, desc))
    else:
        conn.execute("UPDATE bank_accounts SET balance = balance + ? WHERE id=?", (amount, d.get("to_id")))
        conn.execute("INSERT INTO bank_transactions (account_id, date, tx_type, amount, description, username) VALUES (?,?,?,?,?,?)",
                     (d.get("to_id"), now(), "transfer_in", amount, desc, d.get("username")))

    conn.commit()
    conn.close()
    log_action(d.get("username"), "انتقال وجه", f'{amount:,.0f} تومان — {desc}')
    return jsonify({"ok": True})


@app.route("/cash", methods=["GET"])
def get_cash():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM cash_transactions ORDER BY date DESC, id DESC").fetchall()
    balance = conn.execute("""SELECT
        COALESCE(SUM(CASE WHEN tx_type='in' THEN amount ELSE -amount END),0) as bal
        FROM cash_transactions""").fetchone()["bal"]
    conn.close()
    return jsonify({"transactions": [dict(r) for r in rows], "balance": balance})


@app.route("/cash", methods=["POST"])
def add_cash():
    d = request.json
    conn = get_connection()
    conn.execute("INSERT INTO cash_transactions (date, tx_type, amount, description) VALUES (?,?,?,?)",
                 (now(), d["tx_type"], d["amount"], d.get("description", "")))
    conn.commit()
    conn.close()
    log_action(d.get("username"), "ثبت تراکنش صندوق",
               f'{"دریافت" if d["tx_type"]=="in" else "پرداخت"}: {d["amount"]:,.0f} تومان')
    return jsonify({"ok": True})


# ---------- گزارش‌ها ----------
@app.route("/reports/summary", methods=["GET"])
def report_summary():
    conn = get_connection()
    sales = conn.execute("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE invoice_type='sale'").fetchone()["t"]
    sales_returns = conn.execute("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE invoice_type='sale_return'").fetchone()["t"]
    purchases = conn.execute("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE invoice_type='purchase'").fetchone()["t"]
    purchase_returns = conn.execute("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE invoice_type='purchase_return'").fetchone()["t"]
    net_sales = sales - sales_returns
    net_purchases = purchases - purchase_returns
    debtors = conn.execute("SELECT COALESCE(SUM(balance),0) as t FROM parties WHERE balance > 0").fetchone()["t"]
    low_stock = conn.execute("SELECT * FROM items WHERE stock_qty <= min_stock").fetchall()
    conn.close()
    is_admin = g.current_user.get("role") == "admin"
    return jsonify({
        "total_sales": net_sales,
        "total_purchases": net_purchases if is_admin else None,
        "estimated_profit": (net_sales - net_purchases) if is_admin else None,
        "total_debtors": debtors,
        "low_stock_items": [dict(r) for r in low_stock]
    })


@app.route("/reports/stock-ledger/<int:item_id>", methods=["GET"])
def stock_ledger(item_id):
    """گردش انبار یک کالا: همه ورود/خروج‌های آن به ترتیب تاریخ"""
    conn = get_connection()
    item = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    if not item:
        conn.close()
        return jsonify({"ok": False, "message": "کالا پیدا نشد"}), 404
    rows = conn.execute("""
        SELECT invoices.date as date, invoices.invoice_type as invoice_type,
               invoices.number as number, invoice_items.qty as qty
        FROM invoice_items
        JOIN invoices ON invoice_items.invoice_id = invoices.id
        WHERE invoice_items.item_id = ?
        ORDER BY invoices.date
    """, (item_id,)).fetchall()
    conn.close()

    movement_label = {"sale": "خروج (فروش)", "purchase": "ورود (خرید)",
                       "sale_return": "ورود (مرجوعی فروش)", "purchase_return": "خروج (مرجوعی خرید)"}
    running = 0
    ledger = []
    for r in rows:
        qty_in = r["qty"] if r["invoice_type"] in ("purchase", "sale_return") else -r["qty"]
        running += qty_in
        ledger.append({
            "date": r["date"], "type": movement_label.get(r["invoice_type"], r["invoice_type"]),
            "number": r["number"], "qty": r["qty"], "running_balance": running
        })
    return jsonify({"item": dict(item), "ledger": ledger})


@app.route("/activity-log", methods=["GET"])
def get_activity_log():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM activity_log ORDER BY id DESC LIMIT 500").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/security-log", methods=["GET"])
def get_security_log():
    err = require_admin()
    if err:
        return err
    conn = get_connection()
    rows = conn.execute("SELECT * FROM security_log ORDER BY id DESC LIMIT 500").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ---------- چک‌ها ----------
@app.route("/checks", methods=["GET"])
def get_checks():
    status = request.args.get("status")
    conn = get_connection()
    q = """SELECT checks.*, parties.name as party_name FROM checks
           LEFT JOIN parties ON checks.party_id = parties.id"""
    params = ()
    if status:
        q += " WHERE status=?"
        params = (status,)
    q += " ORDER BY due_date ASC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/checks", methods=["POST"])
def add_check():
    d = request.json
    conn = get_connection()
    conn.execute("""INSERT INTO checks (party_id, invoice_id, amount, due_date, status, direction, description)
                     VALUES (?,?,?,?,?,?,?)""",
                 (d.get("party_id"), d.get("invoice_id"), d["amount"], d["due_date"],
                  d.get("status", "pending"), d["direction"], d.get("description", "")))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/checks/<int:check_id>", methods=["PUT"])
def update_check(check_id):
    """برای تغییر وضعیت چک: pending -> cashed یا bounced"""
    d = request.json
    conn = get_connection()
    check = conn.execute("SELECT * FROM checks WHERE id=?", (check_id,)).fetchone()
    conn.execute("UPDATE checks SET status=? WHERE id=?", (d["status"], check_id))

    if check and d["status"] == "cashed" and check["status"] != "cashed":
        tx_type = "in" if check["direction"] == "received" else "out"
        conn.execute("INSERT INTO cash_transactions (date, tx_type, amount, description) VALUES (?,?,?,?)",
                      (now(), tx_type, check["amount"], f"وصول چک شماره {check_id}"))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/checks/<int:check_id>", methods=["DELETE"])
def delete_check(check_id):
    conn = get_connection()
    conn.execute("DELETE FROM checks WHERE id=?", (check_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ---------- پشتیبان‌گیری ----------
def do_backup():
    if not os.path.exists(DB_PATH):
        return None
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    dest = os.path.join(BACKUP_DIR, f"accounting_{stamp}.db")
    shutil.copy2(DB_PATH, dest)
    return dest


def backup_loop():
    last_backup_date = None
    while True:
        today = datetime.now().strftime("%Y-%m-%d")
        if today != last_backup_date:
            do_backup()
            last_backup_date = today
        time.sleep(3600)


@app.route("/backup/now", methods=["POST"])
def backup_now():
    err = require_admin()
    if err:
        return err
    path = do_backup()
    return jsonify({"ok": True, "path": path})


@app.route("/backup/list", methods=["GET"])
def backup_list():
    err = require_admin()
    if err:
        return err
    files = sorted(os.listdir(BACKUP_DIR), reverse=True)
    return jsonify(files)


# ---------- گزارش شبانه (ایمیل + آپلود به VPS) ----------
def run_nightly_tasks():
    backup_path = do_backup()
    summary_text = notifier.build_daily_summary(get_connection)
    ok_email, msg_email = notifier.send_email_summary(summary_text, backup_path)
    ok_vps, msg_vps = notifier.upload_to_vps(backup_path)
    print("گزارش شبانه ->", "ایمیل:", msg_email, "| VPS:", msg_vps)
    return {"email": {"ok": ok_email, "message": msg_email},
            "vps": {"ok": ok_vps, "message": msg_vps}}


def nightly_loop():
    """هر روز ساعت ۲۳ (۱۱ شب) یک‌بار گزارش فروش را ایمیل و بکاپ را به VPS آپلود می‌کند"""
    last_run_date = None
    while True:
        now_dt = datetime.now()
        today_str = now_dt.strftime("%Y-%m-%d")
        if now_dt.hour == 23 and today_str != last_run_date:
            try:
                run_nightly_tasks()
            except Exception as e:
                print("خطا در اجرای گزارش شبانه:", e)
            last_run_date = today_str
        time.sleep(300)


@app.route("/nightly/run-now", methods=["POST"])
def nightly_run_now():
    """برای تست دستی: بلافاصله گزارش شبانه را اجرا می‌کند بدون نیاز به صبر تا ساعت ۲۳"""
    err = require_admin()
    if err:
        return err
    result = run_nightly_tasks()
    return jsonify(result)


@app.route("/reports/monthly", methods=["GET"])
def report_monthly():
    """خلاصه فروش، خرید و سود هر ماه برای ۱۲ ماه اخیر (بر اساس ماه‌های میلادی ثبت‌شده در دیتابیس)"""
    conn = get_connection()
    rows = conn.execute("""
        SELECT substr(date, 1, 7) as month,
               SUM(CASE WHEN invoice_type='sale' THEN total ELSE 0 END) as sales,
               SUM(CASE WHEN invoice_type='purchase' THEN total ELSE 0 END) as purchases
        FROM invoices
        GROUP BY month
        ORDER BY month
    """).fetchall()
    conn.close()
    is_admin = g.current_user.get("role") == "admin"
    result = []
    for r in rows:
        result.append({
            "month": r["month"],
            "sales": r["sales"] or 0,
            "purchases": (r["purchases"] or 0) if is_admin else None,
            "profit": ((r["sales"] or 0) - (r["purchases"] or 0)) if is_admin else None
        })
    return jsonify(result)


# ---------- مدیریت کاربران (برای سطح دسترسی) ----------
@app.route("/users", methods=["GET"])
def get_users():
    err = require_admin()
    if err:
        return err
    conn = get_connection()
    rows = conn.execute("SELECT id, username, role FROM users ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/users", methods=["POST"])
def add_user():
    err = require_admin()
    if err:
        return err
    d = request.json
    conn = get_connection()
    try:
        conn.execute("INSERT INTO users (username, password, role) VALUES (?,?,?)",
                     (d["username"], generate_password_hash(d["password"]), d.get("role", "employee")))
        conn.commit()
        ok = True
        msg = "کاربر اضافه شد"
        log_security_event(d.get("username"), "افزودن کاربر جدید", f'کاربر: {d["username"]}')
    except Exception as e:
        ok = False
        msg = "این نام کاربری قبلاً استفاده شده" if "UNIQUE" in str(e) else str(e)
    conn.close()
    return jsonify({"ok": ok, "message": msg})


@app.route("/users/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    err = require_admin()
    if err:
        return err
    d = request.json
    conn = get_connection()
    if d.get("password"):
        conn.execute("UPDATE users SET password=?, role=? WHERE id=?",
                     (generate_password_hash(d["password"]), d.get("role", "employee"), user_id))
        log_security_event(d.get("username"), "تغییر رمز عبور", f"کاربر شماره {user_id}")
    else:
        conn.execute("UPDATE users SET role=? WHERE id=?", (d.get("role", "employee"), user_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    err = require_admin()
    if err:
        return err
    conn = get_connection()
    conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/backup/restore", methods=["POST"])
def backup_restore():
    """بازیابی دیتابیس از یکی از نسخه‌های پشتیبان قبلی. قبل از بازیابی، خودش هم یک بکاپ احتیاطی از وضعیت فعلی می‌گیرد."""
    err = require_admin()
    if err:
        return err
    d = request.json
    filename = d.get("filename")
    if not filename:
        return jsonify({"ok": False, "message": "نام فایل پشتیبان ارسال نشده"}), 400
    # فقط نام فایل خالی (بدون مسیر) مجاز است تا کسی نتواند با ../ به فایل‌های
    # خارج از پوشه بکاپ‌ها دسترسی پیدا کند
    safe_name = secure_filename(filename)
    if not safe_name or safe_name != filename:
        return jsonify({"ok": False, "message": "نام فایل پشتیبان نامعتبر است"}), 400
    src = os.path.realpath(os.path.join(BACKUP_DIR, safe_name))
    backup_dir_real = os.path.realpath(BACKUP_DIR)
    if os.path.commonpath([src, backup_dir_real]) != backup_dir_real:
        return jsonify({"ok": False, "message": "نام فایل پشتیبان نامعتبر است"}), 400
    if not os.path.exists(src):
        return jsonify({"ok": False, "message": "فایل پشتیبان پیدا نشد"}), 404

    do_backup()  # نسخه احتیاطی از وضعیت فعلی قبل از بازنویسی
    shutil.copy2(src, DB_PATH)
    log_action(d.get("username"), "بازیابی بکاپ", filename)
    return jsonify({"ok": True, "message": f'دیتابیس از نسخه «{filename}» بازیابی شد. سرور و کلاینت را ببندید و دوباره باز کنید.'})


@app.route("/reports/debtors", methods=["GET"])
def report_debtors():
    """لیست مشتریانی که به ما بدهکارند"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM parties WHERE type='customer' AND balance > 0 ORDER BY balance DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/reports/creditors", methods=["GET"])
def report_creditors():
    """لیست تامین‌کنندگانی که ما به آن‌ها بدهکاریم (بستانکاران ما)"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM parties WHERE type='supplier' AND balance < 0 ORDER BY balance ASC"
    ).fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    for r in result:
        r["owed_amount"] = abs(r["balance"])
    return jsonify(result)


@app.route("/reports/top-items", methods=["GET"])
def report_top_items():
    """پرفروش‌ترین کالاها در N روز اخیر (پیش‌فرض ۳۰ روز)"""
    days = request.args.get("days", default=30, type=int)
    conn = get_connection()
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = conn.execute("""
        SELECT items.name as name, items.brand as brand,
               SUM(invoice_items.qty) as total_qty, SUM(invoice_items.total) as total_amount
        FROM invoice_items
        JOIN invoices ON invoice_items.invoice_id = invoices.id
        JOIN items ON invoice_items.item_id = items.id
        WHERE invoices.invoice_type='sale' AND invoices.date >= ?
        GROUP BY items.id
        ORDER BY total_amount DESC
        LIMIT 20
    """, (since,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/invoices/<int:invoice_id>/print", methods=["GET"])
def invoice_print(invoice_id):
    """
    فاکتور را به‌صورت یک صفحه HTML آماده چاپ برمی‌گرداند (نه PDF).
    چون توسط مرورگر رندر می‌شود، متن فارسی همیشه کاملاً درست نمایش داده می‌شود.
    """
    page_format = request.args.get("format", "A5")
    conn = get_connection()
    invoice = conn.execute(
        "SELECT invoices.* FROM invoices WHERE invoices.id=?", (invoice_id,)
    ).fetchone()
    if not invoice:
        conn.close()
        return "فاکتور پیدا نشد", 404
    items = conn.execute("""
        SELECT invoice_items.qty, invoice_items.unit_price, invoice_items.total,
               items.name as item_name, items.brand as brand, categories.name as category_name
        FROM invoice_items
        JOIN items ON invoice_items.item_id = items.id
        LEFT JOIN categories ON items.category_id = categories.id
        WHERE invoice_id=?
    """, (invoice_id,)).fetchall()
    party = None
    if invoice["party_id"]:
        party = conn.execute("SELECT * FROM parties WHERE id=?", (invoice["party_id"],)).fetchone()
    conn.close()

    cfg = load_shop_settings()

    inv_dict = dict(invoice)
    items_list = [dict(r) for r in items]
    party_dict = dict(party) if party else None
    words_text = pdf_generator.number_to_persian_words(inv_dict["total"])

    html = invoice_html.build_invoice_html(
        inv_dict, items_list, party_dict, page_format=page_format,
        shop_name=cfg.get("name") or "حسابداری",
        shop_phones=cfg.get("phones", ""),
        shop_address=cfg.get("address", ""),
        words_text=words_text,
        logo_url=(f"/assets/{cfg['logo_filename']}" if cfg.get("logo_filename") else None),
    )
    return html


@app.route("/invoices/<int:invoice_id>/pdf", methods=["GET"])
def invoice_pdf(invoice_id):
    page_format = request.args.get("format", "A5")
    conn = get_connection()
    invoice = conn.execute(
        "SELECT invoices.*, parties.name as party_name FROM invoices "
        "LEFT JOIN parties ON invoices.party_id = parties.id WHERE invoices.id=?", (invoice_id,)
    ).fetchone()
    if not invoice:
        conn.close()
        return jsonify({"ok": False, "message": "فاکتور پیدا نشد"}), 404
    items = conn.execute(
        "SELECT invoice_items.*, items.name as item_name FROM invoice_items "
        "JOIN items ON invoice_items.item_id = items.id WHERE invoice_id=?", (invoice_id,)
    ).fetchall()
    conn.close()

    inv_dict = dict(invoice)
    inv_dict["id"] = inv_dict.get("number") or inv_dict["id"]
    items_list = [dict(r) for r in items]
    tmp_path = os.path.join(tempfile.gettempdir(), f"invoice_{invoice_id}_{page_format}.pdf")
    pdf_generator.generate_invoice_pdf(
        tmp_path, inv_dict, items_list, party_name=invoice["party_name"], page_format=page_format
    )
    return send_file(tmp_path, mimetype="application/pdf")


@app.route("/export/items.xlsx", methods=["GET"])
def export_items_excel():
    import openpyxl
    conn = get_connection()
    rows = conn.execute("SELECT * FROM items ORDER BY name").fetchall()
    conn.close()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "کالاها"
    ws.append(["کد/بارکد", "نام", "برند", "واحد", "قیمت خرید", "قیمت فروش", "موجودی", "حداقل موجودی"])
    for r in rows:
        ws.append([r["code"] or "", r["name"], r["brand"] or "", r["unit"],
                   r["purchase_price"], r["sale_price"], r["stock_qty"], r["min_stock"]])
    tmp_path = os.path.join(tempfile.gettempdir(), "items_export.xlsx")
    wb.save(tmp_path)
    return send_file(tmp_path, as_attachment=True, download_name="کالاها.xlsx")


@app.route("/ai/analyze-invoice-photo", methods=["POST"])
def analyze_invoice_photo():
    """آنالیز عکس فاکتور خرید با Claude (نیاز به اینترنت و کلید API در config.json دارد)"""
    if "photo" not in request.files:
        return jsonify({"ok": False, "message": "عکسی ارسال نشده"}), 400
    file = request.files["photo"]
    if not file or file.filename == "":
        return jsonify({"ok": False, "message": "عکسی انتخاب نشده"}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    media_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf"}
    media_type = media_map.get(ext)
    if not media_type:
        return jsonify({"ok": False, "message": "فرمت فایل باید jpg، png، webp یا pdf باشد"}), 400

    method = request.form.get("method", "ai")
    image_bytes = file.read()

    if method == "offline":
        ok, data = invoice_ocr_free.analyze_invoice_image_offline(image_bytes, is_pdf=(ext == ".pdf"))
        if not ok:
            return jsonify({"ok": False, "message": data}), 400
        return jsonify({"ok": True, "data": data, "method": "offline"})

    cfg = notifier.load_config() or {}
    ai_cfg = cfg.get("ai", {})
    if not ai_cfg.get("enabled"):
        return jsonify({"ok": False, "message": "روش هوش مصنوعی فعال نشده. فایل config.json را بساز و بخش \"ai\" را طبق راهنما پر کن، یا روش «رایگان آفلاین» را انتخاب کن"}), 400

    ok, data = invoice_ai.analyze_invoice_image(
        image_bytes, media_type, ai_cfg.get("api_key"), ai_cfg.get("model", "claude-haiku-4-5-20251001")
    )
    if not ok:
        return jsonify({"ok": False, "message": data}), 400
    return jsonify({"ok": True, "data": data, "method": "ai"})


@app.route("/items/apply-bulk-prices", methods=["POST"])
def apply_bulk_prices():
    """
    اعمال گروهی قیمت جدید روی چند کالا، با ثبت تاریخچه قبل از تغییر.
    ورودی: {"changes": [{"item_id": 1, "new_purchase_price": 5500, "new_sale_price": 8800}, ...], "note": "...", "username": "..."}
    """
    err = require_admin()
    if err:
        return err
    d = request.json
    changes = d.get("changes", [])
    if not changes:
        return jsonify({"ok": False, "message": "هیچ تغییری ارسال نشده"}), 400

    conn = get_connection()
    count = 0
    for ch in changes:
        item = conn.execute("SELECT * FROM items WHERE id=?", (ch["item_id"],)).fetchone()
        if not item:
            continue
        conn.execute(
            "INSERT INTO price_history (item_id, old_purchase_price, old_sale_price, new_purchase_price, new_sale_price, changed_at, note, username) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (ch["item_id"], item["purchase_price"], item["sale_price"],
             ch["new_purchase_price"], ch["new_sale_price"], now(), d.get("note", ""), d.get("username"))
        )
        conn.execute("UPDATE items SET purchase_price=?, sale_price=? WHERE id=?",
                     (ch["new_purchase_price"], ch["new_sale_price"], ch["item_id"]))
        count += 1
    conn.commit()
    conn.close()
    log_action(d.get("username"), "افزایش/تغییر گروهی قیمت", f"{count} کالا تغییر کرد — {d.get('note', '')}")
    return jsonify({"ok": True, "updated_count": count})


@app.route("/price-history", methods=["GET"])
def get_price_history():
    err = require_admin()
    if err:
        return err
    conn = get_connection()
    rows = conn.execute("""
        SELECT price_history.*, items.name as item_name
        FROM price_history JOIN items ON price_history.item_id = items.id
        ORDER BY price_history.id DESC LIMIT 500
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/price-history/<int:history_id>/revert", methods=["POST"])
def revert_price_history(history_id):
    """بازگردانی قیمت یک کالا به مقدار قبل از یک تغییر خاص (خودش هم یک رکورد تاریخچه جدید می‌سازد)"""
    err = require_admin()
    if err:
        return err
    d = request.json or {}
    conn = get_connection()
    h = conn.execute("SELECT * FROM price_history WHERE id=?", (history_id,)).fetchone()
    if not h:
        conn.close()
        return jsonify({"ok": False, "message": "رکورد تاریخچه پیدا نشد"}), 404
    item = conn.execute("SELECT * FROM items WHERE id=?", (h["item_id"],)).fetchone()
    if not item:
        conn.close()
        return jsonify({"ok": False, "message": "کالا پیدا نشد"}), 404

    conn.execute(
        "INSERT INTO price_history (item_id, old_purchase_price, old_sale_price, new_purchase_price, new_sale_price, changed_at, note, username) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (h["item_id"], item["purchase_price"], item["sale_price"],
         h["old_purchase_price"], h["old_sale_price"], now(), "بازگردانی به نسخه قبلی", d.get("username"))
    )
    conn.execute("UPDATE items SET purchase_price=?, sale_price=? WHERE id=?",
                 (h["old_purchase_price"], h["old_sale_price"], h["item_id"]))
    conn.commit()
    conn.close()
    log_action(d.get("username"), "بازگردانی قیمت", f'کالا: {item["name"]}')
    return jsonify({"ok": True})


# ---------- ویجت‌های تکمیلی داشبورد ----------
@app.route("/reports/stock-ranking", methods=["GET"])
def stock_ranking():
    """رتبه‌بندی کالاها بر اساس موجودی فعلی (بیشترین تا کمترین)"""
    conn = get_connection()
    rows = conn.execute("SELECT name, brand, stock_qty, unit FROM items ORDER BY stock_qty DESC LIMIT 10").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True, "message": "سرور فعال است"})


def run_embedded(port=5050):
    """
    اجرای این سرور به‌صورت تعبیه‌شده داخل خود برنامه دسکتاپ (فقط روی 127.0.0.1، تک‌کاربره).
    این تابع باید در یک ترد جدا (daemon thread) فراخوانی شود.
    """
    import logging
    logging.getLogger("werkzeug").setLevel(logging.ERROR)  # کم کردن پیام‌های اضافه در کنسول
    init_db()
    threading.Thread(target=backup_loop, daemon=True).start()
    threading.Thread(target=nightly_loop, daemon=True).start()
    app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False, debug=False)


if __name__ == "__main__":
    init_db()
    threading.Thread(target=backup_loop, daemon=True).start()
    threading.Thread(target=nightly_loop, daemon=True).start()
    print("=" * 50)
    print("سرور حسابداری در حال اجراست...")
    print("این پنجره را باز نگه دارید تا کلاینت‌ها بتوانند وصل شوند.")
    print("نسخه‌های پشتیبان به‌صورت خودکار در پوشه backups ذخیره می‌شوند.")
    print("گزارش شبانه (ایمیل + آپلود VPS) هر شب ساعت ۲۳ اجرا می‌شود (در صورت تنظیم config.json).")
    print("=" * 50)
    # روی همه رابط‌های شبکه گوش می‌ده تا از کامپیوترهای دیگه قابل دسترسی باشه
    app.run(host="0.0.0.0", port=5050, debug=False)
