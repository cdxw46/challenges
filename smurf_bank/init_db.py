"""Create tables for Smurf Bank."""
from app import app, db


def main() -> None:
    with app.app_context():
        db.create_all()
        print("[smurf-bank] DB initialised at:", app.config["SQLALCHEMY_DATABASE_URI"])


if __name__ == "__main__":
    main()
