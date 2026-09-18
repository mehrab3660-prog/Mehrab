# -*- coding: utf-8 -*-
"""
مسیرهای مشترک برنامه.

وقتی برنامه با PyInstaller به یک فایل exe تبدیل می‌شود، هر بار که اجرا می‌شود
فایل‌های داخلش را در یک پوشه‌ی موقتی (که با بستن برنامه پاک می‌شود) باز می‌کند.
برای همین دو نوع مسیر جدا تعریف شده:
- get_base_dir(): برای فایل‌های قابل‌نوشتن (دیتابیس، تنظیمات، بکاپ) - همیشه پوشه‌ی
  کنار خودِ فایل exe است، که با هر بار اجرا از بین نمی‌رود.
- get_bundle_dir(): برای فایل‌های فقط‌خواندنی برنامه (HTML/CSS/JS) - همان پوشه‌ی
  موقتی داخل exe.
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
