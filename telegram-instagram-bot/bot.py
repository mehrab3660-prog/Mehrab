"""Telegram bot that fetches an Instagram reel/post and, only after the user
confirms with a button tap, sends back the video, its audio track, and its
caption."""

import asyncio
import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

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
from yt_dlp import YoutubeDL

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.environ["BOT_TOKEN"]
ALLOWED_USER_IDS = {
    int(uid.strip())
    for uid in os.environ.get("ALLOWED_USER_IDS", "").split(",")
    if uid.strip()
}
COOKIES_FILE = os.environ.get("INSTAGRAM_COOKIES_FILE") or None

INSTAGRAM_URL_RE = re.compile(
    r"https?://(?:www\.)?instagram\.com/(?:reel|reels|p|tv)/[\w-]+"
)

# job_id -> {user_id, dest_dir, video_path, audio_path, caption}
pending_jobs: dict[str, dict] = {}


def is_allowed(user_id: int) -> bool:
    return not ALLOWED_USER_IDS or user_id in ALLOWED_USER_IDS


def download_instagram(url: str, dest_dir: Path) -> dict:
    ydl_opts = {
        "outtmpl": str(dest_dir / "%(id)s.%(ext)s"),
        "format": "mp4/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    if COOKIES_FILE:
        ydl_opts["cookiefile"] = COOKIES_FILE

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_path = Path(ydl.prepare_filename(info))

    return {
        "video_path": video_path,
        "caption": info.get("description") or info.get("title") or "",
    }


def extract_audio(video_path: Path) -> Path:
    audio_path = video_path.with_suffix(".mp3")
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


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id):
        await update.message.reply_text("این ربات خصوصیه و فقط برای صاحبش کار می‌کنه.")
        return
    await update.message.reply_text(
        "سلام! لینک ریلز یا پست اینستاگرام رو برام بفرست.\n"
        "کلیپ، صداش و کپشن رو آماده می‌کنم و فقط وقتی دکمه‌ی «ارسال کن» رو بزنی، "
        "برات می‌فرستمشون."
    )


async def whoami(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"آیدی عددی شما: {update.effective_user.id}")


async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if not is_allowed(user.id):
        await update.message.reply_text("دسترسی به این ربات فقط برای صاحبش آزاده.")
        return

    text = update.message.text or ""
    match = INSTAGRAM_URL_RE.search(text)
    if not match:
        await update.message.reply_text("این یه لینک معتبر اینستاگرام (ریلز/پست) نیست.")
        return

    url = match.group(0)
    status_msg = await update.message.reply_text("در حال دریافت از اینستاگرام... ⏳")

    dest_dir = Path(tempfile.mkdtemp(prefix="igbot_"))
    try:
        result = await asyncio.to_thread(download_instagram, url, dest_dir)
        video_path = result["video_path"]
        caption = result["caption"]
        audio_path = await asyncio.to_thread(extract_audio, video_path)
    except Exception:
        logger.exception("Failed to fetch %s", url)
        shutil.rmtree(dest_dir, ignore_errors=True)
        await status_msg.edit_text(
            "نتونستم این لینک رو دانلود کنم. ممکنه پست خصوصی باشه یا لینک اشتباه باشه."
        )
        return

    job_id = uuid.uuid4().hex
    pending_jobs[job_id] = {
        "user_id": user.id,
        "dest_dir": dest_dir,
        "video_path": video_path,
        "audio_path": audio_path,
        "caption": caption,
    }

    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("ارسال کن ✅", callback_data=f"send:{job_id}"),
                InlineKeyboardButton("لغو ❌", callback_data=f"cancel:{job_id}"),
            ]
        ]
    )
    await status_msg.edit_text(
        "آماده شد! برای دریافت کلیپ، صدا و کپشن روی دکمه بزن 👇",
        reply_markup=keyboard,
    )


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    action, _, job_id = query.data.partition(":")
    job = pending_jobs.get(job_id)

    if not job or job["user_id"] != query.from_user.id:
        await query.edit_message_text("این درخواست دیگه معتبر نیست.")
        return

    if action == "cancel":
        shutil.rmtree(job["dest_dir"], ignore_errors=True)
        pending_jobs.pop(job_id, None)
        await query.edit_message_text("لغو شد.")
        return

    if action == "send":
        await query.edit_message_reply_markup(reply_markup=None)
        chat_id = query.message.chat_id
        try:
            with open(job["video_path"], "rb") as video_file:
                await context.bot.send_video(chat_id=chat_id, video=video_file)
            with open(job["audio_path"], "rb") as audio_file:
                await context.bot.send_audio(chat_id=chat_id, audio=audio_file)

            caption = job["caption"].strip() or "کپشنی برای این پست ثبت نشده."
            for i in range(0, len(caption), 4000):
                await context.bot.send_message(chat_id=chat_id, text=caption[i:i + 4000])
        except Exception:
            logger.exception("Failed to deliver job %s", job_id)
            await context.bot.send_message(
                chat_id=chat_id,
                text="ارسال فایل با خطا مواجه شد (شاید حجمش برای تلگرام زیاد بوده).",
            )
        finally:
            shutil.rmtree(job["dest_dir"], ignore_errors=True)
            pending_jobs.pop(job_id, None)


def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("whoami", whoami))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_link))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.run_polling()


if __name__ == "__main__":
    main()
