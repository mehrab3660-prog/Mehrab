"""
استخراج شماره پذیرش، نام سازنده و سریال مخزن از سامانه آزمایشگاه.

نحوه کار:
1. یک مرورگر واقعی (غیر مخفی) باز می‌شود.
2. خودتان به‌صورت دستی وارد سامانه می‌شوید (نام کاربری/رمز عبور شما هرگز داخل
   این اسکریپت ذخیره یا وارد نمی‌شود).
3. خودتان تاریخ موردنظر را وارد کرده و روی «مشاهده نتیجه» کلیک می‌کنید تا
   صفحه اول نتایج باز شود.
4. در ترمینال کلید Enter را می‌زنید تا اسکریپت شروع به کار کند.
5. اسکریپت به‌صورت خودکار از هر صفحه، «شماره پذیرش»، «نام سازنده» و
   «سریال مخزن» را استخراج می‌کند، روی دکمه صفحه بعد کلیک می‌کند و این کار
   را تا آخرین صفحه تکرار می‌کند.
6. در پایان یک فایل Excel با نتایج ساخته می‌شود.

اجرا:
    pip install -r requirements.txt
    playwright install chromium
    python extract_serials.py --start-url "https://<site-address>" --out result.xlsx
"""

import argparse
import re
import sys

from playwright.sync_api import sync_playwright

# متن دکمه/لینک «صفحه بعد» ممکن است در سامانه‌های مختلف فرق کند.
# اسکریپت به ترتیب این‌ها را امتحان می‌کند و اولین موردی که فعال و قابل کلیک
# باشد را انتخاب می‌کند. اگر سایت شما از متن دیگری استفاده می‌کند، آن را به
# همین لیست اضافه کنید.
NEXT_PAGE_SELECTORS = [
    "li.PagedList-skipToNext a",
    "a[rel='next']",
    "a:has-text('بعدی')",
    "a:has-text('صفحه بعد')",
    ".pagination .next a",
    "a:has-text('Next')",
    "a:has-text('»')",
]

EXTRACT_JS = r"""
() => {
    const rows = [];
    const links = document.querySelectorAll('a[href*="PrintResult"]');
    links.forEach(link => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/ReceptionId=(\d+)/);
        if (!match) return;
        const receptionId = match[1];

        // از روی لینک بالا می‌رویم تا کارت/ردیفی که شامل متن
        // «سریال مخزن» است را پیدا کنیم.
        let container = link;
        let serialText = null;
        for (let i = 0; i < 6 && container; i++) {
            container = container.parentElement;
            if (!container) break;
            const paragraphs = container.querySelectorAll('p');
            for (const p of paragraphs) {
                if (p.textContent && p.textContent.includes('سریال مخزن')) {
                    serialText = p.textContent;
                    break;
                }
            }
            if (serialText) break;
        }

        rows.push({ receptionId, serialText });
    });
    return rows;
}
"""


def parse_manufacturer_serial(raw_text):
    """از متنی مثل 'شرکت و سریال مخزن: Asiyanama(ANCC)-2024071949'
    نام سازنده و سریال مخزن را جدا می‌کند."""
    if not raw_text:
        return "", ""
    text = raw_text.split(":", 1)[-1].strip()
    match = re.match(r"^(.+)-([^-]+)$", text)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return text, ""


def scrape_current_page(page):
    rows = page.evaluate(EXTRACT_JS)
    results = []
    for row in rows:
        manufacturer, serial = parse_manufacturer_serial(row.get("serialText"))
        results.append({
            "شماره پذیرش": row["receptionId"],
            "نام سازنده": manufacturer,
            "سریال مخزن": serial,
        })
    return results


def find_next_page_control(page):
    for selector in NEXT_PAGE_SELECTORS:
        locator = page.locator(selector)
        try:
            count = locator.count()
        except Exception:
            continue
        if count == 0:
            continue
        element = locator.first
        if element.is_visible() and element.is_enabled():
            return element
    return None


def save_to_excel(all_rows, out_path):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "نتایج"
    ws.sheet_view.rightToLeft = True

    headers = ["شماره پذیرش", "نام سازنده", "سریال مخزن"]
    ws.append(headers)
    for row in all_rows:
        ws.append([row[h] for h in headers])

    for col in ws.columns:
        max_len = max((len(str(cell.value)) for cell in col if cell.value), default=10)
        ws.column_dimensions[col[0].column_letter].width = max_len + 4

    wb.save(out_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-url", required=True, help="آدرس سامانه (صفحه ورود)")
    parser.add_argument("--out", default="result.xlsx", help="مسیر فایل خروجی Excel")
    parser.add_argument("--max-pages", type=int, default=500, help="سقف تعداد صفحات برای جلوگیری از حلقه بی‌نهایت")
    args = parser.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(args.start_url)

        print("مرورگر باز شد.")
        print("لطفاً به‌صورت دستی وارد سامانه شوید، تاریخ را وارد کنید و روی «مشاهده نتیجه» بزنید.")
        input("وقتی صفحه اول نتایج باز شد، اینجا Enter را بزنید تا استخراج شروع شود... ")

        all_rows = []
        seen_reception_ids = set()
        page_number = 1

        while page_number <= args.max_pages:
            page.wait_for_load_state("networkidle")
            page_rows = scrape_current_page(page)

            new_rows = [r for r in page_rows if r["شماره پذیرش"] not in seen_reception_ids]
            if not new_rows and page_number > 1:
                print(f"صفحه {page_number}: ردیف جدیدی پیدا نشد، پایان استخراج.")
                break

            for r in new_rows:
                seen_reception_ids.add(r["شماره پذیرش"])
            all_rows.extend(new_rows)
            print(f"صفحه {page_number}: {len(new_rows)} ردیف استخراج شد. (مجموع: {len(all_rows)})")

            next_control = find_next_page_control(page)
            if next_control is None:
                print("دکمه صفحه بعد پیدا نشد، پایان استخراج.")
                break

            next_control.click()
            page_number += 1

        browser.close()

    if not all_rows:
        print("هیچ داده‌ای استخراج نشد.")
        sys.exit(1)

    save_to_excel(all_rows, args.out)
    print(f"\nمجموع {len(all_rows)} ردیف در فایل '{args.out}' ذخیره شد.")


if __name__ == "__main__":
    main()
