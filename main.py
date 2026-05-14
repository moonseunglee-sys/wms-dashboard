"""
WMS 피킹 생산성 자동화 파이프라인
사용법: python main.py <raw_data.xlsx> [--tool <tool_file.xlsx>] [--owner 퍼시스|일룸]
"""
import sys
import argparse
from pathlib import Path

from config.settings import find_tool_file, OUTPUTS_DIR
from src.ingestion.reference_loader import load_reference_tables
from src.ingestion.loader import load_and_sort
from src.calculation.standard_time import (
    calc_standard_times,
    calc_cumulative,
    calc_picking_summary,
    export_results,
)
from src.db.repository import init_db, save


def run(raw_path: str, tool_path: str | None = None, owner: str = "퍼시스") -> None:
    raw = Path(raw_path)

    print(f"[1/6] DB 초기화...")
    init_db()

    print(f"[2/6] 기준값 로드...")
    tool = Path(tool_path) if tool_path else find_tool_file(raw.parent)
    print(f"      툴 파일: {tool}")
    ref = load_reference_tables(tool)

    print(f"[3/6] Raw data 로드 및 정렬: {raw.name}")
    df = load_and_sort(raw)
    print(f"      {len(df)}행  작업자 {df['작업자'].nunique()}명  Wave {df['WAVE명'].nunique()}개")

    print(f"[4/6] 표준시간 계산 (15개 세부시간)...")
    detail_df = calc_standard_times(df, ref)

    print(f"[5/6] 누계 집계...")
    detail_df = calc_cumulative(detail_df)
    summary_df = calc_picking_summary(detail_df)

    print(f"[6/6] DB 저장 및 Excel 출력...")
    save(detail_df, table="picking_detail")

    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUTS_DIR / f"{raw.stem}_자동화결과.xlsx"
    export_results(detail_df, summary_df, str(out_path))

    print(f"\n{'='*60}")
    print(f"완료: {out_path}")
    print(f"\n[피킹실적 요약]")
    print(summary_df.to_string(index=False))


def _parse_args():
    parser = argparse.ArgumentParser(description="WMS 피킹 생산성 자동화")
    parser.add_argument("raw_path", help="Raw data Excel 경로")
    parser.add_argument("--tool",  default=None, help="기준값 툴 파일 경로 (생략 시 자동 탐색)")
    parser.add_argument("--owner", default="퍼시스", help="퍼시스 | 일룸 (기본값: 퍼시스)")
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run(args.raw_path, tool_path=args.tool, owner=args.owner)
