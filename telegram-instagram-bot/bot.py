import asyncio
import hashlib
import logging
import os
import re
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yt_dlp
from deep_translator import GoogleTranslator
from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    Update,
    User,
)
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

load_dotenv()

BOT_TOKEN = os.environ["BOT_TOKEN"]
ADMIN_ID = int(os.environ.get("ADMIN_ID", "0"))
COOKIES_FILE = os.environ.get("COOKIES_FILE") or None
STICKER_FILE_ID = os.environ.get("STICKER_FILE_ID") or None

RATE_LIMIT_PER_DAY = 20
MAX_TELEGRAM_FILE_BYTES = 49 * 1024 * 1024
DOWNLOAD_SEMAPHORE = asyncio.Semaphore(3)

SETTINGS_BUTTON_TEXT = "⚙️ تنظیمات"
ADMIN_KEYBOARD = ReplyKeyboardMarkup([[SETTINGS_BUTTON_TEXT]], resize_keyboard=True)
CONTACT_ADMIN_BUTTON = InlineKeyboardButton("📩 ارسال پیام به ادمین", callback_data="contact_admin")

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

LINK_RE = re.compile(
    r"https?://(?:www\.)?(?:"
    r"instagram\.com/(?:reel|reels|p|tv)/[A-Za-z0-9_-]+"
    r"|tiktok\.com/@[\w.\-]+/video/\d+"
    r"|vm\.tiktok\.com/[A-Za-z0-9]+"
    r"|youtube\.com/shorts/[A-Za-z0-9_-]+"
    r"|youtu\.be/[A-Za-z0-9_-]+"
    r"|(?:twitter|x)\.com/\w+/status/\d+"
    r")[^\s]*"
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
CLEANUP_MAX_AGE_HOURS = 24

DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "ig_bot_downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

DB_PATH = Path(__file__).parent / "bot_data.db"

# key -> {"video": Path, "audio": Path | None, "gif": Path | None, "caption": str}
media_cache: dict[str, dict] = {}

# admin's sent message_id -> user_id, so an admin reply can be routed back
admin_reply_targets: dict[int, int] = {}

TRIM_RE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            first_seen TEXT,
            last_seen TEXT,
            message_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT,
            sent_at TEXT
        );

        CREATE TABLE IF NOT EXISTS link_cache (
            key TEXT PRIMARY KEY,
            url TEXT,
            video_path TEXT,
            caption TEXT,
            created_at TEXT
        );
        """
    )
    conn.commit()
    conn.close()


def record_user_message(user: User, text: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        INSERT INTO users (user_id, username, first_name, first_seen, last_seen, message_count)
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_seen = excluded.last_seen,
            message_count = message_count + 1
        """,
        (user.id, user.username, user.first_name, now, now),
    )
    conn.execute(
        "INSERT INTO messages (user_id, text, sent_at) VALUES (?, ?, ?)",
        (user.id, text, now),
    )
    conn.commit()
    conn.close()


def is_admin(update: Update) -> bool:
    return bool(ADMIN_ID) and update.effective_user.id == ADMIN_ID


def check_rate_limit(user_id: int) -> bool:
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute(
        "SELECT COUNT(*) FROM messages WHERE user_id = ? AND sent_at > ?",
        (user_id, since),
    ).fetchone()[0]
    conn.close()
    return count <= RATE_LIMIT_PER_DAY


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def load_cache_entry(key: str) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM link_cache WHERE key = ?", (key,)).fetchone()
    conn.close()
    if row and Path(row["video_path"]).exists():
        return {"video": Path(row["video_path"]), "caption": row["caption"]}
    return None


def save_cache_entry(key: str, url: str, video_path: Path, caption: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO link_cache (key, url, video_path, caption, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (key, url, str(video_path), caption, now),
    )
    conn.commit()
    conn.close()


def download_media(url: str, key: str) -> dict:
    cached = load_cache_entry(key)
    if cached:
        return cached

    out_template = str(DOWNLOAD_DIR / f"{key}.%(ext)s")
    ydl_opts = {
        "outtmpl": out_template,
        "format": "mp4/best",
        "quiet": True,
        "noplaylist": True,
    }
    if COOKIES_FILE:
        ydl_opts["cookiefile"] = COOKIES_FILE
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_path = Path(ydl.prepare_filename(info))

    caption = info.get("description") or info.get("title") or "بدون کپشن"
    save_cache_entry(key, url, video_path, caption)
    return {"video": video_path, "caption": caption}


def ensure_within_telegram_limit(video_path: Path) -> Path:
    if video_path.stat().st_size <= MAX_TELEGRAM_FILE_BYTES:
        return video_path
    compressed_path = video_path.with_name(video_path.stem + "_compressed.mp4")
    if not compressed_path.exists():
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(video_path),
                "-vf", "scale='min(720,iw)':-2",
                "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
                "-c:a", "aac", "-b:a", "96k",
                str(compressed_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return compressed_path


def extract_audio(video_path: Path, key: str) -> Path:
    audio_path = DOWNLOAD_DIR / f"{key}.mp3"
    if audio_path.exists():
        return audio_path
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-acodec", "libmp3lame", "-q:a", "2",
            str(audio_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return audio_path


def extract_gif(video_path: Path, key: str) -> Path:
    gif_path = DOWNLOAD_DIR / f"{key}.gif"
    if gif_path.exists():
        return gif_path
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-t", "6", "-vf", "fps=12,scale=480:-1:flags=lanczos",
            str(gif_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return gif_path


def trim_video(video_path: Path, key: str, start: int, end: int) -> Path:
    trimmed_path = DOWNLOAD_DIR / f"{key}_trim_{start}_{end}.mp4"
    if trimmed_path.exists():
        return trimmed_path
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-ss", str(start), "-to", str(end),
            "-c:v", "libx264", "-c:a", "aac",
            str(trimmed_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return trimmed_path


def translate_to_persian(text: str) -> str:
    return GoogleTranslator(source="auto", target="fa").translate(text)


def build_settings_keyboard(admin: bool) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton("📜 دانلودهای من", callback_data="mydownloads")]]
    if admin:
        rows.append(
            [
                InlineKeyboardButton("📊 آمار", callback_data="admin_stats"),
                InlineKeyboardButton("👥 کاربران", callback_data="admin_users"),
            ]
        )
        rows.append(
            [InlineKeyboardButton("📢 پیام همگانی", callback_data="admin_broadcast")]
        )
    return InlineKeyboardMarkup(rows)


async def send_stats(target) -> None:
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    conn.close()
    await target.reply_text(f"👥 تعداد کاربران: {count}")


async def send_users_keyboard(target) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT user_id, username, first_name, message_count "
        "FROM users ORDER BY last_seen DESC LIMIT 30"
    ).fetchall()
    conn.close()

    if not rows:
        await target.reply_text("هنوز کاربری ثبت نشده.")
        return

    buttons = []
    for row in rows:
        uname = f"@{row['username']}" if row["username"] else ""
        label = f"{row['first_name'] or ''} {uname} | id:{row['user_id']} | {row['message_count']} پیام".strip()
        buttons.append(
            [InlineKeyboardButton(label, callback_data=f"view_user:{row['user_id']}")]
        )
    await target.reply_text(
        "👥 برای دیدن پیام‌های هر کاربر روش بزن:",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def send_history(target, user_id: int, limit: int = 50, show_user_info: bool = False) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    if show_user_info:
        user_row = conn.execute(
            "SELECT username, first_name FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        if user_row:
            uname = f"@{user_row['username']}" if user_row["username"] else "(بدون یوزرنیم)"
            await target.reply_text(
                f"👤 {user_row['first_name'] or ''} {uname} | id: {user_id}"
            )
    rows = conn.execute(
        "SELECT text, sent_at FROM messages WHERE user_id = ? "
        "ORDER BY sent_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()

    if not rows:
        await target.reply_text("پیامی ثبت نشده.")
        return

    text = "\n".join(f"[{row['sent_at']}] {row['text']}" for row in rows)
    for i in range(0, len(text), 4000):
        await target.reply_text(text[i:i + 4000])


async def send_broadcast(context: ContextTypes.DEFAULT_TYPE, text: str) -> int:
    conn = sqlite3.connect(DB_PATH)
    user_ids = [row[0] for row in conn.execute("SELECT user_id FROM users").fetchall()]
    conn.close()

    sent = 0
    for uid in user_ids:
        try:
            await context.bot.send_message(uid, text)
            sent += 1
        except Exception:
            logger.exception("Failed to broadcast to user %s", uid)
    return sent


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = (
        "سلام! 👋\n\n"
        "لینک هر کدوم از این پلتفرم‌ها رو برام بفرست تا ویدیوش رو برات بفرستم:\n"
        "• اینستاگرام (پست، ریل، IGTV)\n"
        "• تیک‌تاک\n"
        "• یوتیوب شورتس\n"
        "• توییتر/X\n\n"
        "خدماتی که انجام می‌دم:\n"
        "📥 دانلود مستقیم ویدیو و ارسالش همین‌جا\n"
        "📝 گرفتن کپشن پست با یه دکمه\n"
        "🎵 گرفتن فقط صدای ویدیو (به‌صورت پیام صوتی)\n"
        "🎞 ساخت GIF کوتاه از ویدیو\n"
        "⚡️ ارسال فوری برای لینک‌های تکراری (بدون دانلود دوباره)\n"
        "📦 فشرده‌سازی خودکار ویدیوهای حجیم\n\n"
        "کافیه لینک رو بفرستی، بقیه‌ش با من!"
    )
    if STICKER_FILE_ID:
        try:
            await update.message.reply_sticker(STICKER_FILE_ID)
        except Exception:
            logger.exception("Failed to send welcome sticker")
    if is_admin(update):
        await update.message.reply_text(message, reply_markup=ADMIN_KEYBOARD)
    else:
        await update.message.reply_text(
            message,
            reply_markup=InlineKeyboardMarkup([[CONTACT_ADMIN_BUTTON]]),
        )


async def notify_admin_of_message(context: ContextTypes.DEFAULT_TYPE, user: User, text: str) -> None:
    if not ADMIN_ID or user.id == ADMIN_ID:
        return
    uname = f"@{user.username}" if user.username else "(بدون یوزرنیم)"
    try:
        sent = await context.bot.send_message(
            ADMIN_ID,
            f"📩 پیام جدید از {user.first_name or ''} {uname} (id: {user.id}):\n\n{text}\n\n"
            "(برای پاسخ به این کاربر، روی همین پیام Reply کن)",
        )
        admin_reply_targets[sent.message_id] = user.id
    except Exception:
        logger.exception("Failed to notify admin of message from %s", user.id)


async def handle_sticker(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    sticker = update.message.sticker
    user = update.effective_user

    if is_admin(update):
        await update.message.reply_text(
            "این آیدی استیکرو کپی کن و به‌عنوان STICKER_FILE_ID تو فایل .env بذار:\n\n"
            f"{sticker.file_id}"
        )
        return

    if ADMIN_ID:
        uname = f"@{user.username}" if user.username else "(بدون یوزرنیم)"
        try:
            await context.bot.forward_message(
                ADMIN_ID, update.effective_chat.id, update.message.message_id
            )
            sent = await context.bot.send_message(
                ADMIN_ID,
                f"👆 استیکر از {user.first_name or ''} {uname} (id: {user.id})\n"
                "(برای پاسخ به این کاربر، روی همین پیام Reply کن)",
            )
            admin_reply_targets[sent.message_id] = user.id
        except Exception:
            logger.exception("Failed to notify admin of sticker from %s", user.id)


async def process_trim(update: Update, context: ContextTypes.DEFAULT_TYPE, key: str, text: str) -> None:
    match = TRIM_RE.match(text)
    if not match:
        await update.message.reply_text("فرمت نامعتبره. مثال درست: 5-15")
        return
    start, end = int(match.group(1)), int(match.group(2))
    if end <= start:
        await update.message.reply_text("زمان پایان باید از شروع بزرگ‌تر باشه.")
        return

    entry = media_cache.get(key)
    if entry is None:
        cached = load_cache_entry(key)
        if cached:
            entry = {"video": cached["video"], "audio": None, "gif": None, "caption": cached["caption"]}
            media_cache[key] = entry
    if entry is None or entry["video"].suffix.lower() in IMAGE_EXTENSIONS:
        await update.message.reply_text("این ویدیو دیگه در دسترس نیست.")
        return

    status_msg = await update.message.reply_text("✂️ در حال برش...")
    try:
        trimmed_path = await asyncio.to_thread(trim_video, entry["video"], key, start, end)
    except Exception:
        logger.exception("Failed to trim video for key %s", key)
        await status_msg.edit_text("❌ برش ناموفق بود.")
        return
    await status_msg.delete()
    with open(trimmed_path, "rb") as trimmed_file:
        await update.message.reply_video(trimmed_file)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text or ""

    if is_admin(update) and update.message.reply_to_message:
        target_user_id = admin_reply_targets.get(update.message.reply_to_message.message_id)
        if target_user_id:
            try:
                await context.bot.send_message(target_user_id, text)
                await update.message.reply_text("✅ پیام برای کاربر ارسال شد.")
            except Exception:
                logger.exception("Failed to relay admin reply to user %s", target_user_id)
                await update.message.reply_text("❌ ارسال پیام ناموفق بود.")
            return

    if is_admin(update) and text == SETTINGS_BUTTON_TEXT:
        await update.message.reply_text(
            "⚙️ تنظیمات:", reply_markup=build_settings_keyboard(True)
        )
        return

    if is_admin(update) and context.user_data.get("awaiting_broadcast"):
        context.user_data["awaiting_broadcast"] = False
        sent = await send_broadcast(context, text)
        await update.message.reply_text(f"✅ به {sent} کاربر ارسال شد.")
        return

    trim_key = context.user_data.get("awaiting_trim")
    if trim_key:
        context.user_data["awaiting_trim"] = None
        await process_trim(update, context, trim_key, text)
        return

    if context.user_data.get("awaiting_admin_message"):
        context.user_data["awaiting_admin_message"] = False
        record_user_message(update.effective_user, text)
        await notify_admin_of_message(context, update.effective_user, text)
        await update.message.reply_text("✅ پیامت برای ادمین ارسال شد.")
        return

    record_user_message(update.effective_user, text)
    await notify_admin_of_message(context, update.effective_user, text)

    match = LINK_RE.search(text)
    if not match:
        await update.message.reply_text(
            "لطفاً یک لینک معتبر اینستاگرام، تیک‌تاک، یوتیوب شورتس یا توییتر/X "
            "ارسال کنید.",
            reply_markup=InlineKeyboardMarkup([[CONTACT_ADMIN_BUTTON]]),
        )
        return

    if not is_admin(update) and not check_rate_limit(update.effective_user.id):
        await update.message.reply_text(
            f"⛔️ به سقف {RATE_LIMIT_PER_DAY} دانلود روزانه رسیدی. فردا دوباره امتحان کن.",
            reply_markup=InlineKeyboardMarkup([[CONTACT_ADMIN_BUTTON]]),
        )
        return

    url = match.group(0)
    status_msg = await update.message.reply_text("⏳ در حال دانلود...")
    key = url_hash(url)

    try:
        async with DOWNLOAD_SEMAPHORE:
            result = await asyncio.to_thread(download_media, url, key)
    except Exception as exc:
        logger.exception("Failed to download %s", url)
        await status_msg.edit_text(f"❌ دانلود ناموفق بود:\n{exc}")
        await update.message.reply_text(
            "اگه مشکل ادامه داشت می‌تونی به ادمین پیام بدی:",
            reply_markup=InlineKeyboardMarkup([[CONTACT_ADMIN_BUTTON]]),
        )
        return

    media_cache[key] = {
        "video": result["video"],
        "audio": None,
        "gif": None,
        "caption": result["caption"],
    }

    extra_rows = [] if is_admin(update) else [[CONTACT_ADMIN_BUTTON]]

    if result["video"].suffix.lower() in IMAGE_EXTENSIONS:
        keyboard = InlineKeyboardMarkup(
            [[InlineKeyboardButton("📝 کپشن", callback_data=f"caption:{key}")], *extra_rows]
        )
        await status_msg.delete()
        with open(result["video"], "rb") as photo_file:
            await update.message.reply_photo(photo_file, reply_markup=keyboard)
        return

    try:
        send_path = await asyncio.to_thread(ensure_within_telegram_limit, result["video"])
    except Exception:
        logger.exception("Failed to compress video for key %s", key)
        send_path = result["video"]

    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("📝 کپشن", callback_data=f"caption:{key}"),
                InlineKeyboardButton("🌐 ترجمه کپشن", callback_data=f"translate:{key}"),
            ],
            [
                InlineKeyboardButton("🎵 صدا", callback_data=f"voice:{key}"),
                InlineKeyboardButton("🎞 GIF", callback_data=f"gif:{key}"),
                InlineKeyboardButton("✂️ برش", callback_data=f"trim:{key}"),
            ],
            *extra_rows,
        ]
    )

    await status_msg.delete()
    with open(send_path, "rb") as video_file:
        await update.message.reply_video(video_file, reply_markup=keyboard)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    data = query.data or ""

    if data == "contact_admin":
        await query.answer()
        context.user_data["awaiting_admin_message"] = True
        await query.message.reply_text("📩 پیامت رو بنویس، مستقیم برای ادمین می‌فرستم:")
        return

    if data == "mydownloads":
        await query.answer()
        await send_history(query.message, update.effective_user.id, limit=20)
        return

    if data == "admin_stats":
        if not is_admin(update):
            await query.answer("دسترسی نداری.", show_alert=True)
            return
        await query.answer()
        await send_stats(query.message)
        return

    if data == "admin_users":
        if not is_admin(update):
            await query.answer("دسترسی نداری.", show_alert=True)
            return
        await query.answer()
        await send_users_keyboard(query.message)
        return

    if data == "admin_broadcast":
        if not is_admin(update):
            await query.answer("دسترسی نداری.", show_alert=True)
            return
        await query.answer()
        context.user_data["awaiting_broadcast"] = True
        await query.message.reply_text("📢 متن پیام همگانی رو همین‌جا بفرست:")
        return

    if data.startswith("view_user:"):
        if not is_admin(update):
            await query.answer("دسترسی نداری.", show_alert=True)
            return
        await query.answer()
        target_id = int(data.partition(":")[2])
        await send_history(query.message, target_id, limit=30, show_user_info=True)
        return

    action, _, key = data.partition(":")
    entry = media_cache.get(key)
    if entry is None:
        cached = load_cache_entry(key)
        if cached:
            entry = {
                "video": cached["video"],
                "audio": None,
                "gif": None,
                "caption": cached["caption"],
            }
            media_cache[key] = entry

    if entry is None:
        await query.answer("این ویدیو دیگر در دسترس نیست.", show_alert=True)
        return

    if action == "caption":
        await query.answer()
        caption = entry["caption"] or "بدون کپشن"
        await query.message.reply_text(caption[:4000])
        return

    if action == "translate":
        await query.answer("در حال ترجمه...")
        try:
            translated = await asyncio.to_thread(translate_to_persian, entry["caption"] or "")
            await query.message.reply_text(translated[:4000] or "چیزی برای ترجمه نبود.")
        except Exception:
            logger.exception("Failed to translate caption for key %s", key)
            await query.message.reply_text("❌ ترجمه ناموفق بود.")
        return

    if action == "trim":
        if entry["video"].suffix.lower() in IMAGE_EXTENSIONS:
            await query.answer("این یک عکسه، برش فقط برای ویدیوئه.", show_alert=True)
            return
        await query.answer()
        context.user_data["awaiting_trim"] = key
        await query.message.reply_text(
            "بازه‌ی زمانی رو به‌صورت start-end به ثانیه بفرست (مثلاً 5-15):"
        )
        return

    if action == "voice":
        await query.answer("در حال آماده‌سازی صدا...")
        try:
            if entry.get("audio") is None:
                entry["audio"] = await asyncio.to_thread(extract_audio, entry["video"], key)
            with open(entry["audio"], "rb") as audio_file:
                await query.message.reply_audio(audio_file, title="صدای ویدیو")
        except Exception:
            logger.exception("Failed to extract audio for key %s", key)
            await query.message.reply_text("❌ استخراج صدا ناموفق بود.")
        return

    if action == "gif":
        await query.answer("در حال ساخت GIF...")
        try:
            if entry.get("gif") is None:
                entry["gif"] = await asyncio.to_thread(extract_gif, entry["video"], key)
            with open(entry["gif"], "rb") as gif_file:
                await query.message.reply_animation(gif_file)
        except Exception:
            logger.exception("Failed to extract gif for key %s", key)
            await query.message.reply_text("❌ ساخت GIF ناموفق بود.")
        return

    await query.answer()


def cleanup_old_downloads() -> None:
    cutoff = datetime.now(timezone.utc).timestamp() - CLEANUP_MAX_AGE_HOURS * 3600
    for path in DOWNLOAD_DIR.iterdir():
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            logger.exception("Failed to remove old file %s", path)

    cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM link_cache WHERE created_at < ?", (cutoff_iso,))
    conn.commit()
    conn.close()


async def cleanup_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    await asyncio.to_thread(cleanup_old_downloads)


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Unhandled exception", exc_info=context.error)
    if ADMIN_ID:
        try:
            await context.bot.send_message(ADMIN_ID, f"⚠️ خطای ربات:\n{context.error}")
        except Exception:
            pass


def main() -> None:
    init_db()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(MessageHandler(filters.Sticker.ALL, handle_sticker))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_error_handler(error_handler)
    app.job_queue.run_repeating(cleanup_job, interval=3600, first=60)
    app.run_polling()


if __name__ == "__main__":
    main()
