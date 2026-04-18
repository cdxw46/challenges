"""Create the ONE and only Smurf Bank administrator.

Usage:
    python3 create_admin.py <username> <password>
"""
from __future__ import annotations

import sys

from werkzeug.security import generate_password_hash

from app import User, app, db


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python3 create_admin.py <username> <password>", file=sys.stderr)
        return 2

    username, password = sys.argv[1], sys.argv[2]
    if len(username) < 3 or len(password) < 6:
        print("username >=3 chars, password >=6 chars", file=sys.stderr)
        return 2

    with app.app_context():
        db.create_all()
        existing_admin = User.query.filter_by(is_admin=True).first()
        if existing_admin:
            print(
                f"[smurf-bank] admin already exists: {existing_admin.username!r}. "
                "Refusing to create another.",
                file=sys.stderr,
            )
            return 1
        if User.query.filter_by(username=username).first():
            print(
                f"[smurf-bank] username {username!r} already taken.",
                file=sys.stderr,
            )
            return 1

        admin = User(
            username=username,
            password_hash=generate_password_hash(password),
            is_admin=True,
            balance=1_000_000,
        )
        db.session.add(admin)
        db.session.commit()
        print(f"[smurf-bank] admin {username!r} created. Keep credentials safe.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
