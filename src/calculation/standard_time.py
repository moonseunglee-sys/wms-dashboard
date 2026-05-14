"""
WMS 피킹 표준시간 계산 — F_1 수식 완전 재현
"""
import pandas as pd


# ─────────────────────────────────────────────
# 상수
# ─────────────────────────────────────────────
_EFHIKL_ZONES = {"E", "F", "H", "I", "K", "L", "L/S", "H(퍼)"}


# ─────────────────────────────────────────────
# 로케이션 파싱  'J-105-02-1' → (zone, rack, loc, tier)
# ─────────────────────────────────────────────
def parse_location(loc_str: str) -> tuple:
    if not loc_str or not isinstance(loc_str, str):
        return None, None, None, None
    p = loc_str.strip().split("-")
    try:
        zone = p[0] if len(p) > 0 else None
        rack = int(p[1]) if len(p) > 1 else None
        loc  = int(p[2]) if len(p) > 2 else None
        tier_raw = p[3] if len(p) > 3 else None
        if tier_raw is None:
            tier = None
        elif tier_raw.startswith("L"):
            tier = tier_raw          # 'L3','L4','L5'
        else:
            tier = int(tier_raw)
        return zone, rack, loc, tier
    except (ValueError, IndexError):
        return None, None, None, None


# ─────────────────────────────────────────────
# 이동시간 조회 (초 → 분)
# ─────────────────────────────────────────────
def get_zone_time_min(ref: dict, z1, z2) -> float:
    if not z1 or not z2 or z1 == z2:
        return 0.0
    return ref["zone_dist"].get((z1, z2), ref["zone_dist"].get((z2, z1), 0.0)) / 60.0


def get_rack_time_min(ref: dict, zone, r1, r2) -> float:
    if r1 is None or r2 is None or r1 == r2:
        return 0.0
    store = ref["rack_dist_efhikl"] if zone in _EFHIKL_ZONES else ref["rack_dist_abcdj"]
    v = store.get((r1, r2), store.get((r2, r1), 0.0))
    return v / 60.0


def get_loc_time_min(ref: dict, l1, l2) -> float:
    if l1 is None or l2 is None or l1 == l2:
        return 0.0
    v = ref["loc_dist"].get((l1, l2), ref["loc_dist"].get((l2, l1), 0.0))
    return v / 60.0


# ─────────────────────────────────────────────
# 보조 분류
# ─────────────────────────────────────────────
def get_zone_code(zone: str) -> str:
    if zone == "L":    return "L"
    if zone == "B":    return "B"
    if zone == "L/S":  return "L/S"
    if zone in ("E", "F"):  return "E-F"
    if zone in ("J", "K"):  return "J-K"
    return "0"


def get_region(wave_name: str) -> str:
    if not wave_name:
        return "소액"
    w = str(wave_name)
    if "지" in w[:6]:   return "지방"
    if "경" in w[:6]:   return "경인"
    if "수출" in w:     return "수출"
    return "소액"


# ─────────────────────────────────────────────
# 복합 키 생성
# ─────────────────────────────────────────────
def _plt_wave_key(plt_id, wave_no, worker) -> str:
    return f"{plt_id}|{wave_no}|{worker}"


def _item_loc_key(item_id, plt_id, zone, rack, loc, tier) -> str:
    return f"{item_id}|{plt_id}|{zone}|{rack}|{loc}|{tier}"


# ─────────────────────────────────────────────
# 메인 계산: 품목별 15개 세부시간 + 작업시간
# ─────────────────────────────────────────────
def calc_standard_times(df: pd.DataFrame, ref: dict, travel_factor: float = 1.0) -> pd.DataFrame:
    """
    travel_factor: 이동시간 전체 배율
      퍼시스 3.0 km/h 기준(=1.0), 일룸 2.0 km/h → factor = 3.0/2.0 = 1.5
    """
    rows = df.to_dict("records")
    n = len(rows)
    has_shift = "shift" in df.columns
    results = []

    for i, row in enumerate(rows):
        prev = rows[i - 1] if i > 0 else None
        nxt  = rows[i + 1] if i < n - 1 else None

        zone, rack, loc, tier = parse_location(row.get("LOCATION", ""))
        zone_code = get_zone_code(zone)
        region    = get_region(row.get("WAVE명", ""))

        pz, pr, pl, pt = parse_location(prev["LOCATION"] if prev else "") if prev else (None, None, None, None)
        nz, nr, nl, nt = parse_location(nxt["LOCATION"]  if nxt  else "") if nxt  else (None, None, None, None)

        plt_id  = str(row.get("PLT_ID",  ""))
        wave_no = str(row.get("WAVE번호", ""))
        worker  = str(row.get("작업자",   ""))
        item_id = str(row.get("ITEM_ID",  ""))
        qty     = row.get("피킹수량", 1) or 1

        # ── wave 시작/끝 판별 (M열, Q열 재현)
        if prev is None:
            is_wave_start = True
        else:
            is_wave_start = (
                _plt_wave_key(str(prev.get("PLT_ID", "")), str(prev.get("WAVE번호", "")), str(prev.get("작업자", "")))
                != _plt_wave_key(plt_id, wave_no, worker)
            )

        if nxt is None:
            is_wave_end = True
        else:
            is_wave_end = (
                _plt_wave_key(plt_id, wave_no, worker)
                != _plt_wave_key(str(nxt.get("PLT_ID", "")), str(nxt.get("WAVE번호", "")), str(nxt.get("작업자", "")))
            )

        # ── 시작/끝 로케이션 (N/O/P, R/S/T 컬럼)
        if is_wave_start:
            start_z, start_r, start_l = ref["start_loc"].get(zone, (None, None, None))
        else:
            start_z, start_r, start_l = None, None, None

        if is_wave_end:
            end_z, end_r, end_l = ref["end_loc"].get(zone, (None, None, None))
        else:
            end_z, end_r, end_l = None, None, None

        # ── AD/AE/AF: 시작 이동시간 (분)
        t_start_zone = get_zone_time_min(ref, start_z, zone) if (is_wave_start and start_z and zone) else 0.0
        t_start_rack = get_rack_time_min(ref, zone, int(start_r), rack) if (is_wave_start and start_r is not None and rack is not None) else 0.0
        t_start_loc  = get_loc_time_min(ref, int(start_l), loc)        if (is_wave_start and start_l is not None and loc  is not None) else 0.0

        # ── AG/AH/AI: 끝 이동시간 (분)
        t_end_zone = get_zone_time_min(ref, zone, end_z) if (is_wave_end and end_z and zone) else 0.0
        t_end_rack = get_rack_time_min(ref, zone, rack, int(end_r)) if (is_wave_end and end_r is not None and rack is not None) else 0.0
        t_end_loc  = get_loc_time_min(ref, loc, int(end_l))        if (is_wave_end and end_l is not None and loc  is not None) else 0.0

        # ── AJ/AK/AL: 중간 이동시간 (분) — 같은 팔레트 내에서만
        same_plt = prev is not None and str(prev.get("PLT_ID", "")) == plt_id
        t_zone = get_zone_time_min(ref, pz, zone) if (same_plt and pz and zone) else 0.0
        t_rack = get_rack_time_min(ref, zone, pr, rack) if (same_plt and pr is not None and rack is not None) else 0.0
        t_loc  = get_loc_time_min(ref, loc, pl)        if (same_plt and pl is not None and loc  is not None) else 0.0

        # ── AM: 피킹 단수별 소요시간 (분)
        # 이전 행과 item+loc가 완전히 같으면 0 (동일 위치 연속 피킹)
        if prev:
            same_item_loc = (
                _item_loc_key(str(prev.get("ITEM_ID", "")), str(prev.get("PLT_ID", "")), pz, pr, pl, pt)
                == _item_loc_key(item_id, plt_id, zone, rack, loc, tier)
            )
        else:
            same_item_loc = False

        t_tier = 0.0 if same_item_loc else (ref["tier_time"].get(tier, 0.0) if tier is not None else 0.0)

        # ── AN: 품목 바코드 스캔 (분)
        t_barcode_item = 0.0 if same_item_loc else ref["barcode_item"]

        # ── AO: 피킹시간 × 수량 (분)
        t_pick = ref["pick_time"].get(zone, 0.15) * qty

        # ── AP: 로케이션 바코드 스캔 (분)
        # 다음 행과 item+loc가 같으면 0 (미리 스캔 불필요)
        if nxt:
            same_next_item_loc = (
                _item_loc_key(item_id, plt_id, zone, rack, loc, tier)
                == _item_loc_key(str(nxt.get("ITEM_ID", "")), str(nxt.get("PLT_ID", "")), nz, nr, nl, nt)
            )
        else:
            same_next_item_loc = False

        t_barcode_loc = 0.0 if same_next_item_loc else ref["barcode_loc"]

        # ── 이동시간 speed factor 적용 (일룸 2.0 km/h 등 속도 차이 보정)
        if travel_factor != 1.0:
            t_start_zone *= travel_factor; t_start_rack *= travel_factor; t_start_loc *= travel_factor
            t_end_zone   *= travel_factor; t_end_rack   *= travel_factor; t_end_loc   *= travel_factor
            t_zone       *= travel_factor; t_rack       *= travel_factor; t_loc       *= travel_factor

        # ── AQ: 공파렛트 준비시간 (분) — wave 시작 행만
        t_pallet = ref["pallet_prep"].get("DPS외", 0.30333) if is_wave_start else 0.0

        # ── AR: 라벨링 및 복귀시간 (분) — wave 끝 행만
        t_label = ref["labeling"].get(region, {}).get(zone, 0.0) if is_wave_end else 0.0

        # ── AS: 예상작업시간 합계 (분)
        t_total = (t_start_zone + t_start_rack + t_start_loc
                   + t_end_zone + t_end_rack + t_end_loc
                   + t_zone + t_rack + t_loc
                   + t_tier + t_barcode_item + t_pick + t_barcode_loc
                   + t_pallet + t_label)

        # ── AB: 실제 작업시간 (분) — 연속 작업일시 차이, 휴게시간 보정
        t_curr = row.get("작업일시")
        t_next = nxt["작업일시"] if nxt else None
        if (pd.notna(t_curr) and t_next is not None and pd.notna(t_next)
                and str(row.get("작업자", "")) == str(nxt.get("작업자", ""))):
            delta_min = (t_next - t_curr).total_seconds() / 60.0
            h1, h2 = t_curr.hour, t_next.hour
            if   h2 == 13 and h1 == 12: delta_min -= 50   # 점심
            elif h2 == 18 and h1 == 17: delta_min -= 30   # 저녁
            elif h2 == 1  and h1 == 0:  delta_min -= 60   # 자정 넘김
            t_work = max(delta_min, 0.0)
        else:
            t_work = 0.0

        # ── AC: wave 시작 행은 이전 wave 이동시간 포함 → 표준시간 비교에서 제외
        t_work_prime = 0.0 if is_wave_start else t_work

        # ── AV: 작업소요시간 (F_1 수식 재현)
        if is_wave_start and is_wave_end:
            t_work_adj = (t_work_prime
                          + t_start_zone + t_start_rack + t_start_loc
                          + t_end_zone   + t_end_rack   + t_end_loc
                          + t_tier + t_barcode_item + t_pick + t_barcode_loc
                          + t_pallet + t_label)
        elif is_wave_start:
            t_work_adj = (t_start_zone + t_start_rack + t_start_loc
                          + t_tier + t_barcode_item + t_pick + t_barcode_loc + t_pallet)
        elif is_wave_end:
            t_work_adj = t_work_prime + t_end_zone + t_end_rack + t_end_loc + t_label
        else:
            t_work_adj = t_work_prime

        rec = {
            "작업자":   worker,
            "WAVE명":   row.get("WAVE명", ""),
            "WAVE번호": wave_no,
            "PLT_ID":   plt_id,
            "오더번호": row.get("오더번호", ""),
            "ITEM_ID":  item_id,
            "피킹수량": qty,
            "LOCATION": row.get("LOCATION", ""),
            "작업일시": t_curr,
            "출고지역": region,
            "zone_code":      zone_code,
            "zone": zone, "rack": rack, "loc": loc, "tier": tier,
            "is_wave_start":  is_wave_start,
            "is_wave_end":    is_wave_end,
            # 시작 이동
            "시작_zone간_min": t_start_zone,
            "시작_rack간_min": t_start_rack,
            "시작_loc간_min":  t_start_loc,
            # 끝 이동
            "끝_zone간_min":  t_end_zone,
            "끝_rack간_min":  t_end_rack,
            "끝_loc간_min":   t_end_loc,
            # 중간 이동
            "zone간_min": t_zone,
            "rack간_min": t_rack,
            "loc간_min":  t_loc,
            # 피킹 요소
            "피킹단수_min":   t_tier,
            "품목바코드_min": t_barcode_item,
            "피킹시간_min":   t_pick,
            "loc바코드_min":  t_barcode_loc,
            "공파렛트_min":   t_pallet,
            "라벨링복귀_min": t_label,
            # 집계 원본
            "예상작업시간_min": t_total,      # AS
            "작업시간_min":     t_work,        # AB
            "작업시간_prime":   t_work_prime,  # AC
            "작업소요시간_min": t_work_adj,    # AV
        }
        if has_shift:
            rec["shift"] = row.get("shift")
        results.append(rec)

    return pd.DataFrame(results)


# ─────────────────────────────────────────────
# wave별 누계 집계
# ─────────────────────────────────────────────
def calc_cumulative(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["표준시간_누계_min"]     = 0.0   # AT
    df["wave별_표준시간_min"]   = 0.0   # AU
    df["작업소요시간_누계_min"] = 0.0   # AW
    df["wave별_작업시간_min"]   = 0.0   # AX
    df["wave별_가동률"]         = 0.0   # AY
    df["품목별_가동률"]         = 0.0   # BB

    cum_std  = 0.0
    cum_work = 0.0

    for i in df.index:
        std_i  = df.loc[i, "예상작업시간_min"]
        work_i = df.loc[i, "작업소요시간_min"]

        if df.loc[i, "is_wave_start"]:
            cum_std  = std_i
            cum_work = work_i
        else:
            cum_std  += std_i
            cum_work += work_i

        df.loc[i, "표준시간_누계_min"]     = cum_std
        df.loc[i, "작업소요시간_누계_min"] = cum_work

        if df.loc[i, "is_wave_end"]:
            df.loc[i, "wave별_표준시간_min"] = cum_std
            df.loc[i, "wave별_작업시간_min"] = cum_work
            if cum_work > 0:
                df.loc[i, "wave별_가동률"] = cum_std / cum_work

        if work_i > 0:
            df.loc[i, "품목별_가동률"] = std_i / work_i

    return df


# ─────────────────────────────────────────────
# 작업자별 피킹실적 요약
# ─────────────────────────────────────────────
def calc_picking_summary(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for worker, grp in df.groupby("작업자"):
        total_std  = grp["예상작업시간_min"].sum()
        total_work = grp["작업소요시간_min"].sum()
        rows.append({
            "작업자":       worker,
            "wave수":       grp["WAVE명"].nunique(),
            "피킹품목수":   len(grp),
            "피킹수량":     int(grp["피킹수량"].sum()),
            "표준시간(hr)": round(total_std  / 60, 4),
            "작업시간(hr)": round(total_work / 60, 4),
            "피킹가동률":   round(total_std / total_work, 4) if total_work > 0 else 0,
        })
    return pd.DataFrame(rows)


# ─────────────────────────────────────────────
# 결과 Excel 내보내기
# ─────────────────────────────────────────────
_DETAIL_COLS = [
    "작업자", "WAVE명", "WAVE번호", "PLT_ID", "오더번호", "ITEM_ID", "피킹수량",
    "LOCATION", "작업일시", "출고지역",
    "시작_zone간_min", "시작_rack간_min", "시작_loc간_min",
    "끝_zone간_min", "끝_rack간_min", "끝_loc간_min",
    "zone간_min", "rack간_min", "loc간_min",
    "피킹단수_min", "품목바코드_min", "피킹시간_min", "loc바코드_min",
    "공파렛트_min", "라벨링복귀_min",
    "예상작업시간_min",
    "표준시간_누계_min", "wave별_표준시간_min",
    "작업시간_min", "작업시간_prime", "작업소요시간_min",
    "작업소요시간_누계_min", "wave별_작업시간_min",
    "wave별_가동률", "품목별_가동률",
]


def export_results(detail_df: pd.DataFrame, summary_df: pd.DataFrame, output_path: str,
                   sheet_suffix: str = "F_1") -> None:
    export_cols = [c for c in _DETAIL_COLS if c in detail_df.columns]
    # shift 컬럼이 있으면 앞에 삽입
    if "shift" in detail_df.columns and "shift" not in export_cols:
        export_cols.insert(export_cols.index("출고지역") + 1, "shift")
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        summary_df.to_excel(writer, sheet_name="피킹실적", index=False)
        detail_df[export_cols].to_excel(writer, sheet_name=f"상세데이터({sheet_suffix})", index=False)
