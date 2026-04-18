"""JWT-based authentication for the admin API."""

from __future__ import annotations

import time

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..core import config
from ..pbx import repo

bearer = HTTPBearer(auto_error=False)


def issue_token(username: str, role: str) -> str:
    now = int(time.time())
    ttl = int(config.get("jwt_ttl_seconds", 28800))
    payload = {"sub": username, "role": role, "iat": now, "exp": now + ttl, "iss": "smurf"}
    return jwt.encode(payload, config.get("jwt_secret"), algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, config.get("jwt_secret"), algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))


async def current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    token = None
    if creds is not None:
        token = creds.credentials
    elif "smurf_token" in request.cookies:
        token = request.cookies["smurf_token"]
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    payload = decode_token(token)
    user = await repo.find_user(payload.get("sub", ""))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unknown user")
    return {"username": user["username"], "role": user["role"], "id": user["id"]}


def require_role(*roles: str):
    async def _dep(user=Depends(current_user)):
        if roles and user["role"] not in roles and user["role"] != "superadmin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        return user
    return _dep
