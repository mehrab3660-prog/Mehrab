# -*- coding: utf-8 -*-
"""
مسیرهای مشترک برنامه.

وقتی برنامه با PyInstaller به یک فایل exe تبدیل می‌شود، هر بار که اجرا می‌شود
فایل‌های داخلش را در یک پوشه‌ی موقتی (که با بستن برنامه پاک می‌شود) باز می‌کند.
اگر مسیر دیتابیس/تنظیمات/بکاپ را بر همان اساس بسازیم، هر بار برنامه را می‌بندی
و دوباره باز می‌کنی، همه‌چیز از صفر شروع می‌شود!

برای همین دو نوع مسیر جدا تعریف شده:
- get_base_dir(): برای فایل‌های قابل‌نوشتن و مهم (دیتابیس، بکاپ، تنظیمات، لوگو) -
  همیشه پوشه‌ی کنار خودِ فایل exe است، که با هر بار اجرا از بین نمی‌رود.
- get_bundle_dir(): برای فایل‌های فقط‌خواندنی برنامه (HTML/CSS/JS، آیکون پیش‌فرض) -
  همان پوشه‌ی موقتی داخل exe.
"""
import os
import sys


def get_base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def get_bundle_dir():
    if getattr(sys, "frozen", False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))
