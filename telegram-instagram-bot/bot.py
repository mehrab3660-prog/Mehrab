import asyncio
import logging
import os
import re
import subprocess
import tempfile
import uuid
from pathlib import Path

import yt_dlp
from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
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

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

INSTAGRAM_URL_RE = re.compile(
    r"https?://(?:www\.)?instagram\.com/(?:reel|reels|p|tv)/[A-Za-z0-9_-]+/?[^\s]*"
)

DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "ig_bot_downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

# key -> {"video": Path, "audio": Path | None, "caption": str}
media_cache: dict[str, dict] = {}


def download_instagram_media(url: str, key: str) -> dict:
    out_template = str(DOWNLOAD_DIR / f"{key}.%(ext)s")
    ydl_opts = {
        "outtmpl": out_template,
        "format": "mp4/best",
        "quiet": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_path = Path(ydl.prepare_filename(info))

    caption = info.get("description") or info.get("title") or "بدون کپشن"
    return {"video": video_path, "caption": caption}


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


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "سلام! لینک پست، ریل یا IGTV اینستاگرام رو برام بفرست تا ویدیوش رو "
        "برات بفرستم. زیر ویدیو دو دکمه می‌بینی: یکی برای گرفتن کپشن و "
        "یکی برای گرفتن فقط صدای ویدیو."
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text or ""
    match = INSTAGRAM_URL_RE.search(text)
    if not match:
        await update.message.reply_text(
            "لطفاً یک لینک معتبر اینستاگرام (پست، ریل یا IGTV) ارسال کنید."
        )
        return

    url = match.group(0)
    status_msg = await update.message.reply_text("⏳ در حال دانلود ویدیو...")
    key = uuid.uuid4().hex[:12]

    try:
        result = await asyncio.to_thread(download_instagram_media, url, key)
    except Exception as exc:
        logger.exception("Failed to download %s", url)
        await status_msg.edit_text(f"❌ دانلود ویدیو ناموفق بود:\n{exc}")
        return

    media_cache[key] = {
        "video": result["video"],
        "audio": None,
        "caption": result["caption"],
    }

    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("📝 کپشن", callback_data=f"caption:{key}"),
                InlineKeyboardButton("🎵 دریافت صدا", callback_data=f"audio:{key}"),
            ]
        ]
    )

    await status_msg.delete()
    with open(result["video"], "rb") as video_file:
        await update.message.reply_video(video_file, reply_markup=keyboard)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    action, _, key = (query.data or "").partition(":")
    entry = media_cache.get(key)

    if entry is None:
        await query.answer("این ویدیو دیگر در دسترس نیست.", show_alert=True)
        return

    if action == "caption":
        await query.answer()
        caption = entry["caption"] or "بدون کپشن"
        await query.message.reply_text(caption[:4000])
        return

    if action == "audio":
        await query.answer("در حال آماده‌سازی صدا...")
        try:
            if entry["audio"] is None:
                entry["audio"] = await asyncio.to_thread(
                    extract_audio, entry["video"], key
                )
            with open(entry["audio"], "rb") as audio_file:
                await query.message.reply_audio(audio_file)
        except Exception:
            logger.exception("Failed to extract audio for key %s", key)
            await query.message.reply_text("❌ استخراج صدا ناموفق بود.")
        return

    await query.answer()


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.run_polling()


if __name__ == "__main__":
    main()
