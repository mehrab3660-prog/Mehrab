import sqlite3
from datetime import date, datetime, timedelta

from . import config
from .utils import hm_to_min, min_to_hm, now, today, weekday_idx

DEFAULT_WELCOME = (
    "🌸 سلام، خوش اومدی! ✨\n\n"
    "✂️ به صفحه رزرو آنلاین «{salon}» رسیدی.\n"
    "اینجا می‌تونی خیلی راحت خدمت، روز و ساعت دلخواهت رو انتخاب کنی. 🗓⏰"
)

# Statuses that occupy a time slot
BUSY_STATUSES = ("awaiting_payment", "pending", "confirmed", "done")

STATUS_FA = {
    "awaiting_payment": "⏳ در انتظار پرداخت بیعانه",
    "pending": "🕓 در انتظار تایید آرایشگاه",
    "confirmed": "✅ تایید شده",
    "done": "✔️ انجام شده",
    "cancelled": "❌ لغو شده",
    "rejected": "🚫 رد شده",
    "expired": "⌛️ منقضی (پرداخت نشد)",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    tg_name TEXT,
    name TEXT,
    phone TEXT,
    salon_id INTEGER,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS salons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    owner_name TEXT,
    address TEXT,
    phone TEXT,
    welcome TEXT,
    slot_minutes INTEGER NOT NULL DEFAULT 30,
    deposit_enabled INTEGER NOT NULL DEFAULT 0,
    deposit_amount INTEGER NOT NULL DEFAULT 0,
    card_number TEXT,
    card_holder TEXT,
    remind_hours INTEGER NOT NULL DEFAULT 3,
    active INTEGER NOT NULL DEFAULT 1,
    sub_until TEXT,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 60,
    active INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS work_hours (
    salon_id INTEGER NOT NULL,
    weekday INTEGER NOT NULL,
    is_open INTEGER NOT NULL DEFAULT 1,
    start TEXT NOT NULL DEFAULT '09:00',
    end TEXT NOT NULL DEFAULT '19:00',
    PRIMARY KEY (salon_id, weekday)
);
CREATE TABLE IF NOT EXISTS holidays (
    salon_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (salon_id, day)
);
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    service_name TEXT,
    price INTEGER,
    customer_id INTEGER NOT NULL,
    customer_name TEXT,
    phone TEXT,
    day TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    status TEXT NOT NULL,
    deposit INTEGER NOT NULL DEFAULT 0,
    receipt_file_id TEXT,
    reminded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_appt_salon_day ON appointments (salon_id, day);
CREATE TABLE IF NOT EXISTS sub_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    days INTEGER NOT NULL,
    receipt_file_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT,
    reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

DEFAULT_SETTINGS = {
    "sub_price": "300000",
    "sub_days": "30",
    "sub_card": "",
    "sub_holder": "",
}

conn: sqlite3.Connection = None


def init(path=None):
    global conn
    conn = sqlite3.connect(path or config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    for k, v in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
    conn.commit()
    return conn


def _ts():
    return now().strftime("%Y-%m-%d %H:%M:%S")


def q(sql, args=()):
    return conn.execute(sql, args).fetchall()


def q1(sql, args=()):
    return conn.execute(sql, args).fetchone()


def run(sql, args=()):
    cur = conn.execute(sql, args)
    conn.commit()
    return cur


# ---------- settings ----------
def get_setting(key):
    row = q1("SELECT value FROM settings WHERE key=?", (key,))
    return row["value"] if row else DEFAULT_SETTINGS.get(key, "")


def set_setting(key, value):
    run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, str(value)))


# ---------- users ----------
def upsert_user(uid, tg_name):
    run("INSERT INTO users (id, tg_name, created_at) VALUES (?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET tg_name=excluded.tg_name", (uid, tg_name, _ts()))


def get_user(uid):
    return q1("SELECT * FROM users WHERE id=?", (uid,))


def set_user(uid, **fields):
    for k, v in fields.items():
        assert k in ("name", "phone", "salon_id")
        run(f"UPDATE users SET {k}=? WHERE id=?", (v, uid))


# ---------- salons ----------
SALON_FIELDS = ("name", "owner_name", "address", "phone", "welcome", "slot_minutes", "deposit_enabled",
                "deposit_amount", "card_number", "card_holder", "remind_hours", "active", "sub_until", "owner_id")


def create_salon(owner_id, name, trial_days=None):
    trial = config.TRIAL_DAYS if trial_days is None else trial_days
    cur = run("INSERT INTO salons (owner_id, name, sub_until, created_at) VALUES (?, ?, ?, ?)",
              (owner_id, name, (today() + timedelta(days=trial)).isoformat(), _ts()))
    sid = cur.lastrowid
    # Default week: Sat–Wed 9–19, Thu 9–14, Fri closed
    for wd in range(7):
        is_open = 0 if wd == 6 else 1
        end = "14:00" if wd == 5 else "19:00"
        run("INSERT INTO work_hours (salon_id, weekday, is_open, start, end) VALUES (?, ?, ?, '09:00', ?)",
            (sid, wd, is_open, end))
    return sid


def get_salon(sid):
    return q1("SELECT * FROM salons WHERE id=?", (sid,))


def salon_by_owner(uid):
    return q1("SELECT * FROM salons WHERE owner_id=? ORDER BY id LIMIT 1", (uid,))


def list_salons():
    return q("SELECT * FROM salons ORDER BY id")


def update_salon(sid, **fields):
    for k, v in fields.items():
        assert k in SALON_FIELDS, k
        run(f"UPDATE salons SET {k}=? WHERE id=?", (v, sid))


def salon_bookable(salon) -> bool:
    return bool(salon and salon["active"] and salon["sub_until"] and salon["sub_until"] >= today().isoformat())


def bookable_salons():
    return [s for s in list_salons() if salon_bookable(s)]


def extend_subscription(sid, days):
    s = get_salon(sid)
    base = max(today(), date.fromisoformat(s["sub_until"])) if s["sub_until"] else today()
    new = (base + timedelta(days=days)).isoformat()
    update_salon(sid, sub_until=new)
    return new


# ---------- services ----------
def services(sid, only_active=False):
    sql = "SELECT * FROM services WHERE salon_id=? AND deleted=0"
    if only_active:
        sql += " AND active=1"
    return q(sql + " ORDER BY id", (sid,))


def get_service(svc_id):
    return q1("SELECT * FROM services WHERE id=?", (svc_id,))


def add_service(sid, name, price, duration):
    return run("INSERT INTO services (salon_id, name, price, duration) VALUES (?, ?, ?, ?)",
               (sid, name, price, duration)).lastrowid


def update_service(svc_id, **fields):
    for k, v in fields.items():
        assert k in ("name", "price", "duration", "active", "deleted")
        run(f"UPDATE services SET {k}=? WHERE id=?", (v, svc_id))


# ---------- hours & holidays ----------
def work_hours(sid):
    return {r["weekday"]: r for r in q("SELECT * FROM work_hours WHERE salon_id=?", (sid,))}


def set_work_hours(sid, weekday, **fields):
    for k, v in fields.items():
        assert k in ("is_open", "start", "end")
        run(f"UPDATE work_hours SET {k}=? WHERE salon_id=? AND weekday=?", (v, sid, weekday))


def holidays(sid, from_day=None):
    from_day = (from_day or today()).isoformat()
    return [date.fromisoformat(r["day"]) for r in
            q("SELECT day FROM holidays WHERE salon_id=? AND day>=? ORDER BY day", (sid, from_day))]


def add_holiday(sid, d):
    run("INSERT OR IGNORE INTO holidays (salon_id, day) VALUES (?, ?)", (sid, d.isoformat()))


def remove_holiday(sid, d):
    run("DELETE FROM holidays WHERE salon_id=? AND day=?", (sid, d.isoformat()))


def is_holiday(sid, d):
    return q1("SELECT 1 FROM holidays WHERE salon_id=? AND day=?", (sid, d.isoformat())) is not None


# ---------- availability ----------
def day_slots(salon, d: date, duration: int):
    """Returns (status, slots). status in 'closed' | 'full' | 'open'."""
    wh = work_hours(salon["id"]).get(weekday_idx(d))
    if not wh or not wh["is_open"] or is_holiday(salon["id"], d):
        return "closed", []
    open_m, close_m = hm_to_min(wh["start"]), hm_to_min(wh["end"])
    step = max(5, salon["slot_minutes"] or 30)
    busy = [(hm_to_min(r["start"]), hm_to_min(r["end"])) for r in q(
        f"SELECT start, end FROM appointments WHERE salon_id=? AND day=? AND status IN ({','.join('?' * len(BUSY_STATUSES))})",
        (salon["id"], d.isoformat(), *BUSY_STATUSES))]
    earliest = open_m
    if d == today():
        n = now()
        earliest = max(earliest, n.hour * 60 + n.minute + config.MIN_LEAD_MIN)
    elif d < today():
        return "full", []
    slots = []
    t = open_m
    while t + duration <= close_m:
        if t >= earliest and all(t + duration <= b0 or t >= b1 for b0, b1 in busy):
            slots.append(min_to_hm(t))
        t += step
    return ("open" if slots else "full"), slots


def slot_free(salon, d: date, start: str, duration: int) -> bool:
    return start in day_slots(salon, d, duration)[1]


# ---------- appointments ----------
def create_appointment(salon, service, customer_id, name, phone, d: date, start: str, status, deposit=0):
    end = min_to_hm(hm_to_min(start) + service["duration"])
    return run(
        "INSERT INTO appointments (salon_id, service_id, service_name, price, customer_id, customer_name, phone, "
        "day, start, end, status, deposit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (salon["id"], service["id"], service["name"], service["price"], customer_id, name, phone,
         d.isoformat(), start, end, status, deposit, _ts())).lastrowid


def get_appointment(aid):
    return q1("SELECT * FROM appointments WHERE id=?", (aid,))


def set_appointment(aid, **fields):
    for k, v in fields.items():
        assert k in ("status", "receipt_file_id", "reminded")
        run(f"UPDATE appointments SET {k}=? WHERE id=?", (v, aid))


def customer_appointments(uid, limit=10):
    return q("SELECT * FROM appointments WHERE customer_id=? AND day>=? AND status IN ('awaiting_payment','pending','confirmed') "
             "ORDER BY day, start LIMIT ?", (uid, today().isoformat(), limit))


def salon_appointments(sid, day_from: date, day_to: date = None, statuses=("awaiting_payment", "pending", "confirmed")):
    sql = f"SELECT * FROM appointments WHERE salon_id=? AND day>=? AND status IN ({','.join('?' * len(statuses))})"
    args = [sid, day_from.isoformat(), *statuses]
    if day_to:
        sql += " AND day<=?"
        args.append(day_to.isoformat())
    return q(sql + " ORDER BY day, start LIMIT 50", args)


def expire_unpaid():
    cutoff = (now() - timedelta(minutes=config.PAYMENT_TIMEOUT_MIN)).strftime("%Y-%m-%d %H:%M:%S")
    rows = q("SELECT * FROM appointments WHERE status='awaiting_payment' AND created_at<?", (cutoff,))
    for r in rows:
        set_appointment(r["id"], status="expired")
    return rows


def due_reminders():
    """Confirmed appointments whose reminder time has come."""
    n = now()
    out = []
    rows = q("SELECT a.*, s.remind_hours, s.name AS salon_name, s.address AS salon_address FROM appointments a "
             "JOIN salons s ON s.id=a.salon_id WHERE a.status='confirmed' AND a.reminded=0 AND s.remind_hours>0 "
             "AND a.day>=?", (today().isoformat(),))
    for r in rows:
        start = datetime.fromisoformat(f"{r['day']}T{r['start']}").replace(tzinfo=n.tzinfo)
        if start - timedelta(hours=r["remind_hours"]) <= n < start:
            out.append(r)
    return out


# ---------- subscription payments ----------
def add_sub_payment(sid, amount, days, file_id):
    return run("INSERT INTO sub_payments (salon_id, amount, days, receipt_file_id, created_at) VALUES (?, ?, ?, ?, ?)",
               (sid, amount, days, file_id, _ts())).lastrowid


def get_sub_payment(pid):
    return q1("SELECT * FROM sub_payments WHERE id=?", (pid,))


def review_sub_payment(pid, status):
    run("UPDATE sub_payments SET status=?, reviewed_at=? WHERE id=?", (status, _ts(), pid))


def sub_payments(status=None, limit=20):
    if status:
        return q("SELECT p.*, s.name AS salon_name FROM sub_payments p JOIN salons s ON s.id=p.salon_id "
                 "WHERE p.status=? ORDER BY p.id DESC LIMIT ?", (status, limit))
    return q("SELECT p.*, s.name AS salon_name FROM sub_payments p JOIN salons s ON s.id=p.salon_id "
             "ORDER BY p.id DESC LIMIT ?", (limit,))


# ---------- stats ----------
def stats():
    t = today().isoformat()
    one = lambda sql, a=(): q1(sql, a)[0]
    return {
        "users": one("SELECT COUNT(*) FROM users"),
        "salons": one("SELECT COUNT(*) FROM salons"),
        "salons_active": sum(1 for s in list_salons() if salon_bookable(s)),
        "appts": one("SELECT COUNT(*) FROM appointments WHERE status IN ('pending','confirmed','done')"),
        "appts_today": one("SELECT COUNT(*) FROM appointments WHERE day=? AND status IN ('pending','confirmed','done')", (t,)),
        "appts_upcoming": one("SELECT COUNT(*) FROM appointments WHERE day>=? AND status IN ('pending','confirmed')", (t,)),
        "sub_income": one("SELECT COALESCE(SUM(amount),0) FROM sub_payments WHERE status='approved'"),
        "sub_pending": one("SELECT COUNT(*) FROM sub_payments WHERE status='pending'"),
    }


def all_user_ids():
    return [r["id"] for r in q("SELECT id FROM users")]
