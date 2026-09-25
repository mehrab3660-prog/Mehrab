from datetime import date

from telegram import KeyboardButton, ReplyKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from . import config, db
from .common import BTN_CANCEL, clear_await, ik, main_kb, send, set_await, show
from .utils import (card_fmt, esc, fa, from_ymd, future_days, jdate_full, jdate_label, money, normalize_phone,
                    ymd)


# ---------- entry points ----------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    db.upsert_user(user.id, user.full_name)
    clear_await(context)
    arg = context.args[0] if context.args else ""
    if arg.startswith("s") and arg[1:].isdigit():
        salon = db.get_salon(int(arg[1:]))
        if salon:
            db.set_user(user.id, salon_id=salon["id"])
            await update.message.reply_text("👇 منوی اصلی فعال شد", reply_markup=main_kb(user.id))
            await show_services(update, salon)
            return
    await update.message.reply_text(
        f"سلام {esc(user.first_name)} 🌸\nبه ربات نوبت‌دهی آرایشگاه خوش اومدی.\n\n"
        f"برای گرفتن نوبت روی «📅 رزرو نوبت جدید» بزن.",
        reply_markup=main_kb(user.id), parse_mode=ParseMode.HTML)


async def cmd_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"🆔 شناسه عددی شما: <code>{update.effective_user.id}</code>",
                                    parse_mode=ParseMode.HTML)


def current_salon(uid):
    u = db.get_user(uid)
    if u and u["salon_id"]:
        s = db.get_salon(u["salon_id"])
        if s:
            return s
    salons = db.bookable_salons()
    if len(salons) == 1:
        db.set_user(uid, salon_id=salons[0]["id"])
        return salons[0]
    return None


async def book_entry(update: Update, context: ContextTypes.DEFAULT_TYPE):
    clear_await(context)
    salon = current_salon(update.effective_user.id)
    if salon:
        return await show_services(update, salon)
    salons = db.bookable_salons()
    if not salons:
        return await send(update.effective_chat, "در حال حاضر آرایشگاه فعالی برای رزرو وجود ندارد.")
    await show(update, "🏪 آرایشگاه موردنظرت رو انتخاب کن:",
               [[(f"💇‍♀️ {s['name']}", f"c:salon:{s['id']}")] for s in salons])


async def show_services(update: Update, salon):
    if not db.salon_bookable(salon):
        return await show(update, f"⛔️ رزرو آنلاین «{esc(salon['name'])}» در حال حاضر فعال نیست.")
    welcome = (salon["welcome"] or db.DEFAULT_WELCOME).replace("{salon}", salon["name"])
    text = esc(welcome)
    if salon["address"]:
        text += f"\n\n📍 آدرس آرایشگاه: {esc(salon['address'])}"
    if salon["phone"]:
        text += f"\n📞 تلفن: {fa(esc(salon['phone']))}"
    svcs = db.services(salon["id"], only_active=True)
    if not svcs:
        return await show(update, text + "\n\n⚠️ هنوز خدمتی برای رزرو ثبت نشده است.")
    text += "\n\n✂️ خدمت موردنظرت رو انتخاب کن 👇"
    rows = [[(f"{s['name']} | {money(s['price'])} | {fa(s['duration'])} دقیقه", f"c:svc:{s['id']}")] for s in svcs]
    if len(db.bookable_salons()) > 1:
        rows.append([("🔄 تغییر آرایشگاه", "c:chg")])
    await show(update, text, rows)


def _svc_salon(svc_id):
    svc = db.get_service(svc_id)
    if not svc or svc["deleted"] or not svc["active"]:
        return None, None
    return svc, db.get_salon(svc["salon_id"])


async def show_days(update: Update, svc_id: int):
    svc, salon = _svc_salon(svc_id)
    if not svc or not db.salon_bookable(salon):
        return await show(update, "این خدمت دیگر در دسترس نیست.", [[("🔙 بازگشت", "c:book")]])
    rows = []
    for d in future_days(config.BOOKING_DAYS):
        status, _ = db.day_slots(salon, d, svc["duration"])
        label = jdate_label(d)
        if status == "closed":
            rows.append([(f"{label}  |  تعطیل", "c:closed")])
        elif status == "full":
            rows.append([(f"{label}  |  تکمیل", "c:full")])
        else:
            rows.append([(label, f"c:day:{svc_id}:{ymd(d)}")])
    rows.append([("🔙 بازگشت به خدمات", "c:book")])
    await show(update, f"✂️ خدمت: <b>{esc(svc['name'])}</b>\n\n📅 نوبت‌های این هفته\nروز موردنظرت رو انتخاب کن 👇", rows)


async def show_times(update: Update, svc_id: int, day: str):
    svc, salon = _svc_salon(svc_id)
    if not svc:
        return await show(update, "این خدمت دیگر در دسترس نیست.", [[("🔙 بازگشت", "c:book")]])
    d = from_ymd(day)
    _, slots = db.day_slots(salon, d, svc["duration"])
    if not slots:
        return await show(update, "😔 متأسفانه این روز دیگر زمان خالی ندارد.", [[("🔙 انتخاب روز دیگر", f"c:svc:{svc_id}")]])
    rows, row = [], []
    for t in slots:
        row.append((fa(t), f"c:t:{svc_id}:{day}:{t.replace(':', '')}"))
        if len(row) == 4:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([("🔙 انتخاب روز دیگر", f"c:svc:{svc_id}")])
    await show(update, f"✂️ {esc(svc['name'])}\n📅 {jdate_label(d)}\n\n⏰ ساعت موردنظرت رو انتخاب کن:", rows)


async def pick_time(update: Update, context, svc_id: int, day: str, hhmm: str):
    user = db.get_user(update.effective_user.id)
    pending = {"svc": svc_id, "day": day, "t": hhmm}
    if not user or not user["phone"]:
        set_await(context, "c_phone", **pending)
        kb = ReplyKeyboardMarkup([[KeyboardButton("📱 ارسال شماره من", request_contact=True)], [BTN_CANCEL]],
                                 resize_keyboard=True, one_time_keyboard=True)
        return await send(update.effective_chat, "📱 لطفاً شماره موبایلت رو بفرست (دکمه پایین یا تایپ کن):",
                          reply_markup=kb)
    if not user["name"]:
        set_await(context, "c_name", **pending)
        return await send(update.effective_chat, "👤 نام و نام خانوادگی‌ات رو بنویس:")
    await confirm_screen(update, pending)


async def confirm_screen(update: Update, p):
    svc, salon = _svc_salon(p["svc"])
    if not svc:
        return await send(update.effective_chat, "این خدمت دیگر در دسترس نیست.")
    user = db.get_user(update.effective_user.id)
    d = from_ymd(p["day"])
    t = f"{p['t'][:2]}:{p['t'][2:]}"
    text = (f"🧾 <b>تایید نهایی نوبت</b>\n\n"
            f"🏪 {esc(salon['name'])}\n✂️ {esc(svc['name'])}\n💰 {money(svc['price'])}\n"
            f"📅 {jdate_label(d)} ({jdate_full(d)})\n⏰ ساعت {fa(t)}\n"
            f"👤 {esc(user['name'])}\n📱 {fa(user['phone'])}")
    if salon["deposit_enabled"] and salon["deposit_amount"] > 0:
        text += f"\n\n💳 مبلغ بیعانه: {money(salon['deposit_amount'])} (بعد از تایید، شماره کارت نمایش داده می‌شود)"
    rows = [[("✅ تایید و ثبت نوبت", f"c:ok:{p['svc']}:{p['day']}:{p['t']}")],
            [("✏️ ویرایش نام/شماره", f"c:prof:{p['svc']}:{p['day']}:{p['t']}")],
            [("❌ انصراف", "c:book")]]
    if update.callback_query:
        await show(update, text, rows)
    else:
        await send(update.effective_chat, text, rows)


async def finalize(update: Update, context, svc_id: int, day: str, hhmm: str):
    svc, salon = _svc_salon(svc_id)
    uid = update.effective_user.id
    user = db.get_user(uid)
    if not svc or not db.salon_bookable(salon):
        return await show(update, "این خدمت دیگر در دسترس نیست.")
    d = from_ymd(day)
    t = f"{hhmm[:2]}:{hhmm[2:]}"
    if not db.slot_free(salon, d, t, svc["duration"]):
        return await show(update, "😔 این زمان همین الان رزرو شد یا دیگر در دسترس نیست. لطفاً زمان دیگری انتخاب کن.",
                          [[("🔄 انتخاب زمان دیگر", f"c:day:{svc_id}:{day}")]])
    needs_deposit = bool(salon["deposit_enabled"] and salon["deposit_amount"] > 0 and salon["card_number"])
    status = "awaiting_payment" if needs_deposit else "confirmed"
    aid = db.create_appointment(salon, svc, uid, user["name"], user["phone"], d, t, status,
                                salon["deposit_amount"] if needs_deposit else 0)
    summary = f"✂️ {esc(svc['name'])}\n📅 {jdate_label(d)} — ⏰ {fa(t)}"
    if needs_deposit:
        set_await(context, "c_receipt", aid=aid)
        await show(update,
                   f"📝 نوبت شما موقتاً ثبت شد.\n{summary}\n\n"
                   f"💳 لطفاً مبلغ <b>{money(salon['deposit_amount'])}</b> بیعانه را به کارت زیر واریز کنید:\n\n"
                   f"<code>{salon['card_number']}</code>\n{card_fmt(salon['card_number'])}\n"
                   f"👤 به نام: {esc(salon['card_holder'] or '—')}\n\n"
                   f"📸 سپس <b>تصویر رسید</b> را همین‌جا ارسال کنید.\n"
                   f"⏳ اگر تا {fa(config.PAYMENT_TIMEOUT_MIN)} دقیقه رسید ارسال نشود، نوبت آزاد می‌شود.")
    else:
        await show(update, f"🎉 نوبت شما با موفقیت ثبت شد!\n\n{summary}\n\nمنتظر دیدارت هستیم 🌸")
        await notify_owner_new(context, aid)


async def notify_owner_new(context, aid):
    a = db.get_appointment(aid)
    salon = db.get_salon(a["salon_id"])
    text = (f"🔔 <b>نوبت جدید</b>\n\n👤 {esc(a['customer_name'])}\n📱 {fa(a['phone'])}\n✂️ {esc(a['service_name'])}\n"
            f"📅 {jdate_label(from_iso(a['day']))} — ⏰ {fa(a['start'])}")
    try:
        await context.bot.send_message(salon["owner_id"], text, parse_mode=ParseMode.HTML,
                                       reply_markup=_owner_appt_kb(a))
    except Exception:
        pass


def _owner_appt_kb(a):
    rows = []
    if a["status"] == "pending":
        rows.append([("✅ تایید", f"a:ap:{a['id']}"), ("🚫 رد", f"a:rj:{a['id']}")])
    rows.append([("🔎 جزئیات", f"a:apt:{a['id']}")])
    return ik(rows)


def from_iso(s):
    return date.fromisoformat(s)


async def receive_receipt(update: Update, context, aid: int):
    a = db.get_appointment(aid)
    if not a or a["customer_id"] != update.effective_user.id or a["status"] not in ("awaiting_payment", "pending"):
        clear_await(context)
        return await update.message.reply_text("این نوبت دیگر در انتظار پرداخت نیست.",
                                               reply_markup=main_kb(update.effective_user.id))
    file_id = update.message.photo[-1].file_id
    db.set_appointment(aid, receipt_file_id=file_id, status="pending")
    clear_await(context)
    await update.message.reply_text("✅ رسید دریافت شد. پس از بررسی توسط آرایشگاه، نتیجه برایت ارسال می‌شود 🌸",
                                    reply_markup=main_kb(update.effective_user.id))
    a = db.get_appointment(aid)
    salon = db.get_salon(a["salon_id"])
    caption = (f"🧾 <b>رسید بیعانه</b> — نوبت #{fa(aid)}\n\n👤 {esc(a['customer_name'])}\n📱 {fa(a['phone'])}\n"
               f"✂️ {esc(a['service_name'])}\n📅 {jdate_label(from_iso(a['day']))} — ⏰ {fa(a['start'])}\n"
               f"💰 بیعانه: {money(a['deposit'])}")
    try:
        await context.bot.send_photo(salon["owner_id"], file_id, caption=caption, parse_mode=ParseMode.HTML,
                                     reply_markup=_owner_appt_kb(a))
    except Exception:
        pass


# ---------- my appointments ----------
async def my_appointments(update: Update, context):
    clear_await(context)
    appts = db.customer_appointments(update.effective_user.id)
    if not appts:
        return await show(update, "📋 هیچ نوبت فعالی نداری.\nبرای رزرو روی «📅 رزرو نوبت جدید» بزن.")
    lines, rows = ["📋 <b>نوبت‌های فعال من</b>\n"], []
    for a in appts:
        salon = db.get_salon(a["salon_id"])
        lines.append(f"#{fa(a['id'])} — {esc(salon['name'])}\n✂️ {esc(a['service_name'])}\n"
                     f"📅 {jdate_label(from_iso(a['day']))} ⏰ {fa(a['start'])}\n{db.STATUS_FA[a['status']]}\n")
        row = [(f"❌ لغو #{fa(a['id'])}", f"c:cx:{a['id']}")]
        if a["status"] == "awaiting_payment":
            row.insert(0, (f"📸 ارسال رسید #{fa(a['id'])}", f"c:rc:{a['id']}"))
        rows.append(row)
    await show(update, "\n".join(lines), rows)


async def cancel_appt(update: Update, context, aid: int, confirmed: bool):
    a = db.get_appointment(aid)
    if not a or a["customer_id"] != update.effective_user.id or a["status"] not in ("awaiting_payment", "pending", "confirmed"):
        return await show(update, "این نوبت قابل لغو نیست.")
    if not confirmed:
        return await show(update, f"آیا از لغو نوبت #{fa(aid)} ({esc(a['service_name'])} — "
                                  f"{jdate_label(from_iso(a['day']))} ساعت {fa(a['start'])}) مطمئنی؟",
                          [[("بله، لغو شود", f"c:cxy:{aid}"), ("خیر", "c:my")]])
    db.set_appointment(aid, status="cancelled")
    await show(update, f"❌ نوبت #{fa(aid)} لغو شد.")
    salon = db.get_salon(a["salon_id"])
    try:
        await context.bot.send_message(
            salon["owner_id"],
            f"⚠️ مشتری نوبت را لغو کرد:\n👤 {esc(a['customer_name'])} — 📱 {fa(a['phone'])}\n"
            f"✂️ {esc(a['service_name'])}\n📅 {jdate_label(from_iso(a['day']))} ⏰ {fa(a['start'])}",
            parse_mode=ParseMode.HTML)
    except Exception:
        pass


# ---------- router ----------
async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    parts = q.data.split(":")
    action = parts[1]
    if action == "closed":
        return await q.answer("این روز آرایشگاه تعطیل است 🌙", show_alert=True)
    if action == "full":
        return await q.answer("ظرفیت این روز تکمیل است 😔", show_alert=True)
    await q.answer()
    uid = update.effective_user.id
    db.upsert_user(uid, update.effective_user.full_name)
    if action == "salon":
        db.set_user(uid, salon_id=int(parts[2]))
        salon = db.get_salon(int(parts[2]))
        if salon:
            await show_services(update, salon)
    elif action == "chg":
        db.set_user(uid, salon_id=None)
        salons = db.bookable_salons()
        await show(update, "🏪 آرایشگاه موردنظرت رو انتخاب کن:",
                   [[(f"💇‍♀️ {s['name']}", f"c:salon:{s['id']}")] for s in salons])
    elif action == "book":
        await book_entry(update, context)
    elif action == "svc":
        await show_days(update, int(parts[2]))
    elif action == "day":
        await show_times(update, int(parts[2]), parts[3])
    elif action == "t":
        await pick_time(update, context, int(parts[2]), parts[3], parts[4])
    elif action == "ok":
        await finalize(update, context, int(parts[2]), parts[3], parts[4])
    elif action == "prof":
        db.set_user(uid, phone=None, name=None)
        await pick_time(update, context, int(parts[2]), parts[3], parts[4])
    elif action == "my":
        await my_appointments(update, context)
    elif action == "cx":
        await cancel_appt(update, context, int(parts[2]), False)
    elif action == "cxy":
        await cancel_appt(update, context, int(parts[2]), True)
    elif action == "rc":
        a = db.get_appointment(int(parts[2]))
        if a and a["customer_id"] == uid and a["status"] == "awaiting_payment":
            salon = db.get_salon(a["salon_id"])
            set_await(context, "c_receipt", aid=a["id"])
            await send(update.effective_chat,
                       f"💳 مبلغ {money(a['deposit'])} را به کارت زیر واریز و تصویر رسید را ارسال کنید:\n"
                       f"<code>{salon['card_number']}</code>\n👤 {esc(salon['card_holder'] or '—')}")
        else:
            await show(update, "این نوبت دیگر در انتظار پرداخت نیست.")


async def on_text(update: Update, context, aw) -> bool:
    """Handle customer text input. Returns True if consumed."""
    kind = aw["kind"]
    text = update.message.text or ""
    uid = update.effective_user.id
    if kind == "c_phone":
        phone = normalize_phone(update.message.contact.phone_number if update.message.contact else text)
        if not phone:
            await update.message.reply_text("❗️ شماره معتبر نیست. مثال: ۰۹۱۲۱۲۳۴۵۶۷")
            return True
        db.set_user(uid, phone=phone)
        pending = {k: aw[k] for k in ("svc", "day", "t")}
        set_await(context, "c_name", **pending)
        await update.message.reply_text("👤 نام و نام خانوادگی‌ات رو بنویس:", reply_markup=main_kb(uid))
        return True
    if kind == "c_name":
        name = text.strip()
        if not (2 <= len(name) <= 60):
            await update.message.reply_text("❗️ لطفاً نام را درست وارد کن.")
            return True
        db.set_user(uid, name=name)
        clear_await(context)
        await confirm_screen(update, {k: aw[k] for k in ("svc", "day", "t")})
        return True
    if kind == "c_receipt":
        await update.message.reply_text("📸 لطفاً تصویر رسید را به صورت عکس ارسال کن.")
        return True
    return False
