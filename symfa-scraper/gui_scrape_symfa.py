"""
برنامه‌ی گرافیکی استخراج پلاک و وضعیت مخزن از سامانه سیمفا (gas.symfa.ir)

نصب یک‌بار (خط فرمان):
    pip install requests beautifulsoup4 openpyxl

اجرا:
    فایل run.bat رو دابل‌کلیک کن.

نحوه‌ی گرفتن کوکی از مرورگر (هر بار که کوکی منقضی/نامعتبر شد، دوباره لازمه):
    1. توی کروم وارد حساب کاربری‌ات توی gas.symfa.ir شو و برو صفحه‌ی
       پذیرش‌های گازسوز (GasReception).
    2. کلید F12 رو بزن، تب Network، فیلتر Doc رو بزن، صفحه رو رفرش کن (F5).
    3. روی ردیف GasReception کلیک کن، تب Headers، زیر Request Headers
       مقدار جلوی Cookie رو کپی کن و توی کادر بالای این برنامه پیست کن.
"""

import os
import re
import threading
import tkinter as tk
from tkinter import scrolledtext, messagebox

import requests
from bs4 import BeautifulSoup
import openpyxl

BASE = "https://gas.symfa.ir"
LIST_URL = f"{BASE}/TestCenters/GasReception"
PRINT_URL = f"{BASE}/TestCenters/GasReception/PrintResult?ReceptionId={{}}"

APP_DIR = os.path.dirname(os.path.abspath(__file__))
COOKIE_FILE = os.path.join(APP_DIR, "last_cookie.txt")
OUTPUT_FILE = os.path.join(APP_DIR, "result.xlsx")


def clean_cookie(raw):
    """کاراکترهای نامرئی احتمالی (مثل نشانه‌ی راست‌به‌چپ) رو پاک می‌کنه."""
    raw = re.sub(r"[^\x20-\x7e]", "", raw).strip()
    if raw.lower().startswith("cookie:"):
        raw = raw[len("cookie:"):].strip()
    return raw


def extract_reception_rows(html):
    """از جدول صفحه‌ی لیست، (پلاک، کد پذیرش) هر ردیف را برمی‌گرداند."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None or table.find("thead") is None or table.find("tbody") is None:
        raise RuntimeError("جدول پذیرش‌ها پیدا نشد - احتمالاً کوکی منقضی شده یا اشتباهه.")

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
    """وضعیت هر مخزن را استخراج می‌کند (یک ورودی به ازای هر مخزن)."""
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


class App:
    def __init__(self, root):
        self.root = root
        root.title("استخراج نتایج سیمفا")
        root.geometry("640x480")

        tk.Label(root, text="کوکی حساب کاربری (از DevTools):").pack(fill="x", padx=10, pady=(10, 0))
        self.cookie_box = scrolledtext.ScrolledText(root, height=4)
        self.cookie_box.pack(fill="x", padx=10, pady=5)
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, "r", encoding="utf-8") as f:
                self.cookie_box.insert("1.0", f.read())

        self.start_btn = tk.Button(root, text="شروع استخراج", command=self.start)
        self.start_btn.pack(pady=5)

        self.log_box = scrolledtext.ScrolledText(root, height=18, state="disabled")
        self.log_box.pack(fill="both", expand=True, padx=10, pady=5)

    def log(self, text):
        self.log_box.config(state="normal")
        self.log_box.insert("end", text + "\n")
        self.log_box.see("end")
        self.log_box.config(state="disabled")

    def start(self):
        cookie = clean_cookie(self.cookie_box.get("1.0", "end"))
        if not cookie:
            messagebox.showerror("خطا", "کوکی رو وارد کن.")
            return
        self.start_btn.config(state="disabled")
        threading.Thread(target=self.run, args=(cookie,), daemon=True).start()

    def run(self, cookie):
        try:
            with open(COOKIE_FILE, "w", encoding="utf-8") as f:
                f.write(cookie)

            session = requests.Session()
            session.headers.update({"Cookie": cookie, "User-Agent": "Mozilla/5.0"})

            self.log("در حال گرفتن لیست پذیرش‌ها...")
            resp = session.get(LIST_URL, timeout=30)
            resp.raise_for_status()
            rows = extract_reception_rows(resp.text)
            self.log(f"{len(rows)} پذیرش پیدا شد.")

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
                self.log(f"{code} - {actual_plate} - {tanks}")

            headers = ["کد پذیرش", "پلاک", "تعداد مخزن", "وضعیت مخزن ۱", "وضعیت مخزن ۲"]
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "نتایج"
            ws.append(headers)
            for r in results:
                ws.append([r[h] for h in headers])
            wb.save(OUTPUT_FILE)
            self.log(f"ذخیره شد در: {OUTPUT_FILE}")
            messagebox.showinfo("تمام شد", f"{len(results)} پذیرش استخراج و در result.xlsx ذخیره شد.")
            try:
                os.startfile(OUTPUT_FILE)
            except Exception:
                pass
        except Exception as e:
            self.log(f"خطا: {e}")
            messagebox.showerror("خطا", str(e))
        finally:
            self.start_btn.config(state="normal")


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
