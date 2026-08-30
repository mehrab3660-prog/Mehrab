from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import instagram_client
from app import instagram_private_client as private_client
from app.database import get_db
from app.models import Account, Comment, Media, MediaInsight

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _account_dict(account: Account) -> dict:
    return {
        "id": account.id,
        "username": account.username,
        "name": account.name,
        "profile_picture_url": account.profile_picture_url,
        "followers_count": account.followers_count,
        "follows_count": account.follows_count,
        "media_count": account.media_count,
        "last_synced_at": account.last_synced_at,
    }


def _media_dict(media: Media) -> dict:
    insight = media.insights[-1] if media.insights else None
    return {
        "id": media.id,
        "media_type": media.media_type,
        "caption": media.caption,
        "media_url": media.media_url,
        "permalink": media.permalink,
        "timestamp": media.timestamp,
        "like_count": media.like_count,
        "comments_count": media.comments_count,
        "impressions": insight.impressions if insight else None,
        "reach": insight.reach if insight else None,
        "saved": insight.saved if insight else None,
        "total_interactions": insight.total_interactions if insight else None,
    }


def _get_account_or_404(db: Session, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    return account


@router.get("")
def list_accounts(db: Session = Depends(get_db)):
    return [_account_dict(a) for a in db.query(Account).all()]


@router.get("/{account_id}")
def get_account(account_id: int, db: Session = Depends(get_db)):
    return _account_dict(_get_account_or_404(db, account_id))


@router.get("/{account_id}/media")
def list_media(account_id: int, db: Session = Depends(get_db)):
    account = _get_account_or_404(db, account_id)
    media = sorted(account.media_items, key=lambda m: m.timestamp or datetime.min, reverse=True)
    return [_media_dict(m) for m in media]


@router.post("/{account_id}/sync")
def sync_account(account_id: int, db: Session = Depends(get_db)):
    account = _get_account_or_404(db, account_id)

    if account.auth_method == "private":
        try:
            client = private_client.load_session(account.session_data)
        except private_client.SessionExpired:
            raise HTTPException(401, "نشست این اکانت منقضی شده — دوباره از طریق فرم ورود، یوزرنیم/پسورد را وارد کنید.")
        profile = private_client.get_profile(client, account.username)
        media_items = private_client.list_media(client, account.ig_user_id)
        get_insights = lambda item_id, media_type: private_client.get_media_insights(client, item_id)
        get_comments = lambda item_id: private_client.list_comments(client, item_id)
    else:
        token = account.access_token
        profile = instagram_client.get_profile(account.ig_user_id, token)
        media_items = instagram_client.list_media(account.ig_user_id, token)
        get_insights = lambda item_id, media_type: instagram_client.get_media_insights(item_id, media_type, token)
        get_comments = lambda item_id: instagram_client.list_comments(item_id, token)

    account.followers_count = profile.get("followers_count", 0)
    account.follows_count = profile.get("follows_count", 0)
    account.media_count = profile.get("media_count", 0)

    synced = 0
    for item in media_items:
        media = db.query(Media).filter_by(ig_media_id=item["id"]).first()
        if media is None:
            media = Media(account_id=account.id, ig_media_id=item["id"])
            db.add(media)

        media.media_type = item.get("media_type")
        media.caption = item.get("caption")
        media.media_url = item.get("media_url")
        media.permalink = item.get("permalink")
        media.timestamp = datetime.fromisoformat(item["timestamp"]) if item.get("timestamp") else None
        media.like_count = item.get("like_count", 0)
        media.comments_count = item.get("comments_count", 0)
        db.flush()

        insight_data = get_insights(item["id"], media.media_type)
        if insight_data:
            db.add(
                MediaInsight(
                    media_id=media.id,
                    impressions=insight_data.get("impressions"),
                    reach=insight_data.get("reach"),
                    saved=insight_data.get("saved"),
                    video_views=insight_data.get("video_views"),
                    total_interactions=insight_data.get("total_interactions"),
                )
            )

        for c in get_comments(item["id"]):
            existing = db.query(Comment).filter_by(ig_comment_id=c["id"]).first()
            if existing:
                continue
            db.add(
                Comment(
                    media_id=media.id,
                    ig_comment_id=c["id"],
                    username=c.get("username"),
                    text=c.get("text"),
                    like_count=c.get("like_count", 0),
                    timestamp=datetime.fromisoformat(c["timestamp"]) if c.get("timestamp") else None,
                )
            )
        synced += 1

    if account.auth_method == "private":
        account.session_data = private_client.dump_session(client)

    account.last_synced_at = datetime.utcnow()
    db.commit()
    return {"synced_media": synced}
