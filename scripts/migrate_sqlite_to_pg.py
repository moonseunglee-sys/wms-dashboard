"""SQLite → PostgreSQL 데이터 마이그레이션"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from sqlalchemy import create_engine, inspect, text

from config.settings import DB_PATH, DB_URL
from src.db.repository import init_db


def migrate():
    sqlite_url = f"sqlite:///{DB_PATH}"
    sqlite_engine = create_engine(sqlite_url)

    # SQLite에 테이블이 있는지 확인
    inspector = inspect(sqlite_engine)
    if "picking_detail" not in inspector.get_table_names():
        print("SQLite에 picking_detail 테이블이 없습니다. 마이그레이션 중단.")
        return

    print("SQLite 데이터 로드 중...")
    with sqlite_engine.connect() as conn:
        df = pd.read_sql("SELECT * FROM picking_detail", conn)

    if df.empty:
        print("SQLite에 데이터가 없습니다. 마이그레이션 중단.")
        return

    print(f"  {len(df)}행 로드 완료")

    # id, created_at은 PostgreSQL이 자동 생성
    drop_cols = [c for c in ["id", "created_at"] if c in df.columns]
    df = df.drop(columns=drop_cols)

    # SQLite는 BOOLEAN을 0/1 정수로 저장 → PostgreSQL BOOLEAN으로 변환
    for col in ["is_wave_start", "is_wave_end"]:
        if col in df.columns:
            df[col] = df[col].astype(bool)

    print("PostgreSQL 테이블 초기화 중...")
    init_db()

    pg_engine = create_engine(DB_URL, pool_pre_ping=True)

    # 기존 데이터 중복 방지: 테이블을 비우고 재적재
    with pg_engine.connect() as conn:
        existing = conn.execute(text("SELECT COUNT(*) FROM picking_detail")).scalar()
        if existing > 0:
            answer = input(
                f"PostgreSQL picking_detail에 이미 {existing}행이 있습니다. "
                "덮어쓰려면 y를 입력하세요 [y/N]: "
            )
            if answer.strip().lower() != "y":
                print("마이그레이션 취소.")
                return
            conn.execute(text("TRUNCATE TABLE picking_detail RESTART IDENTITY"))
            conn.commit()
            print("  기존 데이터 삭제 완료")

    print("PostgreSQL에 데이터 적재 중...")
    df.to_sql("picking_detail", pg_engine, if_exists="append", index=False, chunksize=1000)
    print(f"  {len(df)}행 적재 완료")

    # 검증
    with pg_engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM picking_detail")).scalar()
    print(f"\n마이그레이션 완료: PostgreSQL picking_detail = {count}행")


if __name__ == "__main__":
    migrate()
