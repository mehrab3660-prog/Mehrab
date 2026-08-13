"""
استخراج شماره پذیرش، نام سازنده و سریال مخزن از سامانه سیمفا
(gas.symfa.ir) برای مراکز معاینه فنی خودروهای گازسوز.

نحوه کار:
1. یک مرورگر واقعی (غیر مخفی) باز می‌شود.
2. خودتان به‌صورت دستی وارد سامانه می‌شوید (نام کاربری/رمز عبور شما هرگز داخل
   این اسکریپت ذخیره یا وارد نمی‌شود).
3. خودتان به صفحه «پذیرش‌های گازسوز» می‌روید، بازه تاریخ موردنظر (از تاریخ /
   تا تاریخ) را وارد کرده و روی «جستجو» کلیک می‌کنید تا صفحه اول نتایج باز شود.
4. در ترمینال کلید Enter را می‌زنید تا اسکریپت شروع به کار کند.
5. اسکریپت برای هر ردیفی که دکمه «چاپ نتایج» دارد، به‌صورت خودکار صفحه
   نتیجه آزمون همان پذیرش را می‌خواند و «شماره پذیرش»، «پلاک»، «نام سازنده»
   و «سریال مخزن» را استخراج می‌کند. اگر پذیرشی دو مخزن داشته باشد (خودروی
   دوگانه‌سوز با دو مخزن)، برای هر مخزن یک ردیف جدا با همان پلاک ساخته
   می‌شود.
6. روی شماره صفحه بعدی (۲، ۳، ...) کلیک می‌کند و همین کار را تکرار می‌کند
   تا به آخرین صفحه برسد.
7. در پایان یک فایل Excel با نتایج ساخته می‌شود.

اجرا:
    pip install -r requirements.txt
    playwright install chromium
    python extract_serials.py --out result.xlsx
"""

import argparse
import re
import sys
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

DEFAULT_START_URL = "https://gas.symfa.ir/TestCenters/GasReception"


def wait_for_page_to_settle(page, timeout_ms=15000):
    """صبر می‌کند تا صفحه کاملاً بارگذاری و آرام شود (بعضی صفحات این سایت
    بعد از رسیدن به networkidle یک بار دیگر navigate/redirect می‌کنند)."""
    try:
        page.wait_for_load_state("load", timeout=timeout_ms)
    except PlaywrightError:
        pass
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except PlaywrightError:
        pass
    page.wait_for_timeout(700)


def retry_on_navigation(func, retries=5, delay_ms=800):
    """چون گاهی درست همان لحظه‌ای که داریم صفحه را می‌خوانیم، سایت یک
    navigation/redirect دیگر انجام می‌دهد، این تابع در صورت خطای
    'Execution context was destroyed' چند بار دوباره تلاش می‌کند."""
    last_err = None
    for attempt in range(retries):
        try:
            return func()
        except PlaywrightError as e:
            if "context was destroyed" in str(e) or "Target closed" in str(e):
                last_err = e
                import time as _time
                _time.sleep(delay_ms / 1000)
                continue
            raise
    raise last_err


def parse_manufacturer_serial(raw_text):
    """از متنی مثل 'شرکت و سریال مخزن: MIE(Energy-Sanat)-381481411410'
    نام سازنده و سریال مخزن را جدا می‌کند."""
    if not raw_text:
        return "", ""
    text = raw_text.split(":", 1)[-1].strip()
    match = re.match(r"^(.+)-([^-]+)$", text)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return text, ""


def find_reception_ids(page):
    """کد پذیرش (ReceptionId) تمام ردیف‌هایی که دکمه «چاپ نتایج» دارند را از
    صفحه فعلی لیست پذیرش‌ها برمی‌دارد."""
    hrefs = retry_on_navigation(lambda: page.eval_on_selector_all(
        "a[href*='PrintResult']",
        "elements => elements.map(e => e.getAttribute('href'))",
    ))
    ids = []
    for href in hrefs:
        match = re.search(r"ReceptionId=(\d+)", href or "")
        if match:
            ids.append(match.group(1))
    return ids


def _has_value_after_colon(text):
    if ":" not in text:
        return False
    return bool(text.split(":", 1)[-1].strip())


def extract_tanks_from_soup(soup):
    """از soup صفحه «چاپ نتایج» تمام خط‌های «... سریال مخزن: مقدار» را
    پیدا می‌کند (ممکن است یک پذیرش چند مخزن داشته باشد).

    برچسب «سریال مخزن» معمولاً داخل یک <span> است و مقدار آن به‌صورت متن
    ساده بعد از همان <span>، داخل عنصر والد (مثلاً <p>) قرار دارد. پس باید
    کوچک‌ترین عنصری را برداریم که هم برچسب و هم مقدار را با هم دارد، نه
    خودِ <span> برچسب (که مقدار را ندارد) و نه یک عنصر خیلی بزرگ‌تر که چند
    فیلد را با هم قاطی می‌کند."""
    tank_lines = []
    for el in soup.find_all(True):
        text = el.get_text(" ", strip=True)
        if "سریال مخزن" not in text or not _has_value_after_colon(text):
            continue

        has_valid_child = any(
            "سریال مخزن" in child_text and _has_value_after_colon(child_text)
            for child_text in (c.get_text(" ", strip=True) for c in el.find_all(True))
        )
        if has_valid_child:
            # عنصر فرزندی داریم که خودش برچسب+مقدار کامل را دارد؛ همان
            # دقیق‌تر است، این عنصر بزرگ‌تر را رد کن.
            continue

        tank_lines.append(text)
    return tank_lines


def extract_plate_from_soup(soup):
    """شماره پلاک را از جدول مشخصات صفحه «چاپ نتایج» پیدا می‌کند. در آن جدول
    هر سلول برچسب («شماره پلاک») بلافاصله قبل از سلول مقدار خودش می‌آید."""
    for el in soup.find_all(True):
        if el.find(True):
            continue  # فقط عناصر برگ (بدون تگ فرزند) می‌توانند برچسب باشند
        label = el.get_text(strip=True)
        if label != "شماره پلاک":
            continue
        value_el = el.find_next_sibling(True)
        if value_el is not None:
            value = value_el.get_text(strip=True)
            if value:
                return value
    return ""


def click_page_number(page, next_number):
    """روی لینک/دکمه شماره صفحه بعدی در نوار صفحه‌بندی کلیک می‌کند."""
    candidates = [
        f"xpath=//a[normalize-space(text())='{next_number}']",
        f"xpath=//button[normalize-space(text())='{next_number}']",
        f"xpath=//li[normalize-space(text())='{next_number}']",
    ]
    for selector in candidates:
        locator = page.locator(selector)
        try:
            found = locator.count() > 0 and locator.first.is_visible()
        except PlaywrightError:
            found = False
        if found:
            try:
                locator.first.click()
            except PlaywrightError:
                pass
            return True
    return False


def save_to_excel(all_rows, out_path):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "نتایج"
    ws.sheet_view.rightToLeft = True

    headers = ["شماره پذیرش", "پلاک", "نام سازنده", "سریال مخزن"]
    ws.append(headers)
    for row in all_rows:
        ws.append([row[h] for h in headers])

    for col in ws.columns:
        max_len = max((len(str(cell.value)) for cell in col if cell.value), default=10)
        ws.column_dimensions[col[0].column_letter].width = max_len + 4

    wb.save(out_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-url", default=DEFAULT_START_URL, help="آدرس صفحه پذیرش‌های گازسوز")
    parser.add_argument("--out", default="result.xlsx", help="مسیر فایل خروجی Excel")
    parser.add_argument("--max-pages", type=int, default=500, help="سقف تعداد صفحات برای جلوگیری از حلقه بی‌نهایت")
    args = parser.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto(args.start_url)

        print("مرورگر باز شد.")
        print("لطفاً به‌صورت دستی وارد سامانه شوید، به بخش «پذیرش‌های گازسوز» بروید،")
        print("بازه تاریخ موردنظر را وارد کنید و روی «جستجو» بزنید.")
        input("وقتی صفحه اول نتایج (لیست پذیرش‌ها) باز شد، اینجا Enter را بزنید... ")

        all_rows = []
        seen_reception_ids = set()
        page_number = 1

        while page_number <= args.max_pages:
            wait_for_page_to_settle(page)
            reception_ids = find_reception_ids(page)
            new_ids = [rid for rid in reception_ids if rid not in seen_reception_ids]

            if not new_ids and page_number > 1:
                print(f"صفحه {page_number}: پذیرش جدیدی پیدا نشد، پایان استخراج.")
                break

            print(f"صفحه {page_number}: {len(new_ids)} پذیرش دارای نتیجه پیدا شد.")
            for reception_id in new_ids:
                seen_reception_ids.add(reception_id)
                print_url = urljoin(page.url, f"/TestCenters/GasReception/PrintResult?ReceptionId={reception_id}")
                response = context.request.get(print_url)
                if not response.ok:
                    print(f"  - پذیرش {reception_id}: خطا در بارگذاری صفحه نتیجه ({response.status})")
                    continue

                soup = BeautifulSoup(response.text(), "html.parser")
                tank_lines = extract_tanks_from_soup(soup)
                if not tank_lines:
                    print(f"  - پذیرش {reception_id}: خط «سریال مخزن» پیدا نشد.")
                    continue

                plate = extract_plate_from_soup(soup)
                for line in tank_lines:
                    manufacturer, serial = parse_manufacturer_serial(line)
                    all_rows.append({
                        "شماره پذیرش": reception_id,
                        "پلاک": plate,
                        "نام سازنده": manufacturer,
                        "سریال مخزن": serial,
                    })
                print(f"  - پذیرش {reception_id} (پلاک {plate or '?'}): {len(tank_lines)} مخزن استخراج شد.")

            print(f"مجموع تا این‌جا: {len(all_rows)} ردیف.")

            if not click_page_number(page, page_number + 1):
                print("صفحه بعدی پیدا نشد، پایان استخراج.")
                break

            page_number += 1

        browser.close()

    if not all_rows:
        print("هیچ داده‌ای استخراج نشد.")
        sys.exit(1)

    save_to_excel(all_rows, args.out)
    print(f"\nمجموع {len(all_rows)} ردیف در فایل '{args.out}' ذخیره شد.")


if __name__ == "__main__":
    main()
