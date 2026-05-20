"""
WMS 피킹 생산성 자동화 RPA
매일 08:00 자동 실행 (Windows 작업 스케줄러)

흐름:
1. WMS 로그인 (Playwright → 쿠키 추출)
2. 사용자 목록 API 호출 (requests) → workers 테이블 업데이트
3. PALLET HISTORY API 호출 (requests) → 로컬 Excel 저장
4. 집계 계산 (picking_automation_v2)
5. Supabase 적재 (zone_daily, worker_daily)

실행:
  python scripts/wms_rpa.py

.env 필수 항목:
  WMS_ID=아이디
  WMS_PW=비밀번호
  SUPABASE_URL=postgresql://...
"""

import asyncio
import importlib.util
import math
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from playwright.async_api import async_playwright

# ── .env 로드 ──────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
load_dotenv(BASE_DIR / ".env")

# ── 중복 실행 방지 ────────────────────────────────────
def already_ran_today():
    """오늘 이미 실행됐는지 확인"""
    flag_file = BASE_DIR / "data" / ".last_run"
    today_str = datetime.now().strftime("%Y-%m-%d")
    if flag_file.exists():
        if flag_file.read_text().strip() == today_str:
            return True
    return False

def mark_ran_today():
    """오늘 실행 완료 기록"""
    flag_file = BASE_DIR / "data" / ".last_run"
    flag_file.parent.mkdir(exist_ok=True)
    flag_file.write_text(datetime.now().strftime("%Y-%m-%d"))

# ── 설정 ──────────────────────────────────────────────
DATA_DIR     = BASE_DIR / "data" / "raw"
PROC_DIR     = BASE_DIR / "data" / "processed"
PROC_DIR.mkdir(parents=True, exist_ok=True)

WMS_URL      = "https://wms.letus4u.com"
WMS_ID       = os.getenv("WMS_ID", "")
WMS_PW       = os.getenv("WMS_PW", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
TOOL_FILE    = BASE_DIR / "data" / "master" / "기준정보_마스터.xlsx"

TODAY     = datetime.now().date()
YESTERDAY = TODAY - timedelta(days=1)


# ── DB 연결 ───────────────────────────────────────────
def get_conn():
    return psycopg2.connect(SUPABASE_URL)

def safe(val):
    """None/NaN/numpy 타입 → Python 기본 타입 변환"""
    if val is None: return None
    try:
        f = float(val)
        if math.isnan(f): return None
        return f
    except: pass
    return val

def to_py(val):
    """numpy 타입을 Python 기본 타입으로 강제 변환"""
    if val is None: return None
    try:
        import numpy as np
        if isinstance(val, (np.integer,)): return int(val)
        if isinstance(val, (np.floating,)): return float(val)
        if isinstance(val, np.ndarray): return val.tolist()
    except: pass
    return val


# ─────────────────────────────────────────────────────
# Step 1: WMS 로그인 → 쿠키 추출
# ─────────────────────────────────────────────────────
async def wms_login_get_cookies():
    """Playwright로 WMS 로그인 후 세션 쿠키 반환"""
    print("🔐 WMS 로그인 중...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page    = await context.new_page()

        await page.goto(WMS_URL, wait_until="networkidle")
        await page.wait_for_timeout(1000)

        await page.locator("input[name='loginId']").fill(WMS_ID)
        await page.locator("input[name='password']").first.fill(WMS_PW)
        await page.locator("button:has-text('인증 번호 발송')").click()
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)

        # 쿠키 추출
        cookies = await context.cookies()
        await browser.close()

    # requests 세션용 딕셔너리로 변환
    cookie_dict = {c["name"]: c["value"] for c in cookies}
    print(f"✅ 로그인 완료 (쿠키 {len(cookie_dict)}개 획득)")
    return cookie_dict


# ─────────────────────────────────────────────────────
# Step 2: 사용자 목록 API → workers 업데이트
# ─────────────────────────────────────────────────────
def update_workers(session, conn):
    """WMS 사용자 목록 API 호출 → workers 테이블 업데이트"""
    print("\n👥 사용자 목록 수집 중...")

    url = f"{WMS_URL}/v1/system/user/search"
    params = {
        "warehouseOperatorCd": "LETUS",
        "mainWarehouseId": "",
        "searchText": ""
    }
    resp = session.get(url, params=params)
    resp.raise_for_status()
    users = resp.json()

    WORKER_ID_RE = re.compile(r'^(IPC|BS|FS)-?\d+$', re.IGNORECASE)
    workers = []

    for u in users:
        user_id   = str(u.get("userId", "")).strip()
        user_nm   = str(u.get("userNm", "")).strip()
        phone     = str(u.get("userHp", "")).strip()
        warehouse = str(u.get("mainWarehouseId", "")).strip()

        # 양지1센터(YA) 작업자 + IPC/BS/FS ID만
        if warehouse != "YA": continue
        if not WORKER_ID_RE.match(user_id): continue

        pid = user_id.upper()
        if   pid.startswith("IPC"): owner = "일룸"
        elif pid.startswith("BS"):  owner = "퍼시스"
        elif pid.startswith("FS"):  owner = "DPC"
        else: continue

        shift   = "주간" if "[주간]" in user_nm else ("야간" if "[야간]" in user_nm else "")
        display = re.sub(r'\[주간\]|\[야간\]', '', user_nm).strip()

        workers.append({
            "worker_id": user_id, "worker_name": user_nm,
            "display_name": display, "owner": owner,
            "shift": shift, "phone": phone,
        })

    print(f"  수집: {len(workers)}명 (양지1센터)")

    cur = conn.cursor()
    today_str = str(TODAY)
    for w in workers:
        cur.execute("""
            INSERT INTO workers
                (worker_id, worker_name, display_name, owner, shift,
                 group_name, phone, is_active, first_seen, last_seen)
            VALUES (%s,%s,%s,%s,%s,%s,%s, TRUE, %s, %s)
            ON CONFLICT (worker_id) DO UPDATE SET
                worker_name  = EXCLUDED.worker_name,
                display_name = EXCLUDED.display_name,
                shift        = EXCLUDED.shift,
                phone        = EXCLUDED.phone,
                is_active    = TRUE,
                last_seen    = %s,
                updated_at   = NOW()
        """, (w["worker_id"], w["worker_name"], w["display_name"],
              w["owner"], w["shift"], "", w["phone"],
              today_str, today_str, today_str))

    cur.execute("""
        UPDATE workers SET is_active = FALSE, updated_at = NOW()
        WHERE last_seen < %s AND is_active = TRUE
    """, (today_str,))

    conn.commit()
    cur.close()
    print(f"✅ workers 업데이트 완료 ({len(workers)}명)")


# ─────────────────────────────────────────────────────
# Step 3: PALLET HISTORY API → 로컬 Excel 저장
# ─────────────────────────────────────────────────────
def fetch_pallet_history(session, owner_ids, date_from, date_to):
    """PALLET HISTORY API 호출 → DataFrame 반환
    owner_ids: ['T60I01','T60I03'] (일룸+슬로우베드) / ['T60F01'] (퍼시스)
    """
    url = f"{WMS_URL}/v1/performance/palletHistory/getPerformancePalletHistoryList"
    params = [
        ("warehouseId", "YA"),
        ("itemId", ""),
        ("fromDt", date_from.strftime("%Y%m%d")),
        ("toDt",   date_to.strftime("%Y%m%d")),
        ("historyYn", "N"),
    ]
    for oid in owner_ids:
        params.append(("ownerIdArr", oid))

    resp = session.get(url, params=params)
    resp.raise_for_status()
    return pd.DataFrame(resp.json())

def download_pallet_history(session):
    """일룸+슬로우베드 / 퍼시스 데이터 수집 → 로컬 Excel 저장"""
    print("\n📥 PALLET HISTORY 수집 중...")

    save_dir = DATA_DIR / YESTERDAY.strftime("%Y/%m")
    save_dir.mkdir(parents=True, exist_ok=True)
    files = {}

    # 일룸 + 슬로우베드 (어제~오늘)
    print("  [일룸+슬로우베드] 수집 중...")
    df_iloom = fetch_pallet_history(
        session,
        owner_ids=["T60I01", "T60I03"],
        date_from=YESTERDAY,
        date_to=TODAY
    )
    iloom_path = save_dir / f"일룸_{YESTERDAY.strftime('%m%d')}_{TODAY.strftime('%m%d')}.xlsx"
    df_iloom.to_excel(str(iloom_path), index=False)
    files["일룸"] = iloom_path
    print(f"  ✅ 일룸 {len(df_iloom)}건 → {iloom_path.name}")

    # 퍼시스 (어제만)
    print("  [퍼시스] 수집 중...")
    df_fursys = fetch_pallet_history(
        session,
        owner_ids=["T60F01"],
        date_from=YESTERDAY,
        date_to=YESTERDAY
    )
    fursys_path = save_dir / f"퍼시스_{YESTERDAY.strftime('%m%d')}.xlsx"
    df_fursys.to_excel(str(fursys_path), index=False)
    files["퍼시스"] = fursys_path
    print(f"  ✅ 퍼시스 {len(df_fursys)}건 → {fursys_path.name}")

    return files


# ─────────────────────────────────────────────────────
# Step 4 & 5: 집계 계산 + Supabase 적재
# ─────────────────────────────────────────────────────
def run_calculation_and_load(files, conn):
    print("\n📊 집계 계산 중...")

    spec = importlib.util.spec_from_file_location(
        "pav", BASE_DIR / "scripts" / "picking_automation_v2.py"
    )
    pav = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pav)

    import openpyxl
    ref = pav.load_reference_tables(str(TOOL_FILE))

    # 공장도가 로드
    wb = openpyxl.load_workbook(str(TOOL_FILE), read_only=True, data_only=True)
    price_map = {}
    for sheet in ["일룸 공장도가", "퍼시스, 시디즈 공장도가"]:
        for r in wb[sheet].iter_rows(min_row=2, values_only=True):
            if r[3] and r[4]: price_map[str(r[3]).strip()] = float(r[4])

    date_str = str(YESTERDAY)
    all_zone_rows   = []
    all_worker_rows = []

    for owner, fpath in files.items():
        if not fpath or not Path(fpath).exists():
            print(f"  ⚠️  {owner} 파일 없음, 건너뜀")
            continue

        print(f"  [{owner}] 집계 중...")
        df = pd.read_excel(fpath)
        df.columns = df.columns.str.strip()

        # API 컬럼명 → 기존 집계 엔진 컬럼명 매핑
        col_map = {
            "ownerId":      "OWNER",
            "orderNo":      "오더번호",
            "pickingNo":    "피킹번호",
            "itemId":       "ITEM_ID",
            "confirmQty":   "피킹수량",
            "unitLoadId":   "PLT_ID",
            "toLocation":   "LOCATION",
            "waveNo":       "WAVE번호",
            "waveNm":       "WAVE명",
            "fstUsrNm":     "작업자",
            "assignUsrNm":  "지정작업자",
            "fstSysDt":     "작업일시",
        }
        df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

        if "작업일시" in df.columns:
            df["작업일시"] = pd.to_datetime(df["작업일시"], errors="coerce")
        df = df.dropna(subset=["작업일시"])
        df = df[~df["LOCATION"].astype(str).str.startswith("Y-REC")]
        if "지정작업자" not in df.columns: df["지정작업자"] = df["작업자"]

        t = pd.Timestamp(date_str)
        if owner == "일룸":
            dpc = df[df["지정작업자"] == "DPC"]
            주 = df[df["작업자"].str.contains(r"\[주간\]", na=False) &
                    df["작업일시"].between(t.replace(hour=8, minute=30), t.replace(hour=20, minute=59)) &
                    (df["지정작업자"] != "DPC")]
            야 = df[df["작업자"].str.contains(r"\[야간\]", na=False) &
                    df["작업일시"].between(t.replace(hour=21), (t + pd.Timedelta(days=1)).replace(hour=6)) &
                    (df["지정작업자"] != "DPC")]
            result = pd.concat([주, 야])
        else:
            dpc    = pd.DataFrame()
            result = df

        result = result.sort_values(
            ["작업자", "작업일시", "WAVE명", "PLT_ID", "LOCATION"]
        ).reset_index(drop=True)
        if len(result) == 0: continue

        detail = pav.calc_standard_times(result, ref)
        detail = pav.calc_cumulative(detail)
        detail["zone_group"] = detail["LOCATION"].apply(pav.get_zone_group)

        NORMAL = pav.PICKING_ZONES - {"P/S", "L/S", "DPS"}
        valid  = detail[detail["zone_group"].isin(NORMAL)]
        if len(valid) == 0: continue

        # 표준시간
        wave_ends = valid[valid["is_wave_end"] == True].copy()
        wave_zone = valid.groupby(["작업자","WAVE명","zone_group"]).size().reset_index(name="cnt")
        wave_main = (wave_zone.sort_values("cnt", ascending=False)
                              .groupby(["작업자","WAVE명"]).first()["zone_group"].reset_index())
        wave_main.columns = ["작업자","WAVE명","wave_zone"]
        wave_ends = wave_ends.merge(wave_main, on=["작업자","WAVE명"], how="left")
        zone_std  = wave_ends.groupby("wave_zone")["wave별_표준시간_min"].sum() / 60

        # 실적시간 (span-휴게, 건수 비율 배분)
        actual = pav.calc_actual_time(result)
        wz = valid.groupby(["작업자","zone_group"]).size().reset_index(name="cnt")
        wt = wz.groupby("작업자")["cnt"].sum().reset_index(name="total")
        wz = wz.merge(wt, on="작업자").merge(actual, on="작업자")
        wz["실적시간_min"] = wz["실적시간_min"] * wz["cnt"] / wz["total"]
        zone_work = wz.groupby("zone_group")["실적시간_min"].sum() / 60

        # 투입인원
        shift_fn    = lambda w: "주간" if "[주간]" in str(w) else "야간"
        worker_main = wz.sort_values("cnt", ascending=False).groupby("작업자").first()["zone_group"]
        ws_df = (valid.drop_duplicates("작업자")[["작업자"]]
                      .assign(zone=lambda x: x["작업자"].map(worker_main),
                              shift=lambda x: x["작업자"].apply(shift_fn)))
        hc = ws_df.groupby(["zone","shift"]).size().unstack(fill_value=0)

        # 피킹금액
        valid2 = valid.copy()
        valid2["price"] = valid2["ITEM_ID"].map(price_map).fillna(0)
        zone_cnt = valid.groupby("zone_group")["confirmQty"].sum()
        zone_amt = valid2.groupby("zone_group")["price"].sum()

        for z in sorted(NORMAL & (set(zone_std.index) | set(zone_work.index))):
            std  = float(zone_std.get(z, 0)); work = float(zone_work.get(z, 0))
            cnt  = int(zone_cnt.get(z, 0));   amt  = float(zone_amt.get(z, 0))
            eff  = round(std / work * 100, 1) if work > 0 else None
            hd   = int(hc.loc[z, "주간"]) if z in hc.index and "주간" in hc.columns else 0
            hn   = int(hc.loc[z, "야간"]) if z in hc.index and "야간" in hc.columns else 0
            if std == 0 and work == 0 and cnt == 0: continue
            all_zone_rows.append((
                date_str, owner, z,
                round(std, 4), round(work, 4), eff,
                cnt, round(amt / 10000, 1), hd, hn
            ))

        for _, row in wz.iterrows():
            w = row["작업자"]; z = row["zone_group"]; s = shift_fn(w)
            w_std = float(wave_ends[wave_ends["작업자"] == w]["wave별_표준시간_min"].sum() / 60)
            w_wk  = float(row["실적시간_min"] / 60)
            w_cnt = int(row["cnt"])
            w_eff = round(w_std / w_wk * 100, 1) if w_wk > 0 else None
            all_worker_rows.append((date_str, owner, z, w, s,
                                    round(w_std, 4), round(w_wk, 4), w_eff, w_cnt))

        # P/S (DPC)
        if len(dpc) > 0:
            dpc2 = dpc.copy()
            dpc2["price"] = dpc2["ITEM_ID"].map(price_map).fillna(0)
            all_zone_rows.append((
                date_str, owner, "P/S", None, None, None,
                int(len(dpc)), float(round(float(dpc2["price"].sum()) / 10000, 1)),
                int(dpc["작업자"].nunique()), 0
            ))

    # DB 적재
    cur = conn.cursor()
    if all_zone_rows:
        execute_values(cur, """
            INSERT INTO zone_daily
                (work_date, owner, zone, std_time_hr, act_time_hr,
                 efficiency, pick_count, pick_amount, headcount_day, headcount_night)
            VALUES %s
            ON CONFLICT (work_date, owner, zone) DO UPDATE SET
                std_time_hr=EXCLUDED.std_time_hr, act_time_hr=EXCLUDED.act_time_hr,
                efficiency=EXCLUDED.efficiency, pick_count=EXCLUDED.pick_count,
                pick_amount=EXCLUDED.pick_amount, headcount_day=EXCLUDED.headcount_day,
                headcount_night=EXCLUDED.headcount_night, updated_at=NOW()
        """, all_zone_rows)
        print(f"  ✅ zone_daily {len(all_zone_rows)}개 적재")

    if all_worker_rows:
        execute_values(cur, """
            INSERT INTO worker_daily
                (work_date, owner, zone, worker_name, shift,
                 std_time_hr, act_time_hr, efficiency, pick_count)
            VALUES %s
            ON CONFLICT (work_date, owner, zone, worker_name) DO UPDATE SET
                std_time_hr=EXCLUDED.std_time_hr, act_time_hr=EXCLUDED.act_time_hr,
                efficiency=EXCLUDED.efficiency, pick_count=EXCLUDED.pick_count
        """, all_worker_rows)
        print(f"  ✅ worker_daily {len(all_worker_rows)}개 적재")

    conn.commit()
    cur.close()


# ─────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────
async def main():
    # 오늘 이미 실행됐으면 종료
    if already_ran_today():
        print(f"⏭️  오늘({datetime.now().strftime('%Y-%m-%d')}) 이미 실행 완료. 건너뜀.")
        return

    print(f"\n{'='*55}")
    print(f"🚀 WMS 피킹 생산성 RPA 시작")
    print(f"   실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   집계 대상: {YESTERDAY}")
    print(f"{'='*55}\n")

    # DB 연결
    conn = get_conn()
    print("✅ Supabase 연결 성공")

    # Step 1: 로그인 → 쿠키 획득
    cookies = await wms_login_get_cookies()

    # requests 세션 생성 (쿠키 적용)
    session = requests.Session()
    session.cookies.update(cookies)
    session.headers.update({
        "User-Agent": "Mozilla/5.0",
        "Referer": WMS_URL,
    })

    try:
        # Step 2: 작업자 목록 업데이트
        update_workers(session, conn)

        # Step 3: PALLET HISTORY 수집
        files = download_pallet_history(session)

    except Exception as e:
        print(f"\n❌ RPA 오류: {e}")
        import traceback
        traceback.print_exc()
        conn.close()
        return

    # Step 4 & 5: 집계 + DB 적재
    try:
        run_calculation_and_load(files, conn)
    except Exception as e:
        print(f"\n❌ 집계 오류: {e}")
        import traceback
        traceback.print_exc()

    conn.close()
    mark_ran_today()
    print(f"\n{'='*55}")
    print(f"✅ 완료! {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    asyncio.run(main())
