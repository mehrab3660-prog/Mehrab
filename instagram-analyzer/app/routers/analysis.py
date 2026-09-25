import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import ai_analysis
from app.database import get_db
from app.models import Account, Comment, Report

router = APIRouter(prefix="/accounts/{account_id}", tags=["analysis"])


def _get_account_or_404(db: Session, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    return account


@router.post("/analyze")
def analyze_account(account_id: int, db: Session = Depends(get_db)):
    account = _get_account_or_404(db, account_id)

    unanalyzed = (
        db.query(Comment)
        .join(Comment.media)
        .filter(Comment.media.has(account_id=account_id), Comment.sentiment.is_(None))
        .all()
    )
    if unanalyzed:
        results = ai_analysis.analyze_comments_sentiment([c.text or "" for c in unanalyzed])
        for comment, result in zip(unanalyzed, results):
            comment.sentiment = result["sentiment"]
            comment.sentiment_score = result["score"]
        db.commit()

    all_comments = (
        db.query(Comment).join(Comment.media).filter(Comment.media.has(account_id=account_id)).all()
    )
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    for c in all_comments:
        if c.sentiment in sentiment_counts:
            sentiment_counts[c.sentiment] += 1

    media_items = sorted(account.media_items, key=lambda m: m.timestamp or datetime.min, reverse=True)[:20]
    media_summary = [
        {
            "caption": (m.caption or "")[:200],
            "like_count": m.like_count,
            "comments_count": m.comments_count,
            "reach": m.insights[-1].reach if m.insights else None,
        }
        for m in media_items
    ]
    account_summary = {
        "username": account.username,
        "followers_count": account.followers_count,
        "media_count": account.media_count,
    }

    summary_text = ai_analysis.generate_account_report(account_summary, media_summary, sentiment_counts)

    report = Report(
        account_id=account.id,
        summary_text=summary_text,
        stats_json=json.dumps({"sentiment": sentiment_counts, "media_analyzed": len(media_summary)}),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "report_id": report.id,
        "summary_text": report.summary_text,
        "sentiment_counts": sentiment_counts,
    }


@router.get("/reports")
def list_reports(account_id: int, db: Session = Depends(get_db)):
    _get_account_or_404(db, account_id)
    reports = (
        db.query(Report).filter_by(account_id=account_id).order_by(Report.created_at.desc()).all()
    )
    return [
        {"id": r.id, "created_at": r.created_at, "summary_text": r.summary_text, "stats_json": r.stats_json}
        for r in reports
    ]
