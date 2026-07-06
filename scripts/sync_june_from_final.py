# -*- coding: utf-8 -*-
"""
6월 zones_{date}.json 을 종합실적_최종 기준값으로 전면 교체 후 DB 재적재

사용:
  python scripts/sync_june_from_final.py [--dry-run] [--no-db]
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

import openpyxl

BASE_DIR   = Path(__file__).resolve().parent.parent
FINAL_PATH = BASE_DIR / "data/master/2026년 06월 피킹 종합실적_최종.xlsx"
TEMP_DIR   = BASE_DIR / "data/temp"

# ── 종합실적 시트 구조 ─────────────────────────────────────────────
ZONE_STD_ROW = {
    "H-I": 10,  "C-D": 34,  "A-P": 58,  "DPS": 106,
    "E-F": 190, "J-K": 214, "L":   238, "B":   262, "L/S": 286,
    "M-N": 355, "S":   379, "W":   519, "R":   543,
}
COL_BASE = 4   # 6/1 = col 4

ZONE_CENTER = {
    "H-I": "양지1센터", "C-D": "양지1센터", "A-P": "양지1센터", "DPS": "양지1센터",
    "E-F": "양지1센터", "J-K": "양지1센터", "L":   "양지1센터", "B":   "양지1센터", "L/S": "양지1센터",
    "M-N": "양지2센터", "S":   "양지2센터",
    "W":   "양지3센터", "R":   "양지3센터",
}
ZONE_OWNER = {
    "H-I": "일룸",   "C-D": "일룸",   "A-P": "일룸",   "DPS": "일룸",
    "E-F": "퍼시스", "J-K": "퍼시스", "L":   "퍼시스", "B":   "퍼시스", "L/S": "퍼시스",
    "M-N": "데스커", "S":   "데스커",
    "W":   "3PL",    "R":   "3PL",
}


def _v(ws, row, col):
    val = ws.cell(row, col).value
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def load_final_all() -> dict[date, dict[str, dict]]:
    """종합실적 시트에서 6월 전체 읽기. 반환: {date: {zone: {metrics}}}"""
    wb = openpyxl.load_workbook(FINAL_PATH, read_only=True, data_only=True)
    ws = wb.worksheets[2]

    result: dict[date, dict[str, dict]] = {}
    for day in range(1, 31):  # 6/1 ~ 6/30
        d   = date(2026, 6, day)
        col = COL_BASE + (day - 1)
        day_data: dict[str, dict] = {}
        for zone, std_row in ZONE_STD_ROW.items():
            amt = _v(ws, std_row - 3, col)  # 피킹금액
            box = _v(ws, std_row - 1, col)  # 박스수
            std = _v(ws, std_row + 0, col)  # 표준시간(hr)
            wms = _v(ws, std_row + 10, col) # WMS시간(hr)
            act = _v(ws, std_row + 11, col) # 실적시간(hr)
            # 표준시간이 0이거나 null이면 해당 구역 미운영
            if not std:
                continue
            day_data[zone] = {
                "pick_amount": amt,
                "pick_box":    int(box) if box is not None else None,
                "std_time_hr": round(std, 4),
                "act_time_hr": round(act, 4) if act is not None else None,
                "wms_time_hr": round(wms, 4) if wms is not None else None,
            }
        if day_data:
            result[d] = day_data

    wb.close()
    return result


def build_zones_json(d: date, day_data: dict[str, dict]) -> list[dict]:
    records = []
    for zone, m in day_data.items():
        records.append({
            "work_date":   str(d),
            "center":      ZONE_CENTER[zone],
            "owner":       ZONE_OWNER[zone],
            "zone":        zone,
            "std_time_hr": m["std_time_hr"],
            "act_time_hr": m["act_time_hr"],
            "pick_amount": m["pick_amount"],
            "pick_box":    m["pick_box"],
            "wms_time_hr": m["wms_time_hr"],
        })
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="파일/DB 저장 생략")
    ap.add_argument("--no-db",   action="store_true", help="DB 적재 생략")
    args = ap.parse_args()

    print(f"종합실적_최종 읽는 중: {FINAL_PATH.name}")
    final_data = load_final_all()
    print(f"  → {len(final_data)}개 날짜 데이터 로드 완료\n")

    # 날짜별 처리
    print(f"  {'날짜':>12}  {'구역수':>5}  {'피킹금액합':>18}  {'총박스':>8}")
    print(f"  {'-'*55}")
    saved_dates = []
    for d in sorted(final_data.keys()):
        day_data = final_data[d]
        records  = build_zones_json(d, day_data)

        total_amt = sum((r["pick_amount"] or 0) for r in records)
        total_box = sum((r["pick_box"]    or 0) for r in records)
        print(f"  {d}  {len(records):>5}구역  {total_amt:>18,.0f}원  {total_box:>8,}박스")

        jf = TEMP_DIR / f"zones_{d}.json"
        if not args.dry_run:
            jf.write_text(
                json.dumps(records, ensure_ascii=False, indent=2),
                encoding="utf-8"
            )
        saved_dates.append(str(d))

    print(f"\n총 {len(saved_dates)}개 날짜 zones JSON {'저장됨' if not args.dry_run else '(dry-run 생략)'}")

    if args.dry_run or args.no_db:
        print("[DB 적재 건너뜀]")
        return

    # DB 재적재 (zone_daily만 — worker_daily는 건드리지 않음)
    print("\nDB 재적재 중 (load_picking_db.py zones only)...")
    date_args = []
    for ds in saved_dates:
        date_args += ["--date", ds]
    cmd = [sys.executable, str(BASE_DIR / "scripts/load_picking_db.py")] + date_args
    result = subprocess.run(cmd, capture_output=False, text=True)
    if result.returncode == 0:
        print("\n[완료] 6월 전체 DB 재적재 성공")
    else:
        print(f"\n[오류] DB 적재 실패 (returncode={result.returncode})")


if __name__ == "__main__":
    main()
