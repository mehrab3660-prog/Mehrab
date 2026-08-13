"""
استخراج شماره پذیرش، نام سازنده و سریال مخزن از سامانه سیمفا
(gas.symfa.ir) برای مراکز معاینه فنی خودروهای گازسوز.

نحوه کار:
1. یک مرورگر Chrome واقعی (همان Chrome نصب‌شده روی سیستم شما) باز می‌شود.
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
    python extract_serials.py --out result.xlsx

توجه: این ابزار مرورگر Chrome نصب‌شده روی خودِ سیستم شما را باز می‌کند (نه
یک نسخه جدا و دانلودی)، پس Google Chrome باید از قبل روی سیستم نصب باشد.
بار اول که اجرا می‌کنید، به یک درایور کوچک (chromedriver) نیاز دارد که
خودش به‌صورت خودکار متناسب با نسخه Chrome شما دانلود می‌شود (به اینترنت
نیاز دارد، فقط همان بار اول).
"""

import argparse
import re
import sys
import time
from urllib.parse import urljoin

DEFAULT_START_URL = "https://gas.symfa.ir/TestCenters/GasReception"

# این‌ها در import_dependencies() پر می‌شوند، نه همین بالا. اگر این
# import ها همین‌جا (سطح فایل) بودند و یکی‌شان روی سیستم کاربر خطا می‌داد
# (مثلاً به‌خاطر یک DLL یا نسخه ناسازگار)، برنامه قبل از رسیدن به try/except
# داخل __main__ کرش می‌کرد و پنجره کنسول بدون نمایش هیچ پیامی فوراً بسته
# می‌شد. با آوردنشان داخل یک تابع که از داخل try/except صدا زده می‌شود،
# حتی خطای import هم دیده و روی صفحه چاپ می‌شود.
requests = None
BeautifulSoup = None
webdriver = None
NoSuchWindowException = None
StaleElementReferenceException = None
WebDriverException = None
Options = None
Service = None
By = None
ChromeDriverManager = None
TRANSIENT_ERRORS = ()


def import_dependencies():
    global requests, BeautifulSoup, webdriver
    global NoSuchWindowException, StaleElementReferenceException, WebDriverException
    global Options, Service, By, ChromeDriverManager, TRANSIENT_ERRORS

    import requests as _requests
    from bs4 import BeautifulSoup as _BeautifulSoup
    from selenium import webdriver as _webdriver
    from selenium.common.exceptions import NoSuchWindowException as _NoSuchWindowException
    from selenium.common.exceptions import StaleElementReferenceException as _StaleElementReferenceException
    from selenium.common.exceptions import WebDriverException as _WebDriverException
    from selenium.webdriver.chrome.options import Options as _Options
    from selenium.webdriver.chrome.service import Service as _Service
    from selenium.webdriver.common.by import By as _By
    from webdriver_manager.chrome import ChromeDriverManager as _ChromeDriverManager

    requests = _requests
    BeautifulSoup = _BeautifulSoup
    webdriver = _webdriver
    NoSuchWindowException = _NoSuchWindowException
    StaleElementReferenceException = _StaleElementReferenceException
    WebDriverException = _WebDriverException
    Options = _Options
    Service = _Service
    By = _By
    ChromeDriverManager = _ChromeDriverManager
    TRANSIENT_ERRORS = (StaleElementReferenceException, NoSuchWindowException, WebDriverException)


def wait_for_page_to_settle(driver, timeout=15):
    """صبر می‌کند تا صفحه کاملاً بارگذاری و آرام شود (بعضی صفحات این سایت
    بعد از بارگذاری اول یک بار دیگر navigate/redirect می‌کنند)."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            if driver.execute_script("return document.readyState") == "complete":
                break
        except TRANSIENT_ERRORS:
            pass
        time.sleep(0.3)
    time.sleep(0.7)


def retry_on_navigation(func, retries=5, delay=0.8):
    """چون گاهی درست همان لحظه‌ای که داریم صفحه را می‌خوانیم، سایت یک
    navigation/redirect دیگر انجام می‌دهد، این تابع در صورت خطاهای گذرا
    (مثل stale element) چند بار دوباره تلاش می‌کند."""
    last_err = None
    for attempt in range(retries):
        try:
            return func()
        except TRANSIENT_ERRORS as e:
            last_err = e
            time.sleep(delay)
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


def find_reception_ids(driver):
    """کد پذیرش (ReceptionId) تمام ردیف‌هایی که دکمه «چاپ نتایج» دارند را از
    صفحه فعلی لیست پذیرش‌ها برمی‌دارد."""
    def _read():
        links = driver.find_elements(By.CSS_SELECTOR, "a[href*='PrintResult']")
        return [el.get_attribute("href") for el in links]

    hrefs = retry_on_navigation(_read)
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


def click_page_number(driver, next_number):
    """روی لینک/دکمه شماره صفحه بعدی در نوار صفحه‌بندی کلیک می‌کند."""
    candidates = [
        f"//a[normalize-space(text())='{next_number}']",
        f"//button[normalize-space(text())='{next_number}']",
        f"//li[normalize-space(text())='{next_number}']",
    ]
    for xpath in candidates:
        try:
            elements = driver.find_elements(By.XPATH, xpath)
        except TRANSIENT_ERRORS:
            continue
        for el in elements:
            try:
                if el.is_displayed():
                    el.click()
                    return True
            except TRANSIENT_ERRORS:
                continue
    return False


def build_session_from_driver(driver):
    """یک requests.Session با همان کوکی‌های نشست فعلی مرورگر می‌سازد، تا
    بشود صفحه «چاپ نتایج» هر پذیرش را مستقیم (بدون باز کردن تب جدید در
    مرورگر) و سریع خواند."""
    session = requests.Session()
    try:
        user_agent = driver.execute_script("return navigator.userAgent")
        if user_agent:
            session.headers.update({"User-Agent": user_agent})
    except TRANSIENT_ERRORS:
        pass
    for cookie in driver.get_cookies():
        session.cookies.set(cookie["name"], cookie["value"], domain=cookie.get("domain"))
    return session


def save_to_excel(all_rows, out_path):
    """پذیرش‌های تک‌مخزن و جفت‌مخزن (دو مخزن) را در دو شیت جدا ذخیره می‌کند."""
    from openpyxl import Workbook

    headers = ["شماره پذیرش", "پلاک", "نام سازنده", "سریال مخزن"]

    single_tank_rows = [r for r in all_rows if r["_tank_count"] == 1]
    dual_tank_rows = [r for r in all_rows if r["_tank_count"] >= 2]

    def fill_sheet(ws, rows):
        ws.sheet_view.rightToLeft = True
        ws.append(headers)
        for row in rows:
            ws.append([row[h] for h in headers])
        for col in ws.columns:
            max_len = max((len(str(cell.value)) for cell in col if cell.value), default=10)
            ws.column_dimensions[col[0].column_letter].width = max_len + 4

    wb = Workbook()
    ws_single = wb.active
    ws_single.title = "تک مخزن"
    fill_sheet(ws_single, single_tank_rows)

    ws_dual = wb.create_sheet("جفت مخزن")
    fill_sheet(ws_dual, dual_tank_rows)

    wb.save(out_path)


def launch_chrome():
    print("در حال آماده‌سازی مرورگر (بار اول ممکن است چند ثانیه طول بکشد)...")
    try:
        driver_path = ChromeDriverManager().install()
    except Exception as e:
        print(f"[خطا] پیدا کردن/دانلود درایور Chrome ناموفق بود: {e}")
        print("مطمئن شوید Google Chrome نصب است و به اینترنت متصل هستید.")
        sys.exit(1)

    options = Options()
    options.add_argument("--start-maximized")
    try:
        return webdriver.Chrome(service=Service(driver_path), options=options)
    except WebDriverException as e:
        print(f"[خطا] باز کردن Chrome ناموفق بود: {e}")
        print("مطمئن شوید Google Chrome روی این سیستم نصب است.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-url", default=DEFAULT_START_URL, help="آدرس صفحه پذیرش‌های گازسوز")
    parser.add_argument("--out", default="result.xlsx", help="مسیر فایل خروجی Excel")
    parser.add_argument("--max-pages", type=int, default=500, help="سقف تعداد صفحات برای جلوگیری از حلقه بی‌نهایت")
    args = parser.parse_args()

    driver = launch_chrome()
    all_rows = []

    try:
        driver.get(args.start_url)

        print("مرورگر باز شد.")
        print("لطفاً به‌صورت دستی وارد سامانه شوید، به بخش «پذیرش‌های گازسوز» بروید،")
        print("بازه تاریخ موردنظر را وارد کنید و روی «جستجو» بزنید.")
        input("وقتی صفحه اول نتایج (لیست پذیرش‌ها) باز شد، اینجا Enter را بزنید... ")

        seen_reception_ids = set()
        page_number = 1

        while page_number <= args.max_pages:
            wait_for_page_to_settle(driver)
            session = build_session_from_driver(driver)
            reception_ids = find_reception_ids(driver)
            new_ids = [rid for rid in reception_ids if rid not in seen_reception_ids]

            if not new_ids and page_number > 1:
                print(f"صفحه {page_number}: پذیرش جدیدی پیدا نشد، پایان استخراج.")
                break

            print(f"صفحه {page_number}: {len(new_ids)} پذیرش دارای نتیجه پیدا شد.")
            for reception_id in new_ids:
                seen_reception_ids.add(reception_id)
                print_url = urljoin(driver.current_url, f"/TestCenters/GasReception/PrintResult?ReceptionId={reception_id}")
                try:
                    response = session.get(print_url, timeout=30)
                except requests.RequestException as e:
                    print(f"  - پذیرش {reception_id}: خطا در بارگذاری صفحه نتیجه ({e})")
                    continue
                if not response.ok:
                    print(f"  - پذیرش {reception_id}: خطا در بارگذاری صفحه نتیجه ({response.status_code})")
                    continue

                soup = BeautifulSoup(response.text, "html.parser")
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
                        "_tank_count": len(tank_lines),
                    })
                kind = "تک مخزن" if len(tank_lines) == 1 else "جفت مخزن"
                print(f"  - پذیرش {reception_id} (پلاک {plate or '?'}, {kind}): {len(tank_lines)} مخزن استخراج شد.")

            print(f"مجموع تا این‌جا: {len(all_rows)} ردیف.")

            if not click_page_number(driver, page_number + 1):
                print("صفحه بعدی پیدا نشد، پایان استخراج.")
                break

            page_number += 1
    finally:
        driver.quit()

    if not all_rows:
        print("هیچ داده‌ای استخراج نشد.")
        sys.exit(1)

    save_to_excel(all_rows, args.out)
    print(f"\nمجموع {len(all_rows)} ردیف در فایل '{args.out}' ذخیره شد.")


if __name__ == "__main__":
    exit_code = 0
    try:
        import_dependencies()
        main()
    except SystemExit as e:
        exit_code = e.code or 0
    except Exception:
        # وقتی این فایل به exe تبدیل شده و با دابل‌کلیک اجرا می‌شود، به محض
        # تمام شدن برنامه (حتی با خطا) پنجره سیاه بسته می‌شود. این پیام و
        # مکث، خطا (با جزئیات کامل) را قابل خواندن نگه می‌دارد.
        import traceback
        print("\n[خطا]")
        traceback.print_exc()
        exit_code = 1

    if getattr(sys, "frozen", False):
        input("\nEnter را بزنید تا بسته شود... ")

    sys.exit(exit_code)
