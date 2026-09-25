import os


def _load_dotenv(path=".env"):
    """Minimal .env loader so the bot runs without extra dependencies."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
SUPER_ADMIN_IDS = {
    int(x) for x in os.environ.get("SUPER_ADMIN_IDS", "").replace(" ", "").split(",") if x.strip().lstrip("-").isdigit()
}
DB_PATH = os.environ.get("DB_PATH", "salon.db")
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "14") or 14)
PROXY_URL = os.environ.get("PROXY_URL", "").strip()

# How many days ahead customers can book
BOOKING_DAYS = int(os.environ.get("BOOKING_DAYS", "7") or 7)
# Minutes an unpaid (deposit) booking holds its slot before expiring
PAYMENT_TIMEOUT_MIN = int(os.environ.get("PAYMENT_TIMEOUT_MIN", "30") or 30)
# Earliest a same-day slot can be booked, in minutes from now
MIN_LEAD_MIN = int(os.environ.get("MIN_LEAD_MIN", "30") or 30)


def is_super(user_id: int) -> bool:
    return user_id in SUPER_ADMIN_IDS
