import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_RAW_DIR       = BASE_DIR / "data" / "raw"
DATA_PROCESSED_DIR = BASE_DIR / "data" / "processed"
DATA_ARCHIVE_DIR   = BASE_DIR / "data" / "archive"
OUTPUTS_DIR        = BASE_DIR / "outputs"

# SQLite (마이그레이션용으로만 유지)
DB_PATH = BASE_DIR / "data" / "productivity.db"

# PostgreSQL
PG_HOST     = os.getenv("PG_HOST",     "localhost")
PG_PORT     = os.getenv("PG_PORT",     "5432")
PG_DATABASE = os.getenv("PG_DATABASE", "wms_productivity")
PG_USER     = os.getenv("PG_USER",     "wms_user")
PG_PASSWORD = os.getenv("PG_PASSWORD", "wms1234")

DB_URL = (
    f"postgresql+psycopg2://{PG_USER}:{PG_PASSWORD}"
    f"@{PG_HOST}:{PG_PORT}/{PG_DATABASE}"
)

# 기준값 툴 파일 — data/raw/ 또는 BASE_DIR에 위치
TOOL_FILE_NAME = "양지센터 피킹 가동율_05.12.xlsx"


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
