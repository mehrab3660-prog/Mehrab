"""
استخراج پلاک و وضعیت مخزن(های) گازسوز از سامانه سیمفا (gas.symfa.ir)

نصب:
    pip install playwright openpyxl
    playwright install chromium

اجرا:
    python scrape_symfa.py

روند کار:
    1. یک پنجره‌ی مرورگر باز می‌شود و به صفحه‌ی «پذیرش‌های گازسوز» می‌رود.
    2. خودتان با یوزر/پسورد در همان مرورگر وارد سامانه شوید.
    3. هر فیلتری (تاریخ، کد پذیرش و ...) که می‌خواهید روی صفحه‌ی لیست اعمال کنید،
       همان‌جا در مرورگر انجام دهید تا فقط همان‌ها استخراج شوند.
    4. در ترمینال Enter بزنید تا استخراج شروع شود.
    5. نتیجه در فایل result.xlsx (کنار همین اسکریپت) ذخیره می‌شود.
"""

from playwright.sync_api import sync_playwright
import openpyxl

BASE = "https://gas.symfa.ir"
LIST_URL = f"{BASE}/TestCenters/GasReception"
PRINT_URL = f"{BASE}/TestCenters/GasReception/PrintResult?ReceptionId={{}}"
OUTPUT_FILE = "result.xlsx"


def extract_reception_rows(page):
    """از جدول صفحه‌ی لیست، (پلاک، کد پذیرش) هر ردیف را برمی‌گرداند."""
    headers = [h.strip() for h in page.locator("table thead th").all_inner_texts()]
    plate_idx = next((i for i, h in enumerate(headers) if "پلاک" in h), None)
    code_idx = next((i for i, h in enumerate(headers) if "کد پذیرش" in h), None)
    if plate_idx is None or code_idx is None:
        raise RuntimeError(
            f"ستون‌های پلاک/کد پذیرش توی هدر جدول پیدا نشد. هدرها: {headers}"
        )

    rows = []
    for row in page.locator("table tbody tr").all():
        cells = row.locator("td").all_inner_texts()
        if len(cells) <= max(plate_idx, code_idx):
            continue
        plate = cells[plate_idx].strip()
        code = cells[code_idx].strip()
        if code.isdigit():
            rows.append((plate, code))
    return rows


def extract_tanks(page):
    """وضعیت هر مخزن را از صفحه‌ی چاپ نتایج استخراج می‌کند (یک ورودی به ازای هر مخزن)."""
    spans = page.locator("span:has-text('مخزن')").all_inner_texts()
    tanks = []
    for text in spans:
        text = text.strip()
        if "تایید" in text:
            tanks.append("تایید")
        elif "مردود" in text:
            tanks.append("مردود")
    return tanks


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(LIST_URL)
        input(
            "بعد از لاگین و اعمال فیلترهای دلخواه توی مرورگر، وقتی صفحه‌ی لیست پذیرش‌ها "
            "رو می‌بینی، اینجا Enter بزن تا استخراج شروع بشه... "
        )

        rows = extract_reception_rows(page)
        print(f"{len(rows)} پذیرش پیدا شد.")

        results = []
        for plate, code in rows:
            page.goto(PRINT_URL.format(code))
            plate_el = page.locator("td.PlaqueNumber")
            actual_plate = (
                plate_el.first.inner_text().strip() if plate_el.count() else plate
            )
            tanks = extract_tanks(page)
            results.append(
                {
                    "کد پذیرش": code,
                    "پلاک": actual_plate,
                    "تعداد مخزن": len(tanks),
                    "وضعیت مخزن ۱": tanks[0] if len(tanks) > 0 else "",
                    "وضعیت مخزن ۲": tanks[1] if len(tanks) > 1 else "",
                }
            )
            print(f"{code} - {actual_plate} - {tanks}")

        browser.close()

    headers = ["کد پذیرش", "پلاک", "تعداد مخزن", "وضعیت مخزن ۱", "وضعیت مخزن ۲"]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "نتایج"
    ws.append(headers)
    for r in results:
        ws.append([r[h] for h in headers])
    wb.save(OUTPUT_FILE)
    print(f"ذخیره شد در {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
