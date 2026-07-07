# -*- coding: utf-8 -*-
"""
입고 실적 DB 적재기 (Supabase)

- --create : 테이블 없으면 생성 (inbound_worker_daily, inbound_brand_daily)
- --wipe   : 위 2개 테이블 TRUNCATE
- --brand  : 일룸/데스커/퍼시스/3PL (복수 지정 가능)
- --date   : YYYY-MM-DD (복수 지정 가능)

작업자 테이블(inbound_worker_daily): data/temp/inbound_<brand>_<date>.json 의 "basic_*" 필드 사용
  (정산용 6유형 세분화는 추후 '마감' 메뉴에서 별도 처리 — 대시보드는 일반 3유형만)
브랜드 집계 테이블(inbound_brand_daily): 위 작업자 데이터를 브랜드×일자로 합산해 함께 적재

선행: scripts/inbound_automation.py --date <date> --brand <brand> 실행으로 JSON 생성 필요.

예) python scripts/load_inbound_db.py --create --wipe --brand 일룸 데스커 퍼시스 --date 2026-07-01 2026-07-02 2026-07-03 2026-07-04
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
DB_URL = os.getenv("SUPABASE_POOLER_URL") or os.getenv("SUPABASE_DB_URL")
TEMP_DIR = BASE_DIR / "data" / "temp"

WIPE_TABLES = ["inbound_worker_daily", "inbound_brand_daily"]

# 브랜드 → 센터 (피킹과 동일 매핑: CENTER_OWNER)
BRAND_CENTER = {
    "일룸": "양지1센터",
    "퍼시스": "양지1센터",
    "데스커": "양지2센터",
    "3PL": "양지3센터",
}

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS inbound_worker_daily (
    id              SERIAL PRIMARY KEY,
    work_date       DATE    NOT NULL,
    center          TEXT    NOT NULL,
    brand           TEXT    NOT NULL,
    worker          TEXT    NOT NULL,
    worker_display  TEXT    NOT NULL,
    qty_normal      NUMERIC(14,2) DEFAULT 0,
    qty_return      NUMERIC(14,2) DEFAULT 0,
    qty_cut         NUMERIC(14,2) DEFAULT 0,
    qty_total       NUMERIC(14,2) DEFAULT 0,
    amt_normal      NUMERIC(16,2) DEFAULT 0,
    amt_return      NUMERIC(16,2) DEFAULT 0,
    amt_cut         NUMERIC(16,2) DEFAULT 0,
    amt_total       NUMERIC(16,2) DEFAULT 0,
    pallets         INTEGER DEFAULT 0,
    hours           NUMERIC(10,4) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inbound_worker_daily_date  ON inbound_worker_daily(work_date);
CREATE INDEX IF NOT EXISTS idx_inbound_worker_daily_brand ON inbound_worker_daily(brand);

CREATE TABLE IF NOT EXISTS inbound_brand_daily (
    id          SERIAL PRIMARY KEY,
    work_date   DATE    NOT NULL,
    center      TEXT    NOT NULL,
    brand       TEXT    NOT NULL,
    qty_normal  NUMERIC(14,2) DEFAULT 0,
    qty_return  NUMERIC(14,2) DEFAULT 0,
    qty_cut     NUMERIC(14,2) DEFAULT 0,
    qty_total   NUMERIC(14,2) DEFAULT 0,
    amt_normal  NUMERIC(16,2) DEFAULT 0,
    amt_return  NUMERIC(16,2) DEFAULT 0,
    amt_cut     NUMERIC(16,2) DEFAULT 0,
    amt_total   NUMERIC(16,2) DEFAULT 0,
    pallets     INTEGER DEFAULT 0,
    hours       NUMERIC(10,4) DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inbound_brand_daily_date  ON inbound_brand_daily(work_date);
CREATE INDEX IF NOT EXISTS idx_inbound_brand_daily_brand ON inbound_brand_daily(brand);
"""


def _conn():
    if not DB_URL:
        sys.exit("SUPABASE_POOLER_URL/SUPABASE_DB_URL 미설정")
    return psycopg2.connect(DB_URL)


def create_tables(cur):
    print("[CREATE] 테이블 생성(존재 시 스킵)...")
    cur.execute(CREATE_SQL)
    print("  [완료]")


def wipe(cur):
    tbls = ", ".join(WIPE_TABLES)
    print(f"[WIPE] TRUNCATE {tbls} ...")
    cur.execute(f"TRUNCATE TABLE {tbls} RESTART IDENTITY")
    print("  [완료]")


def load_one(cur, brand: str, date_str: str) -> int:
    p = TEMP_DIR / f"inbound_{brand}_{date_str}.json"
    if not p.exists():
        print(f"  [skip] {p.name} 없음 (inbound_automation.py 먼저 실행 필요)")
        return 0

    data = json.loads(p.read_text(encoding="utf-8"))
    center = BRAND_CENTER.get(brand, "기타")

    # ── 작업자별 적재 (멱등: 해당 브랜드×날짜 먼저 삭제) ──
    cur.execute(
        "DELETE FROM inbound_worker_daily WHERE work_date = %s AND brand = %s",
        (date_str, brand),
    )
    rows = [(
        date_str, center, brand, d["worker"], d["worker_display"],
        d["basic_qty_normal"], d["basic_qty_return"], d["basic_qty_cut"], d["qty_total"],
        d["basic_amt_normal"], d["basic_amt_return"], d["basic_amt_cut"], d["amt_total"],
        d["basic_pallets"], d["hours"],
    ) for d in data]
    execute_values(cur, """
        INSERT INTO inbound_worker_daily
            (work_date, center, brand, worker, worker_display,
             qty_normal, qty_return, qty_cut, qty_total,
             amt_normal, amt_return, amt_cut, amt_total,
             pallets, hours)
        VALUES %s
    """, rows)
    print(f"  [inbound_worker_daily] {brand} {date_str}: {len(rows)}명 적재")

    # ── 브랜드 집계 적재 ──
    agg = {
        "qty_normal": sum(d["basic_qty_normal"] for d in data),
        "qty_return": sum(d["basic_qty_return"] for d in data),
        "qty_cut":    sum(d["basic_qty_cut"]    for d in data),
        "qty_total":  sum(d["qty_total"]        for d in data),
        "amt_normal": sum(d["basic_amt_normal"] for d in data),
        "amt_return": sum(d["basic_amt_return"] for d in data),
        "amt_cut":    sum(d["basic_amt_cut"]    for d in data),
        "amt_total":  sum(d["amt_total"]        for d in data),
        "pallets":    sum(d["basic_pallets"]    for d in data),
        "hours":      sum(d["hours"]            for d in data),
    }
    cur.execute(
        "DELETE FROM inbound_brand_daily WHERE work_date = %s AND brand = %s",
        (date_str, brand),
    )
    cur.execute("""
        INSERT INTO inbound_brand_daily
            (work_date, center, brand, qty_normal, qty_return, qty_cut, qty_total,
             amt_normal, amt_return, amt_cut, amt_total, pallets, hours)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (date_str, center, brand, agg["qty_normal"], agg["qty_return"], agg["qty_cut"], agg["qty_total"],
          agg["amt_normal"], agg["amt_return"], agg["amt_cut"], agg["amt_total"], agg["pallets"], agg["hours"]))
    print(f"  [inbound_brand_daily]  {brand} {date_str}: 합계 수량 {agg['qty_total']:,.0f} / 시간 {agg['hours']:.2f}h")
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--create", action="store_true", help="테이블 생성(없으면)")
    ap.add_argument("--wipe",   action="store_true", help="기존 데이터 TRUNCATE")
    ap.add_argument("--brand",  nargs="+", required=True, help="일룸 데스커 퍼시스 3PL")
    ap.add_argument("--date",   nargs="+", required=True, help="YYYY-MM-DD (복수)")
    args = ap.parse_args()

    conn = _conn()
    cur = conn.cursor()
    try:
        if args.create:
            create_tables(cur)
        if args.wipe:
            wipe(cur)

        total = 0
        for brand in args.brand:
            print(f"\n[적재] {brand}")
            for d in args.date:
                total += load_one(cur, brand, d)

        conn.commit()
        print(f"\n[COMMIT] 완료 (작업자 레코드 총 {total}건)")

        for t in ("inbound_worker_daily", "inbound_brand_daily"):
            cur.execute(f"SELECT brand, COUNT(*) FROM {t} GROUP BY brand ORDER BY brand")
            summary = cur.fetchall()
            print(f"  {t}: " + ", ".join(f"{r[0]}={r[1]}" for r in summary))
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
