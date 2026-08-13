# -*- coding: utf-8 -*-
"""
لانچر تک‌کاربره برنامه حسابداری (نسخه جدید با رابط وب مدرن).

اجرای همین یک فایل:
1. سرور محلی را در پس‌زمینه (فقط روی 127.0.0.1، بدون دسترسی از شبکه) بالا می‌آورد.
2. خودش مرورگر پیش‌فرض سیستم را باز می‌کند و صفحه ورود برنامه را نشان می‌دهد.
هیچ پنجره یا مرحله دستی اضافه‌ای لازم نیست.
"""
import os
import sys

# وقتی این فایل به‌صورت exe بدون پنجره‌ی کنسول (windowed) ساخته می‌شود، پایتون
# sys.stdout/stderr را None می‌گذارد؛ بدون این گارد، همان اولین print() کل برنامه
# را کرش می‌کند. به‌جای حذف print ها، خروجی را به یک فایل لاگ کنار خود exe هدایت می‌کنیم.
if sys.stdout is None or sys.stderr is None:
    try:
        base_dir = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__))
        log_file = open(os.path.join(base_dir, "app_log.txt"), "a", encoding="utf-8", buffering=1)
    except OSError:
        log_file = open(os.devnull, "w")
    sys.stdout = sys.stdout or log_file
    sys.stderr = sys.stderr or log_file

import threading
import time
import webbrowser
import server_embedded as se

PORT = 5050
URL = f"http://127.0.0.1:{PORT}"


def open_browser_when_ready():
    """چند لحظه صبر می‌کند تا سرور بالا بیاید، بعد مرورگر را باز می‌کند"""
    import requests
    for _ in range(30):
        try:
            r = requests.get(f"{URL}/ping", timeout=1)
            if r.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(0.3)
    try:
        webbrowser.open(URL)
    except Exception:
        pass


if __name__ == "__main__":
    threading.Thread(target=open_browser_when_ready, daemon=True).start()
    print("در حال اجرای برنامه حسابداری...")
    print(f"اگر مرورگر خودکار باز نشد، خودتان این آدرس را در مرورگر باز کنید: {URL}")
    se.run_embedded(PORT)  # این خط تا زمانی که برنامه بسته شود، اجرا باقی می‌ماند
