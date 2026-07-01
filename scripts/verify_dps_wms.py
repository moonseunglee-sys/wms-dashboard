# -*- coding: utf-8 -*-
"""
DPS WMS 근무시간 검증
  - 종합실적_최종 파일의 DPS WMS 행값  vs  raw 일룸 파일 타임스탬프 계산값
  - 비교 기간: 2026-06-01 ~ 2026-06-27
"""
import glob
import re
from datetime import date, timedelta
from pathlib import Path

import openpyxl
import pandas as pd

BASE_DIR   = Path(__file__).resolve().parent.parent
FINAL_PATH = BASE_DIR / "data/master/2026년 06월 피킹 종합실적_최종.xlsx"
RAW_DIR    = BASE_DIR / "data/raw"

# 종합실적_최종 DPS 블록:
#   ZONE_STD_ROW_FINAL["DPS"]=106 → std=106, act=117(+11), wms=116(+10=ar-1)
DPS_WMS_ROW  = 116
COL_BASE     = 4   # 6/1 = 4번째 열, 이후 +1/day


# ── 종합실적_최종에서 날짜별 DPS WMS 읽기 ───────────────────────────────
def read_final_wms(ws_final) -> dict:
    """sheet 3번(종합실적)에서 DPS WMS 값을 날짜별로 반환 {date: float}"""
    out = {}
    for day in range(1, 28):  # 6/1~6/27
        d   = date(2026, 6, day)
        col = COL_BASE + (day - 1)
        v   = ws_final.cell(DPS_WMS_ROW, col).value
        try:
            out[d] = float(v) if v is not None else None
        except (TypeError, ValueError):
            out[d] = None
    return out


# ── raw 일룸 파일에서 DPS 타임스탬프 기반 WMS 계산 ─────────────────────
def find_iloom_raw(t: date) -> Path | None:
    mmdd = t.strftime("%m%d")
    nxdd = (t + timedelta(days=1)).strftime("%m%d")
    d    = RAW_DIR / t.strftime("%Y/%m")
    for pat in [f"일룸_{mmdd}_{nxdd}.xlsx", f"일룸_{mmdd}*.xlsx"]:
        hits = sorted(glob.glob(str(d / pat)))
        if hits:
            return Path(hits[0])
    return None


_DPS_PAT = re.compile(r"^P-(\d+)", re.IGNORECASE)


def calc_dps_wms(t: date) -> tuple[float | None, int, str | None]:
    """
    raw 일룸 파일에서 DPS 행 타임스탬프 min~max → 시간 계산.
    Returns: (wms_hr, dps_row_count, raw_filename)
    """
    p = find_iloom_raw(t)
    if not p:
        return None, 0, None

    df = pd.read_excel(p)
    df.columns = df.columns.str.strip().str.replace(r"\s+", "_", regex=True)
    raw_col = df["작업일시"].astype(str).str.replace("T", " ", regex=False)
    try:
        df["작업일시"] = pd.to_datetime(raw_col, errors="coerce", format="mixed")
    except TypeError:
        df["작업일시"] = pd.to_datetime(raw_col, errors="coerce")
    df = df.dropna(subset=["작업일시"])

    # 주간 윈도우 (08:00~20:59)
    ts        = pd.Timestamp(t)
    day_start = ts.replace(hour=8,  minute=0,  second=0)
    day_end   = ts.replace(hour=20, minute=59, second=59)
    df = df[df["작업일시"].between(day_start, day_end)]
    df = df[~df["LOCATION"].astype(str).str.upper().str.startswith("Y-REC")]

    # DPS = P-3XX 위치만 (주간)
    def _is_dps(loc: str) -> bool:
        m = _DPS_PAT.match(str(loc).strip())
        return bool(m) and int(m.group(1)) >= 300

    dps_mask = df["LOCATION"].astype(str).apply(_is_dps)
    dps_df   = df[dps_mask]

    n = len(dps_df)
    if n < 2:
        return 0.0, n, p.name

    min_k = dps_df["작업일시"].min()
    max_k = dps_df["작업일시"].max()
    wms   = round((max_k - min_k).total_seconds() / 3600, 4)
    return wms, n, p.name


# ── 메인 ───────────────────────────────────────────────────────────────
def main():
    if not FINAL_PATH.exists():
        print(f"파일 없음: {FINAL_PATH}")
        return

    print(f"종합실적_최종 열기 중...")
    wb       = openpyxl.load_workbook(FINAL_PATH, read_only=True, data_only=True)
    ws_final = wb.worksheets[2]  # 3번째 시트 = 종합실적
    final_wms = read_final_wms(ws_final)
    wb.close()
    print(f"  완료 (DPS WMS row={DPS_WMS_ROW})\n")

    print(f"{'날짜':<12} {'종합실적_최종':>14} {'타임스탬프계산':>14} {'차이':>9} {'오차%':>7}  {'DPS행수':>7}  파일명")
    print("-" * 95)

    diffs = []
    no_raw  = []
    no_data = []

    for day in range(1, 28):
        d         = date(2026, 6, day)
        final_v   = final_wms.get(d)
        calc_v, n_rows, fname = calc_dps_wms(d)

        f_str = f"{final_v:.4f}h" if final_v else "   -    "
        c_str = f"{calc_v:.4f}h"  if calc_v  else "   -    "

        if fname is None:
            no_raw.append(str(d))
            print(f"  {d}  {f_str:>14}  {'raw없음':>14}")
            continue

        if final_v and calc_v and calc_v > 0:
            diff     = final_v - calc_v
            diff_pct = abs(diff) / final_v * 100
            flag     = "O" if diff_pct <= 10 else ("△" if diff_pct <= 20 else "X")
            diffs.append((d, final_v, calc_v, diff, diff_pct))
            diff_str = f"{diff:+.3f}h {diff_pct:5.1f}% {flag}"
        elif calc_v == 0 and n_rows < 2:
            no_data.append(str(d))
            diff_str = "(DPS 행 부족)"
        else:
            diff_str = "   -"

        print(f"  {d}  {f_str:>14}  {c_str:>14}  {diff_str:>18}  {n_rows:>6}  {fname or ''}")

    print("-" * 95)

    if diffs:
        vals      = [(f, c) for _, f, c, _, _ in diffs]
        avg_final = sum(f for f, _ in vals) / len(vals)
        avg_calc  = sum(c for _, c in vals) / len(vals)
        avg_diff  = avg_final - avg_calc
        avg_pct   = sum(p for _, _, _, _, p in diffs) / len(diffs)
        max_pct   = max(p for _, _, _, _, p in diffs)
        print(f"  평균 (n={len(diffs)})   {avg_final:>12.4f}h  {avg_calc:>12.4f}h  "
              f"{avg_diff:+.3f}h  평균오차={avg_pct:.1f}%  최대오차={max_pct:.1f}%")
        print(f"\n  판정 기준: O=±10%이내  △=±20%이내  X=±20%초과")

    if no_raw:
        print(f"\n  raw파일 없음 (휴일/미처리): {', '.join(no_raw)}")
    if no_data:
        print(f"  DPS 행수 부족 (DPS미운영): {', '.join(no_data)}")


if __name__ == "__main__":
    main()
