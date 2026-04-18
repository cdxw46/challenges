"""Smurf Bank — Flask app for a CTF challenge.

Intentional vulnerability: the JWT verifier accepts ``alg: none`` so any
authenticated user can craft an admin token and reach ``/admin``.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from functools import wraps
from typing import Any, Optional

from flask import (
    Flask,
    abort,
    flash,
    g,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    url_for,
)
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
os.makedirs(INSTANCE_DIR, exist_ok=True)

app = Flask(__name__, instance_path=INSTANCE_DIR)
app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"sqlite:///{os.path.join(INSTANCE_DIR, 'smurf.db')}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get(
    "SMURF_SECRET", "smurf-village-not-so-secret-key"
)
app.config["JWT_SECRET"] = os.environ.get(
    "SMURF_JWT_SECRET", "papa-smurf-loves-jwt-2026"
)
app.config["FLAG"] = os.environ.get(
    "SMURF_FLAG", "SMURF{jwt_n0ne_alg_1s_d4ng3r0us}"
)

db = SQLAlchemy(app)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    balance = db.Column(db.Integer, default=1000, nullable=False)  # smurfberries
    created_at = db.Column(db.Float, default=time.time)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    note = db.Column(db.String(140), default="")
    created_at = db.Column(db.Float, default=time.time)

    sender = db.relationship("User", foreign_keys=[sender_id])
    receiver = db.relationship("User", foreign_keys=[receiver_id])


# ---------------------------------------------------------------------------
# JWT helpers (intentionally vulnerable)
# ---------------------------------------------------------------------------


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def jwt_encode(payload: dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64url(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{h}.{p}".encode()
    sig = hmac.new(
        app.config["JWT_SECRET"].encode(), signing_input, hashlib.sha256
    ).digest()
    return f"{h}.{p}.{_b64url(sig)}"


def jwt_decode(token: str) -> Optional[dict[str, Any]]:
    """Decode and verify a JWT.

    NOTE for CTF: this verifier honours ``alg: none``. That's the bug.
    """
    try:
        h_b64, p_b64, s_b64 = token.split(".")
        header = json.loads(_b64url_decode(h_b64))
        payload = json.loads(_b64url_decode(p_b64))
    except Exception:
        return None

    alg = header.get("alg", "").lower()
    if alg in ("none", ""):
        return payload  # the trap

    if alg == "hs256":
        expected = hmac.new(
            app.config["JWT_SECRET"].encode(),
            f"{h_b64}.{p_b64}".encode(),
            hashlib.sha256,
        ).digest()
        try:
            given = _b64url_decode(s_b64)
        except Exception:
            return None
        if not hmac.compare_digest(expected, given):
            return None
        return payload

    return None


# ---------------------------------------------------------------------------
# Auth plumbing
# ---------------------------------------------------------------------------


def _load_user_from_request() -> None:
    g.user = None
    g.token_payload = None
    token = request.cookies.get("smurf_token")
    if not token:
        return
    payload = jwt_decode(token)
    if not payload:
        return
    user = db.session.get(User, payload.get("uid"))
    if not user:
        return
    g.user = user
    g.token_payload = payload


@app.before_request
def _before() -> None:
    _load_user_from_request()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not g.user:
            flash("Inicia sesión, pequeño pitufo.", "error")
            return redirect(url_for("login", next=request.path))
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not g.user:
            return redirect(url_for("login", next=request.path))
        # Trust the token's is_admin claim (vulnerable on purpose).
        token_admin = bool((g.token_payload or {}).get("is_admin"))
        if not token_admin:
            abort(403)
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    total_users = User.query.count()
    return render_template("index.html", total_users=total_users)


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        if len(username) < 3 or len(username) > 32:
            flash("El usuario debe tener entre 3 y 32 caracteres.", "error")
            return redirect(url_for("register"))
        if not username.replace("_", "").isalnum():
            flash("Usuario solo con letras, números y guion bajo.", "error")
            return redirect(url_for("register"))
        if len(password) < 6:
            flash("Contraseña mínima 6 caracteres.", "error")
            return redirect(url_for("register"))
        if User.query.filter_by(username=username).first():
            flash("Ese usuario ya existe.", "error")
            return redirect(url_for("register"))

        user = User(
            username=username,
            password_hash=generate_password_hash(password),
            is_admin=False,
            balance=1000,
        )
        db.session.add(user)
        db.session.commit()
        flash("¡Cuenta creada! Inicia sesión.", "success")
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            flash("Credenciales inválidas.", "error")
            return redirect(url_for("login"))

        payload = {
            "uid": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "iat": int(time.time()),
            "exp": int(time.time()) + 60 * 60 * 8,
        }
        token = jwt_encode(payload)
        nxt = request.args.get("next") or url_for("dashboard")
        resp = make_response(redirect(nxt))
        resp.set_cookie(
            "smurf_token",
            token,
            httponly=False,  # readable in JS so CTF players can inspect easily
            samesite="Lax",
            max_age=60 * 60 * 8,
        )
        flash(f"¡Bienvenido, {user.username}!", "success")
        return resp
    return render_template("login.html")


@app.route("/logout")
def logout():
    resp = make_response(redirect(url_for("index")))
    resp.delete_cookie("smurf_token")
    flash("Sesión cerrada.", "success")
    return resp


@app.route("/dashboard")
@login_required
def dashboard():
    txs = (
        Transaction.query.filter(
            (Transaction.sender_id == g.user.id)
            | (Transaction.receiver_id == g.user.id)
        )
        .order_by(Transaction.created_at.desc())
        .limit(25)
        .all()
    )
    return render_template("dashboard.html", txs=txs)


@app.route("/transfer", methods=["GET", "POST"])
@login_required
def transfer():
    if request.method == "POST":
        target = (request.form.get("target") or "").strip()
        amount_raw = request.form.get("amount") or "0"
        note = (request.form.get("note") or "").strip()[:140]
        try:
            amount = int(amount_raw)
        except ValueError:
            flash("Cantidad inválida.", "error")
            return redirect(url_for("transfer"))
        if amount <= 0:
            flash("La cantidad debe ser positiva.", "error")
            return redirect(url_for("transfer"))
        if amount > g.user.balance:
            flash("Saldo insuficiente.", "error")
            return redirect(url_for("transfer"))
        receiver = User.query.filter_by(username=target).first()
        if not receiver or receiver.id == g.user.id:
            flash("Destinatario inválido.", "error")
            return redirect(url_for("transfer"))

        g.user.balance -= amount
        receiver.balance += amount
        tx = Transaction(
            sender_id=g.user.id,
            receiver_id=receiver.id,
            amount=amount,
            note=note,
        )
        db.session.add(tx)
        db.session.commit()
        flash(
            f"Transferiste {amount} smurfberries a {receiver.username}.",
            "success",
        )
        return redirect(url_for("dashboard"))

    return render_template("transfer.html")


@app.route("/admin")
@admin_required
def admin_panel():
    users = User.query.order_by(User.id.asc()).all()
    txs = (
        Transaction.query.order_by(Transaction.created_at.desc()).limit(50).all()
    )
    return render_template(
        "admin.html",
        users=users,
        txs=txs,
        flag=app.config["FLAG"],
    )


@app.route("/api/me")
@login_required
def api_me():
    return jsonify(
        id=g.user.id,
        username=g.user.username,
        balance=g.user.balance,
        is_admin_db=g.user.is_admin,
        token_claims=g.token_payload,
    )


@app.route("/robots.txt")
def robots():
    body = "User-agent: *\nDisallow: /admin\nDisallow: /api/me\n"
    return app.response_class(body, mimetype="text/plain")


@app.errorhandler(403)
def forbidden(_e):
    return render_template("403.html"), 403


@app.errorhandler(404)
def notfound(_e):
    return render_template("404.html"), 404


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------


def init_db() -> None:
    with app.app_context():
        db.create_all()


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
