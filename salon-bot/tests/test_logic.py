from datetime import timedelta

import pytest

from salonbot import db, utils


@pytest.fixture(autouse=True)
def fresh_db():
    db.init(":memory:")


def next_weekday(idx):
    d = utils.today() + timedelta(days=1)
    while utils.weekday_idx(d) != idx:
        d += timedelta(days=1)
    return d


def test_parsers():
    assert utils.parse_range("۹-۱۸") == ("09:00", "18:00")
    assert utils.parse_range("9:30 تا 20") == ("09:30", "20:00")
    assert utils.parse_range("18-9") is None
    assert utils.normalize_phone("+98 912 123 4567") == "09121234567"
    assert utils.normalize_phone("۰۹۱۲۱۲۳۴۵۶۷") == "09121234567"
    assert utils.normalize_phone("123") is None
    assert utils.normalize_card("6037-9911-1111-2222") == "6037991111112222"
    assert utils.parse_int("۳۵۰٬۰۰۰") == 350000
    d = utils.parse_jdate("1405/07/10")
    assert utils.jdate_full(d) == "۱۴۰۵/۰۷/۱۰"


def test_weekday_saturday_is_zero():
    import datetime
    assert utils.weekday_idx(datetime.date(2026, 9, 26)) == 0  # Saturday
    assert utils.weekday_idx(datetime.date(2026, 10, 2)) == 6  # Friday


def test_friday_closed_by_default():
    sid = db.create_salon(1, "بهار")
    status, slots = db.day_slots(db.get_salon(sid), next_weekday(6), 60)
    assert status == "closed" and slots == []


def test_slots_and_overlap():
    sid = db.create_salon(1, "بهار")
    salon = db.get_salon(sid)
    svc = db.get_service(db.add_service(sid, "کوتاهی", 200000, 60))
    d = next_weekday(0)  # Saturday 09:00-19:00, 30min step
    status, slots = db.day_slots(salon, d, 60)
    assert status == "open" and slots[0] == "09:00" and slots[-1] == "18:00"
    db.create_appointment(salon, svc, 5, "x", "0912", d, "10:00", "confirmed")
    _, slots = db.day_slots(salon, d, 60)
    assert "09:30" not in slots and "10:00" not in slots and "10:30" not in slots
    assert "09:00" in slots and "11:00" in slots
    # cancelled bookings free the slot
    aid = db.create_appointment(salon, svc, 5, "x", "0912", d, "12:00", "confirmed")
    db.set_appointment(aid, status="cancelled")
    assert db.slot_free(salon, d, "12:00", 60)


def test_full_day_and_holiday():
    sid = db.create_salon(1, "بهار")
    db.set_work_hours(sid, 0, start="09:00", end="10:00")
    salon = db.get_salon(sid)
    svc = db.get_service(db.add_service(sid, "x", 1, 60))
    d = next_weekday(0)
    db.create_appointment(salon, svc, 5, "x", "0912", d, "09:00", "pending")
    assert db.day_slots(salon, d, 60)[0] == "full"
    d2 = d + timedelta(days=1)
    db.add_holiday(sid, d2)
    assert db.day_slots(salon, d2, 60)[0] == "closed"


def test_subscription_extend_and_bookable():
    sid = db.create_salon(1, "بهار", trial_days=0)
    assert db.salon_bookable(db.get_salon(sid))  # valid through today
    db.update_salon(sid, sub_until=(utils.today() - timedelta(days=1)).isoformat())
    assert not db.salon_bookable(db.get_salon(sid))
    new = db.extend_subscription(sid, 30)
    assert new == (utils.today() + timedelta(days=30)).isoformat()
    assert db.salon_bookable(db.get_salon(sid))
