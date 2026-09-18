# -*- coding: utf-8 -*-
"""
سرور سیستم پذیرش دستگاه — یک برنامه‌ی کاملاً جدا و سبک، فقط برای ثبت و پیگیری
پذیرش موبایل/تبلت. هیچ وابستگی‌ای به برنامه‌ی حسابداری ندارد و بدون نیاز به
تعریف کالا/دسته‌بندی/انبار، همان لحظه قابل استفاده است.
"""
from flask import Flask, request, jsonify, send_from_directory, g, send_file
from werkzeug.security import generate_password_hash, check_password_hash
from database import init_db, get_connection, now, DB_PATH
import os
import secrets
import shutil
import threading
import time
import json
from paths import get_base_dir, get_bundle_dir

WEB_DIR = os.path.join(get_bundle_dir(), "web")
app = Flask(__name__, static_folder=WEB_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

STATUSES = ("received", "in_progress", "ready", "delivered", "cancelled")
STATUS_LABELS = {
    "received": "پذیرش‌شده", "in_progress": "در حال بررسی/تعمیر", "ready": "آماده تحویل",
    "delivered": "تحویل‌شده", "cancelled": "لغو‌شده",
}


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


# ---------- نشست ساده (توکن در حافظه) ----------
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()
PUBLIC_ENDPOINTS = {"static", "index", "login", "ping", "get_settings"}

FAILED_LOGINS = {}
FAILED_LOGINS_LOCK = threading.Lock()
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 300


@app.before_request
def require_auth():
    if request.method == "OPTIONS" or request.endpoint in PUBLIC_ENDPOINTS:
        return None
    token = request.headers.get("Authorization", "")
    token = token[len("Bearer "):].strip() if token.startswith("Bearer ") else ""
    with SESSIONS_LOCK:
        if token not in SESSIONS:
            return jsonify({"ok": False, "message": "نیاز به ورود مجدد است"}), 401
    g.authed = True


def get_setting(key, default=None):
    conn = get_connection()
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key, value):
    conn = get_connection()
    conn.execute("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (key, value))
    conn.commit()
    conn.close()


# ---------- ورود ----------
@app.route("/login", methods=["POST"])
def login():
    d = request.json or {}
    password = d.get("password", "")

    with FAILED_LOGINS_LOCK:
        rec = FAILED_LOGINS.get("shop")
        if rec and rec["count"] >= MAX_LOGIN_ATTEMPTS and time.time() < rec["locked_until"]:
            remaining = int(rec["locked_until"] - time.time())
            return jsonify({"ok": False, "message": f"به‌خاطر تلاش‌های ناموفق زیاد، {remaining} ثانیه صبر کن"}), 429

    stored_hash = get_setting("admin_password")
    if not stored_hash or not check_password_hash(stored_hash, password):
        with FAILED_LOGINS_LOCK:
            rec = FAILED_LOGINS.setdefault("shop", {"count": 0, "locked_until": 0})
            rec["count"] += 1
            if rec["count"] >= MAX_LOGIN_ATTEMPTS:
                rec["locked_until"] = time.time() + LOCKOUT_SECONDS
        return jsonify({"ok": False, "message": "رمز عبور اشتباه است"}), 401

    with FAILED_LOGINS_LOCK:
        FAILED_LOGINS.pop("shop", None)
    token = secrets.token_hex(32)
    with SESSIONS_LOCK:
        SESSIONS[token] = True
    return jsonify({"ok": True, "token": token})


@app.route("/logout", methods=["POST"])
def logout():
    token = request.headers.get("Authorization", "")[len("Bearer "):].strip()
    with SESSIONS_LOCK:
        SESSIONS.pop(token, None)
    return jsonify({"ok": True})


# ---------- تنظیمات ----------
@app.route("/settings", methods=["GET"])
def get_settings():
    return jsonify({
        "shop_name": get_setting("shop_name", "پذیرش تعمیرات موبایل"),
        "shop_phone": get_setting("shop_phone", ""),
        "shop_address": get_setting("shop_address", ""),
    })


@app.route("/settings", methods=["POST"])
def update_settings():
    d = request.json or {}
    if "shop_name" in d:
        set_setting("shop_name", d.get("shop_name") or "")
    if "shop_phone" in d:
        set_setting("shop_phone", d.get("shop_phone") or "")
    if "shop_address" in d:
        set_setting("shop_address", d.get("shop_address") or "")
    return jsonify({"ok": True})


@app.route("/settings/password", methods=["POST"])
def change_password():
    d = request.json or {}
    current = d.get("current_password", "")
    new = d.get("new_password", "")
    stored_hash = get_setting("admin_password")
    if not stored_hash or not check_password_hash(stored_hash, current):
        return jsonify({"ok": False, "message": "رمز فعلی اشتباه است"}), 400
    if len(new) < 6:
        return jsonify({"ok": False, "message": "رمز جدید باید حداقل ۶ کاراکتر باشد"}), 400
    set_setting("admin_password", generate_password_hash(new))
    return jsonify({"ok": True})


# ---------- پذیرش دستگاه‌ها ----------
def generate_ticket_number(device_id):
    return f"P-{device_id:05d}"


@app.route("/devices", methods=["GET"])
def get_devices():
    status = request.args.get("status")
    q = request.args.get("q", "").strip()
    conn = get_connection()
    sql = "SELECT * FROM devices WHERE 1=1"
    params = []
    if status:
        sql += " AND status=?"
        params.append(status)
    if q:
        like = f"%{q}%"
        sql += """ AND (ticket_number LIKE ? OR imei LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?
                    OR device_model LIKE ? OR device_brand LIKE ?)"""
        params += [like, like, like, like, like, like]
    sql += " ORDER BY id DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/devices/<int:device_id>", methods=["GET"])
def get_device(device_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"ok": False, "message": "پیدا نشد"}), 404
    return jsonify(dict(row))


@app.route("/devices", methods=["POST"])
def add_device():
    d = request.json or {}
    if not (d.get("device_brand") or "").strip() and not (d.get("device_model") or "").strip():
        return jsonify({"ok": False, "message": "برند یا مدل دستگاه را وارد کن"}), 400
    if not (d.get("customer_name") or "").strip():
        return jsonify({"ok": False, "message": "نام مشتری را وارد کن"}), 400
    conn = get_connection()
    c = conn.cursor()
    c.execute("""INSERT INTO devices (ticket_number, customer_name, customer_phone, device_brand, device_model,
                    device_color, imei, device_password, device_condition, accessories, reported_issue,
                    expected_delivery_date, prepayment, status, created_at, updated_at)
                 VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              (d.get("customer_name", "").strip(), d.get("customer_phone", "").strip(),
               d.get("device_brand", "").strip(), d.get("device_model", "").strip(),
               d.get("device_color", "").strip(), d.get("imei", "").strip(), d.get("device_password", "").strip(),
               d.get("device_condition", "").strip(), d.get("accessories", "").strip(),
               d.get("reported_issue", "").strip(), d.get("expected_delivery_date") or None,
               float(d.get("prepayment") or 0), "received", now(), now()))
    device_id = c.lastrowid
    ticket_number = generate_ticket_number(device_id)
    c.execute("UPDATE devices SET ticket_number=? WHERE id=?", (ticket_number, device_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "device_id": device_id, "ticket_number": ticket_number})


@app.route("/devices/<int:device_id>", methods=["PUT"])
def update_device(device_id):
    d = request.json or {}
    conn = get_connection()
    row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "پیدا نشد"}), 404
    fields = ("customer_name", "customer_phone", "device_brand", "device_model", "device_color", "imei",
              "device_password", "device_condition", "accessories", "reported_issue",
              "expected_delivery_date", "prepayment", "note")
    updates = {f: d[f] for f in fields if f in d}
    if updates:
        set_clause = ", ".join(f"{f}=?" for f in updates)
        conn.execute(f"UPDATE devices SET {set_clause}, updated_at=? WHERE id=?",
                     list(updates.values()) + [now(), device_id])
        conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/devices/<int:device_id>/status", methods=["PUT"])
def update_device_status(device_id):
    d = request.json or {}
    status = d.get("status")
    if status not in STATUSES:
        return jsonify({"ok": False, "message": "وضعیت نامعتبر است"}), 400
    conn = get_connection()
    row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "message": "پیدا نشد"}), 404
    delivered_at = now() if status == "delivered" else row["delivered_at"]
    conn.execute("UPDATE devices SET status=?, updated_at=?, delivered_at=? WHERE id=?",
                 (status, now(), delivered_at, device_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/devices/<int:device_id>", methods=["DELETE"])
def delete_device(device_id):
    conn = get_connection()
    conn.execute("DELETE FROM devices WHERE id=?", (device_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/stats", methods=["GET"])
def get_stats():
    conn = get_connection()
    today = now()[:10]

    def count(status):
        return conn.execute("SELECT COUNT(*) as c FROM devices WHERE status=?", (status,)).fetchone()["c"]

    intake_today = conn.execute("SELECT COUNT(*) as c FROM devices WHERE created_at LIKE ?", (f"{today}%",)).fetchone()["c"]
    result = {
        "received": count("received"), "in_progress": count("in_progress"), "ready": count("ready"),
        "delivered": count("delivered"), "intake_today": intake_today,
    }
    conn.close()
    return jsonify(result)


# ---------- چاپ رسید ----------
@app.route("/devices/<int:device_id>/print", methods=["GET"])
def print_receipt(device_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
    conn.close()
    if not row:
        return "پیدا نشد", 404
    d = dict(row)
    shop_name = get_setting("shop_name", "پذیرش تعمیرات موبایل")
    shop_phone = get_setting("shop_phone", "")
    shop_address = get_setting("shop_address", "")

    def esc(v):
        import html
        return html.escape(str(v)) if v is not None else ""

    html_out = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>رسید پذیرش {esc(d['ticket_number'])}</title>
<style>
  body {{ font-family: Tahoma, 'Segoe UI', Arial, sans-serif; margin: 20px; color: #1a1a1a; }}
  .print-btn {{ display:block; margin:0 auto 16px; padding:10px 26px; font-size:14px; cursor:pointer;
    background:#4F46E5; color:#fff; border:none; border-radius:6px; }}
  @media print {{ .print-btn {{ display:none; }} }}
  table {{ width:100%; border-collapse:collapse; margin:10px 0; }}
  th, td {{ border:1px solid #ccc; padding:8px; font-size:14px; text-align:right; }}
  th {{ background:#f3f4f6; width:150px; }}
  h1, h2 {{ margin:6px 0; text-align:center; }}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">چاپ این رسید</button>
<h1>{esc(shop_name)}</h1>
<p style="text-align:center">{esc(shop_phone)} — {esc(shop_address)}</p>
<h2>رسید پذیرش دستگاه</h2>
<table>
  <tr><th>شماره پذیرش</th><td><b>{esc(d['ticket_number'])}</b></td></tr>
  <tr><th>تاریخ پذیرش</th><td>{esc(d['created_at'])}</td></tr>
  <tr><th>تاریخ تحویل احتمالی</th><td>{esc(d['expected_delivery_date']) or '—'}</td></tr>
  <tr><th>مشتری</th><td>{esc(d['customer_name'])}</td></tr>
  <tr><th>تلفن</th><td dir="ltr" style="text-align:right">{esc(d['customer_phone']) or '—'}</td></tr>
  <tr><th>برند/مدل</th><td>{esc(d['device_brand'])} {esc(d['device_model'])}</td></tr>
  <tr><th>رنگ</th><td>{esc(d['device_color']) or '—'}</td></tr>
  <tr><th>IMEI</th><td dir="ltr" style="text-align:right">{esc(d['imei']) or '—'}</td></tr>
  <tr><th>وضعیت ظاهری</th><td>{esc(d['device_condition']) or '—'}</td></tr>
  <tr><th>لوازم همراه</th><td>{esc(d['accessories']) or '—'}</td></tr>
  <tr><th>مشکل اعلام‌شده</th><td>{esc(d['reported_issue']) or '—'}</td></tr>
  <tr><th>پیش‌پرداخت</th><td>{d['prepayment']:,.0f} تومان</td></tr>
</table>
<p style="margin-top:26px;font-size:12px;color:#555">این رسید را تا زمان تحویل دستگاه نزد خود نگه دارید.</p>
<div style="display:flex;justify-content:space-between;margin-top:50px">
  <div>امضای مشتری: ______________</div>
  <div>امضای پذیرش‌کننده: ______________</div>
</div>
</body></html>"""
    return html_out


# ---------- بکاپ ساده ----------
BACKUP_DIR = os.path.join(get_base_dir(), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


@app.route("/backup/download", methods=["GET"])
def download_backup():
    if not os.path.exists(DB_PATH):
        return jsonify({"ok": False, "message": "دیتابیسی وجود ندارد"}), 404
    return send_file(DB_PATH, as_attachment=True, download_name="reception_backup.db")


@app.route("/backup/now", methods=["POST"])
def backup_now():
    if not os.path.exists(DB_PATH):
        return jsonify({"ok": False, "message": "دیتابیسی وجود ندارد"}), 404
    filename = f"reception_{now().replace(':', '-').replace(' ', '_')}.db"
    shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR, filename))
    return jsonify({"ok": True, "filename": filename})


# ---------- سرو کردن رابط کاربری وب ----------
@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True})


def run_embedded(port=5057):
    import logging
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    init_db()
    app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False, debug=False)


if __name__ == "__main__":
    init_db()
    print("=" * 50)
    print("سرور سیستم پذیرش در حال اجراست...")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5057, debug=False)
