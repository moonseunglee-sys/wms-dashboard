from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from config.settings import DB_URL

_engine = create_engine(DB_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=_engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
