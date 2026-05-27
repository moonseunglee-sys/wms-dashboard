"""
picking_automation_v2.py - 피킹 생산성 자동화 (Excel 기반 계산)

흐름:
  1. raw data 읽기 + 필터/정렬/가공
  2. 기준정보_마스터.xlsx F_1(퍼시스)/I_1(일룸),
     기준정보2_마스터.xlsx D_1(데스커)/DU_1(3PL) 에 데이터 덮어쓰기
  3. xlwings로 두 파일 수식 재계산
  4. 각 파일 종합실적 시트에서 결과 읽기
  5. Supabase zone_daily 테이블에 upsert

Usage:
  python scripts/picking_automation_v2.py --date 2026-05-12
"""

import argparse
import glob
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

BASE_DIR = Path(__file__).parent.parent
load_dotenv(BASE_DIR / ".env")

MASTER1  = BASE_DIR / "data" / "master" / "기준정보_마스터.xlsx"
MASTER2  = BASE_DIR / "data" / "master" / "기준정보2_마스터.xlsx"
LOC1     = BASE_DIR / "data" / "master" / "양지1센터_로케이션_정보.xlsx"
LOC2     = BASE_DIR / "data" / "master" / "양지2센터_로케이션_정보.xlsx"
LOC3     = BASE_DIR / "data" / "master" / "양지3센터_로케이션_정보.xlsx"
DATA_DIR = BASE_DIR / "data" / "raw"

SUPABASE_URL = os.getenv("SUPABASE_URL", "")

# 출고지역 판별 (퍼시스/일룸): 경XX-, 광주XX-, 전남XXX- → 지방
_REGION_RE = re.compile(r'경\d{2}-|광주\d{2}-|전남\d{3}-')

# 3PL 제외 브랜드 (OWNER 컬럼)
_3PL_EXCL = {"퍼시스", "일룸", "데스커", "시디즈", "알로소", "슬로우베드"}

# 양지1센터 유효 피킹 zone (P/S는 DPS로 변환 전 내부 구분자)
_VALID_Z1 = {"A-P", "B", "C-D", "E-F", "H-I", "J-K", "L", "L/S", "P/S"}

# 로케이션 마스터 캐시
_loc_cache: dict = {}



# ── 로케이션 마스터 로드 (LOCATION ID → ZONE) ────────────────────────
def _load_loc_map(path: Path) -> dict:
    key = str(path)
    if key in _loc_cache:
        return _loc_cache[key]
    df = pd.read_excel(path, usecols=[2, 3], header=0)
    df.columns = ["zone", "loc_id"]
    m = {
        str(r.loc_id).strip(): str(r.zone).strip()
        for r in df.itertuples()
        if pd.notna(r.loc_id) and pd.notna(r.zone)
    }
    _loc_cache[key] = m
    return m


# ── Zone 매핑 함수 ────────────────────────────────────────────────────

def _zone1(loc: str, lm: dict) -> str | None:
    """양지1센터 LOCATION → zone. None이면 집계 제외."""
    if not loc or not isinstance(loc, str):
        return None
    loc = loc.strip()

    # Y-REC 제외
    if re.match(r'^Y-REC', loc, re.IGNORECASE):
        return None

    # P-110* → H-I (override)
    if re.match(r'^P-110', loc, re.IGNORECASE):
        return 'H-I'

    # P-3XX+ → P/S (→ 이후 DPS 변환)
    m = re.match(r'^P-(\d+)', loc, re.IGNORECASE)
    if m and int(m.group(1)) >= 300:
        return 'P/S'

    # L-101*, L-102* → L/S (override)
    if re.match(r'^L-10[12]-', loc, re.IGNORECASE):
        return 'L/S'

    # 로케이션 마스터 조회
    raw = lm.get(loc)
    if not raw:
        return None

    # 괄호 제거: 'L(반품)' → 'L', '(반품)C-D' → 'C-D'
    cleaned = re.sub(r'\(반품\)', '', raw).strip()

    # GRD → H-I
    if cleaned == 'GRD':
        return 'H-I'

    return cleaned if cleaned in _VALID_Z1 else None


# 양지2센터: M/N → M-N 통합, S → S
_ZONE2_MAP = {'M': 'M-N', 'N': 'M-N', 'S': 'S'}


def _zone2(loc: str, lm: dict) -> str | None:
    """양지2센터 LOCATION → zone."""
    if not loc or not isinstance(loc, str):
        return None
    raw = lm.get(loc.strip())
    if not raw:
        return None
    cleaned = re.sub(r'\(반품\)|\(보관\)', '', raw).strip()
    return _ZONE2_MAP.get(cleaned)


# 양지3센터: W → W, T1/T3/T4/R → R (피킹실적 R 집계 구조에 맞춤)
_ZONE3_MAP = {'W': 'W', 'T1': 'R', 'T3': 'R', 'T4': 'R', 'R': 'R'}


def _zone3(loc: str, lm: dict) -> str | None:
    """양지3센터 LOCATION → zone."""
    if not loc or not isinstance(loc, str):
        return None
    raw = lm.get(loc.strip())
    if not raw:
        return None
    return _ZONE3_MAP.get(raw.strip())


# ── Raw 파일 탐색 ──────────────────────────────────────────────────────
def find_raw(target: date, owner: str) -> Path | None:
    mmdd = target.strftime("%m%d")
    nxdd = (target + timedelta(days=1)).strftime("%m%d")
    d = DATA_DIR / target.strftime("%Y/%m")
    patterns = {
        "퍼시스": [f"퍼시스_{mmdd}.xlsx"],
        "일룸":   [f"일룸_{mmdd}_{nxdd}.xlsx", f"일룸_{mmdd}*.xlsx"],
        "데스커": [f"데스커_{mmdd}_{nxdd}.xlsx", f"데스커_{mmdd}*.xlsx"],
        "3PL":    [f"3센터_{mmdd}.xlsx"],
    }
    for pat in patterns.get(owner, []):
        hits = sorted(glob.glob(str(d / pat)))
        if hits:
            return Path(hits[0])
    return None


# ── Raw 데이터 로드 ────────────────────────────────────────────────────
def _load(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path)
    df.columns = df.columns.str.strip()
    df["작업일시"] = pd.to_datetime(df["작업일시"], errors="coerce")
    return df.dropna(subset=["작업일시"])


# ── 필터 함수 ──────────────────────────────────────────────────────────
def _filter_f1(df: pd.DataFrame, t: date) -> pd.DataFrame:
    """퍼시스 F_1: 08:01~20:59, Y-REC 제외"""
    ts = pd.Timestamp(t)
    df = df[df["작업일시"].between(
        ts.replace(hour=8, minute=1, second=0),
        ts.replace(hour=20, minute=59, second=59),
    )]
    return df[~df["LOCATION"].astype(str).str.upper().str.startswith("Y-REC")]


def _filter_i1(df: pd.DataFrame, t: date) -> pd.DataFrame:
    """일룸 I_1: 주간(08:01~20:59) + 야간(21:00~익일 08:00), Y-REC 제외"""
    ts  = pd.Timestamp(t)
    tsn = ts + pd.Timedelta(days=1)
    주  = df[df["작업일시"].between(
        ts.replace(hour=8, minute=1, second=0),
        ts.replace(hour=20, minute=59, second=59),
    )]
    야  = df[df["작업일시"].between(
        ts.replace(hour=21, minute=0, second=0),
        tsn.replace(hour=8, minute=0, second=0),
    )]
    out = pd.concat([주, 야])
    return out[~out["LOCATION"].astype(str).str.upper().str.startswith("Y-REC")]


def _filter_d1(df: pd.DataFrame, t: date) -> pd.DataFrame:
    """데스커 D_1: 주간(08:01~20:59) + 야간(21:00~익일 08:00)"""
    ts  = pd.Timestamp(t)
    tsn = ts + pd.Timedelta(days=1)
    주  = df[df["작업일시"].between(
        ts.replace(hour=8, minute=1, second=0),
        ts.replace(hour=20, minute=59, second=59),
    )]
    야  = df[df["작업일시"].between(
        ts.replace(hour=21, minute=0, second=0),
        tsn.replace(hour=8, minute=0, second=0),
    )]
    return pd.concat([주, 야])


def _filter_du1(df: pd.DataFrame, t: date) -> pd.DataFrame:
    """3PL DU_1: 08:01~20:59, 그룹사(퍼시스/일룸/데스커 등) 제외"""
    ts = pd.Timestamp(t)
    df = df[df["작업일시"].between(
        ts.replace(hour=8, minute=1, second=0),
        ts.replace(hour=20, minute=59, second=59),
    )]
    return df[~df["OWNER"].astype(str).isin(_3PL_EXCL)]


# ── 시트 데이터 빌드 ───────────────────────────────────────────────────
def _region_c1(wave: str) -> str:
    """F_1/I_1 출고지역: 경XX-/광주XX-/전남XXX- → 지방, 나머지 → 소액"""
    return "지방" if _REGION_RE.search(str(wave)) else "소액"


def build_sheet_data(
    df: pd.DataFrame,
    zone_fn,
    fixed_region: str | None = None,
) -> pd.DataFrame:
    """
    raw DataFrame → 시트 A-L 컬럼 형식으로 변환.

    컬럼:
      A=zone+작업자 key, B=zone, C=오더번호, D=ITEM ID,
      E=수량, F=LOCATION, G=PLT ID, H=WAVE번호, I=WAVE명,
      J=작업자, K=작업일시, L=출고지역
    """
    records = []
    for _, row in df.iterrows():
        loc  = str(row.get("LOCATION", ""))
        zone = zone_fn(loc)
        if zone is None:
            continue

        worker    = str(row.get("작업자", ""))
        wave_name = str(row.get("WAVE명", ""))
        region    = fixed_region if fixed_region else _region_c1(wave_name)

        if zone == "P/S":
            zone = "DPS"
            # worker는 실제 작업자명 그대로 유지

        records.append({
            "A": zone + worker,                                    # DPS + 실제작업자명으로 SUMIF key 생성
            "B": zone,                                             # zone
            "C": row.get("오더번호", ""),
            "D": row.get("ITEM ID", row.get("ITEM_ID", "")),
            "E": row.get("피킹수량", 0),
            "F": loc,                                              # LOCATION
            "G": str(row.get("PLT ID", row.get("PLT_ID", ""))),
            "H": str(row.get("WAVE번호", "")),
            "I": wave_name,
            "J": worker,
            "K": row["작업일시"],
            "L": region,
        })

    if not records:
        return pd.DataFrame(columns=list("ABCDEFGHIJKL"))

    out = pd.DataFrame(records)
    # DPS: 작업자 > WAVE명 > TO팔레트(G) > 작업일시 > FROM로케이션(F)
    # 나머지: 작업자 > 작업일시 > WAVE명 > PLT ID > LOCATION
    dps  = out[out["B"] == "DPS"].sort_values(["J", "I", "G", "K", "F"])
    rest = out[out["B"] != "DPS"].sort_values(["J", "K", "I", "G", "F"])
    return pd.concat([rest, dps]).reset_index(drop=True)


# ── 종합실적 zone 행 위치 (1-indexed) ─────────────────────────────────

ZONE_ROWS_1: dict[str, tuple[int, int]] = {
    "H-I": (10,  21),
    "C-D": (34,  45),
    "A-P": (58,  69),
    "DPS": (106, 117),
    "E-F": (188, 199),
    "J-K": (212, 223),
    "L":   (236, 247),
    "B":   (260, 271),
    "L/S": (284, 295),
}

ZONE_ROWS_2: dict[str, tuple[int, int]] = {
    "M-N": (10,  21),
    "S":   (34,  45),
    "W":   (188, 199),
    "R":   (212, 223),
}


# pywin32이 Excel 오류 셀을 반환하는 정수 코드 (#N/A, #VALUE!, #REF! 등)
_XL_ERROR_CODES: frozenset = frozenset({
    -2146826246,  # #N/A
    -2146826252,  # #NUM!
    -2146826259,  # #NAME?
    -2146826265,  # #REF!
    -2146826273,  # #VALUE!
    -2146826281,  # #DIV/0!
    -2146826288,  # #NULL!
})


def _safe_hr(v) -> float:
    """Excel 셀 값을 float 시간으로 변환. 오류 코드·NaN → 0.0."""
    if not isinstance(v, (int, float)):
        return 0.0
    if isinstance(v, float) and v != v:  # NaN
        return 0.0
    if isinstance(v, int) and v in _XL_ERROR_CODES:
        return 0.0
    return float(v)


def _df_to_rows(df: pd.DataFrame) -> list:
    """DataFrame A-L → 2D 리스트. NaN/NaT → None, Timestamp → datetime 변환."""
    out = []
    for row in df[list("ABCDEFGHIJKL")].itertuples(index=False):
        clean = []
        for v in row:
            try:
                if pd.isna(v):
                    clean.append(None)
                    continue
            except (TypeError, ValueError):
                pass
            if isinstance(v, pd.Timestamp):
                clean.append(v.to_pydatetime().replace(tzinfo=None))
            else:
                clean.append(v)
        out.append(clean)
    return out


def _xw_write_sheet(ws, df: pd.DataFrame):
    """pywin32 COM 워크시트에 A-L 데이터 덮어쓰기 (기존 데이터 초기화 후 작성)."""
    last_row = ws.UsedRange.Row + ws.UsedRange.Rows.Count - 1
    if last_row >= 2:
        ws.Range(f"A2:L{last_row}").ClearContents()
    rows = _df_to_rows(df)
    if rows:
        data = tuple(tuple(r) for r in rows)
        ws.Range(ws.Cells(2, 1), ws.Cells(1 + len(rows), 12)).Value = data
    print(f"    [{ws.Name}] {len(df)}행 작성 완료")


def _xw_read_results(ws, zone_rows: dict) -> dict:
    """pywin32 COM 워크시트 '종합실적' D열(col=4) 에서 표준/실적시간 읽기."""
    col = 4
    results: dict = {}
    for zone, (std_row, act_row) in zone_rows.items():
        s = ws.Cells(std_row, col).Value
        a = ws.Cells(act_row, col).Value
        results[zone] = {
            "std_time_hr": _safe_hr(s),
            "act_time_hr": _safe_hr(a),
        }
    return results


TEMP_DIR = BASE_DIR / "data" / "temp"
TEMP1    = TEMP_DIR / "tmp_master1.xlsx"
TEMP2    = TEMP_DIR / "tmp_master2.xlsx"

# 피킹실적 시트 C열 슬롯 (1-indexed, 양끝 포함)
_PICKING_SLOTS_1: dict[str, tuple[int, int]] = {
    "H-I": (7,   56),
    "C-D": (58,  107),
    "A-P": (109, 158),
    "DPS": (167, 216),
}
_PICKING_SLOTS_2: dict[str, tuple[int, int]] = {
    "M-N": (7,  56),
    "S":   (58, 107),
}


def _write_picking_workers_com(
    wb,  # pywin32 Workbook COM object
    zone_slots: dict[str, tuple[int, int]],
    source_df: pd.DataFrame,
) -> None:
    """pywin32 COM으로 피킹실적 C열에 zone별 작업자명 작성.
    source_df: B열=zone, J열=작업자명
    """
    ws = wb.Worksheets("피킹실적")
    try:
        ws.Unprotect()
    except Exception:
        pass
    for zone, (start_row, end_row) in zone_slots.items():
        mask = source_df["B"] == zone
        workers = list(dict.fromkeys(source_df.loc[mask, "J"].dropna().tolist()))
        slot_size = end_row - start_row + 1
        # 셀 단위 루프 대신 Range 한 번에 쓰기 (RPC_E_CALL_REJECTED 방지)
        col_data = tuple(
            (workers[i],) if i < len(workers) else (None,)
            for i in range(slot_size)
        )
        ws.Range(ws.Cells(start_row, 3), ws.Cells(end_row, 3)).Value = col_data
        print(f"      [{zone}] {len(workers)}명 작성 (슬롯 {slot_size}행)")
    print(f"    피킹실적 C열 작성 완료: {wb.Name}")


def process_workbooks(
    sd_f1: pd.DataFrame,
    sd_i1: pd.DataFrame,
    sd_d1: pd.DataFrame,
    sd_du1: pd.DataFrame,
    date_str: str,
) -> tuple[dict, dict]:
    """
    원본 마스터 파일을 data/temp/에 복사한 뒤 복사본에 데이터 쓰기 →
    수식 재계산 → 결과 읽기 → 복사본 삭제. 원본은 절대 수정하지 않음.

    순서:
      1. 기준정보_마스터.xlsx  → data/temp/tmp_master1.xlsx 복사
      2. 기준정보2_마스터.xlsx → data/temp/tmp_master2.xlsx 복사
      3. pywin32 세션: 피킹실적 C열 작업자 쓰기 → raw data 쓰기 → 재계산 → 읽기
      4. 복사본 삭제
      5. 원본 그대로 유지
    """
    import shutil
    import subprocess
    import win32com.client as win32

    # 잔여 Excel 프로세스 정리 (이전 실행 비정상 종료 시 파일 잠금 해제)
    result = subprocess.run(["taskkill", "/f", "/im", "EXCEL.EXE"],
                            capture_output=True, check=False)
    if result.returncode == 0:
        import time; time.sleep(3)  # 프로세스 완전 종료 대기

    # 1~2. 원본 → 복사본
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    print("  [1/2] 마스터 파일 복사 중...")
    shutil.copy2(MASTER1, TEMP1)
    shutil.copy2(MASTER2, TEMP2)
    print(f"    복사 완료: {TEMP1.name}, {TEMP2.name}")

    excel = win32.Dispatch('Excel.Application')
    excel.Visible = False
    excel.DisplayAlerts = False
    try:
        # 3-a. 복사본 열기 + 피킹실적 C열 작업자 쓰기
        print("  [3] 피킹실적 작업자 업데이트 중...")
        wb1 = excel.Workbooks.Open(str(TEMP1.resolve()))
        _write_picking_workers_com(wb1, _PICKING_SLOTS_1, sd_i1)

        wb2 = excel.Workbooks.Open(str(TEMP2.resolve()))
        _write_picking_workers_com(wb2, _PICKING_SLOTS_2, sd_d1)

        # 3-b. raw data 쓰기
        print("  [4] 데이터 쓰는 중...")
        _xw_write_sheet(wb1.Worksheets("F_1"), sd_f1)

        _xw_write_sheet(wb1.Worksheets("I_1"), sd_i1)
        _ws_i1 = wb1.Worksheets("I_1")
        _n = len(sd_i1)
        # V열(22): LOCATION에서 랙번호 추출해 직접 씀 (마스터 캐시값 덮어쓰기)
        _v_data = []
        for _loc in sd_i1["F"]:
            try:
                _v_data.append([int(str(_loc).split("-")[1])])
            except (IndexError, ValueError):
                _v_data.append([None])
        _ws_i1.Range(f"V2:V{_n+1}").Value = _v_data
        # AK(col37), AL(col38): $J2="DPS" → $B2="DPS" (J열=작업자명이므로 B열로 라우팅)
        _ws_i1.Range(_ws_i1.Cells(2, 37), _ws_i1.Cells(_n + 1, 37)).Formula = (
            '=(IF($B2="DPS",IF($I1=$I2,INDEX(DPS!$B$3:$AN$41,'
            'MATCH($V1,DPS!$A$3:$A$41,0),MATCH($V2,DPS!$B$2:$AN$2,0)),0),'
            'IF(OR($U2="E",$U2="F",$U2="H",$U2="I",$U2="K",$U2="L",$U2="L/S"),'
            'IF($G1=$G2,INDEX(\'101_EFHIKL\'!$C$3:$V$22,'
            'MATCH($V1,\'101_EFHIKL\'!$B$3:$B$22,0),MATCH($V2,\'101_EFHIKL\'!$C$2:$V$2,0)),0),'
            'IF($G1=$G2,INDEX(\'101_ABCDJ\'!$C$3:$T$20,'
            'MATCH($V1,\'101_ABCDJ\'!$B$3:$B$20,0),MATCH($V2,\'101_ABCDJ\'!$C$2:$T$2,0)),0))))/60'
        )
        _ws_i1.Range(_ws_i1.Cells(2, 38), _ws_i1.Cells(_n + 1, 38)).Formula = (
            '=(IF($B2="DPS",0,IF($G2=$G1,INDEX(\'1_24\'!$B$3:$Z$27,'
            'MATCH($W2,\'1_24\'!$A$3:$A$27,0),MATCH($W1,\'1_24\'!$B$2:$Z$2,0)),0)))/60'
        )
        # M열(13): B열 포함 비교로 zone 경계 오인식 방지
        _ws_i1.Range(_ws_i1.Cells(2, 13), _ws_i1.Cells(_n + 1, 13)).Formula = \
            '=IF($B1&$G1&$H1&$J1=$B2&$G2&$H2&$J2,0,"시작")'
        _xw_write_sheet(wb2.Worksheets("D_1"), sd_d1)
        _xw_write_sheet(wb2.Worksheets("DU_1"), sd_du1)

        # 3-c. 수식 재계산
        print("  [5] 수식 재계산 중... (수 분 소요)")
        excel.CalculateFull()

        # CalculateFull 후 I_1 A열 수식→값 고정 (=B&J 재계산 방지)
        _ws_i1 = wb1.Worksheets("I_1")
        _rng = _ws_i1.Range(f"A2:A{len(sd_i1)+1}")
        _rng.Value = _rng.Value

        # 3-d. 종합실적 읽기
        print("  [6] 종합실적 읽는 중...")
        r1 = _xw_read_results(wb1.Worksheets("종합실적"), ZONE_ROWS_1)
        r2 = _xw_read_results(wb2.Worksheets("종합실적"), ZONE_ROWS_2)

        wb1.Close(SaveChanges=False)
        wb2.Close(SaveChanges=False)

    finally:
        excel.Quit()

    # 7. 복사본 삭제
    try:
        TEMP1.unlink(missing_ok=True)
    except OSError:
        pass
    try:
        TEMP2.unlink(missing_ok=True)
    except OSError:
        pass

    return r1, r2


# ── Supabase DB 적재 ───────────────────────────────────────────────────

# zone → owner 매핑
ZONE_OWNER: dict[str, str] = {
    "E-F": "퍼시스", "J-K": "퍼시스", "L":   "퍼시스",
    "B":   "퍼시스", "L/S": "퍼시스",
    "H-I": "일룸",   "C-D": "일룸",   "A-P": "일룸",  "DPS": "일룸",
    "M-N": "데스커", "S":   "데스커",
    "W":   "3PL",    "R":   "3PL",
}


def upsert_zone_daily(conn, rows: list):
    cur = conn.cursor()
    execute_values(cur, """
        INSERT INTO zone_daily
            (work_date, owner, zone, std_time_hr, act_time_hr, efficiency,
             pick_count, pick_amount, headcount_day, headcount_night)
        VALUES %s
        ON CONFLICT (work_date, owner, zone) DO UPDATE SET
            std_time_hr     = EXCLUDED.std_time_hr,
            act_time_hr     = EXCLUDED.act_time_hr,
            efficiency      = EXCLUDED.efficiency,
            pick_count      = EXCLUDED.pick_count,
            pick_amount     = EXCLUDED.pick_amount,
            headcount_day   = EXCLUDED.headcount_day,
            headcount_night = EXCLUDED.headcount_night,
            updated_at      = NOW()
    """, rows)
    conn.commit()
    cur.close()


# ── 날짜별 전체 처리 ───────────────────────────────────────────────────
def run_for_date(target: date) -> dict:
    date_str = str(target)
    print(f"\n{'='*60}")
    print(f"처리 날짜: {date_str}")
    print(f"{'='*60}")

    # 로케이션 마스터 로드
    lm1 = _load_loc_map(LOC1)
    lm2 = _load_loc_map(LOC2)
    lm3 = _load_loc_map(LOC3)

    def prep(owner: str, filter_fn, zone_fn, fixed_region=None) -> pd.DataFrame:
        p = find_raw(target, owner)
        if not p:
            print(f"  [{owner}] 파일 없음, 빈 데이터 사용")
            return pd.DataFrame(columns=list("ABCDEFGHIJKL"))
        print(f"  [{owner}] {p.name}")
        df = _load(p)
        df = filter_fn(df, target)
        sd = build_sheet_data(df, zone_fn, fixed_region)
        print(f"    → 필터후 {len(df)}행, 시트 {len(sd)}행")
        return sd

    # ── 1. raw 데이터 가공
    sd_f1  = prep("퍼시스", _filter_f1,  lambda loc: _zone1(loc, lm1))
    sd_i1  = prep("일룸",   _filter_i1,  lambda loc: _zone1(loc, lm1))
    sd_d1  = prep("데스커", _filter_d1,  lambda loc: _zone2(loc, lm2), "가설창고")
    sd_du1 = prep("3PL",    _filter_du1, lambda loc: _zone3(loc, lm3), "가설창고")

    # ── 2~4. xlwings 단일 세션: 쓰기 → 재계산 → 읽기
    print()
    r1, r2 = process_workbooks(sd_f1, sd_i1, sd_d1, sd_du1, date_str)
    all_results = {**r1, **r2}

    # 결과 출력
    print(f"\n  [기준정보_마스터] {date_str}")
    for z, v in r1.items():
        print(f"    {z:6s}: 표준={v['std_time_hr']:.4f}hr  실적={v['act_time_hr']:.4f}hr")
    print(f"\n  [기준정보2_마스터] {date_str}")
    for z, v in r2.items():
        print(f"    {z:6s}: 표준={v['std_time_hr']:.4f}hr  실적={v['act_time_hr']:.4f}hr")

    # ── 5. Supabase DB 적재
    rows_db = []
    for zone, vals in all_results.items():
        owner = ZONE_OWNER.get(zone, "기타")
        std   = round(vals["std_time_hr"], 4)
        act   = round(vals["act_time_hr"], 4)
        eff   = round(std / act * 100, 1) if act > 0 else None
        if std == 0 and act == 0:
            continue
        rows_db.append((date_str, owner, zone, std, act, eff, 0, 0.0, 0, 0))

    if rows_db and SUPABASE_URL:
        print(f"\n  DB 적재 중: {len(rows_db)}개 zone...")
        conn = psycopg2.connect(SUPABASE_URL)
        upsert_zone_daily(conn, rows_db)
        conn.close()
        print("  DB 적재 완료")
    else:
        print(f"\n  DB 적재 건너뜀 ({'SUPABASE_URL 미설정' if not SUPABASE_URL else 'rows 없음'})")

    return all_results


# ── 검증 (2026-05-12 기준값 대비) ─────────────────────────────────────
EXPECTED_STD: dict[str, float] = {
    "E-F": 17.34, "J-K": 19.29, "L": 5.87, "B": 1.59, "L/S": 4.46,
    "H-I": 18.82, "C-D": 40.03, "A-P": 21.79, "DPS": 48.57,
    "M-N": 32.22, "S":   13.21,
    "W":   3.34,  "R":   4.61,
}


def validate(results: dict, date_str: str):
    if date_str != "2026-05-12":
        return
    print(f"\n{'='*60}")
    print("검증 결과 (표준시간 기준값 대비 ±1% 목표)")
    print(f"  {'zone':<6} {'기준':>8} {'실측':>8} {'오차%':>8}  판정")
    print("  " + "-" * 48)
    all_pass = True
    for zone in sorted(EXPECTED_STD):
        exp = EXPECTED_STD[zone]
        got = results.get(zone, {}).get("std_time_hr", 0.0)
        pct = abs(got - exp) / exp * 100 if exp > 0 else 0.0
        ok  = pct <= 1.0
        if not ok:
            all_pass = False
        flag = "OK" if ok else "NG"
        print(f"  {zone:<6} {exp:>8.2f} {got:>8.2f} {pct:>7.2f}%  {flag}")
    print("  " + "=" * 48)
    print("  " + ("전체 PASS OK" if all_pass else "일부 FAIL NG"))


# ── 진입점 ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="피킹 생산성 자동화")
    parser.add_argument("--date", required=True, help="처리 날짜 (YYYY-MM-DD)")
    args   = parser.parse_args()
    target = datetime.strptime(args.date, "%Y-%m-%d").date()

    results = run_for_date(target)
    validate(results, args.date)


if __name__ == "__main__":
    main()
