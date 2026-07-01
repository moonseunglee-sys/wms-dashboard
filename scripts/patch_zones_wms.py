# -*- coding: utf-8 -*-
"""
6월 zones JSON에 wms_time_hr 패치 후 DB 적재

방식:
  - 6/1~6/27: 종합실적_최종에서 구역별 WMS 읽기 (비DPS) + 타임스탬프 계산 (DPS)
  - 6/28~: DPS만 타임스탬프 계산, 비DPS는 NULL
  - 기존 zones_{date}.json에 wms_time_hr 추가 저장
  - 완료 후 load_picking_db.py 를 통해 DB에 재적재

Usage:
  python scripts/patch_zones_wms.py [--dry-run] [--no-db]
"""
import argparse
import glob
import json
import re
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import openpyxl
import pandas as pd
from dotenv import load_dotenv

BASE_DIR   = Path(__file__).resolve().parent.parent
FINAL_PATH = BASE_DIR / "data/master/2026년 06월 피킹 종합실적_최종.xlsx"
RAW_DIR    = BASE_DIR / "data/raw"
TEMP_DIR   = BASE_DIR / "data/temp"
load_dotenv(BASE_DIR / ".env")

# 종합실적_최종 구역별 표준시간 행 (picking_automation_v2.py ZONE_STD_ROW_FINAL과 동일)
ZONE_STD_ROW_FINAL = {
    "H-I": 10,  "C-D": 34,  "A-P": 58,  "DPS": 106,
    "E-F": 190, "J-K": 214, "L":   238, "B":   262, "L/S": 286,
    "M-N": 355, "S":   379, "W":   519, "R":   543,
}
# WMS 행 = std_row + 10  (act = std+11, wms = act-1 = std+10)
ZONE_WMS_ROW = {z: r + 10 for z, r in ZONE_STD_ROW_FINAL.items()}

COL_BASE = 4  # 종합실적_최종: 6/1 = col 4


# ── 종합실적_최종 전체 WMS 로드 ─────────────────────────────────────
def load_final_wms() -> dict[str, dict[date, float | None]]:
    """반환: {zone: {date: wms_hr}}  (6/1~6/27)"""
    if not FINAL_PATH.exists():
        print(f"  [경고] 종합실적_최종 없음: {FINAL_PATH}")
        return {}

    wb = openpyxl.load_workbook(FINAL_PATH, read_only=True, data_only=True)
    ws = wb.worksheets[2]

    out: dict[str, dict[date, float | None]] = {}
    for zone, wms_row in ZONE_WMS_ROW.items():
        zm: dict[date, float | None] = {}
        for day in range(1, 28):  # 6/1~6/27
            d   = date(2026, 6, day)
            col = COL_BASE + (day - 1)
            v   = ws.cell(wms_row, col).value
            try:
                zm[d] = round(float(v), 4) if v is not None else None
            except (TypeError, ValueError):
                zm[d] = None
        out[zone] = zm

    wb.close()
    return out


# ── DPS WMS: 타임스탬프 min~max 계산 ──────────────────────────────
_DPS_PAT = re.compile(r"^P-(\d+)", re.IGNORECASE)


def _find_iloom_raw(t: date) -> Path | None:
    mmdd = t.strftime("%m%d")
    nxdd = (t + timedelta(days=1)).strftime("%m%d")
    d    = RAW_DIR / t.strftime("%Y/%m")
    for pat in [f"일룸_{mmdd}_{nxdd}.xlsx", f"일룸_{mmdd}*.xlsx"]:
        hits = sorted(glob.glob(str(d / pat)))
        if hits:
            return Path(hits[0])
    return None


def calc_dps_wms(t: date) -> float | None:
    p = _find_iloom_raw(t)
    if not p:
        return None
    df = pd.read_excel(p)
    df.columns = df.columns.str.strip().str.replace(r"\s+", "_", regex=True)
    raw_col = df["작업일시"].astype(str).str.replace("T", " ", regex=False)
    try:
        df["작업일시"] = pd.to_datetime(raw_col, errors="coerce", format="mixed")
    except TypeError:
        df["작업일시"] = pd.to_datetime(raw_col, errors="coerce")
    df = df.dropna(subset=["작업일시"])

    ts        = pd.Timestamp(t)
    day_start = ts.replace(hour=8,  minute=0,  second=0)
    day_end   = ts.replace(hour=20, minute=59, second=59)
    df = df[df["작업일시"].between(day_start, day_end)]
    df = df[~df["LOCATION"].astype(str).str.upper().str.startswith("Y-REC")]

    dps_mask = df["LOCATION"].astype(str).apply(
        lambda loc: bool(_DPS_PAT.match(str(loc).strip())) and
                    int(_DPS_PAT.match(str(loc).strip()).group(1)) >= 300
    )
    dps_df = df[dps_mask]
    if len(dps_df) < 2:
        return None
    min_k = dps_df["작업일시"].min()
    max_k = dps_df["작업일시"].max()
    return round((max_k - min_k).total_seconds() / 3600, 4)


# ── 메인 ──────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="JSON 저장 / DB 적재 생략")
    ap.add_argument("--no-db",   action="store_true", help="DB 적재 생략 (JSON만 저장)")
    args = ap.parse_args()

    # zones JSON 파일 목록 탐색
    json_files = sorted(TEMP_DIR.glob("zones_2026-06-*.json"))
    if not json_files:
        print("zones JSON 파일 없음")
        return

    print(f"대상 파일: {len(json_files)}개\n")

    # 종합실적_최종 WMS 일괄 로드
    print("종합실적_최종 WMS 로드 중...")
    final_wms = load_final_wms()
    print(f"  완료: {len(final_wms)}개 구역 × 최대 27일\n")

    # DPS WMS 날짜별 사전 계산
    print("DPS 타임스탬프 기반 WMS 계산 중...")
    dps_cache: dict[date, float | None] = {}
    all_dates = set()
    for jf in json_files:
        m = re.search(r"zones_(\d{4}-\d{2}-\d{2})\.json", jf.name)
        if m:
            all_dates.add(date.fromisoformat(m.group(1)))
    for d in sorted(all_dates):
        dps_cache[d] = calc_dps_wms(d)
        v = dps_cache[d]
        print(f"  {d}  DPS WMS = {v:.4f}h" if v else f"  {d}  DPS WMS = None (raw없음/미운영)")
    print()

    # 각 zones JSON 패치
    patched_dates = []
    print(f"{'날짜':<12} {'소스':^10}  " + "  ".join(f"{z:>5}" for z in ["H-I","C-D","A-P","DPS","E-F","M-N","W","R"]))
    print("-" * 100)

    for jf in sorted(json_files):
        m = re.search(r"zones_(\d{4}-\d{2}-\d{2})\.json", jf.name)
        if not m:
            continue
        d = date.fromisoformat(m.group(1))
        data = json.loads(jf.read_text(encoding="utf-8"))

        source = "최종파일" if d <= date(2026, 6, 27) else "TS계산만"
        wms_by_zone: dict[str, float | None] = {}

        for rec in data:
            zone = rec["zone"]
            if zone == "DPS":
                wms_by_zone[zone] = dps_cache.get(d)
            elif d <= date(2026, 6, 27):
                wms_by_zone[zone] = (final_wms.get(zone) or {}).get(d)
            else:
                wms_by_zone[zone] = None  # 최종파일 범위 밖: NULL

        # JSON 레코드에 wms_time_hr 추가
        for rec in data:
            rec["wms_time_hr"] = wms_by_zone.get(rec["zone"])

        if not args.dry_run:
            jf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

        patched_dates.append(str(d))

        # 샘플 출력 (주요 구역)
        sample_zones = ["H-I", "C-D", "A-P", "DPS", "E-F", "M-N", "W", "R"]
        vals = []
        for z in sample_zones:
            v = wms_by_zone.get(z)
            vals.append(f"{v:5.2f}" if v else "  - ")
        print(f"  {d}  [{source}]  " + "  ".join(vals))

    print(f"\n총 {len(patched_dates)}개 날짜 패치{'(dry-run)' if args.dry_run else ' 완료'}\n")

    if args.dry_run or args.no_db:
        print("[DB 적재 건너뜀]")
        return

    # DB 재적재
    print("DB 재적재 중 (load_picking_db.py)...")
    date_args = []
    for d in patched_dates:
        date_args += ["--date", d]
    cmd = [sys.executable, str(BASE_DIR / "scripts/load_picking_db.py")] + date_args
    result = subprocess.run(cmd, capture_output=False, text=True)
    if result.returncode == 0:
        print("\n[완료] DB 적재 성공")
    else:
        print(f"\n[오류] DB 적재 실패 (returncode={result.returncode})")


if __name__ == "__main__":
    main()
