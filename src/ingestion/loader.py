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
    일룸 Raw data 로드.

    날짜 필터:
      target_date 00:00 ~ 다음날 06:00 포함 (06:01 이후 제외)
      미지정 시 데이터 내 최소 날짜 자동 감지

    shift_type 판별 (2단계):
      1단계 — 작업자 이름 접두사 확인
        [주간]홍길동 → 주간 / [야간]홍길동 → 야간
      2단계 fallback — 작업자별 첫 작업일시 기준
        06:01~20:59 → 주간 / 21:00~익일06:00 → 야간
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
    cutoff = start + pd.Timedelta(hours=30, minutes=1)  # 다음날 06:01 exclusive
    df = df[(df["작업일시"] >= start) & (df["작업일시"] < cutoff)].copy()

    # ── shift_type 판별
    df["shift_type"] = _classify_shift_by_worker(df)

    df = df.sort_values(
        ["작업자", "작업일시", "WAVE명", "PLT_ID", "LOCATION"],
        ascending=True,
    ).reset_index(drop=True)

    _archive(path)
    return df


# ─────────────────────────────────────────────
# 내부 분류 함수
# ─────────────────────────────────────────────

def _classify_shift_by_worker(df: pd.DataFrame) -> pd.Series:
    """
    2단계 주/야간 판별. 작업자 단위로 동일 shift_type 부여.
    1단계: 작업자 이름 접두사 [주간]/[야간] 확인
    2단계: 작업자 첫 작업일시로 fallback
    """
    result = pd.Series("미정", index=df.index, dtype=str)

    for worker, grp in df.groupby("작업자", sort=False):
        # 1단계: 이름 접두사
        if str(worker).startswith("[주간]"):
            shift = "주간"
        elif str(worker).startswith("[야간]"):
            shift = "야간"
        else:
            # 2단계: 첫 작업일시 기준
            first_dt = grp["작업일시"].dropna().min()
            shift = _shift_from_time(first_dt)

        result.loc[grp.index] = shift

    return result


def _shift_from_time(dt) -> str:
    """작업일시 → 주간/야간 (06:01~20:59 → 주간, 나머지 → 야간)"""
    if pd.isna(dt):
        return "미정"
    mins = dt.hour * 60 + dt.minute
    return "주간" if 361 <= mins <= 1259 else "야간"


def _archive(path: Path) -> None:
    DATA_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = DATA_ARCHIVE_DIR / f"{path.stem}_{ts}{path.suffix}"
    shutil.copy2(path, dest)
