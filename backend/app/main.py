
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from . import models
from .config import settings
from .database import Base, engine
from .routers import allowlist, auth, cooldown, sessions
from .routers import settings as settings_router
from .routers import stats, presence, exam

Base.metadata.create_all(bind=engine)

app = FastAPI(title="FocusFlow API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(allowlist.router)
app.include_router(sessions.router)
app.include_router(cooldown.router)
app.include_router(settings_router.router)
app.include_router(stats.router)
app.include_router(presence.router)
app.include_router(exam.router)

@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
