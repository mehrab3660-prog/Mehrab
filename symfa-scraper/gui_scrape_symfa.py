"""
برنامه‌ی گرافیکی استخراج پلاک و وضعیت مخزن از سامانه سیمفا (gas.symfa.ir)

نصب یک‌بار (خط فرمان):
    pip install requests beautifulsoup4 openpyxl

اجرا:
    فایل run.vbs (یا run.bat) رو دابل‌کلیک کن.

نام‌کاربری و رمز عبورت رو توی برنامه وارد کن؛ برنامه خودش با همون‌ها
لاگین می‌کنه و دیگه نیازی به کپی‌کردن کوکی از DevTools نیست.
"""

import os
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox

import requests
from bs4 import BeautifulSoup
import openpyxl

BASE = "https://gas.symfa.ir"
LOGIN_URL = f"{BASE}/TestCenters/Home/Login"
LIST_URL = f"{BASE}/TestCenters/GasReception"
PRINT_URL = f"{BASE}/TestCenters/GasReception/PrintResult?ReceptionId={{}}"

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CREDS_FILE = os.path.join(APP_DIR, "last_login.txt")
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


def login(username, password):
    """با نام‌کاربری/رمز وارد می‌شود و یک session با کوکی معتبر برمی‌گرداند."""
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})

    # یه بار صفحه رو باز می‌کنیم تا کوکی اولیه‌ی سشن گرفته بشه
    session.get(BASE, timeout=30)

    resp = session.post(
        LOGIN_URL,
        data={"UserName": username, "Password": password, "IsSoft": ""},
        timeout=30,
        allow_redirects=True,
    )
    resp.raise_for_status()
    return session


def extract_reception_rows(html):
    """از جدول صفحه‌ی لیست، (پلاک، کد پذیرش) هر ردیف را برمی‌گرداند."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None or table.find("thead") is None or table.find("tbody") is None:
        raise RuntimeError(
            "جدول پذیرش‌ها پیدا نشد - احتمالاً نام‌کاربری یا رمز اشتباهه."
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
        root.geometry("700x600")
        root.minsize(560, 460)
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
            "Field.TEntry",
            fieldbackground="#fbfcfd",
            padding=6,
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

        saved_user, saved_pass = self._load_creds()

        login_row = tk.Frame(inner, bg=COLOR_CARD)
        login_row.pack(fill="x", pady=(0, 4))

        user_col = tk.Frame(login_row, bg=COLOR_CARD)
        user_col.pack(side="right", fill="x", expand=True, padx=(8, 0))
        ttk.Label(user_col, text="نام‌کاربری", style="Field.TLabel").pack(anchor="e")
        self.user_entry = ttk.Entry(user_col, style="Field.TEntry", justify="right")
        self.user_entry.pack(fill="x", pady=(4, 0))
        self.user_entry.insert(0, saved_user)

        pass_col = tk.Frame(login_row, bg=COLOR_CARD)
        pass_col.pack(side="right", fill="x", expand=True)
        ttk.Label(pass_col, text="رمز عبور", style="Field.TLabel").pack(anchor="e")
        self.pass_entry = ttk.Entry(pass_col, style="Field.TEntry", justify="right", show="•")
        self.pass_entry.pack(fill="x", pady=(4, 0))
        self.pass_entry.insert(0, saved_pass)

        action_row = tk.Frame(inner, bg=COLOR_CARD)
        action_row.pack(fill="x", pady=(14, 10))
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

    def _load_creds(self):
        if os.path.exists(CREDS_FILE):
            with open(CREDS_FILE, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
            if len(lines) >= 2:
                return lines[0], lines[1]
        return "", ""

    def _save_creds(self, username, password):
        with open(CREDS_FILE, "w", encoding="utf-8") as f:
            f.write(username + "\n" + password)

    def log(self, text):
        self.log_box.config(state="normal")
        self.log_box.insert("end", text + "\n")
        self.log_box.see("end")
        self.log_box.config(state="disabled")

    def set_status(self, text):
        self.status_var.set(text)

    def start(self):
        username = self.user_entry.get().strip()
        password = self.pass_entry.get().strip()
        if not username or not password:
            messagebox.showerror("خطا", "نام‌کاربری و رمز عبور رو وارد کن.")
            return
        self.start_btn.config(state="disabled")
        self.progress.start(12)
        self.set_status("در حال ورود...")
        threading.Thread(target=self.run, args=(username, password), daemon=True).start()

    def run(self, username, password):
        try:
            self._save_creds(username, password)

            self.log("در حال ورود به حساب کاربری...")
            session = login(username, password)

            self.set_status("در حال گرفتن لیست پذیرش‌ها...")
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
