# -*- coding: utf-8 -*-
"""
نسخه تک‌کاربره برنامه حسابداری.
با اجرای همین یک فایل (یا exe ساخته‌شده از آن)، سرور محلی خودش در پس‌زمینه
(فقط روی 127.0.0.1، بدون دسترسی از شبکه) بالا می‌آید و نیازی به باز نگه‌داشتن
پنجره دیگری نیست. فقط همین یک برنامه را اجرا کن و کارت راه می‌افتد.
"""
import threading
import time
import sys
import tkinter as tk
from tkinter import ttk, messagebox

import server_embedded
from client import App


SERVER_PORT = 5050
SERVER_URL = f"http://127.0.0.1:{SERVER_PORT}"


class StandaloneApp(App):
    def __init__(self):
        self._start_embedded_server()
        super().__init__()
        # همیشه به سرور محلی خودش وصل می‌شود، نیازی به وارد کردن آدرس نیست
        self.server_url = SERVER_URL

    def _start_embedded_server(self):
        """سرور Flask را در یک ترد پس‌زمینه بالا می‌آورد و منتظر آماده‌شدنش می‌ماند"""
        t = threading.Thread(target=server_embedded.run_embedded, args=(SERVER_PORT,), daemon=True)
        t.start()

        import requests
        start = time.time()
        while time.time() - start < 15:
            try:
                r = requests.get(f"{SERVER_URL}/ping", timeout=1)
                if r.status_code == 200:
                    return
            except Exception:
                time.sleep(0.3)
        messagebox.showerror("خطا", "راه‌اندازی سرور محلی با مشکل مواجه شد. برنامه را دوباره اجرا کنید.")

    # ---------------- صفحه ورود ساده‌شده (بدون فیلد آدرس سرور) ----------------
    def show_login(self):
        for w in self.winfo_children():
            w.destroy()

        frame = ttk.Frame(self, padding=50)
        frame.pack(expand=True)

        ttk.Label(frame, text="حسابداری مغازه الکتریکی", font=("Tahoma", 18, "bold")).grid(
            row=0, column=0, columnspan=2, pady=(0, 30))

        ttk.Label(frame, text="نام کاربری:").grid(row=1, column=1, sticky="e", pady=8, padx=5)
        user_entry = ttk.Entry(frame, width=28, justify="left")
        user_entry.insert(0, "admin")
        user_entry.grid(row=1, column=0, pady=8)

        ttk.Label(frame, text="رمز عبور:").grid(row=2, column=1, sticky="e", pady=8, padx=5)
        pass_entry = ttk.Entry(frame, width=28, show="*", justify="left")
        pass_entry.grid(row=2, column=0, pady=8)

        def do_login():
            import requests
            try:
                r = requests.post(f"{self.server_url}/login", json={
                    "username": user_entry.get(),
                    "password": pass_entry.get()
                }, timeout=5)
                data = r.json()
                if data.get("ok"):
                    self.user = data["user"]
                    self.token = data.get("token")
                    self.show_main()
                else:
                    messagebox.showerror("خطا", data.get("message", "ورود ناموفق بود"))
            except Exception:
                messagebox.showerror("خطا در اتصال", "سرور محلی هنوز آماده نیست. چند لحظه صبر کن و دوباره امتحان کن.")

        pass_entry.bind("<Return>", lambda e: do_login())
        ttk.Button(frame, text="ورود", command=do_login).grid(row=3, column=0, columnspan=2, pady=25)
        ttk.Label(
            frame,
            text="اولین بار اجرا می‌کنید؟ رمز مدیر یک‌بار در فایل\nFIRST_LOGIN_ADMIN_PASSWORD.txt کنار برنامه نوشته می‌شود.",
            foreground="gray", justify="center"
        ).grid(row=4, column=0, columnspan=2)


if __name__ == "__main__":
    app = StandaloneApp()
    app.mainloop()
