"""
استخراج پلاک و وضعیت مخزن(های) گازسوز از سامانه سیمفا (gas.symfa.ir)
بدون نیاز به مرورگر خودکار - فقط با کوکی حساب لاگین‌شده (سازگار با ویندوز ۷ هم هست).

نصب:
    pip install requests beautifulsoup4 openpyxl

نحوه‌ی گرفتن کوکی از مرورگر:
    1. توی کروم وارد حساب کاربری‌ات توی gas.symfa.ir شو و برو صفحه‌ی
       پذیرش‌های گازسوز (GasReception).
    2. کلید F12 رو بزن تا DevTools باز بشه، برو تب Network.
    3. صفحه رو رفرش کن (F5).
    4. روی اولین درخواست با نام GasReception کلیک کن، برو بخش Headers،
       زیر «Request Headers» دنبال خط Cookie بگرد و کل مقدار جلوش رو کپی کن.
    5. اون مقدار رو بذار جای COOKIE پایین همین فایل (بین دو گیومه).

اجرا:
    python scrape_symfa.py
"""

import requests
from bs4 import BeautifulSoup
import openpyxl

BASE = "https://gas.symfa.ir"
LIST_URL = f"{BASE}/TestCenters/GasReception"
PRINT_URL = f"{BASE}/TestCenters/GasReception/PrintResult?ReceptionId={{}}"
OUTPUT_FILE = "result.xlsx"

# کل مقدار هدر Cookie که از مرورگر کپی کردی رو اینجا جایگزین کن
COOKIE = "اینجا کوکی کپی‌شده از مرورگر رو جایگزین کن"

HEADERS = {
    "Cookie": COOKIE,
    "User-Agent": "Mozilla/5.0",
}


def extract_reception_rows(html):
    """از جدول صفحه‌ی لیست، (پلاک، کد پذیرش) هر ردیف را برمی‌گرداند."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None or table.find("thead") is None or table.find("tbody") is None:
        raise RuntimeError(
            "جدول پذیرش‌ها توی صفحه پیدا نشد - احتمالاً کوکی معتبر نیست یا منقضی شده."
        )

    headers = [th.get_text(strip=True) for th in table.find("thead").find_all("th")]
    plate_idx = next((i for i, h in enumerate(headers) if "پلاک" in h), None)
    code_idx = next((i for i, h in enumerate(headers) if "کد پذیرش" in h), None)
    if plate_idx is None or code_idx is None:
        raise RuntimeError(f"ستون‌های پلاک/کد پذیرش پیدا نشد. هدرها: {headers}")

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cells) <= max(plate_idx, code_idx):
            continue
        plate = cells[plate_idx]
        code = cells[code_idx]
        if code.isdigit():
            rows.append((plate, code))
    return rows


def extract_tanks(html):
    """وضعیت هر مخزن را از صفحه‌ی چاپ نتایج استخراج می‌کند (یک ورودی به ازای هر مخزن)."""
    soup = BeautifulSoup(html, "html.parser")
    tanks = []
    for span in soup.find_all("span"):
        text = span.get_text(strip=True)
        if "مخزن" not in text:
            continue
        if "تایید" in text:
            tanks.append("تایید")
        elif "مردود" in text:
            tanks.append("مردود")
    return tanks


def extract_plate(html):
    soup = BeautifulSoup(html, "html.parser")
    cell = soup.find("td", class_="PlaqueNumber")
    return cell.get_text(strip=True) if cell else ""


def main():
    session = requests.Session()
    session.headers.update(HEADERS)

    resp = session.get(LIST_URL, timeout=30)
    resp.raise_for_status()
    rows = extract_reception_rows(resp.text)
    print(f"{len(rows)} پذیرش پیدا شد.")

    results = []
    for plate, code in rows:
        r = session.get(PRINT_URL.format(code), timeout=30)
        r.raise_for_status()
        actual_plate = extract_plate(r.text) or plate
        tanks = extract_tanks(r.text)
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
