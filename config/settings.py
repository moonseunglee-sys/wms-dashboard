from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_RAW_DIR = BASE_DIR / "data" / "raw"
DATA_PROCESSED_DIR = BASE_DIR / "data" / "processed"
DATA_ARCHIVE_DIR = BASE_DIR / "data" / "archive"
OUTPUTS_DIR = BASE_DIR / "outputs"

DB_PATH = BASE_DIR / "data" / "productivity.db"

# 피킹 표준시간 설정 (초 단위)
STANDARD_TIME = {
    "pick_per_line": 30,       # 라인당 피킹 기준시간 (초)
    "travel_per_meter": 2,     # 이동거리 1m당 시간 (초)
    "pack_per_box": 60,        # 박스당 포장 기준시간 (초)
}

# Excel 컬럼 매핑 (실제 파일에 맞게 수정)
COLUMN_MAP = {
    "worker_id": "작업자ID",
    "worker_name": "작업자명",
    "work_date": "작업일자",
    "pick_lines": "피킹라인수",
    "pick_qty": "피킹수량",
    "travel_distance": "이동거리(m)",
    "work_start": "작업시작",
    "work_end": "작업종료",
}
