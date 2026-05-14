from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_RAW_DIR       = BASE_DIR / "data" / "raw"
DATA_PROCESSED_DIR = BASE_DIR / "data" / "processed"
DATA_ARCHIVE_DIR   = BASE_DIR / "data" / "archive"
OUTPUTS_DIR        = BASE_DIR / "outputs"

DB_PATH = BASE_DIR / "data" / "productivity.db"

# 기준값 툴 파일 — data/raw/ 또는 BASE_DIR에 위치
TOOL_FILE_NAME = "양지센터 피킹 가동율_05.12.xlsx"

# ── 이동속도 설정
# 툴파일 이동시간은 3.0 km/h 기준으로 계산된 값
# 일룸은 2.0 km/h → travel_factor = 3.0 / 2.0 = 1.5
_REFERENCE_SPEED_KMH = 3.0
_TRAVEL_SPEED_KMH = {
    "퍼시스": 3.0,
    "일룸":   2.0,
}

def get_travel_factor(owner: str) -> float:
    speed = _TRAVEL_SPEED_KMH.get(owner, _REFERENCE_SPEED_KMH)
    return _REFERENCE_SPEED_KMH / speed


def find_tool_file(hint_dir: Path | None = None) -> Path:
    """툴 파일을 hint_dir → data/raw → BASE_DIR 순으로 탐색"""
    candidates = []
    if hint_dir:
        candidates.append(Path(hint_dir) / TOOL_FILE_NAME)
    candidates += [
        DATA_RAW_DIR / TOOL_FILE_NAME,
        BASE_DIR / TOOL_FILE_NAME,
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(
        f"툴 파일을 찾을 수 없습니다: {TOOL_FILE_NAME}\n"
        f"검색 경로: {[str(c) for c in candidates]}"
    )
