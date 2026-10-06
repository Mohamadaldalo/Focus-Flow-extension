"""
Password hashing and JWT-based session token helpers.

Passwords are hashed with bcrypt (via passlib-free direct bcrypt usage to keep
the dependency surface small). A JWT is issued on successful login and is
required, in addition to the cooldown flow, for any sensitive action.
"""
from datetime import datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from .config import settings

ALGORITHM = "HS256"


def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # malformed hash
        return False


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
