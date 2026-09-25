"""Receives Meta webhook events for Instagram comments and DMs, drafts a
reply with Claude in the account owner's voice, and sends it back through
the official Graph API — a fully automatic reply bot.

Requires: the connected account's Meta app has instagram_manage_comments and
instagram_manage_messages permissions, and a webhook subscription pointing
at POST /webhooks/instagram (publicly reachable — see README).
"""

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app import ai_analysis, instagram_client
from app.config import settings
from app.database import SessionLocal
from app.models import Account, AutoReply, Media

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/instagram")
def verify_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    """Meta calls this once, synchronously, when you register the webhook URL."""
    if hub_mode == "subscribe" and hub_verify_token == settings.webhook_verify_token:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(403, "Webhook verification token mismatch")


def _account_context(db: Session, account: Account) -> dict:
    recent = (
        db.query(Media)
        .filter_by(account_id=account.id)
        .order_by(Media.timestamp.desc())
        .limit(5)
        .all()
    )
    captions = " | ".join(m.caption[:100] for m in recent if m.caption)
    return {"name": account.name or account.username, "recent_captions": captions}


def _already_replied(db: Session, source_id: str) -> bool:
    return db.query(AutoReply).filter_by(source_id=source_id).first() is not None


def _handle_comment(db: Session, account: Account, value: dict) -> None:
    comment_id = str(value.get("id") or "")
    text = value.get("text") or ""
    if not comment_id or not text or _already_replied(db, comment_id):
        return

    context = _account_context(db, account)
    reply_text = ai_analysis.generate_auto_reply(text, context, source_type="comment")
    try:
        instagram_client.reply_to_comment(comment_id, reply_text, account.access_token)
    except instagram_client.InstagramAPIError:
        return  # don't log a reply that was never actually sent

    db.add(
        AutoReply(
            account_id=account.id,
            source_type="comment",
            source_id=comment_id,
            incoming_text=text,
            reply_text=reply_text,
        )
    )
    db.commit()


def _handle_dm(db: Session, account: Account, messaging_event: dict) -> None:
    message = messaging_event.get("message") or {}
    if message.get("is_echo"):
        return  # this is our own sent message being echoed back — not an incoming one
    text = message.get("text")
    message_id = message.get("mid")
    sender_id = (messaging_event.get("sender") or {}).get("id")
    if not text or not message_id or not sender_id or _already_replied(db, message_id):
        return

    context = _account_context(db, account)
    reply_text = ai_analysis.generate_auto_reply(text, context, source_type="dm")
    try:
        instagram_client.send_direct_message(account.ig_user_id, sender_id, reply_text, account.access_token)
    except instagram_client.InstagramAPIError:
        return

    db.add(
        AutoReply(
            account_id=account.id,
            source_type="dm",
            source_id=message_id,
            incoming_text=text,
            reply_text=reply_text,
        )
    )
    db.commit()


@router.post("/instagram")
async def receive_webhook(request: Request):
    payload = await request.json()
    db = SessionLocal()
    try:
        for entry in payload.get("entry", []):
            ig_user_id = str(entry.get("id") or "")
            account = db.query(Account).filter_by(ig_user_id=ig_user_id, auth_method="official").first()
            if account is None:
                continue

            for change in entry.get("changes", []):
                if change.get("field") == "comments":
                    _handle_comment(db, account, change.get("value") or {})

            for messaging_event in entry.get("messaging", []):
                _handle_dm(db, account, messaging_event)
    finally:
        db.close()

    # Meta requires a fast 200 response regardless of what happened above,
    # or it will retry (and eventually disable) the webhook.
    return {"status": "ok"}
