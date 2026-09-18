# -*- coding: utf-8 -*-
"""
لانچر تک‌فایلی سیستم پذیرش. همین یک فایل را اجرا کن:
1. سرور محلی را در پس‌زمینه (فقط روی 127.0.0.1) بالا می‌آورد.
2. خودش مرورگر پیش‌فرض سیستم را باز می‌کند.
"""
import os
import sys

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
import server as srv

PORT = 5057
URL = f"http://127.0.0.1:{PORT}"


def open_browser_when_ready():
    import urllib.request
    for _ in range(30):
        try:
            with urllib.request.urlopen(f"{URL}/ping", timeout=1) as r:
                if r.status == 200:
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
    print("در حال اجرای سیستم پذیرش...")
    print(f"اگر مرورگر خودکار باز نشد، خودتان این آدرس را باز کنید: {URL}")
    srv.run_embedded(PORT)
