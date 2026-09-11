"""
برنامه‌ی گرافیکی استخراج پلاک و وضعیت مخزن از سامانه سیمفا (gas.symfa.ir)

نصب یک‌بار (خط فرمان):
    pip install requests beautifulsoup4 openpyxl

اجرا:
    فایل run.vbs رو دابل‌کلیک کن (بدون پنجره‌ی سیاه cmd باز می‌شه).

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
from tkinter import ttk, scrolledtext, messagebox

import requests
from bs4 import BeautifulSoup
import openpyxl

BASE = "https://gas.symfa.ir"
LIST_URL = f"{BASE}/TestCenters/GasReception"
PRINT_URL = f"{BASE}/TestCenters/GasReception/PrintResult?ReceptionId={{}}"

APP_DIR = os.path.dirname(os.path.abspath(__file__))
COOKIE_FILE = os.path.join(APP_DIR, "last_cookie.txt")
OUTPUT_FILE = os.path.join(APP_DIR, "result.xlsx")

# پالت رنگی
COLOR_BG = "#f4f6f8"
COLOR_HEADER = "#0f6d8c"
COLOR_HEADER_TEXT = "#ffffff"
COLOR_ACCENT = "#0f6d8c"
COLOR_ACCENT_HOVER = "#0c5871"
COLOR_CARD = "#ffffff"
COLOR_BORDER = "#d7dde3"
COLOR_TEXT = "#1f2933"
COLOR_MUTED = "#6b7785"
FONT_FAMILY = "Segoe UI"


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
        root.geometry("700x560")
        root.minsize(560, 440)
        root.configure(bg=COLOR_BG)

        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("Header.TFrame", background=COLOR_HEADER)
        style.configure(
            "Header.TLabel",
            background=COLOR_HEADER,
            foreground=COLOR_HEADER_TEXT,
            font=(FONT_FAMILY, 15, "bold"),
        )
        style.configure(
            "SubHeader.TLabel",
            background=COLOR_HEADER,
            foreground="#d7ecf3",
            font=(FONT_FAMILY, 9),
        )
        style.configure("Card.TFrame", background=COLOR_CARD)
        style.configure(
            "Field.TLabel",
            background=COLOR_CARD,
            foreground=COLOR_TEXT,
            font=(FONT_FAMILY, 10, "bold"),
        )
        style.configure(
            "Status.TLabel",
            background=COLOR_CARD,
            foreground=COLOR_MUTED,
            font=(FONT_FAMILY, 9),
        )
        style.configure(
            "Accent.TButton",
            background=COLOR_ACCENT,
            foreground="#ffffff",
            font=(FONT_FAMILY, 10, "bold"),
            padding=(16, 9),
            borderwidth=0,
        )
        style.map(
            "Accent.TButton",
            background=[("active", COLOR_ACCENT_HOVER), ("disabled", "#a9b6bd")],
        )
        style.configure(
            "Accent.Horizontal.TProgressbar",
            troughcolor="#e7ecef",
            background=COLOR_ACCENT,
            thickness=8,
        )

        # ---------- هدر ----------
        header = ttk.Frame(root, style="Header.TFrame")
        header.pack(fill="x")
        ttk.Label(header, text="استخراج نتایج سیمفا", style="Header.TLabel").pack(
            anchor="e", padx=20, pady=(16, 0)
        )
        ttk.Label(
            header,
            text="پلاک و وضعیت مخزن پذیرش‌های گازسوز از gas.symfa.ir",
            style="SubHeader.TLabel",
        ).pack(anchor="e", padx=20, pady=(2, 16))

        # ---------- بدنه ----------
        body = tk.Frame(root, bg=COLOR_BG)
        body.pack(fill="both", expand=True, padx=18, pady=16)

        card = tk.Frame(body, bg=COLOR_CARD, highlightbackground=COLOR_BORDER, highlightthickness=1)
        card.pack(fill="both", expand=True)

        inner = tk.Frame(card, bg=COLOR_CARD)
        inner.pack(fill="both", expand=True, padx=18, pady=16)

        ttk.Label(inner, text="کوکی حساب کاربری", style="Field.TLabel").pack(
            anchor="e", fill="x"
        )
        self.cookie_box = scrolledtext.ScrolledText(
            inner,
            height=4,
            font=("Consolas", 9),
            bg="#fbfcfd",
            fg=COLOR_TEXT,
            relief="solid",
            borderwidth=1,
            wrap="word",
        )
        self.cookie_box.pack(fill="x", pady=(6, 4))
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, "r", encoding="utf-8") as f:
                self.cookie_box.insert("1.0", f.read())

        ttk.Label(
            inner,
            text="از DevTools مرورگر (F12 → Network → GasReception → Headers → Cookie) کپی کن.",
            style="Status.TLabel",
        ).pack(anchor="e", fill="x", pady=(0, 12))

        action_row = tk.Frame(inner, bg=COLOR_CARD)
        action_row.pack(fill="x", pady=(0, 10))
        self.start_btn = ttk.Button(
            action_row, text="▶  شروع استخراج", style="Accent.TButton", command=self.start
        )
        self.start_btn.pack(side="right")

        self.status_var = tk.StringVar(value="آماده")
        ttk.Label(action_row, textvariable=self.status_var, style="Status.TLabel").pack(
            side="right", padx=(0, 14)
        )

        self.progress = ttk.Progressbar(
            inner, style="Accent.Horizontal.TProgressbar", mode="indeterminate"
        )
        self.progress.pack(fill="x", pady=(0, 12))

        ttk.Label(inner, text="گزارش اجرا", style="Field.TLabel").pack(anchor="e", fill="x")
        self.log_box = scrolledtext.ScrolledText(
            inner,
            font=("Consolas", 9),
            bg="#0f1720",
            fg="#d7ecf3",
            insertbackground="#d7ecf3",
            relief="flat",
            state="disabled",
        )
        self.log_box.pack(fill="both", expand=True, pady=(6, 0))

    def log(self, text):
        self.log_box.config(state="normal")
        self.log_box.insert("end", text + "\n")
        self.log_box.see("end")
        self.log_box.config(state="disabled")

    def set_status(self, text):
        self.status_var.set(text)

    def start(self):
        cookie = clean_cookie(self.cookie_box.get("1.0", "end"))
        if not cookie:
            messagebox.showerror("خطا", "کوکی رو وارد کن.")
            return
        self.start_btn.config(state="disabled")
        self.progress.start(12)
        self.set_status("در حال اجرا...")
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
            for i, (plate, code) in enumerate(rows, start=1):
                self.set_status(f"در حال پردازش {i} از {len(rows)}...")
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
            self.set_status(f"تمام شد - {len(results)} پذیرش")
            messagebox.showinfo("تمام شد", f"{len(results)} پذیرش استخراج و در result.xlsx ذخیره شد.")
            try:
                os.startfile(OUTPUT_FILE)
            except Exception:
                pass
        except Exception as e:
            self.log(f"خطا: {e}")
            self.set_status("خطا")
            messagebox.showerror("خطا", str(e))
        finally:
            self.progress.stop()
            self.start_btn.config(state="normal")


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
