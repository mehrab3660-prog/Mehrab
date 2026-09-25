from telegram import InlineKeyboardButton as B, InlineKeyboardMarkup, ReplyKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import BadRequest

from . import config, db

BTN_BOOK = "📅 رزرو نوبت جدید"
BTN_MY = "📋 نوبت‌های من"
BTN_ADMIN = "🛠 پنل مدیریت"
BTN_SUPER = "🛡 پنل مدیر کل"
BTN_CANCEL = "❌ انصراف"


def main_kb(uid: int) -> ReplyKeyboardMarkup:
    rows = []
    if config.is_super(uid):
        rows.append([BTN_SUPER])
    if db.salon_by_owner(uid):
        rows.append([BTN_ADMIN])
    rows.append([BTN_MY, BTN_BOOK])
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, input_field_placeholder="پنل موردنظر را انتخاب کنید…")


def cancel_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup([[BTN_CANCEL]], resize_keyboard=True)


def ik(rows) -> InlineKeyboardMarkup:
    """rows: list of rows, each row a list of (text, callback_data)."""
    return InlineKeyboardMarkup([[B(t, callback_data=d) for t, d in row] for row in rows])


def one_per_row(items):
    return [[item] for item in items]


async def show(update: Update, text: str, rows=None):
    """Edit the callback's message if possible, otherwise send a new one."""
    markup = ik(rows) if rows else None
    q = update.callback_query
    if q and q.message and q.message.text is not None:
        try:
            await q.edit_message_text(text, reply_markup=markup, parse_mode=ParseMode.HTML,
                                      disable_web_page_preview=True)
            return
        except BadRequest as e:
            if "not modified" in str(e).lower():
                return
    await update.effective_chat.send_message(text, reply_markup=markup, parse_mode=ParseMode.HTML,
                                             disable_web_page_preview=True)


async def send(chat, text, rows=None, reply_markup=None):
    return await chat.send_message(text, reply_markup=ik(rows) if rows else reply_markup,
                                   parse_mode=ParseMode.HTML, disable_web_page_preview=True)


def set_await(context, kind, **data):
    context.user_data["await"] = {"kind": kind, **data}


def get_await(context):
    return context.user_data.get("await")


def clear_await(context):
    context.user_data.pop("await", None)
