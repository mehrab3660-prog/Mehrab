from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Account(Base):
    """An Instagram account connected either via the official Graph API
    (auth_method="official") or via direct username/password login through
    the unofficial private API (auth_method="private")."""

    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    auth_method = Column(String, nullable=False, default="official")  # "official" | "private"
    ig_user_id = Column(String, unique=True, nullable=False, index=True)
    facebook_page_id = Column(String, nullable=True)
    username = Column(String, nullable=False)
    name = Column(String)
    profile_picture_url = Column(String)
    followers_count = Column(Integer, default=0)
    follows_count = Column(Integer, default=0)
    media_count = Column(Integer, default=0)
    access_token = Column(String, nullable=True)  # official (Graph API) auth
    token_expires_at = Column(DateTime)
    session_data = Column(Text, nullable=True)  # private (instagrapi) auth — serialized session
    created_at = Column(DateTime, default=datetime.utcnow)
    last_synced_at = Column(DateTime)

    media_items = relationship("Media", back_populates="account", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="account", cascade="all, delete-orphan")


class Media(Base):
    """A single post/reel/story pulled from an account."""

    __tablename__ = "media"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    ig_media_id = Column(String, unique=True, nullable=False, index=True)
    media_type = Column(String)  # IMAGE, VIDEO, CAROUSEL_ALBUM
    caption = Column(Text)
    media_url = Column(String)
    permalink = Column(String)
    timestamp = Column(DateTime)
    like_count = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)

    account = relationship("Account", back_populates="media_items")
    insights = relationship("MediaInsight", back_populates="media", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="media", cascade="all, delete-orphan")


class MediaInsight(Base):
    """Point-in-time performance metrics for a media item."""

    __tablename__ = "media_insights"

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False, index=True)
    impressions = Column(Integer)
    reach = Column(Integer)
    saved = Column(Integer)
    video_views = Column(Integer)
    total_interactions = Column(Integer)
    fetched_at = Column(DateTime, default=datetime.utcnow)

    media = relationship("Media", back_populates="insights")


class Comment(Base):
    """A comment on a media item, optionally scored by the AI layer."""

    __tablename__ = "comments"
    __table_args__ = (UniqueConstraint("ig_comment_id", name="uq_comment_ig_id"),)

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False, index=True)
    ig_comment_id = Column(String, nullable=False)
    username = Column(String)
    text = Column(Text)
    like_count = Column(Integer, default=0)
    timestamp = Column(DateTime)
    sentiment = Column(String)  # positive / neutral / negative
    sentiment_score = Column(Float)

    media = relationship("Media", back_populates="comments")


class Report(Base):
    """An AI-generated analysis report for an account over a period."""

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    summary_text = Column(Text)
    stats_json = Column(Text)

    account = relationship("Account", back_populates="reports")
