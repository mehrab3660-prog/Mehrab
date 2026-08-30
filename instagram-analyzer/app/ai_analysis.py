"""AI analysis layer built on the Claude API.

Uses Claude Sonnet 5 (claude-sonnet-5) — sentiment scoring, caption
analysis and report writing are high-volume, moderate-difficulty tasks
well suited to Sonnet's cost/quality balance.
"""

import base64
import json

import httpx
from anthropic import Anthropic

from app.config import settings

MODEL = "claude-sonnet-5"

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def analyze_comments_sentiment(comments: list[str]) -> list[dict]:
    """Batch-score a list of comment texts. Returns one entry per input comment."""
    if not comments:
        return []

    numbered = "\n".join(f"{i}. {text}" for i, text in enumerate(comments))
    response = _get_client().messages.create(
        model=MODEL,
        max_tokens=4096,
        output_config={
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "results": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "index": {"type": "integer"},
                                    "sentiment": {
                                        "type": "string",
                                        "enum": ["positive", "neutral", "negative"],
                                    },
                                    "score": {"type": "number"},
                                },
                                "required": ["index", "sentiment", "score"],
                                "additionalProperties": False,
                            },
                        }
                    },
                    "required": ["results"],
                    "additionalProperties": False,
                },
            }
        },
        messages=[
            {
                "role": "user",
                "content": (
                    "Score the sentiment of each Instagram comment below. "
                    "score is -1.0 (very negative) to 1.0 (very positive).\n\n"
                    f"{numbered}"
                ),
            }
        ],
    )
    text = next(b.text for b in response.content if b.type == "text")
    data = json.loads(text)
    return sorted(data["results"], key=lambda r: r["index"])


def generate_account_report(account_summary: dict, media_summary: list[dict], sentiment_summary: dict) -> str:
    """Produce a natural-language performance report for an account."""
    prompt = (
        "You are analyzing an Instagram business account's recent performance. "
        "Write a concise, actionable report in Persian for the account owner: "
        "highlight growth trends, best- and worst-performing posts, audience "
        "sentiment, and 3-5 concrete recommendations.\n\n"
        f"Account: {json.dumps(account_summary, ensure_ascii=False)}\n\n"
        f"Recent media performance: {json.dumps(media_summary, ensure_ascii=False)}\n\n"
        f"Comment sentiment breakdown: {json.dumps(sentiment_summary, ensure_ascii=False)}"
    )
    response = _get_client().messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return next(b.text for b in response.content if b.type == "text")


def analyze_image(image_url: str) -> str:
    """Describe and evaluate the visual content of a media item."""
    image_bytes = httpx.get(image_url, timeout=30).content
    encoded = base64.standard_b64encode(image_bytes).decode("utf-8")

    response = _get_client().messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": encoded},
                    },
                    {
                        "type": "text",
                        "text": (
                            "In Persian, briefly describe this Instagram post's visual content, "
                            "its dominant colors/mood, and one suggestion to improve visual quality."
                        ),
                    },
                ],
            }
        ],
    )
    return next(b.text for b in response.content if b.type == "text")
