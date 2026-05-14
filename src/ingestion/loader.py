import pandas as pd
from pathlib import Path
from config.settings import COLUMN_MAP, DATA_ARCHIVE_DIR
import shutil
from datetime import datetime


def load_excel(file_path: str | Path) -> pd.DataFrame:
    path = Path(file_path)
    df = pd.read_excel(path, dtype=str)
    df = _rename_columns(df)
    df = _parse_types(df)
    _archive(path)
    return df


def _rename_columns(df: pd.DataFrame) -> pd.DataFrame:
    reverse_map = {v: k for k, v in COLUMN_MAP.items()}
    return df.rename(columns=reverse_map)


def _parse_types(df: pd.DataFrame) -> pd.DataFrame:
    if "work_date" in df.columns:
        df["work_date"] = pd.to_datetime(df["work_date"], errors="coerce")
    for col in ("pick_lines", "pick_qty", "travel_distance"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    for col in ("work_start", "work_end"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], format="%H:%M", errors="coerce").dt.time
    return df


def _archive(path: Path) -> None:
    DATA_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = DATA_ARCHIVE_DIR / f"{path.stem}_{ts}{path.suffix}"
    shutil.copy2(path, dest)
