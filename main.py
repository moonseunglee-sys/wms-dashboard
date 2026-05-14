"""
WMS 피킹 생산성 자동화 파이프라인
사용법:
  python main.py <raw_data.xlsx>                        # 퍼시스
  python main.py <raw_data.xlsx> --owner 일룸           # 일룸 (날짜 자동감지)
  python main.py <raw_data.xlsx> --owner 일룸 --date 2026-05-12
  python main.py <raw_data.xlsx> --owner 일룸 --validate-worker 이재형
"""
import argparse
from pathlib import Path

from config.settings import find_tool_file, OUTPUTS_DIR, get_travel_factor
from src.ingestion.reference_loader import load_reference_tables
from src.ingestion.loader import load_and_sort, load_iloom
from src.calculation.standard_time import (
    calc_standard_times,
    calc_cumulative,
    calc_picking_summary,
    export_results,
)
from src.calculation.validate import validate_sheet
from src.db.repository import init_db, save


def run(raw_path: str, tool_path: str | None = None, owner: str = "퍼시스",
        date: str | None = None, validate_worker: str | None = None,
        validate_wave: str | None = None) -> None:

    raw = Path(raw_path)

    print(f"[1/6] DB 초기화...")
    init_db()

    print(f"[2/6] 기준값 로드...")
    tool = Path(tool_path) if tool_path else find_tool_file(raw.parent)
    print(f"      툴 파일: {tool}")
    ref = load_reference_tables(tool)

    print(f"[3/6] Raw data 로드 ({owner})...")
    if owner == "일룸":
        df = load_iloom(raw, target_date=date)
        shift_info = f"  주간 {(df['shift_type']=='주간').sum()}행 / 야간 {(df['shift_type']=='야간').sum()}행"
    else:
        df = load_and_sort(raw)
        shift_info = ""
    print(f"      {len(df)}행  작업자 {df['작업자'].nunique()}명  Wave {df['WAVE명'].nunique()}개{shift_info}")

    travel_factor = get_travel_factor(owner)
    if travel_factor != 1.0:
        print(f"      이동시간 factor: {travel_factor:.2f} ({owner} 속도 보정)")

    print(f"[4/6] 표준시간 계산 (15개 세부시간)...")
    detail_df = calc_standard_times(df, ref, travel_factor=travel_factor)

    print(f"[5/6] 누계 집계...")
    detail_df = calc_cumulative(detail_df)
    summary_df = calc_picking_summary(detail_df)

    print(f"[6/6] DB 저장 및 Excel 출력...")
    save(detail_df, table="picking_detail")

    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    sheet_suffix = "I_1" if owner == "일룸" else "F_1"
    out_path = OUTPUTS_DIR / f"{raw.stem}_자동화결과.xlsx"
    export_results(detail_df, summary_df, str(out_path), sheet_suffix=sheet_suffix)

    print(f"\n{'='*60}")
    print(f"완료: {out_path}")
    print(f"\n[피킹실적 요약]")
    print(summary_df.to_string(index=False))

    # ── 일룸: I_1 검증
    if owner == "일룸":
        print(f"\n\n{'='*60}")
        print(f"[I_1 검증 시작]")
        validate_sheet(
            detail_df, str(tool),
            sheet_name="I_1",
            target_worker=validate_worker,
            target_wave=validate_wave,
        )


def _parse_args():
    p = argparse.ArgumentParser(description="WMS 피킹 생산성 자동화")
    p.add_argument("raw_path",           help="Raw data Excel 경로")
    p.add_argument("--tool",             default=None,   help="기준값 툴 파일 경로 (생략 시 자동 탐색)")
    p.add_argument("--owner",            default="퍼시스", help="퍼시스 | 일룸 (기본값: 퍼시스)")
    p.add_argument("--date",             default=None,   help="기준 날짜 (일룸용, 예: 2026-05-12)")
    p.add_argument("--validate-worker",  default=None,   help="상세 검증 출력할 작업자명")
    p.add_argument("--validate-wave",    default=None,   help="상세 검증 출력할 WAVE명")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run(
        args.raw_path,
        tool_path=args.tool,
        owner=args.owner,
        date=args.date,
        validate_worker=args.validate_worker,
        validate_wave=args.validate_wave,
    )
