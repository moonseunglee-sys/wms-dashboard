from datetime import date
from typing import Optional
import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.deps import get_db
from api.schemas import PickingDetailOut, WorkerSummary, DailySummary

router = APIRouter(prefix="/picking", tags=["picking"])

ILOOM_ZONES = ("'A'", "'B'", "'C'", "'D'", "'H'", "'I'", "'P'")


def _owner_expr() -> str:
    zones = ", ".join(ILOOM_ZONES)
    return f"CASE WHEN zone IN ({zones}) THEN '일룸' ELSE '퍼시스' END"


def _base_filters(
    start_date: Optional[date],
    end_date: Optional[date],
    shift_type: Optional[str],
    worker: Optional[str],
) -> tuple[str, dict]:
    clauses, params = ["작업일시 IS NOT NULL"], {}
    if start_date:
        clauses.append("DATE(작업일시) >= :start_date")
        params["start_date"] = start_date
    if end_date:
        clauses.append("DATE(작업일시) <= :end_date")
        params["end_date"] = end_date
    if shift_type:
        clauses.append("shift_type = :shift_type")
        params["shift_type"] = shift_type
    if worker:
        clauses.append("작업자 = :worker")
        params["worker"] = worker
    return " AND ".join(clauses), params


@router.get("/detail", response_model=list[PickingDetailOut])
def get_detail(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    shift_type: Optional[str] = Query(None),
    worker: Optional[str] = Query(None),
    limit: int = Query(500, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    where, params = _base_filters(start_date, end_date, shift_type, worker)
    params.update({"limit": limit, "offset": offset})
    sql = f"SELECT * FROM picking_detail WHERE {where} ORDER BY 작업일시 LIMIT :limit OFFSET :offset"
    rows = db.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/workers", response_model=list[WorkerSummary])
def get_worker_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    shift_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    where, params = _base_filters(start_date, end_date, shift_type, None)
    owner_expr = _owner_expr()
    sql = f"""
        SELECT
            작업자,
            {owner_expr} AS 화주사,
            COUNT(*)                          AS 피킹건수,
            COALESCE(SUM(예상작업시간_min), 0) AS 표준시간_min,
            COALESCE(SUM(wave별_작업시간_min), 0) AS 실적시간_min,
            CASE
                WHEN SUM(wave별_작업시간_min) > 0
                THEN SUM(예상작업시간_min) / SUM(wave별_작업시간_min)
                ELSE 0
            END AS 가동률
        FROM picking_detail
        WHERE {where}
        GROUP BY 작업자, {owner_expr}
        ORDER BY 가동률 DESC
    """
    rows = db.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/daily", response_model=list[DailySummary])
def get_daily_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    shift_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    where, params = _base_filters(start_date, end_date, shift_type, None)
    sql = f"""
        SELECT
            DATE(작업일시)                        AS 작업일,
            COUNT(*)                              AS 피킹건수,
            COALESCE(SUM(예상작업시간_min), 0)    AS 표준시간_min,
            COALESCE(SUM(wave별_작업시간_min), 0) AS 실적시간_min,
            CASE
                WHEN SUM(wave별_작업시간_min) > 0
                THEN SUM(예상작업시간_min) / SUM(wave별_작업시간_min)
                ELSE 0
            END AS 가동률
        FROM picking_detail
        WHERE {where}
        GROUP BY DATE(작업일시)
        ORDER BY 작업일
    """
    rows = db.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/workers/list")
def list_workers(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT DISTINCT 작업자 FROM picking_detail ORDER BY 작업자")).scalars().all()
    return rows
