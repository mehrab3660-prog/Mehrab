from datetime import date, timedelta

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from . import config, db
from .common import cancel_kb, clear_await, ik, main_kb, send, set_await, show
from .utils import (WEEKDAYS, card_fmt, days_left, esc, fa, jdate_full, jdate_label, money, normalize_card,
                    parse_int, parse_jdate, parse_range, today, ymd, from_ymd)

BACK = [("🔙 بازگشت به پنل", "a:menu")]

# field -> (prompt, parser, back callback)
FIELDS = {
    "name": ("🏪 نام جدید آرایشگاه را بنویسید:", lambda s: s.strip()[:60] or None, "a:inf"),
    "owner_name": ("👤 نام مدیر/آرایشگر را بنویسید:", lambda s: s.strip()[:60] or None, "a:inf"),
    "address": ("📍 آدرس آرایشگاه را بنویسید:", lambda s: s.strip()[:300] or None, "a:inf"),
    "phone": ("📞 شماره تماس آرایشگاه را بنویسید:", lambda s: s.strip()[:30] or None, "a:inf"),
    "deposit_amount": ("💰 مبلغ بیعانه را به تومان وارد کنید (مثلاً ۱۰۰۰۰۰):", parse_int, "a:dep"),
    "card_number": ("💳 شماره کارت ۱۶ رقمی را وارد کنید:", normalize_card, "a:dep"),
    "card_holder": ("👤 نام صاحب کارت را وارد کنید:", lambda s: s.strip()[:60] or None, "a:dep"),
    "welcome": ("💬 متن پیام خوش‌آمدگویی را بنویسید.\nمی‌توانید از {salon} برای درج نام آرایشگاه استفاده کنید:",
                lambda s: s.strip()[:1000] or None, "a:wel"),
}


def owner_salon(uid):
    return db.salon_by_owner(uid)


# ---------- screens ----------
async def menu(update: Update, context):
    clear_await(context)
    salon = owner_salon(update.effective_user.id)
    if not salon:
        return await send(update.effective_chat, "⛔️ شما مدیر هیچ آرایشگاهی نیستید.\n"
                                                 "برای ثبت آرایشگاه با مدیر سامانه تماس بگیرید (شناسه خود را با /id ببینید).")
    dl = days_left(salon["sub_until"])
    sub = f"⭐️ اشتراک: {fa(dl)} روز باقی‌مانده" if dl >= 0 else "⛔️ اشتراک منقضی شده — رزرو مشتریان غیرفعال است"
    text = (f"🛠 <b>پنل مدیریت آرایشگاه</b>\n\n🏪 {esc(salon['name'])}\n👤 {esc(salon['owner_name'] or 'مشخص نشده')}\n"
            f"{sub}\n\nبخش موردنظر را انتخاب کنید:")
    await show(update, text, [
        [("📋 نوبت‌های رزروشده", "a:apts")],
        [("✂️ مدیریت خدمات", "a:svcs")],
        [("🗓 روزها و ساعات کاری", "a:wh")],
        [("🏪 مشخصات آرایشگاه", "a:inf")],
        [("💳 بیعانه و کارت‌به‌کارت", "a:dep")],
        [("⏰ یادآوری نوبت‌ها", "a:rem")],
        [("💬 پیام خوش‌آمدگویی مشتری", "a:wel")],
        [("⭐️ اشتراک من", "a:sub")],
        [("🔗 لینک رزرو من", "a:link")],
    ])


async def appointments(update, salon, mode="up"):
    t = today()
    if mode == "today":
        rows_ = db.salon_appointments(salon["id"], t, t)
        title = "امروز"
    elif mode == "tom":
        rows_ = db.salon_appointments(salon["id"], t + timedelta(days=1), t + timedelta(days=1))
        title = "فردا"
    elif mode == "pend":
        rows_ = db.salon_appointments(salon["id"], t, statuses=("pending",))
        title = "در انتظار تایید"
    else:
        rows_ = db.salon_appointments(salon["id"], t)
        title = "همه نوبت‌های آینده"
    lines = [f"📋 <b>نوبت‌ها — {title}</b>\n"]
    if not rows_:
        lines.append("نوبتی وجود ندارد.")
    buttons = []
    for a in rows_:
        d = date.fromisoformat(a["day"])
        icon = db.STATUS_FA[a["status"]].split()[0]
        buttons.append([(f"{icon} {jdate_label(d)} {fa(a['start'])} | {a['customer_name']} | {a['service_name']}",
                         f"a:apt:{a['id']}")])
    filters = [("امروز", "a:apts:today"), ("فردا", "a:apts:tom"), ("همه", "a:apts:up"), ("منتظر تایید", "a:apts:pend")]
    await show(update, "\n".join(lines), buttons + [filters, BACK])


async def appointment_detail(update, context, salon, aid):
    a = db.get_appointment(aid)
    if not a or a["salon_id"] != salon["id"]:
        return await show(update, "نوبت پیدا نشد.", [BACK])
    d = date.fromisoformat(a["day"])
    text = (f"🔎 <b>نوبت #{fa(a['id'])}</b>\n\n👤 {esc(a['customer_name'])}\n📱 {fa(a['phone'])}\n"
            f"✂️ {esc(a['service_name'])} — {money(a['price'])}\n📅 {jdate_label(d)} ({jdate_full(d)})\n"
            f"⏰ {fa(a['start'])} تا {fa(a['end'])}\nوضعیت: {db.STATUS_FA[a['status']]}")
    if a["deposit"]:
        text += f"\n💰 بیعانه: {money(a['deposit'])}"
    rows = []
    if a["status"] == "pending":
        rows.append([("✅ تایید", f"a:ap:{aid}"), ("🚫 رد", f"a:rj:{aid}")])
    if a["status"] == "confirmed":
        rows.append([("✔️ انجام شد", f"a:dn:{aid}")])
    if a["status"] in ("awaiting_payment", "pending", "confirmed"):
        rows.append([("❌ لغو نوبت", f"a:cx:{aid}")])
    if a["receipt_file_id"]:
        rows.append([("🧾 مشاهده رسید", f"a:rcp:{aid}")])
    rows.append([("🔙 لیست نوبت‌ها", "a:apts")])
    await show(update, text, rows)


async def set_status(update, context, salon, aid, status):
    a = db.get_appointment(aid)
    if not a or a["salon_id"] != salon["id"]:
        return await show(update, "نوبت پیدا نشد.", [BACK])
    allowed = {
        "confirmed": ("pending", "awaiting_payment"),
        "rejected": ("pending", "awaiting_payment"),
        "cancelled": ("pending", "awaiting_payment", "confirmed"),
        "done": ("confirmed",),
    }
    if a["status"] not in allowed[status]:
        return await send(update.effective_chat,
                          f"ℹ️ وضعیت نوبت #{fa(aid)} قبلاً تغییر کرده است: {db.STATUS_FA[a['status']]}")
    db.set_appointment(aid, status=status)
    d = date.fromisoformat(a["day"])
    info = f"✂️ {esc(a['service_name'])}\n📅 {jdate_label(d)} — ⏰ {fa(a['start'])}\n🏪 {esc(salon['name'])}"
    msg = {
        "confirmed": f"🎉 نوبت شما تایید شد!\n\n{info}" + (f"\n📍 {esc(salon['address'])}" if salon["address"] else ""),
        "rejected": f"😔 متأسفانه نوبت شما تایید نشد.\n\n{info}\nبرای پیگیری با آرایشگاه تماس بگیرید"
                    + (f": {fa(esc(salon['phone']))}" if salon["phone"] else "."),
        "cancelled": f"⚠️ نوبت شما توسط آرایشگاه لغو شد.\n\n{info}",
    }.get(status)
    if msg:
        try:
            await context.bot.send_message(a["customer_id"], msg, parse_mode=ParseMode.HTML)
        except Exception:
            pass
    q = update.callback_query
    if q and q.message and q.message.photo:
        # Came from a receipt photo: update its buttons instead of editing text
        await q.edit_message_reply_markup(None)
        return await send(update.effective_chat, f"وضعیت نوبت #{fa(aid)}: {db.STATUS_FA[status]}")
    await appointment_detail(update, context, salon, aid)


async def services(update, salon):
    svcs = db.services(salon["id"])
    rows = [[(f"{'🟢' if s['active'] else '⚪️'} {s['name']} | {money(s['price'])} | {fa(s['duration'])}′", f"a:s:{s['id']}")]
            for s in svcs]
    rows += [[("➕ افزودن خدمت جدید", "a:sva")], BACK]
    text = "✂️ <b>مدیریت خدمات</b>\n\n" + ("برای ویرایش روی هر خدمت بزنید." if svcs else "هنوز خدمتی ثبت نشده است.")
    await show(update, text, rows)


async def service_detail(update, salon, svc_id):
    s = db.get_service(svc_id)
    if not s or s["salon_id"] != salon["id"] or s["deleted"]:
        return await services(update, salon)
    text = (f"✂️ <b>{esc(s['name'])}</b>\n\n💰 قیمت: {money(s['price'])}\n⏱ مدت: {fa(s['duration'])} دقیقه\n"
            f"وضعیت: {'🟢 فعال' if s['active'] else '⚪️ غیرفعال'}")
    await show(update, text, [
        [("✏️ نام", f"a:se:name:{svc_id}"), ("💰 قیمت", f"a:se:price:{svc_id}"), ("⏱ مدت", f"a:se:duration:{svc_id}")],
        [("🔁 فعال/غیرفعال", f"a:st:{svc_id}"), ("🗑 حذف", f"a:sx:{svc_id}")],
        [("🔙 لیست خدمات", "a:svcs")],
    ])


async def work_hours(update, salon):
    wh = db.work_hours(salon["id"])
    rows = []
    for i, name in enumerate(WEEKDAYS):
        r = wh[i]
        label = f"{name}: {fa(r['start'])} تا {fa(r['end'])}" if r["is_open"] else f"{name}: تعطیل"
        rows.append([(("🟢 " if r["is_open"] else "🔴 ") + label, f"a:wd:{i}")])
    rows += [
        [("🕘 تنظیم ساعت همه روزها", "a:wha")],
        [(f"⏱ فاصله نوبت‌ها: {fa(salon['slot_minutes'])} دقیقه", "a:slot")],
        [("🏖 تعطیلات خاص", "a:hol")],
        BACK,
    ]
    await show(update, "🗓 <b>روزها و ساعات کاری</b>\n\nبرای تغییر، روی هر روز بزنید:", rows)


async def weekday(update, salon, i):
    r = db.work_hours(salon["id"])[i]
    text = (f"🗓 <b>{WEEKDAYS[i]}</b>\n\nوضعیت: {'🟢 باز' if r['is_open'] else '🔴 تعطیل'}\n"
            f"ساعت کاری: {fa(r['start'])} تا {fa(r['end'])}")
    await show(update, text, [
        [("🔁 باز/تعطیل", f"a:wdt:{i}"), ("🕘 تغییر ساعت", f"a:wdh:{i}")],
        [("🔙 بازگشت", "a:wh")],
    ])


async def holidays(update, salon):
    hs = db.holidays(salon["id"])
    rows = [[(f"🗑 {jdate_label(d)} ({jdate_full(d)})", f"a:hlx:{ymd(d)}")] for d in hs]
    rows += [[("➕ افزودن روز تعطیل", "a:hla")], [("🔙 بازگشت", "a:wh")]]
    text = "🏖 <b>تعطیلات خاص</b>\n\n" + ("برای حذف روی هر تاریخ بزنید." if hs else "روز تعطیلی ثبت نشده است.")
    await show(update, text, rows)


async def info(update, salon):
    text = (f"🏪 <b>مشخصات آرایشگاه</b>\n\nنام: {esc(salon['name'])}\nمدیر: {esc(salon['owner_name'] or '—')}\n"
            f"آدرس: {esc(salon['address'] or '—')}\nتلفن: {fa(esc(salon['phone'] or '—'))}")
    await show(update, text, [
        [("✏️ نام", "a:f:name"), ("👤 نام مدیر", "a:f:owner_name")],
        [("📍 آدرس", "a:f:address"), ("📞 تلفن", "a:f:phone")],
        BACK,
    ])


async def deposit(update, salon):
    on = salon["deposit_enabled"]
    text = (f"💳 <b>بیعانه و کارت‌به‌کارت</b>\n\nدریافت بیعانه: {'🟢 فعال' if on else '⚪️ غیرفعال'}\n"
            f"مبلغ بیعانه: {money(salon['deposit_amount'])}\nشماره کارت: {card_fmt(salon['card_number'])}\n"
            f"به نام: {esc(salon['card_holder'] or '—')}\n\n"
            "ℹ️ وقتی فعال باشد، مشتری بعد از انتخاب نوبت باید بیعانه را کارت‌به‌کارت کند و عکس رسید بفرستد؛ "
            "سپس شما نوبت را تایید یا رد می‌کنید.")
    await show(update, text, [
        [("🔁 فعال/غیرفعال", "a:dpt")],
        [("💰 مبلغ", "a:f:deposit_amount"), ("💳 شماره کارت", "a:f:card_number")],
        [("👤 نام صاحب کارت", "a:f:card_holder")],
        BACK,
    ])


async def reminder(update, salon):
    cur = salon["remind_hours"]
    opts = [0, 1, 2, 3, 6, 12, 24]
    rows = [[((("✅ " if h == cur else "") + ("خاموش" if h == 0 else f"{fa(h)} ساعت قبل")), f"a:rmv:{h}")
             for h in opts[i:i + 3]] for i in range(0, len(opts), 3)]
    rows.append(BACK)
    now_txt = "خاموش" if cur == 0 else f"{fa(cur)} ساعت قبل از نوبت"
    await show(update, f"⏰ <b>یادآوری نوبت‌ها</b>\n\nبه مشتری پیام یادآوری ارسال می‌شود.\nتنظیم فعلی: {now_txt}", rows)


async def welcome(update, salon):
    cur = (salon["welcome"] or db.DEFAULT_WELCOME).replace("{salon}", salon["name"])
    await show(update, f"💬 <b>پیام خوش‌آمدگویی فعلی:</b>\n\n{esc(cur)}", [
        [("✏️ تغییر متن", "a:f:welcome"), ("♻️ متن پیش‌فرض", "a:wlr")],
        BACK,
    ])


async def subscription(update, salon):
    dl = days_left(salon["sub_until"])
    until = jdate_full(date.fromisoformat(salon["sub_until"])) if salon["sub_until"] else "—"
    price, days = int(db.get_setting("sub_price") or 0), int(db.get_setting("sub_days") or 30)
    status = f"🟢 فعال تا {until} ({fa(dl)} روز باقی‌مانده)" if dl >= 0 else f"🔴 منقضی شده ({until})"
    text = f"⭐️ <b>اشتراک من</b>\n\nوضعیت: {status}\n\n💎 تمدید {fa(days)} روزه: {money(price)}"
    rows = []
    if db.get_setting("sub_card"):
        rows.append([("💳 پرداخت و تمدید اشتراک", "a:subp")])
    else:
        text += "\n\nبرای تمدید با مدیر سامانه تماس بگیرید."
    await show(update, text, rows + [BACK])


async def link(update, context, salon):
    url = f"https://t.me/{context.bot.username}?start=s{salon['id']}"
    await show(update, f"🔗 <b>لینک رزرو اختصاصی شما</b>\n\n{url}\n\n"
                       "این لینک را در اینستاگرام، واتساپ یا بیو قرار دهید تا مشتری‌ها مستقیم وارد صفحه رزرو شما شوند.",
               [BACK])


# ---------- router ----------
async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    parts = q.data.split(":")
    action = parts[1]
    salon = owner_salon(update.effective_user.id)
    if not salon:
        return await q.answer("دسترسی ندارید.", show_alert=True)
    await q.answer()
    clear_await(context)
    sid = salon["id"]

    if action == "menu":
        await menu(update, context)
    elif action == "apts":
        await appointments(update, salon, parts[2] if len(parts) > 2 else "up")
    elif action == "apt":
        await appointment_detail(update, context, salon, int(parts[2]))
    elif action in ("ap", "rj", "cx", "dn"):
        status = {"ap": "confirmed", "rj": "rejected", "cx": "cancelled", "dn": "done"}[action]
        await set_status(update, context, salon, int(parts[2]), status)
    elif action == "rcp":
        a = db.get_appointment(int(parts[2]))
        if a and a["salon_id"] == sid and a["receipt_file_id"]:
            await context.bot.send_photo(update.effective_chat.id, a["receipt_file_id"],
                                         caption=f"🧾 رسید نوبت #{fa(a['id'])}")
    elif action == "svcs":
        await services(update, salon)
    elif action == "s":
        await service_detail(update, salon, int(parts[2]))
    elif action == "sva":
        set_await(context, "a_svc_new", step="name")
        await send(update.effective_chat, "✂️ نام خدمت جدید را بنویسید (مثلاً «کوتاهی مو»):", reply_markup=cancel_kb())
    elif action == "se":
        field, svc_id = parts[2], int(parts[3])
        s = db.get_service(svc_id)
        if s and s["salon_id"] == sid:
            prompts = {"name": "✏️ نام جدید خدمت:", "price": "💰 قیمت جدید (تومان):", "duration": "⏱ مدت زمان (دقیقه):"}
            set_await(context, "a_svc_edit", field=field, svc=svc_id)
            await send(update.effective_chat, prompts[field], reply_markup=cancel_kb())
    elif action == "st":
        s = db.get_service(int(parts[2]))
        if s and s["salon_id"] == sid:
            db.update_service(s["id"], active=0 if s["active"] else 1)
            await service_detail(update, salon, s["id"])
    elif action == "sx":
        s = db.get_service(int(parts[2]))
        if s and s["salon_id"] == sid:
            await show(update, f"🗑 خدمت «{esc(s['name'])}» حذف شود؟",
                       [[("بله، حذف شود", f"a:sxy:{s['id']}"), ("خیر", f"a:s:{s['id']}")]])
    elif action == "sxy":
        s = db.get_service(int(parts[2]))
        if s and s["salon_id"] == sid:
            db.update_service(s["id"], deleted=1, active=0)
        await services(update, salon)
    elif action == "wh":
        await work_hours(update, salon)
    elif action == "wd":
        await weekday(update, salon, int(parts[2]))
    elif action == "wdt":
        i = int(parts[2])
        db.set_work_hours(sid, i, is_open=0 if db.work_hours(sid)[i]["is_open"] else 1)
        await weekday(update, salon, i)
    elif action == "wdh":
        set_await(context, "a_hours", day=int(parts[2]))
        await send(update.effective_chat, f"🕘 ساعت کاری {WEEKDAYS[int(parts[2])]} را وارد کنید.\nمثال: ۹-۱۸ یا ۹:۳۰ تا ۲۰",
                   reply_markup=cancel_kb())
    elif action == "wha":
        set_await(context, "a_hours", day=-1)
        await send(update.effective_chat, "🕘 ساعت کاری همه روزهای باز را وارد کنید.\nمثال: ۹-۱۸ یا ۹:۳۰ تا ۲۰",
                   reply_markup=cancel_kb())
    elif action == "slot":
        await show(update, "⏱ فاصله بین شروع نوبت‌ها را انتخاب کنید:", [
            [((("✅ " if m == salon["slot_minutes"] else "") + f"{fa(m)} دقیقه"), f"a:slv:{m}") for m in (15, 20, 30)],
            [((("✅ " if m == salon["slot_minutes"] else "") + f"{fa(m)} دقیقه"), f"a:slv:{m}") for m in (45, 60, 90)],
            [("🔙 بازگشت", "a:wh")],
        ])
    elif action == "slv":
        db.update_salon(sid, slot_minutes=int(parts[2]))
        await work_hours(update, db.get_salon(sid))
    elif action == "hol":
        await holidays(update, salon)
    elif action == "hla":
        set_await(context, "a_holiday")
        await send(update.effective_chat, f"🏖 تاریخ تعطیلی را به شمسی وارد کنید.\nمثال: {jdate_full(today() + timedelta(days=3))}",
                   reply_markup=cancel_kb())
    elif action == "hlx":
        db.remove_holiday(sid, from_ymd(parts[2]))
        await holidays(update, salon)
    elif action == "inf":
        await info(update, salon)
    elif action == "f":
        field = parts[2]
        set_await(context, "a_field", field=field)
        await send(update.effective_chat, FIELDS[field][0], reply_markup=cancel_kb())
    elif action == "dep":
        await deposit(update, salon)
    elif action == "dpt":
        if not salon["deposit_enabled"] and (not salon["card_number"] or not salon["deposit_amount"]):
            return await show(update, "❗️ قبل از فعال‌سازی، مبلغ بیعانه و شماره کارت را وارد کنید.",
                              [[("🔙 بازگشت", "a:dep")]])
        db.update_salon(sid, deposit_enabled=0 if salon["deposit_enabled"] else 1)
        await deposit(update, db.get_salon(sid))
    elif action == "rem":
        await reminder(update, salon)
    elif action == "rmv":
        db.update_salon(sid, remind_hours=int(parts[2]))
        await reminder(update, db.get_salon(sid))
    elif action == "wel":
        await welcome(update, salon)
    elif action == "wlr":
        db.update_salon(sid, welcome=None)
        await welcome(update, db.get_salon(sid))
    elif action == "sub":
        await subscription(update, salon)
    elif action == "subp":
        price, days = int(db.get_setting("sub_price") or 0), int(db.get_setting("sub_days") or 30)
        card, holder = db.get_setting("sub_card"), db.get_setting("sub_holder")
        set_await(context, "a_sub_receipt")
        await send(update.effective_chat,
                   f"💳 مبلغ <b>{money(price)}</b> را برای تمدید {fa(days)} روزه به کارت زیر واریز کنید:\n\n"
                   f"<code>{card}</code>\n{card_fmt(card)}\n👤 {esc(holder or '—')}\n\n📸 سپس تصویر رسید را ارسال کنید.",
                   reply_markup=cancel_kb())
    elif action == "link":
        await link(update, context, salon)


async def on_text(update: Update, context, aw) -> bool:
    kind = aw["kind"]
    if not kind.startswith("a_"):
        return False
    uid = update.effective_user.id
    salon = owner_salon(uid)
    if not salon:
        clear_await(context)
        return False
    text = update.message.text or ""
    sid = salon["id"]
    reply = update.message.reply_text

    async def done(msg, screen):
        clear_await(context)
        await reply(msg, reply_markup=main_kb(uid))
        await screen

    if kind == "a_field":
        field = aw["field"]
        prompt, parser, _ = FIELDS[field]
        value = parser(text)
        if value is None:
            await reply("❗️ مقدار وارد شده معتبر نیست، دوباره تلاش کنید.")
            return True
        db.update_salon(sid, **{field: value})
        salon = db.get_salon(sid)
        screen = {"a:inf": info, "a:dep": deposit, "a:wel": welcome}[FIELDS[field][2]](update, salon)
        await done("✅ ذخیره شد.", screen)
        return True

    if kind == "a_svc_new":
        step = aw["step"]
        if step == "name":
            name = text.strip()[:60]
            if len(name) < 2:
                await reply("❗️ نام خدمت را درست وارد کنید.")
                return True
            set_await(context, "a_svc_new", step="price", name=name)
            await reply("💰 قیمت این خدمت را به تومان وارد کنید (مثلاً ۳۵۰۰۰۰):")
        elif step == "price":
            price = parse_int(text)
            if price is None:
                await reply("❗️ قیمت را فقط به عدد وارد کنید.")
                return True
            set_await(context, "a_svc_new", step="duration", name=aw["name"], price=price)
            await reply("⏱ مدت زمان این خدمت چند دقیقه است؟ (مثلاً ۶۰)")
        else:
            dur = parse_int(text)
            if not dur or not (5 <= dur <= 720):
                await reply("❗️ مدت زمان باید بین ۵ تا ۷۲۰ دقیقه باشد.")
                return True
            db.add_service(sid, aw["name"], aw["price"], dur)
            await done("✅ خدمت جدید اضافه شد.", services(update, salon))
        return True

    if kind == "a_svc_edit":
        s = db.get_service(aw["svc"])
        if not s or s["salon_id"] != sid:
            clear_await(context)
            return True
        field = aw["field"]
        if field == "name":
            value = text.strip()[:60] or None
        else:
            value = parse_int(text)
            if field == "duration" and value is not None and not (5 <= value <= 720):
                value = None
        if value is None:
            await reply("❗️ مقدار وارد شده معتبر نیست.")
            return True
        db.update_service(s["id"], **{field: value})
        await done("✅ ذخیره شد.", service_detail(update, salon, s["id"]))
        return True

    if kind == "a_hours":
        rng = parse_range(text)
        if not rng:
            await reply("❗️ فرمت درست نیست. مثال: ۹-۱۸ یا ۹:۳۰ تا ۲۰")
            return True
        days = range(7) if aw["day"] == -1 else [aw["day"]]
        wh = db.work_hours(sid)
        for i in days:
            if aw["day"] == -1 and not wh[i]["is_open"]:
                continue
            db.set_work_hours(sid, i, start=rng[0], end=rng[1])
        screen = work_hours(update, salon) if aw["day"] == -1 else weekday(update, salon, aw["day"])
        await done("✅ ساعت کاری ذخیره شد.", screen)
        return True

    if kind == "a_holiday":
        d = parse_jdate(text)
        if not d or d < today():
            await reply(f"❗️ تاریخ معتبر نیست. مثال: {jdate_full(today() + timedelta(days=3))}")
            return True
        db.add_holiday(sid, d)
        await done(f"✅ {jdate_label(d)} به تعطیلات اضافه شد.", holidays(update, salon))
        return True

    if kind == "a_sub_receipt":
        await reply("📸 لطفاً تصویر رسید را به صورت عکس ارسال کنید.")
        return True
    return False


async def on_sub_receipt(update: Update, context):
    salon = owner_salon(update.effective_user.id)
    clear_await(context)
    if not salon:
        return
    price, days = int(db.get_setting("sub_price") or 0), int(db.get_setting("sub_days") or 30)
    file_id = update.message.photo[-1].file_id
    pid = db.add_sub_payment(salon["id"], price, days, file_id)
    await update.message.reply_text("✅ رسید اشتراک دریافت شد و پس از تایید مدیر سامانه، اشتراک شما تمدید می‌شود.",
                                    reply_markup=main_kb(update.effective_user.id))
    for admin_id in config.SUPER_ADMIN_IDS:
        try:
            await context.bot.send_photo(
                admin_id, file_id, parse_mode=ParseMode.HTML,
                caption=f"🧾 <b>رسید اشتراک</b> #{fa(pid)}\n🏪 {esc(salon['name'])}\n💰 {money(price)} — {fa(days)} روز",
                reply_markup=ik([[("✅ تایید", f"s:pa:{pid}"), ("🚫 رد", f"s:pr:{pid}")]]))
        except Exception:
            pass
