# -*- coding: utf-8 -*-
"""
آنالیز عکس فاکتور خرید با استفاده از Claude (هوش مصنوعی Anthropic).
این ماژول فقط وقتی اینترنت وصل باشد و یک کلید API در config.json تنظیم شده باشد کار می‌کند؛
بقیه‌ی برنامه بدون این قابلیت هم کاملاً آفلاین کار می‌کند.
"""
import base64
import json
import re
import requests

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

EXTRACTION_PROMPT = """این تصویر یک فاکتور خرید است (احتمالاً فارسی). اطلاعات را استخراج کن و *فقط* یک JSON خام
برگردان، بدون هیچ توضیح یا متن اضافه قبل یا بعدش، دقیقاً به این فرم:

{
  "supplier_name": "نام تامین‌کننده/فروشنده روی فاکتور، اگر نبود null",
  "invoice_number": "شماره فاکتور اگر نوشته شده، اگر نبود null",
  "date": "تاریخ فاکتور همانطور که نوشته شده، اگر نبود null",
  "items": [
    {"name": "نام کالا", "qty": عدد, "unit_price": عدد (به تومان، بدون کاما یا واحد پول)}
  ]
}

نکات مهم:
- unit_price و qty باید عدد خالص باشند (بدون کاما، بدون "تومان").
- اگر مقداری در تصویر خوانا نبود یا مطمئن نبودی، به‌جای حدس زدن، مقدار را null بگذار.
- اگر چند ردیف کالا هست، همه را در آرایه items بیاور.
- خروجی باید فقط همان JSON باشد؛ هیچ متن قبل یا بعد از آن ننویس."""


def analyze_invoice_image(image_bytes, media_type, api_key, model="claude-haiku-4-5-20251001"):
    """
    image_bytes: محتوای باینری تصویر یا PDF
    media_type: مثل 'image/jpeg'، 'image/png' یا 'application/pdf'
    برمی‌گرداند: (ok: bool, data_or_error)
    """
    if not api_key:
        return False, "کلید API تنظیم نشده است (به بخش تنظیمات فاکتور در config.json مراجعه کن)"

    b64_data = base64.b64encode(image_bytes).decode("utf-8")

    # فایل‌های PDF به‌عنوان «سند» و عکس‌ها به‌عنوان «تصویر» به Claude فرستاده می‌شوند
    if media_type == "application/pdf":
        content_block = {"type": "document", "source": {"type": "base64", "media_type": media_type, "data": b64_data}}
    else:
        content_block = {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64_data}}

    payload = {
        "model": model,
        "max_tokens": 2000,
        "messages": [
            {
                "role": "user",
                "content": [
                    content_block,
                    {"type": "text", "text": EXTRACTION_PROMPT},
                ],
            }
        ],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    try:
        resp = requests.post(ANTHROPIC_API_URL, json=payload, headers=headers, timeout=45)
    except requests.exceptions.RequestException as e:
        return False, f"اتصال به اینترنت/سرور هوش مصنوعی برقرار نشد: {e}"

    if resp.status_code == 401:
        return False, "کلید API نامعتبر است. آن را در config.json بررسی کن"
    if resp.status_code != 200:
        return False, f"خطا از سرویس هوش مصنوعی (کد {resp.status_code}): {resp.text[:200]}"

    try:
        result = resp.json()
        text = "".join(block.get("text", "") for block in result.get("content", []) if block.get("type") == "text")
    except Exception as e:
        return False, f"پاسخ غیرمنتظره از سرویس هوش مصنوعی: {e}"

    # حذف fence های احتمالی مارک‌داون دور JSON
    cleaned = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()

    try:
        data = json.loads(cleaned)
    except Exception:
        return False, "پاسخ هوش مصنوعی قابل تبدیل به JSON نبود. لطفاً با عکس واضح‌تری دوباره امتحان کن"

    if "items" not in data or not isinstance(data["items"], list):
        return False, "هوش مصنوعی نتوانست کالایی از تصویر استخراج کند"

    return True, data
