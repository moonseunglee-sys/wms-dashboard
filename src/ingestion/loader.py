import pandas as pd
from pathlib import Path
from config.settings import DATA_ARCHIVE_DIR
import shutil
from datetime import datetime


# ─────────────────────────────────────────────
# 퍼시스 Raw data 로드
# ─────────────────────────────────────────────
def load_and_sort(raw_path: str | Path) -> pd.DataFrame:
    """Raw Excel 로드 → 컬럼 정리 → 정렬 (작업자/작업일시/WAVE명/PLT_ID/LOCATION)"""
    path = Path(raw_path)
    df = pd.read_excel(path)
    df.columns = df.columns.str.strip()
    df = df.rename(columns={"ITEM ID": "ITEM_ID", "PLT ID": "PLT_ID"})
    df["작업일시"] = pd.to_datetime(df["작업일시"], errors="coerce")
    df = df.sort_values(
        ["작업자", "작업일시", "WAVE명", "PLT_ID", "LOCATION"],
        ascending=True,
    ).reset_index(drop=True)
    _archive(path)
    return df


# ─────────────────────────────────────────────
# 일룸 Raw data 로드 (날짜 필터 + 주/야간 판별)
# ─────────────────────────────────────────────
def load_iloom(raw_path: str | Path, target_date: str = None) -> pd.DataFrame:
    """
    일룸 Raw data 로드:
    - 날짜 필터: target_date 전체 + 다음날 00:00~06:00 포함 (06:01 이후 제외)
      target_date 미지정 시 데이터 내 최소 날짜 자동 감지
    - shift 컬럼 추가: 주간(06:01~20:59) / 야간(21:00~익일06:00)
    """
    path = Path(raw_path)
    df = pd.read_excel(path)
    df.columns = df.columns.str.strip()
    df = df.rename(columns={"ITEM ID": "ITEM_ID", "PLT ID": "PLT_ID"})
    df["작업일시"] = pd.to_datetime(df["작업일시"], errors="coerce")

    # ── 날짜 필터
    if target_date is None:
        target_date = str(df["작업일시"].dt.date.min())

    start  = pd.Timestamp(target_date)
    cutoff = start + pd.Timedelta(hours=30, minutes=1)  # 다음날 06:01 (exclusive)
    df = df[(df["작업일시"] >= start) & (df["작업일시"] < cutoff)].copy()

    # ── 주/야간 판별
    df["shift"] = df["작업일시"].apply(_classify_shift)

    df = df.sort_values(
        ["작업자", "작업일시", "WAVE명", "PLT_ID", "LOCATION"],
        ascending=True,
    ).reset_index(drop=True)

    _archive(path)
    return df


def _classify_shift(dt) -> str | None:
    if pd.isna(dt):
        return None
    mins = dt.hour * 60 + dt.minute
    # 주간: 06:01(361분) ~ 20:59(1259분)
    return "주간" if 361 <= mins <= 1259 else "야간"


def _archive(path: Path) -> None:
    DATA_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = DATA_ARCHIVE_DIR / f"{path.stem}_{ts}{path.suffix}"
    shutil.copy2(path, dest)
