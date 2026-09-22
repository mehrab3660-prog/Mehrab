# ربات تلگرامی دانلود ویدیوی اینستاگرام

کاربر لینک پست/ریل/IGTV اینستاگرام رو برای ربات می‌فرسته، ربات ویدیو رو دانلود
می‌کنه و همراه با دو دکمه شیشه‌ای (inline keyboard) زیرش برمی‌گردونه:

- **📝 کپشن** — کپشن اصلی پست رو به صورت پیام متنی می‌فرسته.
- **🎵 دریافت صدا** — فقط صدای ویدیو رو (فایل mp3) استخراج و ارسال می‌کنه.

## پیش‌نیازها

- Python 3.10+
- [ffmpeg](https://ffmpeg.org/) نصب‌شده روی سیستم و در دسترس در `PATH`
  (برای استخراج صدا لازم است):
  ```bash
  sudo apt-get install ffmpeg
  ```
- یک توکن ربات تلگرام از [@BotFather](https://t.me/BotFather)

## نصب و اجرا

```bash
cd telegram-instagram-bot
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# سپس BOT_TOKEN را داخل فایل .env قرار دهید

python bot.py
```

## نکات

- دانلود از اینستاگرام به‌وسیله‌ی [yt-dlp](https://github.com/yt-dlp/yt-dlp)
  انجام می‌شود. برای پست‌های عمومی نیازی به لاگین نیست؛ برای اکانت‌های
  خصوصی باید کوکی مرورگر خودتان را طبق مستندات yt-dlp تنظیم کنید.
- فایل‌های دانلودشده به‌صورت موقت در پوشه‌ی موقت سیستم (`ig_bot_downloads`)
  ذخیره می‌شوند.
