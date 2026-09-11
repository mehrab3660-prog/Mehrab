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
import re
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox

import requests
from bs4 import BeautifulSoup
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

BASE = "https://gas.symfa.ir"
LOGIN_URL = f"{BASE}/TestCenters/Home/Login"
LIST_URL = f"{BASE}/TestCenters/GasReception"
LIST_PAGE_URL = f"{BASE}/TestCenters/GasReception?Page={{}}"
PRINT_URL = f"{BASE}/TestCenters/GasReception/PrintResult?ReceptionId={{}}"

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CREDS_FILE = os.path.join(APP_DIR, "last_login.txt")
OUTPUT_FILE = os.path.join(APP_DIR, "result.xlsx")

# پالت رنگی - تم تیره‌ی طلایی/سرمه‌ای
COLOR_BG = "#0e1117"
COLOR_HEADER_FROM = "#151a27"
COLOR_HEADER_TO = "#241a3a"
COLOR_HEADER_TEXT = "#e8c876"
COLOR_ACCENT = "#c9a227"
COLOR_ACCENT_HOVER = "#e0b830"
COLOR_ACCENT_TEXT = "#171308"
COLOR_CARD = "#171b26"
COLOR_BORDER = "#2a3040"
COLOR_TEXT = "#e8e6e3"
COLOR_MUTED = "#8b94a7"
COLOR_FIELD_BG = "#0f1320"
FONT_FAMILY = "Segoe UI"


def draw_car_icon(canvas, cx, cy, scale, color, bg="#0e1117"):
    """یه سیلوئت ماشین ساده و مسطح (flat) روی Canvas می‌کشه."""
    # بدنه‌ی اصلی
    canvas.create_rectangle(
        cx - 24 * scale, cy - 2 * scale, cx + 24 * scale, cy + 4 * scale,
        fill=color, outline=color,
    )
    # کابین (سقف)
    canvas.create_polygon(
        cx - 14 * scale, cy - 2 * scale,
        cx - 9 * scale, cy - 10 * scale,
        cx + 6 * scale, cy - 10 * scale,
        cx + 10 * scale, cy - 2 * scale,
        fill=color, outline=color,
    )
    # شیشه‌ی جلو/عقب
    canvas.create_line(
        cx - 10 * scale, cy - 9 * scale, cx - 6 * scale, cy - 2.5 * scale,
        fill=bg, width=max(1, int(1.2 * scale)),
    )
    canvas.create_line(
        cx + 2 * scale, cy - 2.5 * scale, cx + 5 * scale, cy - 9 * scale,
        fill=bg, width=max(1, int(1.2 * scale)),
    )
    # چراغ جلو
    canvas.create_oval(
        cx + 20 * scale, cy - 1 * scale, cx + 24 * scale, cy + 1.5 * scale,
        fill="#fff3d0", outline="",
    )
    # چرخ‌ها (توپر، بدون نقطه‌ی داخلی)
    r = 4 * scale
    wy = cy + 4 * scale
    for wx in (-13, 13):
        wcx = cx + wx * scale
        canvas.create_oval(wcx - r, wy - r, wcx + r, wy + r, fill="#3a4155", outline=bg, width=max(1, int(scale)))


def draw_gradient(canvas, width, height, color_from, color_to):
    """یه گرادیان افقی روی یه Canvas می‌کشه (تک‌رنگ ttk نداره)."""

    def hex_to_rgb(h):
        h = h.lstrip("#")
        return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))

    r1, g1, b1 = hex_to_rgb(color_from)
    r2, g2, b2 = hex_to_rgb(color_to)
    steps = max(width, 1)
    for i in range(steps):
        t = i / steps
        r = int(r1 + (r2 - r1) * t)
        g = int(g1 + (g2 - g1) * t)
        b = int(b1 + (b2 - b1) * t)
        color = f"#{r:02x}{g:02x}{b:02x}"
        canvas.create_line(i, 0, i, height, fill=color)


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


def extract_max_page(html):
    """شماره‌ی بزرگ‌ترین صفحه رو از دکمه‌های صفحه‌بندی پایین جدول پیدا می‌کنه."""
    soup = BeautifulSoup(html, "html.parser")
    pages = [1]
    for a in soup.find_all("a", href=True):
        m = re.search(r"[?&]Page=(\d+)", a["href"])
        if m:
            pages.append(int(m.group(1)))
    return max(pages)


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


# رنگ‌های خروجی اکسل (هم‌رنگ با تم برنامه)
XLS_NAVY = "151A27"
XLS_LIGHT = "F4F1E6"
XLS_GREEN_FILL = "E5F5E6"
XLS_GREEN_FONT = "1B7A2E"
XLS_RED_FILL = "FBE7E7"
XLS_RED_FONT = "B3241C"


def add_report_block(ws, start_col, title, headers, data_rows):
    """یه بلوک (عنوان + هدر + ردیف‌ها) رو کنار بلوک‌های قبلی (ستون به ستون) اضافه می‌کنه
    و شماره‌ی ستون شروع بلوک بعدی رو برمی‌گردونه."""
    n_cols = len(headers)
    end_col = start_col + n_cols - 1
    thin = Side(style="thin", color="D0D0D0")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws.merge_cells(start_row=1, start_column=start_col, end_row=1, end_column=end_col)
    tcell = ws.cell(row=1, column=start_col, value=f"{title} ({len(data_rows)})")
    tcell.font = Font(bold=True, size=11, color="FFFFFF")
    tcell.fill = PatternFill("solid", fgColor=XLS_NAVY)
    tcell.alignment = Alignment(horizontal="center", vertical="center")

    header_row = 2
    for i, h in enumerate(headers):
        c = ws.cell(row=header_row, column=start_col + i, value=h)
        c.font = Font(bold=True, color=XLS_NAVY, size=9)
        c.fill = PatternFill("solid", fgColor=XLS_LIGHT)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border

    for offset, row in enumerate(data_rows):
        r_i = header_row + 1 + offset
        for i, val in enumerate(row):
            cell = ws.cell(row=r_i, column=start_col + i, value=val)
            cell.border = border
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.font = Font(size=9)
            if val == "تایید":
                cell.font = Font(bold=True, size=9, color=XLS_GREEN_FONT)
                cell.fill = PatternFill("solid", fgColor=XLS_GREEN_FILL)
            elif val == "مردود":
                cell.font = Font(bold=True, size=9, color=XLS_RED_FONT)
                cell.fill = PatternFill("solid", fgColor=XLS_RED_FILL)

    return end_col + 2  # یک ستون خالی به‌عنوان فاصله


def build_report_workbook(one_tank_rows, two_tank_rows, rejected_rows, other_rows):
    """یه فایل اکسل تک‌شیت با بلوک‌های تک‌مخزن/دومخزن/مردودی/سایر کنار هم، همه روی یک صفحه‌ی A5."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "گزارش"
    ws.sheet_view.rightToLeft = True

    blocks = [
        ("تک‌مخزن", ["ردیف", "پلاک", "وضعیت"], one_tank_rows),
        ("دو‌مخزن", ["ردیف", "پلاک", "وضعیت ۱", "وضعیت ۲"], two_tank_rows),
        ("مردودی‌ها", ["ردیف", "پلاک", "وضعیت ۱", "وضعیت ۲"], rejected_rows),
    ]
    if other_rows:
        blocks.append(("سایر", ["ردیف", "پلاک", "توضیح"], other_rows))

    col = 1
    for title, headers, rows in blocks:
        next_col = add_report_block(ws, col, title, headers, rows)
        for c in range(col, next_col - 1):
            width = 6 if headers[c - col] == "ردیف" else 13
            ws.column_dimensions[get_column_letter(c)].width = width
        ws.column_dimensions[get_column_letter(next_col - 1)].width = 2
        col = next_col

    ws.page_setup.paperSize = ws.PAPERSIZE_A5
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = 0.2
    ws.page_margins.right = 0.2
    ws.page_margins.top = 0.3
    ws.page_margins.bottom = 0.3

    return wb


class App:
    def __init__(self, root):
        self.root = root
        root.title("استخراج پلاک")
        root.geometry("700x600")
        root.minsize(560, 460)
        root.configure(bg=COLOR_BG)
        self._set_window_icon(root)

        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("Card.TFrame", background=COLOR_CARD)
        style.configure(
            "Field.TLabel",
            background=COLOR_CARD,
            foreground=COLOR_ACCENT,
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
            foreground=COLOR_ACCENT_TEXT,
            font=(FONT_FAMILY, 11, "bold"),
            padding=(18, 10),
            borderwidth=0,
        )
        style.map(
            "Accent.TButton",
            background=[("active", COLOR_ACCENT_HOVER), ("disabled", "#4a4a42")],
            foreground=[("disabled", "#8a8a80")],
        )
        style.configure(
            "Field.TEntry",
            fieldbackground=COLOR_FIELD_BG,
            foreground=COLOR_TEXT,
            insertcolor=COLOR_TEXT,
            bordercolor=COLOR_BORDER,
            lightcolor=COLOR_BORDER,
            darkcolor=COLOR_BORDER,
            padding=8,
        )
        style.map("Field.TEntry", bordercolor=[("focus", COLOR_ACCENT)])
        style.configure(
            "Accent.Horizontal.TProgressbar",
            troughcolor=COLOR_FIELD_BG,
            background=COLOR_ACCENT,
            thickness=6,
        )

        # ---------- هدر (گرادیان سرمه‌ای/بنفش با عنوان طلایی) ----------
        header_h = 92
        logo_size = 60
        header = tk.Canvas(root, height=header_h, highlightthickness=0, bd=0)
        header.pack(fill="x")

        def render_header(event=None):
            header.delete("all")
            w = header.winfo_width() or root.winfo_width() or 700
            draw_gradient(header, w, header_h, COLOR_HEADER_FROM, COLOR_HEADER_TO)
            header.create_line(0, header_h - 1, w, header_h - 1, fill=COLOR_ACCENT, width=2)
            logo_cx = w - 20 - logo_size // 2
            logo_cy = header_h // 2
            draw_car_icon(header, logo_cx, logo_cy, 1.6, COLOR_ACCENT, bg=COLOR_HEADER_TO)
            text_right = logo_cx - 44
            header.create_text(
                text_right,
                header_h // 2,
                text="استخراج پلاک",
                fill=COLOR_HEADER_TEXT,
                font=(FONT_FAMILY, 20, "bold"),
                anchor="e",
            )

        header.bind("<Configure>", render_header)

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

    def _set_window_icon(self, root):
        """آیکون پنجره/نوار وظیفه رو با یه لوگوی ساده‌ی ماشین می‌سازه (بدون فایل خارجی)."""
        try:
            size = 32
            img = tk.PhotoImage(width=size, height=size)
            img.put(COLOR_BG, to=(0, 0, size, size))
            img.put(COLOR_ACCENT, to=(10, 11, 22, 17))  # کابین
            img.put(COLOR_ACCENT, to=(4, 17, 28, 22))  # بدنه
            img.put("#3a4155", to=(7, 21, 13, 27))  # چرخ جلو
            img.put("#3a4155", to=(19, 21, 25, 27))  # چرخ عقب
            self._icon_img = img  # جلوگیری از garbage collection
            root.iconphoto(True, img)
        except Exception:
            pass

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
            max_page = extract_max_page(resp.text)
            self.log(f"{max_page} صفحه پیدا شد.")

            rows = []
            seen_codes = set()
            for plate, code in extract_reception_rows(resp.text):
                if code not in seen_codes:
                    seen_codes.add(code)
                    rows.append((plate, code))

            for page in range(2, max_page + 1):
                self.set_status(f"در حال گرفتن صفحه‌ی {page} از {max_page}...")
                page_resp = session.get(LIST_PAGE_URL.format(page), timeout=30)
                page_resp.raise_for_status()
                for plate, code in extract_reception_rows(page_resp.text):
                    if code not in seen_codes:
                        seen_codes.add(code)
                        rows.append((plate, code))

            self.log(f"{len(rows)} پذیرش پیدا شد.")

            results = []
            for i, (plate, code) in enumerate(rows, start=1):
                self.set_status(f"در حال پردازش {i} از {len(rows)}...")
                try:
                    r = session.get(PRINT_URL.format(code), timeout=30)
                    r.raise_for_status()
                    actual_plate = extract_plate(r.text) or plate
                    tanks = extract_tanks(r.text)
                except Exception as item_err:
                    self.log(f"{code} - رد شد (خطا: {item_err})")
                    continue
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

            one_tank = [r for r in results if r["تعداد مخزن"] == 1]
            two_tank = [r for r in results if r["تعداد مخزن"] == 2]
            other = [r for r in results if r["تعداد مخزن"] not in (1, 2)]
            rejected = [
                r for r in results
                if "مردود" in (r["وضعیت مخزن ۱"], r["وضعیت مخزن ۲"])
            ]

            one_tank_rows = [
                [i, r["پلاک"], r["وضعیت مخزن ۱"]]
                for i, r in enumerate(one_tank, start=1)
            ]
            two_tank_rows = [
                [i, r["پلاک"], r["وضعیت مخزن ۱"], r["وضعیت مخزن ۲"]]
                for i, r in enumerate(two_tank, start=1)
            ]
            rejected_rows = [
                [i, r["پلاک"], r["وضعیت مخزن ۱"], r["وضعیت مخزن ۲"]]
                for i, r in enumerate(rejected, start=1)
            ]
            other_rows = [
                [i, r["پلاک"], f"{r['تعداد مخزن']} مخزن"]
                for i, r in enumerate(other, start=1)
            ]

            wb = build_report_workbook(one_tank_rows, two_tank_rows, rejected_rows, other_rows)
            wb.save(OUTPUT_FILE)
            self.log(f"ذخیره شد در: {OUTPUT_FILE}")
            self.log(
                f"تک‌مخزن: {len(one_tank)} - دومخزنه: {len(two_tank)} - مردودی: {len(rejected)}"
            )
            self.set_status(f"تمام شد - {len(results)} پذیرش")
            messagebox.showinfo(
                "تمام شد",
                f"{len(results)} پذیرش استخراج شد "
                f"({len(one_tank)} تک‌مخزن، {len(two_tank)} دومخزنه، {len(rejected)} مردودی) "
                f"و در result.xlsx ذخیره شد.",
            )
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
