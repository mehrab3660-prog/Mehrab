"""Thin client around Meta's Graph API for Instagram Business/Creator accounts.

Requires the connected Instagram account to be a Business or Creator account
linked to a Facebook Page, and a Meta app with the following permissions
approved for the accounts you manage: instagram_basic, instagram_manage_insights,
instagram_manage_comments, pages_show_list, pages_read_engagement.
"""

from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx

from app.config import settings

GRAPH_API_VERSION = "v21.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
FB_OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth"

SCOPES = [
    "instagram_basic",
    "instagram_manage_insights",
    "instagram_manage_comments",
    "pages_show_list",
    "pages_read_engagement",
]


class InstagramAPIError(RuntimeError):
    pass


def _get(path: str, params: dict) -> dict:
    resp = httpx.get(f"{GRAPH_BASE}/{path}", params=params, timeout=30)
    data = resp.json()
    if resp.status_code >= 400 or "error" in data:
        raise InstagramAPIError(data.get("error", data))
    return data


def build_login_url(state: str) -> str:
    params = {
        "client_id": settings.instagram_app_id,
        "redirect_uri": settings.oauth_redirect_uri,
        "state": state,
        "scope": ",".join(SCOPES),
        "response_type": "code",
    }
    return f"{FB_OAUTH_DIALOG}?{urlencode(params)}"


def exchange_code_for_token(code: str) -> str:
    data = _get(
        "oauth/access_token",
        {
            "client_id": settings.instagram_app_id,
            "client_secret": settings.instagram_app_secret,
            "redirect_uri": settings.oauth_redirect_uri,
            "code": code,
        },
    )
    return data["access_token"]


def get_long_lived_token(short_lived_token: str) -> tuple[str, datetime]:
    data = _get(
        "oauth/access_token",
        {
            "grant_type": "fb_exchange_token",
            "client_id": settings.instagram_app_id,
            "client_secret": settings.instagram_app_secret,
            "fb_exchange_token": short_lived_token,
        },
    )
    expires_in = data.get("expires_in", 60 * 24 * 60 * 60)  # ~60 days default
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    return data["access_token"], expires_at


def list_managed_pages(user_access_token: str) -> list[dict]:
    """Facebook Pages the logged-in user manages, each may have a linked IG account."""
    data = _get(
        "me/accounts",
        {"access_token": user_access_token, "fields": "id,name,access_token,instagram_business_account"},
    )
    return data.get("data", [])


def get_profile(ig_user_id: str, access_token: str) -> dict:
    return _get(
        ig_user_id,
        {
            "access_token": access_token,
            "fields": "username,name,profile_picture_url,followers_count,follows_count,media_count",
        },
    )


def list_media(ig_user_id: str, access_token: str, limit: int = 25) -> list[dict]:
    data = _get(
        f"{ig_user_id}/media",
        {
            "access_token": access_token,
            "fields": "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
            "limit": limit,
        },
    )
    return data.get("data", [])


def get_media_insights(media_id: str, media_type: str, access_token: str) -> dict:
    metrics = ["impressions", "reach", "saved", "total_interactions"]
    if media_type == "VIDEO":
        metrics.append("video_views")
    try:
        data = _get(f"{media_id}/insights", {"access_token": access_token, "metric": ",".join(metrics)})
    except InstagramAPIError:
        return {}
    return {item["name"]: item["values"][0]["value"] for item in data.get("data", [])}


def list_comments(media_id: str, access_token: str) -> list[dict]:
    data = _get(
        f"{media_id}/comments",
        {"access_token": access_token, "fields": "id,username,text,like_count,timestamp"},
    )
    return data.get("data", [])
