"""
WMS 피킹 생산성 자동화 파이프라인
사용법: python main.py <excel_file_path>
"""
import sys
from pathlib import Path

from src.ingestion.loader import load_excel
from src.calculation.standard_time import calculate
from src.db.repository import init_db, save


def run(file_path: str) -> None:
    print(f"[1/4] DB 초기화...")
    init_db()

    print(f"[2/4] Excel 로드: {file_path}")
    df = load_excel(file_path)
    print(f"      {len(df)}건 로드 완료")

    print(f"[3/4] 표준시간 계산...")
    df = calculate(df)

    print(f"[4/4] DB 저장...")
    saved = save(df)
    print(f"      {saved}건 저장 완료")
    print("파이프라인 완료.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python main.py <excel_file_path>")
        sys.exit(1)
    run(sys.argv[1])
