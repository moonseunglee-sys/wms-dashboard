import pandas as pd
from pathlib import Path
from config.settings import DATA_ARCHIVE_DIR
import shutil
from datetime import datetime


def load_and_sort(raw_path: str | Path) -> pd.DataFrame:
    """Raw Excel 로드 → 컬럼 정리 → 정렬 (작업자/작업일시/WAVE명/PLT_ID/LOCATION)"""
    path = Path(raw_path)
    df = pd.read_excel(path)
    df.columns = df.columns.str.strip()
    df = df.rename(columns={
        "ITEM ID": "ITEM_ID",
        "PLT ID":  "PLT_ID",
    })
    df["작업일시"] = pd.to_datetime(df["작업일시"], errors="coerce")
    df = df.sort_values(
        ["작업자", "작업일시", "WAVE명", "PLT_ID", "LOCATION"],
        ascending=True,
    ).reset_index(drop=True)
    _archive(path)
    return df


def _archive(path: Path) -> None:
    DATA_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = DATA_ARCHIVE_DIR / f"{path.stem}_{ts}{path.suffix}"
    shutil.copy2(path, dest)
