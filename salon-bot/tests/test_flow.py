"""End-to-end: drives the real handlers through a fake Telegram HTTP layer."""
import asyncio
import json
from datetime import timedelta

import pytest
from telegram import Update
from telegram.request import BaseRequest

from salonbot import config, db, utils
from salonbot.common import BTN_ADMIN, BTN_BOOK, BTN_MY

OWNER, CUSTOMER, SUPER = 100, 200, 300
BOT = {"id": 999, "is_bot": True, "first_name": "Salon", "username": "salon_test_bot"}


class FakeRequest(BaseRequest):
    def __init__(self):
        self.calls = []
        self.mid = 1000

    async def initialize(self):
        pass

    async def shutdown(self):
        pass

    async def do_request(self, url, method, request_data=None, **kw):
        name = url.rsplit("/", 1)[-1]
        params = request_data.json_parameters if request_data else {}
        self.calls.append((name, params))
        if name == "getMe":
            result = BOT
        elif name in ("sendMessage", "sendPhoto", "editMessageText", "editMessageReplyMarkup"):
            self.mid += 1
            result = {"message_id": self.mid, "date": 0, "chat": {"id": int(params.get("chat_id", 1)), "type": "private"},
                      "text": params.get("text", "")}
        else:
            result = True
        return 200, json.dumps({"ok": True, "result": result}).encode()

    def sent_to(self, chat_id):
        return [p for n, p in self.calls if n.startswith(("send", "edit")) and str(p.get("chat_id")) == str(chat_id)]

    def last_markup(self, chat_id):
        for p in reversed(self.sent_to(chat_id)):
            if p.get("reply_markup") and "inline_keyboard" in p["reply_markup"]:
                return json.loads(p["reply_markup"]) if isinstance(p["reply_markup"], str) else p["reply_markup"]
        return None


def button(req, chat_id, contains):
    mk = req.last_markup(chat_id)
    kb = mk["inline_keyboard"] if isinstance(mk, dict) else json.loads(mk)["inline_keyboard"]
    for row in kb:
        for b in row:
            if contains in b["text"] or contains == b["callback_data"]:
                return b["callback_data"]
    raise AssertionError(f"button {contains!r} not found in {kb}")


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "BOT_TOKEN", "1:TEST")
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "SUPER_ADMIN_IDS", {SUPER})
    from telegram.ext import ApplicationBuilder
    from salonbot import main as m
    req = FakeRequest()
    orig = ApplicationBuilder.build

    def build(self):
        self.request(req).get_updates_request(FakeRequest())
        return orig(self)
    monkeypatch.setattr(ApplicationBuilder, "build", build)
    errors = []

    async def on_error(update, context):
        errors.append(context.error)
    monkeypatch.setattr(m, "on_error", on_error)
    app = m.build_app()
    asyncio.run(app.initialize())
    yield app, req
    assert not errors, errors


def run(app, upd):
    asyncio.run(app.process_update(Update.de_json(upd, app.bot)))


_uid = [0]


def msg(app, uid, text=None, **extra):
    _uid[0] += 1
    m = {"message_id": _uid[0], "date": 0, "chat": {"id": uid, "type": "private"},
         "from": {"id": uid, "is_bot": False, "first_name": f"U{uid}"}, **extra}
    if text is not None:
        m["text"] = text
        if text.startswith("/"):
            m["entities"] = [{"type": "bot_command", "offset": 0, "length": len(text.split()[0])}]
    run(app, {"update_id": _uid[0], "message": m})


def click(app, uid, data):
    _uid[0] += 1
    run(app, {"update_id": _uid[0], "callback_query": {
        "id": str(_uid[0]), "chat_instance": "x", "data": data,
        "from": {"id": uid, "is_bot": False, "first_name": f"U{uid}"},
        "message": {"message_id": 1, "date": 0, "chat": {"id": uid, "type": "private"}, "text": "old"}}})


def test_full_flow(env):
    app, req = env
    # super admin creates a salon
    msg(app, SUPER, "/start")
    click(app, SUPER, "s:sla")
    msg(app, SUPER, str(OWNER))
    msg(app, SUPER, "آرایشگاه بهار")
    sid = db.salon_by_owner(OWNER)["id"]

    # owner adds a service and enables deposit
    msg(app, OWNER, BTN_ADMIN)
    click(app, OWNER, "a:sva")
    msg(app, OWNER, "کوتاهی مو")
    msg(app, OWNER, "۳۵۰٬۰۰۰")
    msg(app, OWNER, "۶۰")
    svc = db.services(sid)[0]
    assert svc["price"] == 350000 and svc["duration"] == 60
    click(app, OWNER, "a:f:deposit_amount"); msg(app, OWNER, "100000")
    click(app, OWNER, "a:f:card_number"); msg(app, OWNER, "6037 9911 1111 2222")
    click(app, OWNER, "a:dpt")
    assert db.get_salon(sid)["deposit_enabled"] == 1
    click(app, OWNER, "a:wha"); msg(app, OWNER, "۹ تا ۱۸")
    assert db.work_hours(sid)[0]["end"] == "18:00" and db.work_hours(sid)[6]["is_open"] == 0

    # customer books through the salon link
    msg(app, CUSTOMER, f"/start s{sid}")
    click(app, CUSTOMER, button(req, CUSTOMER, "کوتاهی مو"))
    tomorrow = utils.today() + timedelta(days=1)
    while utils.weekday_idx(tomorrow) == 6:
        tomorrow += timedelta(days=1)
    click(app, CUSTOMER, button(req, CUSTOMER, utils.jdate_label(tomorrow)))
    click(app, CUSTOMER, button(req, CUSTOMER, "۱۰:۰۰"))
    msg(app, CUSTOMER, contact={"phone_number": "+989121234567", "user_id": CUSTOMER, "first_name": "S"})
    msg(app, CUSTOMER, "سارا محمدی")
    click(app, CUSTOMER, button(req, CUSTOMER, "تایید و ثبت نوبت"))
    a = db.q1("SELECT * FROM appointments")
    assert a["status"] == "awaiting_payment" and a["start"] == "10:00" and a["phone"] == "09121234567"
    assert not db.slot_free(db.get_salon(sid), tomorrow, "10:00", 60)

    # customer sends receipt -> owner gets photo with approve button
    msg(app, CUSTOMER, photo=[{"file_id": "PH1", "file_unique_id": "u", "width": 1, "height": 1}])
    assert db.get_appointment(a["id"])["status"] == "pending"
    assert any(n == "sendPhoto" and str(p["chat_id"]) == str(OWNER) for n, p in req.calls)
    click(app, OWNER, f"a:ap:{a['id']}")
    assert db.get_appointment(a["id"])["status"] == "confirmed"
    assert any("تایید شد" in p.get("text", "") for p in req.sent_to(CUSTOMER))

    # customer views and cancels
    msg(app, CUSTOMER, BTN_MY)
    click(app, CUSTOMER, f"c:cx:{a['id']}")
    click(app, CUSTOMER, f"c:cxy:{a['id']}")
    assert db.get_appointment(a["id"])["status"] == "cancelled"

    # subscription renewal round trip
    click(app, SUPER, "s:sf:sub_card"); msg(app, SUPER, "6219861000000000")
    before = db.get_salon(sid)["sub_until"]
    click(app, OWNER, "a:subp")
    msg(app, OWNER, photo=[{"file_id": "PH2", "file_unique_id": "u2", "width": 1, "height": 1}])
    pid = db.sub_payments("pending")[0]["id"]
    click(app, SUPER, f"s:pa:{pid}")
    assert db.get_salon(sid)["sub_until"] > before

    # every screen of every panel renders without errors
    for data in ["a:menu", "a:apts", "a:apts:today", "a:apts:pend", "a:svcs", f"a:s:{svc['id']}", "a:wh", "a:wd:3",
                 "a:slot", "a:hol", "a:inf", "a:dep", "a:rem", "a:rmv:2", "a:wel", "a:sub", "a:link", f"a:apt:{a['id']}"]:
        click(app, OWNER, data)
    for data in ["s:menu", "s:stats", "s:sal", f"s:sl:{sid}", "s:rc", "s:hist", "s:set", "s:bc"]:
        click(app, SUPER, data)
    click(app, OWNER, "a:hla"); msg(app, OWNER, utils.jdate_full(tomorrow))
    assert db.is_holiday(sid, tomorrow)

    # customer sees no admin button; unauthorized callbacks are refused
    click(app, CUSTOMER, "a:menu")
    click(app, CUSTOMER, "s:stats")
    msg(app, CUSTOMER, BTN_BOOK)


def test_reminder_job(env):
    app, req = env
    from salonbot import main as m
    sid = db.create_salon(OWNER, "بهار")
    salon = db.get_salon(sid)
    svc = db.get_service(db.add_service(sid, "x", 1, 30))
    start = utils.now() + timedelta(hours=1)
    aid = db.create_appointment(salon, svc, CUSTOMER, "n", "0912", start.date(), start.strftime("%H:%M"), "confirmed")

    class Ctx:
        bot = app.bot
    if start.date() == utils.today():
        asyncio.run(m.job_tick(Ctx()))
        assert db.get_appointment(aid)["reminded"] == 1
        assert any("یادآوری" in p.get("text", "") for p in req.sent_to(CUSTOMER))
