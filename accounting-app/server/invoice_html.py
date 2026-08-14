# -*- coding: utf-8 -*-
"""
تولید فاکتور به‌صورت یک صفحه HTML آماده چاپ - دقیقاً شبیه فرم‌های رسمی حسابداری فارسی.
به‌جای ساخت PDF با کتابخانه پایتون (که بدون فونت اختصاصی فارسی را درست رندر نمی‌کند)،
این صفحه توسط خودِ مرورگر رندر و چاپ می‌شود، پس رندر فارسی همیشه کاملاً درست است
(از فونت‌های نصب‌شده روی خود سیستم مثل Tahoma/Vazir استفاده می‌شود).
"""
import html
import io
import jalali

_PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def to_fa_digits(text):
    return str(text).translate(_PERSIAN_DIGITS)


def esc(text):
    """فرار دادن مقادیر کاربر (نام کالا، طرف‌حساب، تنظیمات مغازه و ...) قبل از قرار دادن
    در HTML، تا کسی نتواند با گذاشتن اسکریپت داخل نام کالا/مشتری، کد دلخواه در مرورگر
    بیننده فاکتور اجرا کند (XSS ذخیره‌شده)."""
    return html.escape(str(text if text is not None else ""))


def fmt_qty(q):
    """نمایش تعداد: اگر عدد صحیح بود بدون اعشار، وگرنه با اعشار (برای متر/کیلوگرم)"""
    try:
        q = float(q)
    except (TypeError, ValueError):
        q = 0
    text = f"{q:.2f}".rstrip("0").rstrip(".") if q % 1 else f"{int(q)}"
    return to_fa_digits(text)


def fmt_amount(n):
    """عدد را با جداکننده هزارگان و ارقام فارسی برمی‌گرداند، مثل ۱۲۵،۰۰۰"""
    try:
        n = float(n)
    except (TypeError, ValueError):
        n = 0
    formatted = f"{n:,.0f}"
    return to_fa_digits(formatted)


PAGE_SIZE_CSS = {
    "A4": "size: A4; margin: 14mm;",
    "A5": "size: A5; margin: 10mm;",
    "thermal80": "size: 80mm auto; margin: 3mm;",
    "thermal58": "size: 58mm auto; margin: 2mm;",
}


def build_invoice_html(invoice, items, party, page_format="A5",
                        shop_name="حسابداری", shop_phones="", shop_address="",
                        words_text="", logo_url=None, footer_message=""):
    """
    invoice: دیکشنری شامل number/id, invoice_type, date, total, paid, discount
    items: لیستی شامل item_name, category_name (اختیاری), qty, unit_price, total
    party: دیکشنری مشتری/تامین‌کننده شامل name, phone, balance (یا None)
    """
    is_thermal = page_format.startswith("thermal")
    page_css = PAGE_SIZE_CSS.get(page_format, PAGE_SIZE_CSS["A5"])

    type_titles = {
        "sale": "فاکتور فروش", "purchase": "فاکتور خرید",
        "sale_return": "فاکتور مرجوعی فروش", "purchase_return": "فاکتور مرجوعی خرید",
    }
    title = type_titles.get(invoice["invoice_type"], "فاکتور")
    party_role = "خریدار" if invoice["invoice_type"] in ("sale", "sale_return") else "فروشنده (تامین‌کننده)"

    has_serial_or_warranty = any(it.get("serial_number") or it.get("warranty_months") for it in items)

    rows_html = ""
    for i, it in enumerate(items, start=1):
        serial_warranty_cell = ""
        if has_serial_or_warranty:
            parts = []
            if it.get("serial_number"):
                parts.append(esc(it["serial_number"]))
            if it.get("warranty_months"):
                parts.append(f"{to_fa_digits(it['warranty_months'])} ماه گارانتی")
            serial_warranty_cell = f"<td>{' / '.join(parts) or '—'}</td>"
        rows_html += f"""
        <tr>
          <td>{to_fa_digits(i)}</td>
          <td>{esc(it.get('category_name') or it.get('brand') or '—')}</td>
          <td>{esc(it['item_name'])}</td>
          <td>{fmt_qty(it['qty'])}</td>
          <td>{fmt_amount(it['unit_price'])}</td>
          <td>{fmt_amount(it['total'])}</td>
          {serial_warranty_cell}
        </tr>"""

    total = invoice.get("total", 0)
    discount = invoice.get("discount", 0) or 0
    subtotal = total + discount
    balance_after = party["balance"] if party else None
    balance_before = None
    if party is not None and invoice.get("payment_type") == "credit":
        remaining = total - invoice.get("paid", 0)
        sign_map = {"sale": 1, "purchase": -1, "sale_return": -1, "purchase_return": 1}
        sign = sign_map.get(invoice["invoice_type"], 0)
        balance_before = balance_after - sign * remaining
    elif party is not None:
        balance_before = balance_after

    balance_rows = ""
    if party is not None:
        balance_rows = f"""
        <tr><td class="label">مانده قبلی:</td><td class="value">{fmt_amount(balance_before)} تومان</td></tr>
        <tr><td class="label">مانده کل:</td><td class="value">{fmt_amount(balance_after)} تومان</td></tr>"""

    party_block = ""
    if party:
        party_block = f"""
        <div class="party-row">
          <span><strong>{party_role}:</strong> {esc(party['name'])}</span>
          <span><strong>تلفن:</strong> {esc(to_fa_digits(party.get('phone') or '—'))}</span>
        </div>"""

    description_block = ""
    if invoice.get("description"):
        description_block = f"""
        <div class="description-row"><strong>توضیحات:</strong> {esc(invoice["description"])}</div>"""

    date_fa = to_fa_digits(jalali.format_jalali_datetime(invoice.get('date', '')))

    html = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>{esc(title)} {esc(invoice.get('number') or invoice.get('id'))}</title>
<style>
  @page {{ {page_css} }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Vazirmatn', Tahoma, 'Segoe UI', Arial, sans-serif;
    color: #111; margin: 0; padding: {'8px' if is_thermal else '20px'};
    font-size: {'11px' if is_thermal else '14px'};
  }}
  .shop-header {{ text-align: center; margin-bottom: 10px; }}
  .shop-header img {{ max-height: {'34px' if is_thermal else '54px'}; margin-bottom: 6px; }}
  .shop-header h1 {{ font-size: {'14px' if is_thermal else '20px'}; margin: 0 0 4px 0; }}
  .shop-header .sub {{ font-size: {'10px' if is_thermal else '12px'}; color: #444; margin: 2px 0; }}
  .title-badge {{
    text-align: left; font-weight: bold; font-size: {'11px' if is_thermal else '13px'};
    border: 1px solid #333; display: inline-block; padding: 3px 14px; float: left; border-radius: 4px;
  }}
  .clearfix::after {{ content: ""; display: table; clear: both; }}
  .meta-row {{ display: flex; justify-content: space-between; margin: 10px 0 4px 0; font-size: {'10px' if is_thermal else '13px'}; flex-wrap: wrap; }}
  .party-row {{ display: flex; justify-content: space-between; margin-bottom: 8px; font-size: {'10px' if is_thermal else '13px'}; border-top: 1px dashed #999; padding-top: 6px; flex-wrap: wrap; }}
  .description-row {{ margin-bottom: 8px; font-size: {'10px' if is_thermal else '13px'}; color: #333; word-break: break-word; }}
  table.items {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  table.items th, table.items td {{
    border: 1px solid #333; padding: {'3px' if is_thermal else '7px'}; text-align: center;
    font-size: {'10px' if is_thermal else '13px'};
  }}
  table.items th {{ background: #f0f0f0; }}
  table.totals {{ width: 100%; margin-top: 10px; border-collapse: collapse; }}
  table.totals td {{ padding: {'2px 4px' if is_thermal else '5px 8px'}; font-size: {'10px' if is_thermal else '13px'}; }}
  table.totals .label {{ text-align: left; color: #333; }}
  table.totals .value {{ text-align: right; font-weight: bold; width: 140px; }}
  table.totals tr.grand td {{ border-top: 2px solid #333; font-size: {'11px' if is_thermal else '14px'}; }}
  .words-box {{ margin-top: 10px; padding: 8px; border: 1px dashed #666; font-size: {'10px' if is_thermal else '12.5px'}; }}
  .signatures {{ display: flex; justify-content: space-between; margin-top: {'20px' if is_thermal else '40px'}; font-size: {'10px' if is_thermal else '13px'}; }}
  .footer {{ text-align: center; margin-top: 16px; font-size: {'10px' if is_thermal else '12px'}; color: #555; border-top: 1px solid #ccc; padding-top: 8px; }}
  .print-btn {{
    display: block; margin: 14px auto; padding: 10px 26px; font-size: 14px; cursor: pointer;
    background: #4F46E5; color: #fff; border: none; border-radius: 6px;
  }}
  @media print {{ .print-btn {{ display: none; }} }}
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">چاپ این فاکتور</button>

<div class="clearfix">
  <div class="title-badge">{esc(title)}</div>
</div>
<div class="shop-header">
  {f'<img src="{esc(logo_url)}" alt="لوگو">' if logo_url else ''}
  <h1>{esc(shop_name)}</h1>
  {f'<div class="sub">{esc(shop_phones)}</div>' if shop_phones else ''}
  {f'<div class="sub">{esc(shop_address)}</div>' if shop_address else ''}
</div>

<div class="meta-row">
  <span><strong>شماره فاکتور:</strong> {esc(invoice.get('number') or invoice.get('id'))}</span>
  <span><strong>تاریخ:</strong> {date_fa}</span>
</div>
{party_block}
{description_block}

<table class="items">
  <thead>
    <tr>
      <th>ردیف</th><th>نوع کالا</th><th>شرح کالا</th><th>تعداد</th><th>مبلغ واحد</th><th>جمع کل</th>{'<th>سریال/گارانتی</th>' if has_serial_or_warranty else ''}
    </tr>
  </thead>
  <tbody>
    {rows_html}
  </tbody>
</table>

<table class="totals">
  <tr><td class="label">جمع کل:</td><td class="value">{fmt_amount(subtotal)} تومان</td></tr>
  <tr><td class="label">تخفیف:</td><td class="value">{fmt_amount(discount)} تومان</td></tr>
  <tr class="grand"><td class="label">جمع کل با تخفیف:</td><td class="value">{fmt_amount(total)} تومان</td></tr>
  {balance_rows}
</table>

<div class="words-box"><strong>مبلغ به حروف:</strong> {words_text} تومان</div>

<div class="signatures">
  <span>امضای خریدار</span>
  <span>امضای فروشنده</span>
</div>

<div class="footer">{esc(footer_message) if footer_message else 'اعتماد شما سرمایه ماست'}</div>

</body>
</html>"""
    return html


def build_statement_html(party, invoices, shop_name="حسابداری", shop_phones="", shop_address="", logo_url=None):
    """
    صورت‌حساب کامل یک طرف‌حساب (مشتری/تامین‌کننده): همه فاکتورها به‌همراه مانده فعلی،
    آماده چاپ یا اشتراک‌گذاری با خود طرف‌حساب — دقیقاً مثل فاکتور تکی، توسط مرورگر رندر می‌شود.
    """
    type_titles = {
        "sale": "فروش", "purchase": "خرید",
        "sale_return": "مرجوعی فروش", "purchase_return": "مرجوعی خرید",
    }

    rows_html = ""
    for i, inv in enumerate(invoices, start=1):
        remaining = (inv.get("total") or 0) - (inv.get("paid") or 0)
        date_fa = to_fa_digits(jalali.format_jalali_datetime(inv.get('date', '')))
        rows_html += f"""
        <tr>
          <td>{to_fa_digits(i)}</td>
          <td>{date_fa}</td>
          <td>{esc(inv.get('number') or inv.get('id'))}</td>
          <td>{esc(type_titles.get(inv.get('invoice_type'), inv.get('invoice_type')))}</td>
          <td>{fmt_amount(inv.get('total'))}</td>
          <td>{fmt_amount(inv.get('paid'))}</td>
          <td>{fmt_amount(remaining)}</td>
        </tr>"""

    balance = party.get("balance") or 0
    balance_label = "بدهکار به ما" if balance > 0 else ("بستانکار از ما" if balance < 0 else "تسویه")

    html_out = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>صورت‌حساب {esc(party.get('name'))}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Vazirmatn', Tahoma, 'Segoe UI', Arial, sans-serif;
    color: #111; margin: 0; padding: 20px; font-size: 14px;
  }}
  .shop-header {{ text-align: center; margin-bottom: 14px; }}
  .shop-header img {{ max-height: 54px; margin-bottom: 6px; }}
  .shop-header h1 {{ font-size: 20px; margin: 0 0 4px 0; }}
  .shop-header .sub {{ font-size: 12px; color: #444; margin: 2px 0; }}
  .party-box {{
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;
    border: 1px solid #333; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px;
  }}
  .party-box .balance {{ font-weight: bold; font-size: 16px; }}
  .party-box .balance.debt {{ color: #b91c1c; }}
  .party-box .balance.credit {{ color: #15803d; }}
  table.items {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  table.items th, table.items td {{ border: 1px solid #333; padding: 7px; text-align: center; font-size: 13px; }}
  table.items th {{ background: #f0f0f0; }}
  .footer {{ text-align: center; margin-top: 16px; font-size: 12px; color: #555; border-top: 1px solid #ccc; padding-top: 8px; }}
  .print-btn {{
    display: block; margin: 14px auto; padding: 10px 26px; font-size: 14px; cursor: pointer;
    background: #4F46E5; color: #fff; border: none; border-radius: 6px;
  }}
  @media print {{ .print-btn {{ display: none; }} }}
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">چاپ این صورت‌حساب</button>

<div class="shop-header">
  {f'<img src="{esc(logo_url)}" alt="لوگو">' if logo_url else ''}
  <h1>{esc(shop_name)}</h1>
  {f'<div class="sub">{esc(shop_phones)}</div>' if shop_phones else ''}
  {f'<div class="sub">{esc(shop_address)}</div>' if shop_address else ''}
</div>

<h2 style="text-align:center">صورت‌حساب کامل: {esc(party.get('name'))}</h2>

<div class="party-box">
  <span><strong>تلفن:</strong> {esc(to_fa_digits(party.get('phone') or '—'))}</span>
  <span class="balance {'debt' if balance > 0 else ('credit' if balance < 0 else '')}">
    مانده فعلی: {fmt_amount(abs(balance))} تومان ({balance_label})
  </span>
</div>

<table class="items">
  <thead>
    <tr><th>ردیف</th><th>تاریخ</th><th>شماره فاکتور</th><th>نوع</th><th>جمع کل</th><th>پرداخت‌شده</th><th>مانده فاکتور</th></tr>
  </thead>
  <tbody>
    {rows_html or '<tr><td colspan="7">فاکتوری ثبت نشده</td></tr>'}
  </tbody>
</table>

<div class="footer">اعتماد شما سرمایه ماست</div>

</body>
</html>"""
    return html_out


def _make_barcode_svg(code):
    """SVG بارکد Code128 برای یک کد کالا؛ اگر کد خالی/نامعتبر بود، رشته خالی برمی‌گرداند"""
    if not code:
        return ""
    try:
        import barcode
        from barcode.writer import SVGWriter
        bc = barcode.get("code128", code, writer=SVGWriter())
        buf = io.BytesIO()
        bc.write(buf, options={"write_text": False, "module_height": 10, "quiet_zone": 1})
        return buf.getvalue().decode("utf-8")
    except Exception:
        return ""


def build_labels_html(items):
    """
    برگه برچسب قیمت/بارکد برای چاپ و چسباندن روی کالا یا قفسه.
    items: لیستی از دیکشنری‌ها شامل name, code, sale_price
    """
    labels_html = ""
    for it in items:
        code = (it.get("code") or "").strip()
        svg = _make_barcode_svg(code)
        labels_html += f"""
        <div class="label">
          <div class="label-name">{esc(it.get('name'))}</div>
          {f'<div class="label-barcode">{svg}</div>' if svg else ''}
          {f'<div class="label-code">{esc(code)}</div>' if code else ''}
          <div class="label-price">{fmt_amount(it.get('sale_price'))} تومان</div>
        </div>"""

    html_out = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>برچسب قیمت کالاها</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Vazirmatn', Tahoma, 'Segoe UI', Arial, sans-serif; margin: 10px; }}
  .labels-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }}
  .label {{
    border: 1px dashed #999; border-radius: 4px; padding: 8px; text-align: center;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    break-inside: avoid;
  }}
  .label-name {{ font-size: 12px; font-weight: bold; margin-bottom: 4px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }}
  .label-barcode svg {{ max-width: 100%; height: 40px; }}
  .label-code {{ font-size: 10px; color: #555; direction: ltr; margin: 2px 0; }}
  .label-price {{ font-size: 14px; font-weight: bold; margin-top: 4px; }}
  .print-btn {{
    display: block; margin: 14px auto; padding: 10px 26px; font-size: 14px; cursor: pointer;
    background: #4F46E5; color: #fff; border: none; border-radius: 6px;
  }}
  @media print {{ .print-btn {{ display: none; }} }}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">چاپ برچسب‌ها</button>
<div class="labels-grid">
{labels_html or '<p>کالایی انتخاب نشده</p>'}
</div>
</body>
</html>"""
    return html_out
