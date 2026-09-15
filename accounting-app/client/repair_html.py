# -*- coding: utf-8 -*-
"""
تولید صفحات چاپی ماژول تعمیرات (رسید پذیرش، برچسب دستگاه با QR، گزارش تعمیر) —
دقیقاً به همان روش فاکتور (invoice_html.py): یک صفحه HTML آماده چاپ که با فونت و
راست‌چین بودن خودِ مرورگر رندر می‌شود، تا فارسی همیشه درست چاپ شود.
"""
import io
from invoice_html import _VAZIRMATN_FONT_FACE_CSS, esc, fmt_amount, to_fa_digits

STATUS_LABELS = {
    "received": "پذیرش‌شده",
    "diagnosing": "در حال عیب‌یابی",
    "waiting_customer_approval": "منتظر تأیید مشتری",
    "waiting_parts": "منتظر قطعه",
    "in_repair": "در حال تعمیر",
    "repaired": "تعمیر کامل شده",
    "ready": "آماده تحویل",
    "delivered": "تحویل شده",
    "cancelled": "لغو شده",
    "warranty_return": "برگشتی / گارانتی",
}


def _make_qr_svg(data):
    if not data:
        return ""
    try:
        import qrcode
        import qrcode.image.svg
        img = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=6)
        buf = io.BytesIO()
        img.save(buf)
        return buf.getvalue().decode("utf-8")
    except Exception:
        return ""


def _base_head(title):
    return f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>{esc(title)}</title>
<style>
{_VAZIRMATN_FONT_FACE_CSS}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Estedad', Tahoma, 'Segoe UI', Arial, sans-serif; margin: 16px; color:#1a1a1a; }}
  .print-btn {{
    display: block; margin: 0 auto 16px; padding: 10px 26px; font-size: 14px; cursor: pointer;
    background: #4F46E5; color: #fff; border: none; border-radius: 6px;
  }}
  @media print {{ .print-btn {{ display: none; }} }}
  table {{ width: 100%; border-collapse: collapse; margin: 8px 0; }}
  th, td {{ border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; text-align: right; }}
  th {{ background: #f3f4f6; }}
  h1, h2, h3 {{ margin: 6px 0; }}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">چاپ</button>
"""


def build_repair_receipt_html(repair, parts, shop_name="", shop_phones="", shop_address=""):
    """رسید پذیرش دستگاه — به مشتری داده می‌شود"""
    html_out = _base_head(f"رسید پذیرش {repair.get('ticket_number', '')}")
    qr_svg = _make_qr_svg(repair.get("ticket_number", ""))
    html_out += f"""
<div style="text-align:center;border-bottom:2px solid #4F46E5;padding-bottom:10px;margin-bottom:14px">
  <h1>{esc(shop_name)}</h1>
  <div>{esc(shop_phones)} — {esc(shop_address)}</div>
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <h2>رسید پذیرش دستگاه</h2>
    <p>شماره پذیرش: <b>{esc(repair.get('ticket_number'))}</b></p>
    <p>تاریخ پذیرش: {esc(repair.get('intake_date'))}</p>
    <p>تاریخ احتمالی تحویل: {esc(repair.get('expected_delivery_date') or '—')}</p>
  </div>
  <div style="width:110px">{qr_svg}</div>
</div>
<table>
  <tr><th>مشتری</th><td>{esc(repair.get('customer_name') or '—')}</td>
      <th>تلفن</th><td>{esc(repair.get('customer_phone') or '—')}</td></tr>
  <tr><th>برند/مدل</th><td>{esc(repair.get('device_brand'))} {esc(repair.get('device_model'))}</td>
      <th>رنگ</th><td>{esc(repair.get('device_color') or '—')}</td></tr>
  <tr><th>IMEI</th><td colspan="3">{esc(repair.get('imei') or '—')}</td></tr>
  <tr><th>وضعیت ظاهری</th><td colspan="3">{esc(repair.get('device_condition') or '—')}</td></tr>
  <tr><th>لوازم همراه</th><td colspan="3">{esc(repair.get('accessories') or '—')}</td></tr>
  <tr><th>مشکل اعلام‌شده</th><td colspan="3">{esc(repair.get('reported_issue') or '—')}</td></tr>
  <tr><th>پیش‌پرداخت</th><td colspan="3">{fmt_amount(repair.get('prepayment') or 0)} ریال</td></tr>
</table>
<p style="margin-top:30px;font-size:12px;color:#555">
این رسید را تا زمان تحویل دستگاه نزد خود نگه دارید. برای پیگیری وضعیت تعمیر، شماره پذیرش را اعلام کنید.
</p>
<div style="display:flex;justify-content:space-between;margin-top:50px">
  <div>امضای مشتری: ______________</div>
  <div>امضای پذیرش‌کننده: ______________</div>
</div>
</body></html>"""
    return html_out


def build_repair_label_html(repair):
    """برچسب دستگاه با QR — روی خودِ دستگاه چسبانده می‌شود"""
    qr_svg = _make_qr_svg(repair.get("ticket_number", ""))
    html_out = _base_head(f"برچسب {repair.get('ticket_number', '')}")
    html_out += f"""
<div style="border:1px dashed #999;border-radius:6px;padding:10px;max-width:260px;text-align:center">
  <div style="font-weight:bold;font-size:15px">{esc(repair.get('ticket_number'))}</div>
  <div style="width:100px;margin:6px auto">{qr_svg}</div>
  <div style="font-size:12px">{esc(repair.get('device_brand'))} {esc(repair.get('device_model'))}</div>
  <div style="font-size:11px;color:#555">{esc(repair.get('customer_name') or '')}</div>
</div>
</body></html>"""
    return html_out


def build_repair_report_html(repair, parts, technicians, history):
    """گزارش کامل تعمیر — برای بایگانی یا تحویل به مشتری همراه فاکتور"""
    html_out = _base_head(f"گزارش تعمیر {repair.get('ticket_number', '')}")
    parts_rows = "".join(
        f"<tr><td>{esc(p.get('item_name'))}</td><td>{to_fa_digits(p.get('qty'))}</td>"
        f"<td>{fmt_amount(p.get('unit_price'))}</td><td>{fmt_amount(p.get('qty') * p.get('unit_price'))}</td></tr>"
        for p in parts
    ) or "<tr><td colspan='4' style='text-align:center'>موردی ثبت نشده</td></tr>"
    tech_rows = "".join(
        f"<tr><td>{esc(t.get('name'))}</td><td>{fmt_amount(t.get('commission_amount') or 0)}</td></tr>"
        for t in technicians
    ) or "<tr><td colspan='2' style='text-align:center'>تخصیص داده نشده</td></tr>"
    history_rows = "".join(
        f"<tr><td>{esc(h.get('changed_at'))}</td><td>{esc(STATUS_LABELS.get(h.get('new_status'), h.get('new_status')))}</td>"
        f"<td>{esc(h.get('changed_by') or '')}</td><td>{esc(h.get('note') or '')}</td></tr>"
        for h in history
    )
    html_out += f"""
<h2>گزارش تعمیر — {esc(repair.get('ticket_number'))}</h2>
<table>
  <tr><th>مشتری</th><td>{esc(repair.get('customer_name') or '—')}</td>
      <th>دستگاه</th><td>{esc(repair.get('device_brand'))} {esc(repair.get('device_model'))} / IMEI: {esc(repair.get('imei') or '—')}</td></tr>
  <tr><th>عیب اعلامی</th><td colspan="3">{esc(repair.get('reported_issue') or '—')}</td></tr>
  <tr><th>عیب نهایی</th><td colspan="3">{esc(repair.get('final_issue') or '—')}</td></tr>
  <tr><th>تست‌های انجام‌شده</th><td colspan="3">{esc(repair.get('tests_performed') or '—')}</td></tr>
  <tr><th>نتیجه تست</th><td colspan="3">{esc(repair.get('test_result') or '—')}</td></tr>
  <tr><th>قطعه خراب</th><td colspan="3">{esc(repair.get('damaged_part_desc') or '—')}</td></tr>
  <tr><th>یادداشت فنی</th><td colspan="3">{esc(repair.get('diagnostic_notes') or '—')}</td></tr>
  <tr><th>گارانتی</th><td colspan="3">{to_fa_digits(repair.get('warranty_days') or 0)} روز
      ({esc(repair.get('warranty_start_date') or '—')} تا {esc(repair.get('warranty_end_date') or '—')})</td></tr>
</table>
<h3>قطعات و خدمات مصرف‌شده</h3>
<table><tr><th>شرح</th><th>تعداد</th><th>قیمت واحد (ریال)</th><th>جمع (ریال)</th></tr>{parts_rows}</table>
<h3>تعمیرکاران</h3>
<table><tr><th>نام</th><th>اجرت/پورسانت (ریال)</th></tr>{tech_rows}</table>
<h3>تاریخچه وضعیت</h3>
<table><tr><th>تاریخ</th><th>وضعیت</th><th>توسط</th><th>یادداشت</th></tr>{history_rows}</table>
</body></html>"""
    return html_out
