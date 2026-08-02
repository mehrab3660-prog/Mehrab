# -*- coding: utf-8 -*-
"""
آنالیز رایگان و آفلاین عکس فاکتور خرید با Tesseract OCR (بدون نیاز به اینترنت).
دقت این روش به‌مراتب کمتر از روش هوش مصنوعی است، مخصوصاً روی فاکتورهای دست‌نویس
یا فاکتورهای شلوغ - نتیجه را همیشه قبل از ثبت نهایی بررسی کن.

نیازمندی‌ها روی ویندوز:
1. نصب برنامه Tesseract-OCR (از https://github.com/UB-Mannheim/tesseract/wiki)
2. هنگام نصب، پشتیبانی زبان فارسی (Persian) را هم تیک بزن
   (یا بعداً فایل fas.traineddata را در پوشه tessdata کنار خود Tesseract قرار بده)
3. pip install pytesseract pillow
"""
import io
import re

try:
    import pytesseract
    from PIL import Image
    _OCR_READY = True
except ImportError:
    _OCR_READY = False

try:
    import fitz  # PyMuPDF - برای تبدیل صفحه اول PDF به تصویر جهت OCR
    _PDF_READY = True
except ImportError:
    _PDF_READY = False


def _pdf_first_page_to_image_bytes(pdf_bytes):
    """صفحه اول یک فایل PDF را به بایت‌های تصویر PNG تبدیل می‌کند"""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    pix = page.get_pixmap(dpi=200)
    return pix.tobytes("png")


def _find_tesseract_windows():
    """روی ویندوز، مسیر معمول نصب Tesseract و پوشه tessdata را به‌صورت خودکار پیدا و تنظیم می‌کند"""
    import os
    import sys
    if not sys.platform.startswith("win"):
        return
    common_dirs = [
        r"C:\Program Files\Tesseract-OCR",
        r"C:\Program Files (x86)\Tesseract-OCR",
    ]
    for d in common_dirs:
        exe_path = os.path.join(d, "tesseract.exe")
        tessdata_path = os.path.join(d, "tessdata")
        if os.path.exists(exe_path):
            pytesseract.pytesseract.tesseract_cmd = exe_path
            if os.path.isdir(tessdata_path):
                # این همون تنظیمی است که باعث می‌شود دیگر نیاز به تنظیم دستی
                # متغیر محیطی TESSDATA_PREFIX در ویندوز نباشد
                os.environ["TESSDATA_PREFIX"] = tessdata_path
            return


def extract_raw_text(image_bytes):
    """متن خام را از عکس با OCR استخراج می‌کند (فارسی در صورت نصب بودن، وگرنه انگلیسی)"""
    if not _OCR_READY:
        raise RuntimeError("pytesseract یا Pillow نصب نیست. دستور 'pip install pytesseract pillow' را بزن.")
    _find_tesseract_windows()
    img = Image.open(io.BytesIO(image_bytes))
    try:
        text = pytesseract.image_to_string(img, lang="fas+eng")
    except pytesseract.TesseractError:
        try:
            # اگر بسته زبان فارسی نصب نبود، حداقل با انگلیسی امتحان کن
            text = pytesseract.image_to_string(img, lang="eng")
        except pytesseract.TesseractError as e:
            raise RuntimeError(
                "فایل‌های زبان Tesseract (tessdata) پیدا نشد. برنامه Tesseract-OCR را دوباره نصب کن و "
                "مطمئن شو حین نصب گزینه‌ی 'Additional language data' → 'Persian' و 'English' تیک خورده باشد. "
                f"جزئیات فنی: {e}"
            )
    return text


_NUMBER_PATTERN = re.compile(r"[\d۰-۹,،]+")


def _to_int(token):
    fa_to_en = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")
    cleaned = token.translate(fa_to_en).replace(",", "").replace("،", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_invoice_text(text):
    """
    تلاش می‌کند از متن خام OCR، ردیف‌های «نام کالا / تعداد / قیمت» را با روش‌های ابتدایی حدس بزند.
    این روش کاملاً حدسی است: خط‌هایی که حداقل دو عدد در آن‌ها پیدا شود را به‌عنوان یک ردیف کالا
    در نظر می‌گیرد (عدد آخر = قیمت، عدد ماقبل آخر = تعداد)، و بقیه‌ی خط را به‌عنوان نام کالا برمی‌دارد.
    نتیجه باید همیشه قبل از ثبت توسط کاربر بازبینی شود.
    """
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        matches = [m for m in _NUMBER_PATTERN.finditer(line)
                   if _to_int(m.group()) is not None
                   and len(m.group().replace(",", "").replace("،", "")) >= 2]
        if len(matches) < 2:
            continue
        qty_match, price_match = matches[-2], matches[-1]
        qty = _to_int(qty_match.group())
        price = _to_int(price_match.group())
        name_part = line[:qty_match.start()]
        name_part = re.sub(r"[\s\-:|،,]+$", "", name_part).strip()
        if not name_part or qty is None or qty <= 0 or qty > 100000:
            continue
        items.append({"name": name_part, "qty": qty, "unit_price": price})

    return {"supplier_name": None, "invoice_number": None, "date": None, "items": items}


def analyze_invoice_image_offline(image_bytes, is_pdf=False):
    """نقطه ورود اصلی: عکس یا PDF -> متن خام -> ردیف‌های حدسی کالا"""
    if not _OCR_READY:
        return False, "کتابخانه OCR نصب نیست. دستور 'pip install pytesseract pillow' را بزن و Tesseract-OCR را هم نصب کن."

    if is_pdf:
        if not _PDF_READY:
            return False, "برای خواندن PDF در روش رایگان، دستور 'pip install pymupdf' را بزن."
        try:
            image_bytes = _pdf_first_page_to_image_bytes(image_bytes)
        except Exception as e:
            return False, f"خطا در تبدیل PDF به تصویر: {e}"

    try:
        text = extract_raw_text(image_bytes)
    except Exception as e:
        return False, f"خطا در خواندن عکس: {e}"

    data = parse_invoice_text(text)
    if not data["items"]:
        return False, "هیچ ردیف قابل‌فهمی پیدا نشد. عکس واضح‌تر بگیر یا از روش هوش مصنوعی استفاده کن."
    return True, data
