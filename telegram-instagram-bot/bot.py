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
from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, User
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

RATE_LIMIT_PER_DAY = 20
MAX_TELEGRAM_FILE_BYTES = 49 * 1024 * 1024
DOWNLOAD_SEMAPHORE = asyncio.Semaphore(3)

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

DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "ig_bot_downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

DB_PATH = Path(__file__).parent / "bot_data.db"

# key -> {"video": Path, "audio": Path | None, "gif": Path | None, "caption": str}
media_cache: dict[str, dict] = {}


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


def extract_voice(video_path: Path, key: str) -> Path:
    voice_path = DOWNLOAD_DIR / f"{key}.ogg"
    if voice_path.exists():
        return voice_path
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-c:a", "libopus", "-b:a", "64k",
            str(voice_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return voice_path


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
            [InlineKeyboardButton("📢 پیام همگانی", callback_data="admin_broadcast_help")]
        )
    return InlineKeyboardMarkup(rows)


async def send_stats(target) -> None:
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    conn.close()
    await target.reply_text(f"👥 تعداد کاربران: {count}")


async def send_users_list(target) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT user_id, username, first_name, message_count, last_seen "
        "FROM users ORDER BY last_seen DESC"
    ).fetchall()
    conn.close()

    if not rows:
        await target.reply_text("هنوز کاربری ثبت نشده.")
        return

    lines = []
    for row in rows:
        uname = f"@{row['username']}" if row["username"] else "(بدون یوزرنیم)"
        lines.append(
            f"{row['first_name'] or ''} {uname} | id: {row['user_id']} | "
            f"پیام‌ها: {row['message_count']} | آخرین بازدید: {row['last_seen']}"
        )
    text = "\n".join(lines)
    for i in range(0, len(text), 4000):
        await target.reply_text(text[i:i + 4000])


async def send_history(target, user_id: int, limit: int = 50) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
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


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = (
        "سلام! لینک پست/ریل اینستاگرام، تیک‌تاک، یوتیوب شورتس یا توییتر/X رو "
        "برام بفرست تا ویدیوش رو برات بفرستم. زیر ویدیو دکمه‌هایی برای گرفتن "
        "کپشن، صدا و GIF می‌بینی."
    )
    if is_admin(update):
        await update.message.reply_text(
            message,
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("⚙️ تنظیمات", callback_data="open_settings")]]
            ),
        )
    else:
        await update.message.reply_text(message)


async def settings_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update):
        return
    await update.message.reply_text(
        "⚙️ تنظیمات:", reply_markup=build_settings_keyboard(True)
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text or ""
    record_user_message(update.effective_user, text)

    match = LINK_RE.search(text)
    if not match:
        await update.message.reply_text(
            "لطفاً یک لینک معتبر اینستاگرام، تیک‌تاک، یوتیوب شورتس یا توییتر/X "
            "ارسال کنید."
        )
        return

    if not is_admin(update) and not check_rate_limit(update.effective_user.id):
        await update.message.reply_text(
            f"⛔️ به سقف {RATE_LIMIT_PER_DAY} دانلود روزانه رسیدی. فردا دوباره امتحان کن."
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
        return

    media_cache[key] = {
        "video": result["video"],
        "audio": None,
        "gif": None,
        "caption": result["caption"],
    }

    try:
        send_path = await asyncio.to_thread(ensure_within_telegram_limit, result["video"])
    except Exception:
        logger.exception("Failed to compress video for key %s", key)
        send_path = result["video"]

    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("📝 کپشن", callback_data=f"caption:{key}"),
                InlineKeyboardButton("🎵 صدا", callback_data=f"voice:{key}"),
                InlineKeyboardButton("🎞 GIF", callback_data=f"gif:{key}"),
            ]
        ]
    )

    await status_msg.delete()
    with open(send_path, "rb") as video_file:
        await update.message.reply_video(video_file, reply_markup=keyboard)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    data = query.data or ""

    if data == "open_settings":
        if not is_admin(update):
            await query.answer("دسترسی نداری.", show_alert=True)
            return
        await query.answer()
        await query.message.reply_text(
            "⚙️ تنظیمات:", reply_markup=build_settings_keyboard(True)
        )
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
        await send_users_list(query.message)
        return

    if data == "admin_broadcast_help":
        if not is_admin(update):
            await query.answer("دسترسی نداری.", show_alert=True)
            return
        await query.answer()
        await query.message.reply_text("برای پیام همگانی این دستور رو بزن:\n/broadcast متن پیام شما")
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

    if action == "voice":
        await query.answer("در حال آماده‌سازی صدا...")
        try:
            if entry.get("audio") is None:
                entry["audio"] = await asyncio.to_thread(extract_voice, entry["video"], key)
            with open(entry["audio"], "rb") as audio_file:
                await query.message.reply_voice(audio_file)
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


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update):
        return
    await send_stats(update.message)


async def users_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update):
        return
    await send_users_list(update.message)


async def history_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update):
        return
    if not context.args:
        await update.message.reply_text("استفاده: /history <user_id>")
        return
    try:
        target_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("آیدی نامعتبر است.")
        return
    await send_history(update.message, target_id, limit=50)


async def mydownloads_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await send_history(update.message, update.effective_user.id, limit=20)


async def broadcast_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update):
        return
    if not context.args:
        await update.message.reply_text("استفاده: /broadcast متن پیام")
        return
    text = " ".join(context.args)

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
    await update.message.reply_text(f"✅ به {sent} کاربر ارسال شد.")


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
    app.add_handler(CommandHandler("settings", settings_cmd))
    app.add_handler(CommandHandler("stats", stats_cmd))
    app.add_handler(CommandHandler("users", users_cmd))
    app.add_handler(CommandHandler("history", history_cmd))
    app.add_handler(CommandHandler("mydownloads", mydownloads_cmd))
    app.add_handler(CommandHandler("broadcast", broadcast_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_error_handler(error_handler)
    app.run_polling()


if __name__ == "__main__":
    main()
