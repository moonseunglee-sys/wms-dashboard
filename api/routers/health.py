from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.deps import get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "connected"}
