import secrets

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app import instagram_client
from app.database import SessionLocal
from app.models import Account

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
def login(request: Request):
    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    return RedirectResponse(instagram_client.build_login_url(state))


@router.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(400, f"Instagram authorization failed: {error}")
    if not code or not state or state != request.session.get("oauth_state"):
        raise HTTPException(400, "Invalid OAuth state")
    request.session.pop("oauth_state", None)

    short_token = instagram_client.exchange_code_for_token(code)
    long_token, expires_at = instagram_client.get_long_lived_token(short_token)

    pages = instagram_client.list_managed_pages(long_token)
    connected = []
    db: Session = SessionLocal()
    try:
        for page in pages:
            ig_account = page.get("instagram_business_account")
            if not ig_account:
                continue
            ig_user_id = ig_account["id"]
            page_token = page["access_token"]
            profile = instagram_client.get_profile(ig_user_id, page_token)

            account = db.query(Account).filter_by(ig_user_id=ig_user_id).first()
            if account is None:
                account = Account(ig_user_id=ig_user_id, facebook_page_id=page["id"])
                db.add(account)

            account.username = profile.get("username", "")
            account.name = profile.get("name")
            account.profile_picture_url = profile.get("profile_picture_url")
            account.followers_count = profile.get("followers_count", 0)
            account.follows_count = profile.get("follows_count", 0)
            account.media_count = profile.get("media_count", 0)
            account.access_token = page_token
            account.token_expires_at = expires_at
            connected.append(account.username)

        db.commit()
    finally:
        db.close()

    if not connected:
        raise HTTPException(
            400,
            "No Instagram Business/Creator account found. Connect an Instagram "
            "account to one of your Facebook Pages and grant the requested permissions.",
        )
    return RedirectResponse("/")
