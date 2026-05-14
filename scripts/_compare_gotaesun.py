"""고태선 첫 번째 WAVE vs I_1 시트 직접 비교"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import pandas as pd
import openpyxl
from src.ingestion.reference_loader import load_reference_tables
from src.ingestion.loader import load_iloom
from src.calculation.standard_time import calc_standard_times, calc_cumulative
from config.settings import get_travel_factor

TOOL   = "data/raw/양지센터 피킹 가동율_05.12.xlsx"
RAW    = "data/raw/일룸_0512_0513.xlsx"
WORKER = "고태선"

pd.set_option("display.float_format", "{:.4f}".format)

# ── 1. 자동화 계산
ref = load_reference_tables(TOOL)
df  = load_iloom(RAW, "2026-05-12")
det = calc_standard_times(df, ref, travel_factor=get_travel_factor("일룸"))
det = calc_cumulative(det)

our = det[det["작업자"] == WORKER].reset_index(drop=True)
if our.empty:
    print(f"[오류] '{WORKER}' 자동화 결과 없음"); sys.exit(1)

our_waves = our["WAVE명"].unique().tolist()
print(f"=== 고태선 WAVE 목록 ({len(our_waves)}개) ===")
for i, w in enumerate(our_waves):
    print(f"  {i+1:2d}. {w}  ({len(our[our['WAVE명']==w])}행)")

# ── 2. I_1 시트 로드
wb = openpyxl.load_workbook(TOOL, read_only=True, data_only=True)
ws = wb["I_1"]
i1_all = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[9] == WORKER]
wb.close()

if not i1_all:
    print(f"\n[오류] I_1 시트에 '{WORKER}' 없음"); sys.exit(1)

# I_1 첫 번째 WAVE 추출
first_wave_i1 = str(i1_all[0][8])
i1_wave = [r for r in i1_all if str(r[8]) == first_wave_i1]

print(f"\n=== I_1 기준시트: {WORKER} / {first_wave_i1} ({len(i1_wave)}행) ===")
print(f"  {'#':>2}  {'LOCATION':<18} {'std(AS)':>8} {'work(AB)':>8} {'prime(AC)':>9} {'adj(AV)':>8}")
print("  " + "-" * 58)
for idx, r in enumerate(i1_wave):
    loc   = str(r[5] or "")
    std   = round(float(r[44] or 0), 4)
    work  = round(float(r[27] or 0), 4)
    prime = round(float(r[28] or 0), 4)
    adj   = round(float(r[47] or 0), 4)
    print(f"  {idx:>2}  {loc:<18} {std:>8.4f} {work:>8.4f} {prime:>9.4f} {adj:>8.4f}")
i1_sum_std = sum(float(r[44] or 0) for r in i1_wave)
i1_sum_adj = sum(float(r[47] or 0) for r in i1_wave)
print("  " + "-" * 58)
print(f"  {'합계':<20} {i1_sum_std:>8.4f}  {'':>8}  {'':>9} {i1_sum_adj:>8.4f}")

# ── 3. 자동화 결과 - 같은 WAVE 추출
our_first = our_waves[0]
our_wave = our[our["WAVE명"] == our_first].reset_index(drop=True)

print(f"\n=== 자동화 계산: {WORKER} / {our_first} ({len(our_wave)}행) ===")
detail_cols = [
    "LOCATION",
    "시작_zone간_min","시작_rack간_min","시작_loc간_min",
    "끝_zone간_min","끝_rack간_min","끝_loc간_min",
    "zone간_min","rack간_min","loc간_min",
    "피킹단수_min","품목바코드_min","피킹시간_min","loc바코드_min",
    "공파렛트_min","라벨링복귀_min",
    "예상작업시간_min","작업소요시간_min",
]
print(our_wave[[c for c in detail_cols if c in our_wave.columns]].to_string(index=True))

# ── 4. 직접 비교 — I_1 WAVE와 동일한 WAVE를 자동화에서 찾아 매칭
print(f"\n{'='*72}")
print(f"직접 비교: {WORKER}")
print(f"  I_1   첫 WAVE: {first_wave_i1}")

# I_1 첫 WAVE와 이름이 같은 WAVE를 자동화에서 탐색
if first_wave_i1 in our_waves:
    our_wave_matched = our[our["WAVE명"] == first_wave_i1].reset_index(drop=True)
    print(f"  자동화 매칭: {first_wave_i1} ({len(our_wave_matched)}행) [WAVE명 일치]")
else:
    our_wave_matched = our_wave  # fallback: 자동화 첫 WAVE
    print(f"  자동화 fallback: {our_first} ({len(our_wave_matched)}행) [WAVE명 불일치]")

n = min(len(our_wave_matched), len(i1_wave))
print(f"  비교 행수: {n}행")
print(f"\n  {'':3} {'LOCATION':<18} {'I1_std':>7} {'자동화':>7} {'차이':>7} | {'I1_adj':>7} {'자동화':>7} {'차이':>7}")
print("  " + "-" * 74)
diffs_std, diffs_adj = [], []
for j in range(n):
    r   = i1_wave[j]
    o   = our_wave_matched.iloc[j]
    i1s = round(float(r[44] or 0), 4)
    i1a = round(float(r[47] or 0), 4)
    ds  = round(o["예상작업시간_min"] - i1s, 4)
    da  = round(o["작업소요시간_min"] - i1a, 4)
    diffs_std.append(abs(ds)); diffs_adj.append(abs(da))
    flag = "O" if abs(ds) < 0.005 else "X"
    loc  = str(r[5] or "")
    print(f"  {flag} {loc:<18} {i1s:>7.4f} {o['예상작업시간_min']:>7.4f} {ds:>+7.4f} | "
          f"{i1a:>7.4f} {o['작업소요시간_min']:>7.4f} {da:>+7.4f}")

i1_sum  = sum(float(r[44] or 0) for r in i1_wave[:n])
our_sum = our_wave_matched["예상작업시간_min"].iloc[:n].sum()
print("  " + "-" * 74)
print(f"  {'합계':<22} {i1_sum:>7.4f} {our_sum:>7.4f} {our_sum-i1_sum:>+7.4f}")
print(f"\n  표준시간 MAE:     {sum(diffs_std)/len(diffs_std):.4f}분")
print(f"  작업소요시간 MAE: {sum(diffs_adj)/len(diffs_adj):.4f}분")
print(f"  일치(< 0.005분):  {sum(1 for d in diffs_std if d < 0.005)}/{n}행")
