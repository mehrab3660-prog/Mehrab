from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import accounts, analysis, auth, private_auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Instagram AI Analyzer", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)

app.include_router(auth.router)
app.include_router(private_auth.router)
app.include_router(accounts.router)
app.include_router(analysis.router)

app.mount("/", StaticFiles(directory="web", html=True), name="web")
