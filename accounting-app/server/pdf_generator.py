# -*- coding: utf-8 -*-
"""
تولید فاکتور PDF با پشتیبانی از متن فارسی (راست‌به‌چپ)

برای نمایش درست حروف فارسی در PDF از فونت یونیکد فارسی Estedad.ttf استفاده می‌شود
که همراه خود برنامه (کنار همین فایل، در پوشه fonts/) بسته‌بندی شده است.
اگر به هر دلیلی این فایل پیدا نشود، برنامه باز هم کار می‌کند ولی حروف فارسی ممکن است درست نمایش داده نشود.
"""
import os

from paths import get_base_dir

FONT_DIR = os.path.join(get_base_dir(), "fonts")
FONT_PATH = os.path.join(FONT_DIR, "Estedad.ttf")
FONT_NAME = "Estedad"

try:
    from reportlab.lib.pagesizes import A5, A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    _reportlab_ready = True
except ImportError:
    _reportlab_ready = False

PAGE_SIZES = {}
if _reportlab_ready:
    PAGE_SIZES = {
        "A4": A4,
        "A5": A5,
        "thermal80": (80 * mm, 200 * mm),   # رسید حرارتی ۸۰ میلی‌متری (ارتفاع به‌صورت تقریبی، خودکار رشد می‌کند)
        "thermal58": (58 * mm, 200 * mm),   # رسید حرارتی ۵۸ میلی‌متری
    }

_font_ready = False
if _reportlab_ready and os.path.exists(FONT_PATH):
    try:
        pdfmetrics.registerFont(TTFont(FONT_NAME, FONT_PATH))
        _font_ready = True
    except Exception:
        _font_ready = False

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    _shaping_ready = True
except ImportError:
    _shaping_ready = False


def rtl(text):
    """آماده‌سازی متن فارسی برای نمایش درست راست‌به‌چپ و بهم‌چسبیده در PDF"""
    text = "" if text is None else str(text)
    if _shaping_ready:
        try:
            reshaped = arabic_reshaper.reshape(text)
            return get_display(reshaped)
        except Exception:
            return text
    return text


def _fmt_rial(n):
    """مبلغ (که داخلی به تومان ذخیره می‌شه) رو با جداکننده هزارگان به ریال (ضربدر ۱۰) نشون می‌ده"""
    try:
        n = float(n or 0)
    except (TypeError, ValueError):
        n = 0
    return f'{n * 10:,.0f}'


def print_pdf_direct(pdf_path, printer_name=None):
    """
    ارسال مستقیم فایل PDF به چاپگر (بدون نیاز به باز شدن نرم‌افزار نمایش PDF).
    فقط روی ویندوز کار می‌کند. در صورت شکست، (False, پیام خطا) برمی‌گرداند
    تا فراخواننده بتواند به روش جایگزین (باز کردن فایل) برگردد.
    """
    import sys
    if not sys.platform.startswith("win"):
        return False, "چاپ مستقیم فقط روی ویندوز پشتیبانی می‌شود"
    try:
        import win32api
        import win32print
        if not printer_name:
            printer_name = win32print.GetDefaultPrinter()
        win32api.ShellExecute(0, "print", pdf_path, f'"{printer_name}"', ".", 0)
        return True, f"دستور چاپ به {printer_name} ارسال شد"
    except ImportError:
        return False, "کتابخانه pywin32 نصب نیست (pip install pywin32)"
    except Exception as e:
        return False, f"خطا در چاپ مستقیم: {e}"


_ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]
_TEENS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"]
_TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"]
_HUNDREDS = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"]
_SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون"]


def _three_digits_to_words(n):
    parts = []
    hundred, remainder = n // 100, n % 100
    if hundred:
        parts.append(_HUNDREDS[hundred])
    if remainder:
        if remainder < 10:
            parts.append(_ONES[remainder])
        elif remainder < 20:
            parts.append(_TEENS[remainder - 10])
        else:
            tens_digit, ones_digit = remainder // 10, remainder % 10
            parts.append(_TENS[tens_digit] + (" و " + _ONES[ones_digit] if ones_digit else ""))
    return " و ".join(parts)


def number_to_persian_words(n):
    """تبدیل یک عدد صحیح به معادل نوشتاری فارسی آن (برای نوشتن مبلغ به حروف در فاکتور)"""
    n = int(round(n))
    if n == 0:
        return "صفر"
    negative = n < 0
    n = abs(n)
    groups = []
    while n > 0:
        groups.append(n % 1000)
        n //= 1000
    parts = []
    for i in range(len(groups) - 1, -1, -1):
        g = groups[i]
        if g == 0:
            continue
        words = _three_digits_to_words(g)
        if i > 0:
            words += " " + _SCALES[i]
        parts.append(words)
    result = " و ".join(parts)
    return ("منفی " + result) if negative else result


def generate_invoice_pdf(output_path, invoice, items, party_name=None, shop_name="مغازه لوازم الکتریکی", page_format="A5"):
    """
    invoice: دیکشنری شامل id, invoice_type, date, total, paid, payment_type
    items: لیستی از دیکشنری‌ها شامل item_name, qty, unit_price, total
    page_format: یکی از "A4", "A5", "thermal80", "thermal58"
    """
    if not _reportlab_ready:
        raise RuntimeError("کتابخانه reportlab نصب نیست. دستور 'pip install reportlab arabic-reshaper python-bidi' را اجرا کنید.")

    page_size = PAGE_SIZES.get(page_format, PAGE_SIZES["A5"])
    is_thermal = page_format.startswith("thermal")
    margin = 10 if is_thermal else 30
    base_font_size = 8 if is_thermal else 10

    c = canvas.Canvas(output_path, pagesize=page_size)
    width, height = page_size
    font = FONT_NAME if _font_ready else "Helvetica"

    c.setFont(font, base_font_size + 4)
    y = height - (25 if is_thermal else 40)
    c.drawRightString(width - margin, y, rtl(shop_name))
    y -= (18 if is_thermal else 25)

    c.setFont(font, base_font_size + 1)
    title = "فاکتور فروش" if invoice["invoice_type"] in ("sale", "sale_return") else "فاکتور خرید"
    if invoice["invoice_type"] in ("sale_return", "purchase_return"):
        title = "فاکتور مرجوعی " + ("فروش" if invoice["invoice_type"] == "sale_return" else "خرید")
    c.drawRightString(width - margin, y, rtl(f'{title}  -  شماره {invoice["id"]}'))
    y -= (14 if is_thermal else 18)
    c.drawRightString(width - margin, y, rtl(f'تاریخ: {invoice.get("date", "")}'))
    y -= (14 if is_thermal else 18)
    if party_name:
        c.drawRightString(width - margin, y, rtl(f'طرف حساب: {party_name}'))
        y -= (14 if is_thermal else 18)
    if invoice.get("description"):
        desc_text = f'توضیحات: {invoice["description"]}'
        if is_thermal:
            max_chars = 34
            words = desc_text.split(" ")
            line = ""
            for w in words:
                if len(line) + len(w) + 1 > max_chars:
                    c.drawRightString(width - margin, y, rtl(line))
                    y -= 11
                    line = w
                else:
                    line = (line + " " + w) if line else w
            if line:
                c.drawRightString(width - margin, y, rtl(line))
                y -= 11
        else:
            c.drawRightString(width - margin, y, rtl(desc_text))
            y -= 18

    y -= 8
    c.line(margin, y, width - margin, y)
    y -= (14 if is_thermal else 20)

    c.setFont(font, base_font_size)
    if is_thermal:
        c.drawRightString(width - margin, y, rtl("کالا / تعداد / قیمت / جمع"))
    else:
        c.drawRightString(width - margin, y, rtl("کالا"))
        c.drawRightString(width - 150, y, rtl("تعداد"))
        c.drawRightString(width - 220, y, rtl("قیمت واحد (ریال)"))
        c.drawRightString(width - 300, y, rtl("جمع (ریال)"))
    y -= (12 if is_thermal else 15)
    c.line(margin, y, width - margin, y)
    y -= (12 if is_thermal else 15)

    for it in items:
        if is_thermal:
            c.drawRightString(width - margin, y, rtl(it["item_name"]))
            y -= 11
            c.drawRightString(width - margin, y,
                               rtl(f'{it["qty"]} × {_fmt_rial(it["unit_price"])} = {_fmt_rial(it["total"])}'))
            y -= 13
        else:
            c.drawRightString(width - margin, y, rtl(it["item_name"]))
            c.drawRightString(width - 150, y, rtl(str(it["qty"])))
            c.drawRightString(width - 220, y, rtl(_fmt_rial(it["unit_price"])))
            c.drawRightString(width - 300, y, rtl(_fmt_rial(it["total"])))
            y -= 16
        if y < 60:
            c.showPage()
            c.setFont(font, base_font_size)
            y = height - (25 if is_thermal else 40)

    y -= 8
    c.line(margin, y, width - margin, y)
    y -= (16 if is_thermal else 20)
    c.setFont(font, base_font_size + 2)
    c.drawRightString(width - margin, y, rtl(f'جمع کل: {_fmt_rial(invoice["total"])} ریال'))
    y -= (13 if is_thermal else 18)
    c.drawRightString(width - margin, y, rtl(f'پرداخت‌شده: {_fmt_rial(invoice["paid"])} ریال'))
    y -= (13 if is_thermal else 18)
    remaining = invoice["total"] - invoice["paid"]
    if remaining > 0:
        c.drawRightString(width - margin, y, rtl(f'مانده: {_fmt_rial(remaining)} ریال'))
        y -= (13 if is_thermal else 18)

    # مبلغ به حروف - همیشه در انتهای فاکتور
    y -= 6
    c.line(margin, y, width - margin, y)
    y -= (14 if is_thermal else 20)
    c.setFont(font, base_font_size - (1 if is_thermal else 0))
    words_text = f'مبلغ به حروف: {number_to_persian_words(invoice["total"] * 10)} ریال'
    if is_thermal:
        # روی کاغذ باریک رسید، متن به حروف را می‌شکنیم تا از عرض کاغذ رد نشود
        max_chars = 34
        words = words_text.split(" ")
        line = ""
        for w in words:
            if len(line) + len(w) + 1 > max_chars:
                c.drawRightString(width - margin, y, rtl(line))
                y -= 11
                line = w
            else:
                line = (line + " " + w) if line else w
        if line:
            c.drawRightString(width - margin, y, rtl(line))
    else:
        c.drawRightString(width - margin, y, rtl(words_text))

    c.save()
    return output_path


def generate_statement_pdf(output_path, party, invoices, shop_name="مغازه لوازم الکتریکی"):
    """
    صورت‌حساب کامل یک طرف‌حساب (لیست فاکتورها + مانده فعلی) به‌صورت PDF — برای چاپ یا
    اشتراک‌گذاری با خود مشتری/تامین‌کننده. همیشه با فرمت A4 (چون ممکنه فاکتور زیاد باشه).
    """
    if not _reportlab_ready:
        raise RuntimeError("کتابخانه reportlab نصب نیست. دستور 'pip install reportlab arabic-reshaper python-bidi' را اجرا کنید.")

    type_titles = {"sale": "فروش", "purchase": "خرید", "sale_return": "مرجوعی فروش", "purchase_return": "مرجوعی خرید"}
    margin = 30
    base_font_size = 10
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4
    font = FONT_NAME if _font_ready else "Helvetica"

    def draw_header():
        y = height - 40
        c.setFont(font, base_font_size + 4)
        c.drawRightString(width - margin, y, rtl(shop_name))
        y -= 25
        c.setFont(font, base_font_size + 2)
        c.drawRightString(width - margin, y, rtl(f'صورت‌حساب: {party.get("name", "")}'))
        y -= 18
        c.setFont(font, base_font_size)
        c.drawRightString(width - margin, y, rtl(f'تلفن: {party.get("phone") or "—"}'))
        y -= 10
        c.line(margin, y, width - margin, y)
        y -= 20
        c.drawRightString(width - margin, y, rtl("تاریخ"))
        c.drawRightString(width - 150, y, rtl("شماره فاکتور"))
        c.drawRightString(width - 260, y, rtl("نوع"))
        c.drawRightString(width - 340, y, rtl("جمع کل (ریال)"))
        c.drawRightString(width - 420, y, rtl("پرداخت‌شده (ریال)"))
        c.drawRightString(width - 500, y, rtl("مانده (ریال)"))
        y -= 12
        c.line(margin, y, width - margin, y)
        y -= 15
        return y

    y = draw_header()
    c.setFont(font, base_font_size)
    for inv in invoices:
        remaining = (inv.get("total") or 0) - (inv.get("paid") or 0)
        c.drawRightString(width - margin, y, rtl(str(inv.get("date", ""))[:10]))
        c.drawRightString(width - 150, y, rtl(str(inv.get("number") or inv.get("id"))))
        c.drawRightString(width - 260, y, rtl(type_titles.get(inv.get("invoice_type"), inv.get("invoice_type"))))
        c.drawRightString(width - 340, y, rtl(_fmt_rial(inv.get("total", 0))))
        c.drawRightString(width - 420, y, rtl(_fmt_rial(inv.get("paid", 0))))
        c.drawRightString(width - 500, y, rtl(_fmt_rial(remaining)))
        y -= 16
        if y < 60:
            c.showPage()
            c.setFont(font, base_font_size)
            y = draw_header()
            c.setFont(font, base_font_size)

    y -= 10
    c.line(margin, y, width - margin, y)
    y -= 22
    balance = party.get("balance") or 0
    label = "بدهکار به ما" if balance > 0 else ("بستانکار از ما" if balance < 0 else "تسویه")
    c.setFont(font, base_font_size + 3)
    c.drawRightString(width - margin, y, rtl(f'مانده فعلی: {_fmt_rial(abs(balance))} ریال ({label})'))

    c.save()
    return output_path
