# Instagram AI Analyzer

آنالیز عمیق اکانت‌های Instagram Business/Creator (خودتان یا کلاینت‌هایتان) با استفاده از Instagram Graph API رسمی متا برای گرفتن داده، و Claude API برای تحلیل هوشمند (احساسات کامنت‌ها، گزارش عملکرد، تحلیل تصویر پست‌ها).

## محدودیت مهم

این ابزار فقط برای اکانت‌هایی کار می‌کند که:
- از نوع **Business یا Creator** باشند،
- به یک **صفحه‌ی فیسبوک** متصل باشند،
- صاحب اکانت از طریق OAuth دسترسی را تأیید کند.

آنالیز اکانت‌های عمومی دلخواه (رقبا و غیره) بدون اجازه‌ی صاحب اکانت، از طریق این ابزار پشتیبانی نمی‌شود — چنین کاری نیازمند اسکرپینگ است که خلاف قوانین اینستاگرام است.

## راه‌اندازی

### ۱. ساخت اپ در Meta for Developers

1. به [developers.facebook.com](https://developers.facebook.com) بروید و یک اپ جدید بسازید (نوع Business).
2. محصول **Instagram Graph API** و **Facebook Login** را به اپ اضافه کنید.
3. در تنظیمات Facebook Login، این آدرس را به عنوان Valid OAuth Redirect URI اضافه کنید:
   `http://localhost:8000/auth/callback` (یا آدرس دامنه‌ی واقعی‌تان)
4. دسترسی‌های (Permissions) زیر را برای اپ درخواست/تأیید کنید:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `instagram_manage_comments`
   - `pages_show_list`
   - `pages_read_engagement`
5. تا زمانی که اپ در حالت Development است، فقط کاربران تعریف‌شده به عنوان Developer/Tester روی اپ می‌توانند لاگین کنند. برای استفاده‌ی عمومی باید اپ توسط متا ریویو شود (App Review).

### ۲. تنظیم محیط

```bash
cd instagram-analyzer
python -m venv venv
source venv/bin/activate  # ویندوز: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# مقادیر .env را پر کنید: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, ANTHROPIC_API_KEY, SESSION_SECRET
```

### ۳. اجرا

```bash
uvicorn app.main:app --reload
```

سپس به `http://localhost:8000` بروید، روی «اتصال اکانت جدید» بزنید، وارد فیسبوک شوید و اکانت اینستاگرام کسب‌وکارتان را انتخاب کنید.

## معماری

- `app/instagram_client.py` — کلاینت Instagram Graph API (OAuth، پروفایل، پست‌ها، اینسایت‌ها، کامنت‌ها)
- `app/ai_analysis.py` — لایه‌ی هوش مصنوعی (Claude): تحلیل احساسات کامنت‌ها، تولید گزارش، تحلیل تصویر
- `app/models.py` — مدل‌های دیتابیس (SQLAlchemy / SQLite به‌صورت پیش‌فرض)
- `app/routers/` — اندپوینت‌های FastAPI (auth, accounts, analysis)
- `web/` — داشبورد ساده (HTML/CSS/JS بدون وابستگی خارجی)

## جریان کار

1. **اتصال اکانت** (`/auth/login`) → OAuth با فیسبوک → توکن بلندمدت ذخیره می‌شود.
2. **همگام‌سازی داده** (دکمه «به‌روزرسانی داده‌ها») → پست‌ها، اینسایت‌ها و کامنت‌های جدید از Graph API گرفته و در دیتابیس ذخیره می‌شوند.
3. **تحلیل هوش‌مصنوعی** (دکمه «تحلیل با هوش‌مصنوعی») → کامنت‌های تحلیل‌نشده امتیازدهی احساسی می‌شوند و یک گزارش کامل فارسی تولید می‌شود.

## نکات محدودیت API

- Instagram Graph API نرخ محدودیت (rate limit) دارد؛ برای اکانت‌های با پست/کامنت زیاد ممکن است sync طولانی شود.
- برای دریافت کامنت‌ها نیاز به تأیید دسترسی `instagram_manage_comments` توسط متا دارید.
- توکن‌های بلندمدت حدود ۶۰ روز اعتبار دارند و باید قبل از انقضا رفرش شوند (این پروژه فعلاً رفرش خودکار ندارد — نیاز به پیاده‌سازی جداگانه در صورت استفاده‌ی طولانی‌مدت).
