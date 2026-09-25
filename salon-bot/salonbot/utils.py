import html
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import jdatetime

TZ = ZoneInfo("Asia/Tehran")

WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]
MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
          "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]

_TO_FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
_TO_EN = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def esc(s) -> str:
    return html.escape(str(s or ""))


def fa(x) -> str:
    return str(x).translate(_TO_FA)


def to_en(s: str) -> str:
    return (s or "").translate(_TO_EN)


def now() -> datetime:
    return datetime.now(TZ)


def today() -> date:
    return now().date()


def money(n) -> str:
    return fa(f"{int(n or 0):,}".replace(",", "٬")) + " تومان"


def weekday_idx(d: date) -> int:
    """Iranian week index: Saturday=0 ... Friday=6."""
    return (d.weekday() + 2) % 7


def jdate_label(d: date) -> str:
    j = jdatetime.date.fromgregorian(date=d)
    return f"{WEEKDAYS[weekday_idx(d)]} {fa(j.day)} {MONTHS[j.month - 1]}"


def jdate_full(d: date) -> str:
    j = jdatetime.date.fromgregorian(date=d)
    return fa(f"{j.year}/{j.month:02d}/{j.day:02d}")


def parse_jdate(s: str):
    m = re.fullmatch(r"\s*(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*", to_en(s))
    if not m:
        return None
    try:
        return jdatetime.date(int(m[1]), int(m[2]), int(m[3])).togregorian()
    except ValueError:
        return None


def ymd(d: date) -> str:
    return d.strftime("%Y%m%d")


def from_ymd(s: str) -> date:
    return datetime.strptime(s, "%Y%m%d").date()


def hm_to_min(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def min_to_hm(x: int) -> str:
    return f"{x // 60:02d}:{x % 60:02d}"


def parse_time(s: str):
    m = re.fullmatch(r"\s*(\d{1,2})(?:\s*[:٫.]\s*(\d{1,2}))?\s*", to_en(s))
    if not m:
        return None
    h, mi = int(m[1]), int(m[2] or 0)
    if h == 24 and mi == 0:
        return "24:00"
    if not (0 <= h < 24 and 0 <= mi < 60):
        return None
    return f"{h:02d}:{mi:02d}"


def parse_range(s: str):
    """'9-18', '9:30 تا 17' -> ('09:00', '18:00')"""
    parts = re.split(r"\s*(?:-|–|تا|الی)\s*", to_en(s).strip())
    if len(parts) != 2:
        return None
    a, b = parse_time(parts[0]), parse_time(parts[1])
    if not a or not b or hm_to_min(a) >= hm_to_min(b):
        return None
    return a, b


def parse_int(s: str):
    s = to_en(s).replace(",", "").replace("٬", "").replace("،", "").strip()
    return int(s) if s.isdigit() else None


def normalize_phone(s: str):
    s = re.sub(r"[\s\-()]", "", to_en(s))
    if s.startswith("+98"):
        s = "0" + s[3:]
    elif s.startswith("0098"):
        s = "0" + s[4:]
    elif s.startswith("98") and len(s) == 12:
        s = "0" + s[2:]
    elif s.startswith("9") and len(s) == 10:
        s = "0" + s
    return s if re.fullmatch(r"0\d{10}", s) else None


def normalize_card(s: str):
    s = re.sub(r"[\s\-]", "", to_en(s))
    return s if re.fullmatch(r"\d{16}", s) else None


def card_fmt(s: str) -> str:
    return fa(" ".join(s[i:i + 4] for i in range(0, len(s), 4))) if s else "—"


def days_left(until: str) -> int:
    if not until:
        return -1
    return (date.fromisoformat(until) - today()).days


def future_days(n: int, start: date = None):
    start = start or today()
    return [start + timedelta(days=i) for i in range(n)]
