import asyncio
from datetime import date

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from . import config, db
from .common import cancel_kb, clear_await, ik, main_kb, send, set_await, show
from .utils import card_fmt, days_left, esc, fa, jdate_full, money, normalize_card, parse_int

BACK = [("🔙 بازگشت به پنل", "s:menu")]

SETTINGS = {
    "sub_price": ("💰 مبلغ اشتراک (تومان):", parse_int),
    "sub_days": ("📆 مدت هر اشتراک (روز):", lambda s: (lambda v: v if v and v > 0 else None)(parse_int(s))),
    "sub_card": ("💳 شماره کارت دریافت اشتراک (۱۶ رقم):", normalize_card),
    "sub_holder": ("👤 نام صاحب کارت:", lambda s: s.strip()[:60] or None),
}


async def menu(update: Update, context):
    clear_await(context)
    pending = len(db.sub_payments("pending"))
    await show(update, "🛡 <b>پنل مدیر کل</b>\n\nاین بخش فقط برای شناسه‌های ثبت‌شده در SUPER_ADMIN_IDS باز می‌شود.", [
        [("📊 آمار سامانه", "s:stats")],
        [("🏪 مدیریت آرایشگرها", "s:sal")],
        [("🧾 رسیدهای اشتراک" + (f" ({fa(pending)})" if pending else ""), "s:rc")],
        [("📚 تاریخچه پرداخت اشتراک", "s:hist")],
        [("⚙️ تنظیمات پرداخت و مدیران", "s:set")],
        [("📢 پیام همگانی", "s:bc")],
    ])


async def stats(update):
    st = db.stats()
    await show(update, (
        "📊 <b>آمار سامانه</b>\n\n"
        f"👥 کاربران: {fa(st['users'])}\n"
        f"🏪 آرایشگاه‌ها: {fa(st['salons'])} (فعال: {fa(st['salons_active'])})\n"
        f"📋 کل نوبت‌ها: {fa(st['appts'])}\n"
        f"📅 نوبت‌های امروز: {fa(st['appts_today'])}\n"
        f"⏭ نوبت‌های پیش‌رو: {fa(st['appts_upcoming'])}\n"
        f"💰 درآمد اشتراک: {money(st['sub_income'])}\n"
        f"🧾 رسیدهای در انتظار: {fa(st['sub_pending'])}"), [BACK])


async def salons(update):
    rows = []
    for s in db.list_salons():
        dl = days_left(s["sub_until"])
        icon = "🟢" if db.salon_bookable(s) else "🔴"
        rows.append([(f"{icon} {s['name']} | {fa(dl) + ' روز' if dl >= 0 else 'منقضی'}", f"s:sl:{s['id']}")])
    rows += [[("➕ افزودن آرایشگاه", "s:sla")], BACK]
    await show(update, "🏪 <b>مدیریت آرایشگرها</b>", rows)


async def salon_detail(update, sid):
    s = db.get_salon(sid)
    if not s:
        return await salons(update)
    n_svc = len(db.services(sid))
    n_apt = db.q1("SELECT COUNT(*) FROM appointments WHERE salon_id=? AND status IN ('confirmed','done')", (sid,))[0]
    until = jdate_full(date.fromisoformat(s["sub_until"])) if s["sub_until"] else "—"
    text = (f"🏪 <b>{esc(s['name'])}</b> (#{fa(sid)})\n\n👤 مالک: <code>{s['owner_id']}</code> {esc(s['owner_name'] or '')}\n"
            f"📞 {fa(esc(s['phone'] or '—'))}\n📍 {esc(s['address'] or '—')}\n"
            f"⭐️ اشتراک تا: {until} ({fa(days_left(s['sub_until']))} روز)\n"
            f"وضعیت: {'🟢 فعال' if s['active'] else '🔴 مسدود'}\n✂️ خدمات: {fa(n_svc)} | 📋 نوبت‌ها: {fa(n_apt)}")
    await show(update, text, [
        [("➕ ۳۰ روز", f"s:ext:{sid}:30"), ("➕ ۹۰ روز", f"s:ext:{sid}:90"), ("➕ ۳۶۵ روز", f"s:ext:{sid}:365")],
        [("🔁 فعال/مسدود", f"s:tg:{sid}"), ("👤 تغییر مالک", f"s:own:{sid}")],
        [("🔙 لیست آرایشگاه‌ها", "s:sal")],
    ])


async def receipts(update, context):
    pend = db.sub_payments("pending")
    if not pend:
        return await show(update, "🧾 رسید در انتظاری وجود ندارد.", [BACK])
    await show(update, f"🧾 {fa(len(pend))} رسید در انتظار بررسی — در ادامه ارسال می‌شوند 👇", [BACK])
    for p in pend:
        await context.bot.send_photo(
            update.effective_chat.id, p["receipt_file_id"], parse_mode=ParseMode.HTML,
            caption=f"🧾 رسید #{fa(p['id'])}\n🏪 {esc(p['salon_name'])}\n💰 {money(p['amount'])} — {fa(p['days'])} روز\n🕓 {fa(p['created_at'])}",
            reply_markup=ik([[("✅ تایید", f"s:pa:{p['id']}"), ("🚫 رد", f"s:pr:{p['id']}")]]))


async def history(update):
    rows = db.sub_payments(limit=25)
    st = {"pending": "🕓", "approved": "✅", "rejected": "🚫"}
    lines = ["📚 <b>تاریخچه پرداخت اشتراک</b>\n"]
    lines += [f"{st[p['status']]} #{fa(p['id'])} {esc(p['salon_name'])} — {money(p['amount'])} — {fa(p['created_at'][:10])}"
              for p in rows] or ["پرداختی ثبت نشده است."]
    await show(update, "\n".join(lines), [BACK])


async def settings(update):
    admins = "\n".join(f"• <code>{a}</code>" for a in sorted(config.SUPER_ADMIN_IDS)) or "—"
    text = (f"⚙️ <b>تنظیمات پرداخت و مدیران</b>\n\n💰 مبلغ اشتراک: {money(db.get_setting('sub_price'))}\n"
            f"📆 مدت اشتراک: {fa(db.get_setting('sub_days'))} روز\n💳 کارت: {card_fmt(db.get_setting('sub_card'))}\n"
            f"👤 به نام: {esc(db.get_setting('sub_holder') or '—')}\n🎁 اشتراک رایگان آرایشگاه جدید: {fa(config.TRIAL_DAYS)} روز\n\n"
            f"🛡 مدیران کل (از فایل .env):\n{admins}")
    await show(update, text, [
        [("💰 مبلغ", "s:sf:sub_price"), ("📆 مدت", "s:sf:sub_days")],
        [("💳 کارت", "s:sf:sub_card"), ("👤 صاحب کارت", "s:sf:sub_holder")],
        BACK,
    ])


async def review_payment(update, context, pid, approve):
    p = db.get_sub_payment(pid)
    q = update.callback_query
    if not p or p["status"] != "pending":
        return await send(update.effective_chat, "ℹ️ این رسید قبلاً بررسی شده است.")
    db.review_sub_payment(pid, "approved" if approve else "rejected")
    salon = db.get_salon(p["salon_id"])
    if approve:
        until = db.extend_subscription(salon["id"], p["days"])
        msg = f"🎉 اشتراک «{esc(salon['name'])}» تمدید شد تا {jdate_full(date.fromisoformat(until))}."
    else:
        msg = f"🚫 رسید اشتراک «{esc(salon['name'])}» تایید نشد. در صورت نیاز با مدیر سامانه تماس بگیرید."
    try:
        await context.bot.send_message(salon["owner_id"], msg, parse_mode=ParseMode.HTML)
    except Exception:
        pass
    if q.message and q.message.photo:
        await q.edit_message_reply_markup(None)
    await send(update.effective_chat, ("✅ تایید شد. " if approve else "🚫 رد شد. ") + msg)


async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not config.is_super(update.effective_user.id):
        return await q.answer("دسترسی ندارید.", show_alert=True)
    await q.answer()
    clear_await(context)
    parts = q.data.split(":")
    action = parts[1]
    if action == "menu":
        await menu(update, context)
    elif action == "stats":
        await stats(update)
    elif action == "sal":
        await salons(update)
    elif action == "sl":
        await salon_detail(update, int(parts[2]))
    elif action == "ext":
        sid, days = int(parts[2]), int(parts[3])
        until = db.extend_subscription(sid, days)
        s = db.get_salon(sid)
        try:
            await context.bot.send_message(s["owner_id"], f"⭐️ اشتراک «{s['name']}» تا {jdate_full(date.fromisoformat(until))} تمدید شد.")
        except Exception:
            pass
        await salon_detail(update, sid)
    elif action == "tg":
        s = db.get_salon(int(parts[2]))
        db.update_salon(s["id"], active=0 if s["active"] else 1)
        await salon_detail(update, s["id"])
    elif action == "own":
        set_await(context, "s_owner", sid=int(parts[2]))
        await send(update.effective_chat, "👤 شناسه عددی تلگرام مالک جدید را وارد کنید\n(مالک می‌تواند با دستور /id شناسه‌اش را ببیند):",
                   reply_markup=cancel_kb())
    elif action == "sla":
        set_await(context, "s_new", step="owner")
        await send(update.effective_chat, "👤 شناسه عددی تلگرام مالک آرایشگاه را وارد کنید\n(مالک می‌تواند با دستور /id شناسه‌اش را ببیند):",
                   reply_markup=cancel_kb())
    elif action == "rc":
        await receipts(update, context)
    elif action in ("pa", "pr"):
        await review_payment(update, context, int(parts[2]), action == "pa")
    elif action == "hist":
        await history(update)
    elif action == "set":
        await settings(update)
    elif action == "sf":
        set_await(context, "s_setting", key=parts[2])
        await send(update.effective_chat, SETTINGS[parts[2]][0], reply_markup=cancel_kb())
    elif action == "bc":
        await show(update, "📢 پیام همگانی برای چه کسانی ارسال شود؟", [
            [("🏪 فقط مالکان آرایشگاه‌ها", "s:bct:owners")],
            [("👥 همه کاربران ربات", "s:bct:all")],
            BACK,
        ])
    elif action == "bct":
        set_await(context, "s_broadcast", target=parts[2])
        await send(update.effective_chat, "✍️ متن پیام را بنویسید:", reply_markup=cancel_kb())


async def on_text(update: Update, context, aw) -> bool:
    kind = aw["kind"]
    uid = update.effective_user.id
    if not kind.startswith("s_") or not config.is_super(uid):
        return False
    text = update.message.text or ""
    reply = update.message.reply_text

    if kind == "s_new":
        if aw["step"] == "owner":
            owner = parse_int(text.lstrip("-"))
            if not owner:
                await reply("❗️ شناسه باید عدد باشد.")
                return True
            if db.salon_by_owner(owner):
                await reply("❗️ این کاربر قبلاً یک آرایشگاه دارد.")
                return True
            set_await(context, "s_new", step="name", owner=owner)
            await reply("🏪 نام آرایشگاه را بنویسید:")
            return True
        name = text.strip()[:60]
        if len(name) < 2:
            await reply("❗️ نام معتبر نیست.")
            return True
        sid = db.create_salon(aw["owner"], name)
        clear_await(context)
        await reply(f"✅ آرایشگاه «{name}» با {fa(config.TRIAL_DAYS)} روز اشتراک رایگان ساخته شد.", reply_markup=main_kb(uid))
        try:
            await context.bot.send_message(
                aw["owner"], f"🎉 آرایشگاه «{name}» برای شما در ربات ثبت شد!\n"
                             f"برای شروع /start را بزنید و وارد «🛠 پنل مدیریت» شوید.")
        except Exception:
            await reply("⚠️ پیام به مالک ارسال نشد (احتمالاً هنوز ربات را استارت نکرده است).")
        await salon_detail(update, sid)
        return True

    if kind == "s_owner":
        owner = parse_int(text.lstrip("-"))
        if not owner:
            await reply("❗️ شناسه باید عدد باشد.")
            return True
        db.update_salon(aw["sid"], owner_id=owner)
        clear_await(context)
        await reply("✅ مالک تغییر کرد.", reply_markup=main_kb(uid))
        await salon_detail(update, aw["sid"])
        return True

    if kind == "s_setting":
        prompt, parser = SETTINGS[aw["key"]]
        value = parser(text)
        if value is None:
            await reply("❗️ مقدار معتبر نیست.")
            return True
        db.set_setting(aw["key"], value)
        clear_await(context)
        await reply("✅ ذخیره شد.", reply_markup=main_kb(uid))
        await settings(update)
        return True

    if kind == "s_broadcast":
        clear_await(context)
        if aw["target"] == "owners":
            targets = sorted({s["owner_id"] for s in db.list_salons()})
        else:
            targets = db.all_user_ids()
        ok = 0
        for t in targets:
            try:
                await context.bot.send_message(t, f"📢 {text}")
                ok += 1
            except Exception:
                pass
            await asyncio.sleep(0.05)  # stay under Telegram's rate limit
        await reply(f"✅ پیام برای {fa(ok)} از {fa(len(targets))} نفر ارسال شد.", reply_markup=main_kb(uid))
        return True
    return False
