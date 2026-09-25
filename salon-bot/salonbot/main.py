import logging
from datetime import date, time as dtime

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (Application, ApplicationBuilder, CallbackQueryHandler, CommandHandler, ContextTypes,
                          MessageHandler, filters)

from . import admin, config, customer, db, superadmin
from .common import BTN_ADMIN, BTN_BOOK, BTN_CANCEL, BTN_MY, BTN_SUPER, clear_await, get_await, main_kb
from .utils import TZ, days_left, esc, fa, jdate_label

log = logging.getLogger("salonbot")


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    db.upsert_user(uid, update.effective_user.full_name)
    text = (update.message.text or "").strip()

    if text == BTN_CANCEL:
        clear_await(context)
        return await update.message.reply_text("لغو شد.", reply_markup=main_kb(uid))
    if text == BTN_BOOK:
        return await customer.book_entry(update, context)
    if text == BTN_MY:
        return await customer.my_appointments(update, context)
    if text == BTN_ADMIN:
        return await admin.menu(update, context)
    if text == BTN_SUPER:
        if config.is_super(uid):
            return await superadmin.menu(update, context)
        return await update.message.reply_text("⛔️ دسترسی ندارید.")

    aw = get_await(context)
    if aw:
        for handler in (customer.on_text, admin.on_text, superadmin.on_text):
            if await handler(update, context, aw):
                return
    await update.message.reply_text("از منوی پایین یکی از گزینه‌ها را انتخاب کن 👇", reply_markup=main_kb(uid))


async def on_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    aw = get_await(context)
    if aw and aw["kind"] == "c_phone":
        await customer.on_text(update, context, aw)


async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    aw = get_await(context)
    if aw and aw["kind"] == "c_receipt":
        return await customer.receive_receipt(update, context, aw["aid"])
    if aw and aw["kind"] == "a_sub_receipt":
        return await admin.on_sub_receipt(update, context)
    # A customer sending a photo without the prompt: attach it to their only unpaid booking
    unpaid = [a for a in db.customer_appointments(update.effective_user.id) if a["status"] == "awaiting_payment"]
    if len(unpaid) == 1:
        return await customer.receive_receipt(update, context, unpaid[0]["id"])
    await update.message.reply_text("برای ارسال رسید، ابتدا از «📋 نوبت‌های من» گزینه ارسال رسید را بزن.")


async def job_tick(context: ContextTypes.DEFAULT_TYPE):
    """Every few minutes: expire unpaid bookings and send reminders."""
    for a in db.expire_unpaid():
        try:
            await context.bot.send_message(
                a["customer_id"],
                f"⌛️ نوبت #{fa(a['id'])} ({esc(a['service_name'])} — {jdate_label(date.fromisoformat(a['day']))} "
                f"ساعت {fa(a['start'])}) به دلیل عدم ارسال رسید بیعانه لغو شد.", parse_mode=ParseMode.HTML)
        except Exception:
            pass
    for a in db.due_reminders():
        db.set_appointment(a["id"], reminded=1)
        text = (f"⏰ <b>یادآوری نوبت</b>\n\n🏪 {esc(a['salon_name'])}\n✂️ {esc(a['service_name'])}\n"
                f"📅 {jdate_label(date.fromisoformat(a['day']))} — ⏰ ساعت {fa(a['start'])}")
        if a["salon_address"]:
            text += f"\n📍 {esc(a['salon_address'])}"
        text += "\n\nمنتظرت هستیم 🌸"
        try:
            await context.bot.send_message(a["customer_id"], text, parse_mode=ParseMode.HTML)
        except Exception:
            pass


async def job_daily(context: ContextTypes.DEFAULT_TYPE):
    """Warn salon owners whose subscription is about to expire."""
    for s in db.list_salons():
        dl = days_left(s["sub_until"])
        if s["active"] and dl in (3, 1, 0):
            try:
                await context.bot.send_message(
                    s["owner_id"], f"⚠️ اشتراک «{s['name']}» {fa(dl) + ' روز دیگر' if dl else 'امروز'} به پایان می‌رسد.\n"
                                   "برای تمدید از «🛠 پنل مدیریت ← ⭐️ اشتراک من» اقدام کنید.")
            except Exception:
                pass


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE):
    log.exception("Unhandled error", exc_info=context.error)


def build_app() -> Application:
    if not config.BOT_TOKEN:
        raise SystemExit("BOT_TOKEN تنظیم نشده است. فایل .env را بسازید (از روی .env.example).")
    db.init()
    builder = ApplicationBuilder().token(config.BOT_TOKEN)
    if config.PROXY_URL:
        builder = builder.proxy(config.PROXY_URL).get_updates_proxy(config.PROXY_URL)
    app = builder.build()

    app.add_handler(CommandHandler("start", customer.start))
    app.add_handler(CommandHandler("id", customer.cmd_id))
    app.add_handler(CommandHandler("admin", admin.menu))
    app.add_handler(CommandHandler("super", lambda u, c: superadmin.menu(u, c) if config.is_super(u.effective_user.id) else None))
    app.add_handler(CallbackQueryHandler(customer.on_callback, pattern=r"^c:"))
    app.add_handler(CallbackQueryHandler(admin.on_callback, pattern=r"^a:"))
    app.add_handler(CallbackQueryHandler(superadmin.on_callback, pattern=r"^s:"))
    app.add_handler(MessageHandler(filters.CONTACT, on_contact))
    app.add_handler(MessageHandler(filters.PHOTO, on_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    app.add_error_handler(on_error)

    app.job_queue.run_repeating(job_tick, interval=300, first=10)
    app.job_queue.run_daily(job_daily, time=dtime(10, 0, tzinfo=TZ))
    return app


def main():
    logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s: %(message)s", level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    app = build_app()
    log.info("Salon bot started")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
