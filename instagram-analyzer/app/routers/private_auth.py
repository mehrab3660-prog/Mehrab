from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import instagram_private_client as ig
from app.database import get_db
from app.models import Account

router = APIRouter(prefix="/auth/private", tags=["private-auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class VerifyRequest(BaseModel):
    login_token: str
    code: str
    username: str
    password: str


def _save_account(db: Session, client, username: str) -> Account:
    profile = ig.get_profile(client, username)
    account = db.query(Account).filter_by(ig_user_id=profile["ig_user_id"]).first()
    if account is None:
        account = Account(ig_user_id=profile["ig_user_id"], auth_method="private")
        db.add(account)

    account.auth_method = "private"
    account.username = profile["username"]
    account.name = profile["name"]
    account.profile_picture_url = profile["profile_picture_url"]
    account.followers_count = profile["followers_count"]
    account.follows_count = profile["follows_count"]
    account.media_count = profile["media_count"]
    account.session_data = ig.dump_session(client)
    db.commit()
    db.refresh(account)
    return account


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        client = ig.start_login(payload.username, payload.password)
    except ig.LoginChallenge as challenge:
        return {
            "status": "challenge_required",
            "kind": challenge.kind,
            "login_token": challenge.login_token,
            "message": challenge.message,
        }
    except Exception as e:
        raise HTTPException(400, f"ورود ناموفق: {e}")

    account = _save_account(db, client, payload.username)
    return {"status": "ok", "account_id": account.id}


@router.post("/verify")
def verify(payload: VerifyRequest, db: Session = Depends(get_db)):
    try:
        client = ig.complete_login(payload.login_token, payload.code)
    except Exception as e:
        raise HTTPException(400, f"تأیید ناموفق: {e}")

    account = _save_account(db, client, payload.username)
    return {"status": "ok", "account_id": account.id}
