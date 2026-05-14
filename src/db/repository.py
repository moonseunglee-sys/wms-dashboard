import pandas as pd
from sqlalchemy import create_engine, text
from config.settings import DB_PATH


def get_engine():
    return create_engine(f"sqlite:///{DB_PATH}")


def save(df: pd.DataFrame, table: str = "picking_detail") -> int:
    engine = get_engine()
    rows = df.to_sql(table, engine, if_exists="append", index=False)
    return rows or len(df)


def query(sql: str, params: dict | None = None) -> pd.DataFrame:
    engine = get_engine()
    with engine.connect() as conn:
        return pd.read_sql(text(sql), conn, params=params)


def init_db() -> None:
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS picking_detail (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                작업자          TEXT,
                WAVE명          TEXT,
                WAVE번호        TEXT,
                PLT_ID          TEXT,
                오더번호        TEXT,
                ITEM_ID         TEXT,
                피킹수량        INTEGER,
                LOCATION        TEXT,
                작업일시        TIMESTAMP,
                출고지역        TEXT,
                zone_code       TEXT,
                zone            TEXT,
                rack            REAL,
                loc             REAL,
                tier            TEXT,
                is_wave_start   BOOLEAN,
                is_wave_end     BOOLEAN,
                시작_zone간_min REAL,
                시작_rack간_min REAL,
                시작_loc간_min  REAL,
                끝_zone간_min   REAL,
                끝_rack간_min   REAL,
                끝_loc간_min    REAL,
                zone간_min      REAL,
                rack간_min      REAL,
                loc간_min       REAL,
                피킹단수_min    REAL,
                품목바코드_min  REAL,
                피킹시간_min    REAL,
                loc바코드_min   REAL,
                공파렛트_min    REAL,
                라벨링복귀_min  REAL,
                예상작업시간_min     REAL,
                표준시간_누계_min    REAL,
                wave별_표준시간_min  REAL,
                작업시간_min         REAL,
                작업시간_prime       REAL,
                작업소요시간_min     REAL,
                작업소요시간_누계_min REAL,
                wave별_작업시간_min  REAL,
                wave별_가동률        REAL,
                품목별_가동률        REAL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()
