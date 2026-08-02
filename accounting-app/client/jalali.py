# -*- coding: utf-8 -*-
"""
تبدیل تاریخ میلادی به شمسی (جلالی) - پیاده‌سازی مستقل و بدون نیاز به کتابخانه خارجی،
چون نصب کتابخانه‌های جانبی برای این پروژه قبلاً با مشکل اتصال اینترنت مواجه شده بود.
"""

_G_DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_J_DAYS_IN_MONTH = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]

_PERSIAN_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]


def gregorian_to_jalali(gy, gm, gd):
    """تبدیل سال/ماه/روز میلادی به سال/ماه/روز شمسی (الگوریتم استاندارد تقویم جلالی)"""
    gy2 = gy - 1600
    gm2 = gm - 1
    gd2 = gd - 1

    g_day_no = 365 * gy2 + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400
    for i in range(gm2):
        g_day_no += _G_DAYS_IN_MONTH[i]
    if gm2 > 1 and ((gy % 4 == 0 and gy % 100 != 0) or (gy % 400 == 0)):
        g_day_no += 1
    g_day_no += gd2

    j_day_no = g_day_no - 79
    j_np = j_day_no // 12053
    j_day_no %= 12053
    jy = 979 + 33 * j_np + 4 * (j_day_no // 1461)
    j_day_no %= 1461

    if j_day_no >= 366:
        jy += (j_day_no - 1) // 365
        j_day_no = (j_day_no - 1) % 365

    jm, jd = 12, 29
    for i in range(11):
        if j_day_no < _J_DAYS_IN_MONTH[i]:
            jm = i + 1
            jd = j_day_no + 1
            break
        j_day_no -= _J_DAYS_IN_MONTH[i]
    else:
        jm = 12
        jd = j_day_no + 1

    return jy, jm, jd


def format_jalali_datetime(dt_string, with_time=True):
    """
    ورودی: رشته تاریخ‌زمان میلادی به فرمت 'YYYY-MM-DD HH:MM:SS' (خروجی استاندارد دیتابیس)
    خروجی: رشته شمسی مثل '1405/05/06' یا '1405/05/06 - 14:30'
    """
    try:
        date_part = dt_string.split(" ")[0]
        time_part = dt_string.split(" ")[1] if " " in dt_string else ""
        gy, gm, gd = (int(x) for x in date_part.split("-"))
        jy, jm, jd = gregorian_to_jalali(gy, gm, gd)
        result = f"{jy}/{jm:02d}/{jd:02d}"
        if with_time and time_part:
            result += f" - {time_part[:5]}"
        return result
    except Exception:
        return dt_string  # اگر فرمت غیرمنتظره بود، همان مقدار اصلی را برگردان تا برنامه خطا ندهد
