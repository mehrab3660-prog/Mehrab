"""Direct username/password Instagram access via the unofficial private API
(instagrapi — the same protocol the official mobile app uses).

WARNING: this bypasses Meta's official Graph API entirely. It violates
Instagram's Terms of Service, is unsupported, can break whenever Instagram
changes its app internals, and carries a real risk of the account being
rate-limited, checkpointed, or suspended. Only use it on accounts you own,
and prefer the official Graph API (app/instagram_client.py) whenever it is
available to you.
"""

import json
import secrets
from datetime import datetime

from instagrapi import Client
from instagrapi.exceptions import ChallengeRequired, TwoFactorRequired

# In-memory store of Client objects mid-login (waiting on a 2FA/checkpoint
# code). Fine for a single-process deployment; lost on restart.
_pending_clients: dict[str, Client] = {}


class LoginChallenge(Exception):
    """Raised when Instagram needs an extra verification code to finish login."""

    def __init__(self, kind: str, login_token: str, message: str):
        self.kind = kind  # "two_factor" | "checkpoint"
        self.login_token = login_token
        self.message = message
        super().__init__(message)


def start_login(username: str, password: str) -> Client:
    """Attempt a direct login. Raises LoginChallenge if Instagram demands
    a verification code (2FA or a security checkpoint) before continuing."""
    client = Client()
    try:
        client.login(username, password)
    except TwoFactorRequired:
        token = secrets.token_urlsafe(16)
        _pending_clients[token] = client
        raise LoginChallenge(
            "two_factor",
            token,
            "کد تأیید دو مرحله‌ای که پیامک/اپ Authenticator برایتان فرستاده را وارد کنید.",
        )
    except ChallengeRequired:
        token = secrets.token_urlsafe(16)
        _pending_clients[token] = client
        raise LoginChallenge(
            "checkpoint",
            token,
            "اینستاگرام یک کد تأیید به ایمیل یا شماره‌ی شما فرستاده. آن را وارد کنید.",
        )
    return client


def complete_login(login_token: str, code: str) -> Client:
    """Finish a login that was paused by start_login() with a verification code."""
    client = _pending_clients.pop(login_token, None)
    if client is None:
        raise ValueError("نشست ورود منقضی شده — از ابتدا با یوزرنیم/پسورد دوباره تلاش کنید.")

    client.challenge_code_handler = lambda *_: code
    try:
        client.login(client.username, client.password, verification_code=code)
    except ChallengeRequired:
        client.challenge_resolve(client.last_json)
    return client


class SessionExpired(Exception):
    """The stored session cookie is no longer valid — the user must log in again.

    We deliberately never persist the raw password, so an expired session
    cannot be silently refreshed; re-authentication requires the user to
    submit their credentials again through /auth/private/login.
    """


def load_session(session_data: str) -> Client:
    """Reuse a previously saved session instead of logging in from scratch."""
    client = Client()
    client.set_settings(json.loads(session_data))
    try:
        client.get_timeline_feed()  # cheap call to confirm the session is still alive
    except Exception as e:
        raise SessionExpired("Stored session is no longer valid") from e
    return client


def dump_session(client: Client) -> str:
    return json.dumps(client.get_settings())


def get_profile(client: Client, username: str) -> dict:
    user = client.user_info_by_username(username)
    return {
        "ig_user_id": str(user.pk),
        "username": user.username,
        "name": user.full_name,
        "profile_picture_url": str(user.profile_pic_url) if user.profile_pic_url else None,
        "followers_count": user.follower_count,
        "follows_count": user.following_count,
        "media_count": user.media_count,
    }


def list_media(client: Client, user_id: str, amount: int = 25) -> list[dict]:
    medias = client.user_medias(user_id, amount=amount)
    result = []
    for m in medias:
        result.append(
            {
                "id": str(m.id),
                "caption": m.caption_text,
                "media_type": "VIDEO" if m.media_type == 2 else "IMAGE",
                "media_url": str(m.thumbnail_url or (m.video_url if m.video_url else "")) or None,
                "permalink": f"https://www.instagram.com/p/{m.code}/",
                "timestamp": m.taken_at.isoformat() if isinstance(m.taken_at, datetime) else str(m.taken_at),
                "like_count": m.like_count or 0,
                "comments_count": m.comment_count or 0,
            }
        )
    return result


def get_media_insights(client: Client, media_pk: str) -> dict:
    """Best-effort — insights are only exposed for business/creator accounts
    and may fail silently for personal accounts or if Instagram changes the
    endpoint. Returns {} on any failure."""
    try:
        insights = client.insights_media(media_pk)
        return {
            "impressions": insights.get("impression_count"),
            "reach": insights.get("reach_count"),
            "saved": insights.get("save_count"),
            "total_interactions": insights.get("total_interactions"),
        }
    except Exception:
        return {}


def list_comments(client: Client, media_pk: str, amount: int = 50) -> list[dict]:
    comments = client.media_comments(media_pk, amount=amount)
    result = []
    for c in comments:
        result.append(
            {
                "id": str(c.pk),
                "username": c.user.username if c.user else None,
                "text": c.text,
                "like_count": c.like_count or 0,
                "timestamp": c.created_at_utc.isoformat() if c.created_at_utc else None,
            }
        )
    return result
