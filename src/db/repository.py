import pandas as pd
from sqlalchemy import create_engine, text
from config.settings import DB_PATH


def get_engine():
    return create_engine(f"sqlite:///{DB_PATH}")


def save(df: pd.DataFrame, table: str = "picking_productivity") -> int:
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
            CREATE TABLE IF NOT EXISTS picking_productivity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_id TEXT,
                worker_name TEXT,
                work_date DATE,
                pick_lines INTEGER,
                pick_qty INTEGER,
                travel_distance REAL,
                work_start TEXT,
                work_end TEXT,
                standard_time_sec REAL,
                actual_time_sec REAL,
                efficiency_rate REAL,
                lines_per_hour REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()
