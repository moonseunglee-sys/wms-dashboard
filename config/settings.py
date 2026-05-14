from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_RAW_DIR       = BASE_DIR / "data" / "raw"
DATA_PROCESSED_DIR = BASE_DIR / "data" / "processed"
DATA_ARCHIVE_DIR   = BASE_DIR / "data" / "archive"
OUTPUTS_DIR        = BASE_DIR / "outputs"

DB_PATH = BASE_DIR / "data" / "productivity.db"

# 기준값 툴 파일 — data/raw/ 또는 BASE_DIR에 위치
TOOL_FILE_NAME = "양지센터_피킹_가동율.xlsx"

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
