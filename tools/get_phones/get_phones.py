import os
import sys
import subprocess
import threading
import queue
import time
import traceback
from tkinter import Tk, StringVar, IntVar, BooleanVar, filedialog, Menu, END
from tkinter import ttk, scrolledtext

# در بیلد --windowed (بدون کنسول)، ویندوز stdout/stderr رو None می‌ذاره؛ هر
# print/log داخلی (مثلاً از خود Selenium) با AttributeError کرش می‌کنه و
# Thread بی‌صدا می‌میره. اینجا یک stream خالی جایگزینشون می‌کنیم.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

BASE_URL = "https://petrol.symfa.ir/TestCenters/Receptions/Details?ReceptionId="
FIREFOX_PATH_CANDIDATES = [
    r"C:\Program Files\Mozilla Firefox\firefox.exe",
    r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
]
PAGE_WAIT_TIMEOUT = 8
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def resource_path(filename):
    """مسیر فایل بسته‌شده داخل exe (PyInstaller onefile) یا کنار اسکریپت."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, filename)


GECKODRIVER_PATH = resource_path("geckodriver.exe")


class ScraperWorker(threading.Thread):
    """یک مرورگر مستقل که از صف مشترک کد می‌گیرد و پردازش می‌کند."""

    def __init__(self, worker_id, code_queue, username, password, headless,
                 results, results_lock, on_progress, on_log, stop_event):
        super().__init__(daemon=True)
        self.worker_id = worker_id
        self.code_queue = code_queue
        self.username = username
        self.password = password
        self.headless = headless
        self.results = results
        self.results_lock = results_lock
        self.on_progress = on_progress
        self.on_log = on_log
        self.stop_event = stop_event

    def run(self):
        self.on_log(f"[Worker {self.worker_id}] در حال باز کردن مرورگر...")
        try:
            driver = self._build_driver()
        except Exception as exc:
            self.on_log(f"[Worker {self.worker_id}] خطا در راه‌اندازی مرورگر: {exc}")
            self.on_log(traceback.format_exc())
            return
        self.on_log(f"[Worker {self.worker_id}] مرورگر آماده است.")

        wait = WebDriverWait(driver, PAGE_WAIT_TIMEOUT)

        def try_login():
            try:
                username_box = wait.until(EC.presence_of_element_located((By.ID, "Username")))
                password_box = driver.find_element(By.ID, "Password")
                username_box.clear()
                username_box.send_keys(self.username)
                password_box.clear()
                password_box.send_keys(self.password)
                password_box.send_keys(Keys.ENTER)
                wait.until(lambda d: "Login" not in d.title)
            except TimeoutException:
                pass

        def get_text(label):
            try:
                element = driver.find_element(By.XPATH, f"//div[text()='{label}']/following-sibling::div")
                return element.text.strip()
            except NoSuchElementException:
                return "پیدا نشد"

        try:
            while not self.stop_event.is_set():
                try:
                    code = self.code_queue.get_nowait()
                except queue.Empty:
                    break

                url = BASE_URL + code
                try:
                    driver.get(url)

                    if "Login" in driver.title:
                        try_login()
                        driver.get(url)

                    try:
                        wait.until(EC.presence_of_element_located(
                            (By.XPATH, "//div[contains(text(),'پلاک')]")))
                    except TimeoutException:
                        pass

                    row = {
                        "کد پذیرش": code,
                        "شماره": get_text("تلفن همراه:"),
                        "تاریخ ثبت": get_text("تاریخ ثبت:"),
                        "تاریخ انقضا": get_text("تاریخ انقضا:"),
                        "پلاک": get_text("پلاک:"),
                    }
                    ok = row["شماره"] != "پیدا نشد"
                except Exception as exc:
                    row = {
                        "کد پذیرش": code, "شماره": "خطا", "تاریخ ثبت": "خطا",
                        "تاریخ انقضا": "خطا", "پلاک": "خطا",
                    }
                    ok = False
                    self.on_log(f"[Worker {self.worker_id}] خطا روی {code}: {exc}")

                with self.results_lock:
                    self.results.append(row)

                self.on_progress(ok)
                self.on_log(f"[Worker {self.worker_id}] {code} {'✓' if ok else '✗'}")
        except Exception:
            self.on_log(f"[Worker {self.worker_id}] خطای غیرمنتظره:\n{traceback.format_exc()}")
        finally:
            driver.quit()

    def _build_driver(self):
        options = Options()
        for path in FIREFOX_PATH_CANDIDATES:
            if os.path.exists(path):
                options.binary_location = path
                break
        if self.headless:
            options.add_argument("--headless")
        options.set_preference("permissions.default.image", 2)

        # geckodriver داخل خود exe بسته‌بندی شده (بدون نیاز به اینترنت در لحظه
        # اجرا). اگه پیدا نشد (مثلاً اجرا از روی سورس)، به Selenium Manager
        # برمی‌گردیم.
        if os.path.exists(GECKODRIVER_PATH):
            service = Service(GECKODRIVER_PATH)
        else:
            service = Service()
        service.creation_flags = NO_WINDOW
        return webdriver.Firefox(service=service, options=options)


def add_context_menu(widget):
    """منوی راست‌کلیک برش/کپی/جای‌گذاری/انتخاب همه برای Entry (پیش‌فرض Tkinter نداره)."""
    menu = Menu(widget, tearoff=0)
    menu.add_command(label="برش", command=lambda: widget.event_generate("<<Cut>>"))
    menu.add_command(label="کپی", command=lambda: widget.event_generate("<<Copy>>"))
    menu.add_command(label="جای‌گذاری", command=lambda: widget.event_generate("<<Paste>>"))
    menu.add_separator()
    menu.add_command(label="انتخاب همه", command=lambda: widget.select_range(0, "end"))

    def show_menu(event):
        menu.tk_popup(event.x_root, event.y_root)

    widget.bind("<Button-3>", show_menu)


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("استخراج اطلاعات پذیرش")
        self.root.geometry("560x520")

        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass

        main = ttk.Frame(root, padding=12)
        main.pack(fill="both", expand=True)

        cred = ttk.LabelFrame(main, text="اطلاعات ورود", padding=10)
        cred.pack(fill="x", pady=5)

        ttk.Label(cred, text="نام کاربری:").grid(row=0, column=0, sticky="e", padx=5, pady=4)
        self.username_var = StringVar()
        username_entry = ttk.Entry(cred, textvariable=self.username_var)
        username_entry.grid(row=0, column=1, sticky="ew", padx=5)
        add_context_menu(username_entry)

        ttk.Label(cred, text="رمز عبور:").grid(row=1, column=0, sticky="e", padx=5, pady=4)
        self.password_var = StringVar()
        password_entry = ttk.Entry(cred, textvariable=self.password_var, show="*")
        password_entry.grid(row=1, column=1, sticky="ew", padx=5)
        add_context_menu(password_entry)
        cred.columnconfigure(1, weight=1)

        opts = ttk.LabelFrame(main, text="تنظیمات اجرا", padding=10)
        opts.pack(fill="x", pady=5)

        ttk.Label(opts, text="تعداد مرورگر هم‌زمان:").grid(row=0, column=0, sticky="e", padx=5, pady=4)
        self.workers_var = IntVar(value=4)
        ttk.Spinbox(opts, from_=1, to=10, textvariable=self.workers_var, width=5).grid(
            row=0, column=1, sticky="w", padx=5)

        self.headless_var = BooleanVar(value=True)
        ttk.Checkbutton(opts, text="اجرای بی‌صدا (Headless)", variable=self.headless_var).grid(
            row=0, column=2, sticky="w", padx=15)

        fileframe = ttk.LabelFrame(main, text="فایل کدها", padding=10)
        fileframe.pack(fill="x", pady=5)
        self.file_label = ttk.Label(fileframe, text="انتخاب نشده", wraplength=460)
        self.file_label.pack(side="left", fill="x", expand=True)
        ttk.Button(fileframe, text="انتخاب فایل", command=self.select_file).pack(side="right")
        self.file_path = None

        btns = ttk.Frame(main)
        btns.pack(fill="x", pady=8)
        self.start_btn = ttk.Button(btns, text="شروع", command=self.start_process)
        self.start_btn.pack(side="left", padx=5)
        self.stop_btn = ttk.Button(btns, text="توقف", command=self.stop_process, state="disabled")
        self.stop_btn.pack(side="left", padx=5)
        ttk.Button(btns, text="خروج", command=self.root.quit).pack(side="left", padx=5)

        progress_frame = ttk.Frame(main)
        progress_frame.pack(fill="x", pady=5)
        self.progress = ttk.Progressbar(progress_frame, orient="horizontal", mode="determinate")
        self.progress.pack(fill="x")
        self.status_label = ttk.Label(progress_frame, text="آماده", foreground="#2a5")
        self.status_label.pack(anchor="w", pady=3)

        logframe = ttk.LabelFrame(main, text="گزارش زنده", padding=6)
        logframe.pack(fill="both", expand=True, pady=5)
        self.log_box = scrolledtext.ScrolledText(logframe, height=10, state="disabled")
        self.log_box.pack(fill="both", expand=True)

        ttk.Label(main, text="طراحی نرم افزار: محراب طلائی", foreground="gray",
                  font=("Tahoma", 8)).pack(side="bottom", pady=(4, 0))

        self.results = []
        self.results_lock = threading.Lock()
        self.stop_event = threading.Event()
        self.workers = []
        self.total = 0
        self.done_count = 0
        self.ok_count = 0
        self.start_time = None
        self.progress_lock = threading.Lock()

    def select_file(self):
        path = filedialog.askopenfilename(filetypes=[("Excel files", "*.xlsx")])
        if path:
            self.file_path = path
            self.file_label.config(text=path)

    def log(self, text):
        self.root.after(0, self._log_ui, text)

    def _log_ui(self, text):
        self.log_box.config(state="normal")
        self.log_box.insert(END, text + "\n")
        self.log_box.see(END)
        self.log_box.config(state="disabled")

    def on_progress(self, ok):
        with self.progress_lock:
            self.done_count += 1
            if ok:
                self.ok_count += 1
            done, total, ok_count = self.done_count, self.total, self.ok_count
        self.root.after(0, self._update_progress_ui, done, total, ok_count)

    def _update_progress_ui(self, done, total, ok_count):
        self.progress["value"] = done
        elapsed = time.time() - self.start_time
        rate = done / elapsed if elapsed > 0 else 0
        remaining = (total - done) / rate if rate > 0 else 0
        self.status_label.config(
            text=f"{done}/{total} پردازش شد | موفق: {ok_count} | "
                 f"سرعت: {rate:.1f} کد/ثانیه | تخمین باقی‌مانده: {remaining:.0f} ثانیه"
        )
        if done >= total:
            self.on_finished()

    def start_process(self):
        if not self.file_path:
            self.status_label.config(text="ابتدا فایل کدها را انتخاب کنید!")
            return

        df_codes = pd.read_excel(self.file_path, header=None)
        codes = [str(c) for c in df_codes.iloc[:, 0].tolist()]
        if not codes:
            self.status_label.config(text="فایل خالی است!")
            return

        code_queue = queue.Queue()
        for c in codes:
            code_queue.put(c)

        self.results = []
        self.stop_event.clear()
        self.total = len(codes)
        self.done_count = 0
        self.ok_count = 0
        self.start_time = time.time()
        self.progress["maximum"] = self.total
        self.progress["value"] = 0
        self.log_box.config(state="normal")
        self.log_box.delete("1.0", END)
        self.log_box.config(state="disabled")

        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.status_label.config(text=f"در حال شروع {self.total} کد...")

        n_workers = min(self.workers_var.get(), self.total)
        self.workers = [
            ScraperWorker(
                worker_id=i + 1,
                code_queue=code_queue,
                username=self.username_var.get(),
                password=self.password_var.get(),
                headless=self.headless_var.get(),
                results=self.results,
                results_lock=self.results_lock,
                on_progress=self.on_progress,
                on_log=self.log,
                stop_event=self.stop_event,
            )
            for i in range(n_workers)
        ]
        for w in self.workers:
            w.start()

    def stop_process(self):
        self.stop_event.set()
        self.status_label.config(text="در حال توقف... نتایج جمع‌آوری‌شده ذخیره می‌شود")
        self.stop_btn.config(state="disabled")
        threading.Thread(target=self._wait_and_finish, daemon=True).start()

    def _wait_and_finish(self):
        for w in self.workers:
            w.join()
        self.root.after(0, self.on_finished)

    def on_finished(self):
        self.start_btn.config(state="normal")
        self.stop_btn.config(state="disabled")

        out_path = filedialog.asksaveasfilename(
            defaultextension=".xlsx",
            filetypes=[("Excel files", "*.xlsx")],
            title="محل ذخیره فایل خروجی",
        )
        if out_path:
            df_out = pd.DataFrame(self.results)
            df_out.to_excel(out_path, index=False)
            self.status_label.config(
                text=f"پایان: {len(self.results)} ردیف ذخیره شد ({self.ok_count} موفق)."
            )
        else:
            self.status_label.config(text="ذخیره لغو شد.")


if __name__ == "__main__":
    root = Tk()
    app = App(root)
    root.mainloop()
