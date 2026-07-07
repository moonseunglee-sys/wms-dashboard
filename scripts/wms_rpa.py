"""
WMS 데이터 수집 RPA (피킹 + 입고/이동)
매일 08:30 자동 실행 (Windows 작업 스케줄러)

흐름:
1. WMS 로그인 (Playwright → 쿠키 추출)
2. 작업자 목록 API → workers 테이블 업데이트
3. 브랜드별 PALLET HISTORY 다운로드 → data/raw/YYYY/MM/ 저장 (피킹)
4. 브랜드별 ITEM HISTORY(적치+이동) 다운로드 → data/raw/2026_입고/MM/ 저장 (입고)

파일명/날짜 범위 (피킹, PALLET HISTORY):
  - 일룸  (T60I01+T60I03, 야간 있음): 일룸_{MMDD}_{END}.xlsx   date_from=target, date_to=next_weekday
  - 데스커(T60I02,        야간 있음): 데스커_{MMDD}_{END}.xlsx  date_from=target, date_to=next_weekday
  - 퍼시스(T60F01,        주간 전용): 퍼시스_{MMDD}.xlsx        date_from=date_to=target
  - 3PL  (그룹사 제외 전체 active owner): 3PL_{MMDD}.xlsx       date_from=date_to=target

next_weekday 규칙 (피킹 전용 — 입고/이동은 항상 단일일):
  평일  target → target+1일 (다음날)
  토요일 target → target+2일 (월요일)     ex) 토/일/월
  공휴일 전날  → 수동 --date 사용 권장

파일명 (입고/이동, ITEM HISTORY — 브랜드 무관 항상 단일일 target 기준):
  - 입고_{브랜드}_{MMDD}.xlsx  (WMS "실적관리 > ITEM HISTORY > 입하/적치실적" 탭과 동일 데이터)
  - 이동_{브랜드}_{MMDD}.xlsx  (같은 화면 "이동" 탭과 동일 데이터)
  브랜드 그룹은 피킹과 동일: 일룸(T60I01+T60I03), 데스커(T60I02), 퍼시스(T60F01), 3PL(그룹사 제외 전체)

다음 단계 (수동 또는 별도 트리거):
  python scripts/batch_run.py --dates YYYY-MM-DD           (피킹)
  python scripts/inbound_batch_run.py --dates YYYY-MM-DD   (입고)

실행:
  python scripts/wms_rpa.py                     # 기본: 어제 날짜
  python scripts/wms_rpa.py --date 2026-07-04   # 특정 날짜
  python scripts/wms_rpa.py --force             # 중복 실행 무시
  python scripts/wms_rpa.py --skip-inbound      # 입고/이동 다운로드 생략(피킹만)

.env 필수:
  WMS_ID=아이디
  WMS_PW=비밀번호
  SUPABASE_POOLER_URL=postgresql://... (또는 SUPABASE_DB_URL)
"""

import argparse
import asyncio
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path

import requests
import psycopg2
from dotenv import load_dotenv
from playwright.async_api import async_playwright

# ── 경로/설정 ───────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR       = BASE_DIR / "data" / "raw"
INBOUND_RAW_DIR = BASE_DIR / "data" / "raw" / "2026_입고"   # inbound_automation.py의 raw_dir()과 동일 경로
WMS_URL      = "https://wms.letus4u.com"
WMS_ID       = os.getenv("WMS_ID", "")
WMS_PW       = os.getenv("WMS_PW", "")
# SUPABASE_URL은 REST API 주소(https://xxx.supabase.co)라 psycopg2 DSN으로 못 씀 — DB 직결 URL 사용
SUPABASE_DB_URL = os.getenv("SUPABASE_POOLER_URL") or os.getenv("SUPABASE_DB_URL", "")

# ── Owner ID (WMS /v1/master/owner/list 기준) ───────────────────────────
# 야간 있음 → 2일치(평일) / 3일치(토) 다운로드
NIGHT_BRANDS = {
    "일룸":   ["T60I01", "T60I03"],  # 일룸 + 슬로우베드
    "데스커": ["T60I02"],
}
# 주간 전용 → 단일 날짜 다운로드 (3PL은 owner_ids=None → 런타임 동적 조회)
DAY_BRANDS = {
    "퍼시스": ["T60F01"],
    "3PL":    None,
}

# 브랜드별 물리 창고 (WMS 로그인 화면 창고선택 드롭다운 기준)
#   YA=양지1물류센터, Y2=양지2물류센터, Y3=양지3물류센터
# 기존 코드가 전부 "YA"로 하드코딩돼 있어 데스커/3PL 데이터가 0건으로 나오던 버그 수정 (2026-07-07)
BRAND_WAREHOUSE = {
    "일룸":   "YA",
    "퍼시스": "YA",
    "데스커": "Y2",
    "3PL":    "Y3",
}

# 그룹사 owner IDs (고정) — 런타임에 전체 owner 목록에서 이걸 제외한 나머지 = 3PL
# 화주사가 추가되어도 이 목록만 유지하면 자동으로 포함됨
_GROUP_OWNERS = frozenset({
    "T60I01", "T60I02", "T60I03",   # 일룸, 데스커, 슬로우베드
    "T60F01",                        # 퍼시스
    "T60P01", "T60P02",              # 시디즈, 알로소
    "T60T01",                        # 팀스
})


# ── 날짜 헬퍼 ──────────────────────────────────────────────────────────
def next_weekday(d: date) -> date:
    """d 다음 날부터 첫 번째 평일(월~금) 반환.
    공휴일은 별도 처리 없음 → 공휴일 낀 주간은 --date 수동 실행 권장.
    """
    d = d + timedelta(days=1)
    while d.weekday() >= 5:   # 5=토, 6=일
        d += timedelta(days=1)
    return d


def get_file_spec(brand: str, target: date):
    """(date_from, date_to, filename) 반환"""
    ymd = target.strftime("%m%d")

    if brand in NIGHT_BRANDS:
        end = next_weekday(target)
        emd = end.strftime("%m%d")
        return target, end, f"{brand}_{ymd}_{emd}.xlsx"
    else:
        return target, target, f"{brand}_{ymd}.xlsx"


# ── 중복 실행 방지 ─────────────────────────────────────────────────────
def already_ran(target_str: str) -> bool:
    flag = BASE_DIR / "data" / ".last_run"
    return flag.exists() and flag.read_text().strip() == target_str

def mark_ran(target_str: str):
    flag = BASE_DIR / "data" / ".last_run"
    flag.parent.mkdir(exist_ok=True)
    flag.write_text(target_str)


# ─────────────────────────────────────────────────────────────────────
# Step 1: WMS 로그인 → 쿠키 추출
# ─────────────────────────────────────────────────────────────────────
async def _try_login(page) -> dict:
    """로그인 1회 시도 → 대시보드 진입 확인 후 쿠키 반환. 실패 시 빈 dict."""
    await page.goto(WMS_URL, wait_until="networkidle")
    await page.wait_for_timeout(1000)
    await page.locator("input[name='loginId']").fill(WMS_ID)
    await page.locator("input[name='password']").first.fill(WMS_PW)
    await page.locator("button:has-text('인증 번호 발송')").click()
    try:
        # 고정 대기 대신 대시보드 진입을 실제로 기다림 (레이스 컨디션 방지)
        await page.wait_for_url("**/v1/dashboard**", timeout=15000)
    except Exception:
        return {}
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(500)
    cookies = await page.context.cookies()
    cdict = {c["name"]: c["value"] for c in cookies}
    return cdict if "SESSION" in cdict else {}


async def wms_login(max_retries: int = 3) -> dict:
    print("WMS 로그인 중...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        for attempt in range(1, max_retries + 1):
            ctx  = await browser.new_context()
            page = await ctx.new_page()
            cdict = await _try_login(page)
            await ctx.close()

            if cdict:
                await browser.close()
                print(f"  로그인 완료 (쿠키 {len(cdict)}개, 시도 {attempt}/{max_retries})")
                return cdict

            print(f"  [재시도 {attempt}/{max_retries}] 로그인 미완료 — 재시도")

        await browser.close()

    raise RuntimeError("WMS 로그인 실패 (재시도 초과) — 계정/네트워크 상태 확인 필요")


# ─────────────────────────────────────────────────────────────────────
# Step 2: 작업자 목록 → workers 테이블 업데이트
# ─────────────────────────────────────────────────────────────────────
def update_workers(session: requests.Session, conn, today_str: str):
    print("\n작업자 목록 수집 중...")

    resp = session.get(
        f"{WMS_URL}/v1/system/user/search",
        params={"warehouseOperatorCd": "LETUS", "mainWarehouseId": "", "searchText": ""},
    )
    resp.raise_for_status()
    users = resp.json()

    WORKER_RE = re.compile(r'^(IPC|BS|FS)-?\d+$', re.IGNORECASE)
    workers = []

    for u in users:
        user_id   = str(u.get("userId",       "")).strip()
        user_nm   = str(u.get("userNm",        "")).strip()
        phone     = str(u.get("userHp",        "")).strip()
        warehouse = str(u.get("mainWarehouseId","")).strip()

        if warehouse != "YA":         continue
        if not WORKER_RE.match(user_id): continue

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

    print(f"  {len(workers)}명 수집 (양지1센터 YA)")

    cur = conn.cursor()
    for w in workers:
        cur.execute("""
            INSERT INTO workers
                (worker_id, worker_name, display_name, owner, shift,
                 group_name, phone, is_active, first_seen, last_seen)
            VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,%s,%s)
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
    print(f"  workers 업데이트 완료 ({len(workers)}명)")


# ─────────────────────────────────────────────────────────────────────
# Step 3: PALLET HISTORY 다운로드 (피킹)
# ─────────────────────────────────────────────────────────────────────
def fetch_owner_list(session: requests.Session) -> list:
    """WMS 전체 owner 목록 조회 (ownerId, ownerNm, isUse 포함)"""
    resp = session.get(
        f"{WMS_URL}/v1/master/owner/list",
        params={"warehouseId": "YA"},
    )
    resp.raise_for_status()
    return resp.json()


def build_owner_name_map(owners: list) -> dict:
    """{ownerId: ownerNm} 매핑 — 입고/이동 raw의 OWNER 컬럼(한글명) 복원용"""
    return {o["ownerId"]: o["ownerNm"] for o in owners}


def fetch_3pl_owner_ids(owners: list) -> list:
    """전체 owner 목록에서 그룹사(_GROUP_OWNERS) 제외 활성 owner IDs 반환"""
    ids = [
        o["ownerId"] for o in owners
        if o.get("isUse") and o["ownerId"] not in _GROUP_OWNERS
    ]
    print(f"  3PL owner: {len(ids)}개 (그룹사 {len(_GROUP_OWNERS)}개 제외)")
    return ids


_PALLET_COLS = ["작업자", "WAVE명", "WAVE번호", "PLT ID", "오더번호", "ITEM ID",
                "피킹수량", "LOCATION", "작업일시", "OWNER"]


def _build_pallet_df(rows: list, owner_map: dict):
    """palletHistory API 원본 필드 → picking_automation_v2.py가 기대하는 raw 컬럼명으로 매핑
    (2026-07-07: 매핑 없이 raw JSON 그대로 저장하던 버그 수정 — KeyError: '작업일시' 원인)
    """
    import pandas as pd
    recs = [{
        "작업자": r.get("fstUsrNm"),
        "WAVE명": r.get("waveNm"),
        "WAVE번호": r.get("waveNo"),
        "PLT ID": r.get("unitLoadId"),
        "오더번호": r.get("orderNo"),
        "ITEM ID": r.get("itemId"),
        "피킹수량": r.get("confirmQty"),
        "LOCATION": r.get("toLocation"),
        "작업일시": r.get("fstSysDt"),
        "OWNER": owner_map.get(r.get("ownerId"), r.get("ownerId")),
    } for r in rows]
    return pd.DataFrame(recs, columns=_PALLET_COLS)


def fetch_pallet_history(session: requests.Session, owner_ids: list,
                         date_from: date, date_to: date, owner_map: dict,
                         warehouse_id: str = "YA"):
    resp = session.get(
        f"{WMS_URL}/v1/performance/palletHistory/getPerformancePalletHistoryList",
        params=[
            ("warehouseId", warehouse_id), ("itemId", ""),
            ("fromDt", date_from.strftime("%Y%m%d")),
            ("toDt",   date_to.strftime("%Y%m%d")),
            ("historyYn", "N"),
        ] + [("ownerIdArr", oid) for oid in owner_ids],
    )
    resp.raise_for_status()
    return _build_pallet_df(resp.json(), owner_map)


def download_all(session: requests.Session, target: date, owner_3pl_ids: list, owner_map: dict) -> dict:
    """전체 브랜드 PALLET HISTORY 다운로드. 반환: {brand: Path}"""
    save_dir = DATA_DIR / target.strftime("%Y/%m")
    save_dir.mkdir(parents=True, exist_ok=True)

    all_brands = {**NIGHT_BRANDS, **DAY_BRANDS}
    downloaded = {}

    print(f"\n피킹 데이터 다운로드 (target={target}) ...")

    for brand, owner_ids in all_brands.items():
        if owner_ids is None:   # 3PL
            owner_ids = owner_3pl_ids

        d_from, d_to, fname = get_file_spec(brand, target)
        day_label = f"{d_from.strftime('%m/%d')}~{d_to.strftime('%m/%d')}" \
                    if d_from != d_to else d_from.strftime('%m/%d')

        print(f"  [{brand}] {day_label} 수집 중...")
        try:
            df = fetch_pallet_history(session, owner_ids, d_from, d_to, owner_map, BRAND_WAREHOUSE[brand])
            if len(df) == 0:
                print(f"    0건 — 파일 미저장")
                continue

            path = save_dir / fname
            df.to_excel(str(path), index=False)
            downloaded[brand] = path
            print(f"    {len(df)}건 → {path.name}")

        except Exception as e:
            print(f"    오류: {e}")

    return downloaded


# ─────────────────────────────────────────────────────────────────────
# Step 4: ITEM HISTORY 다운로드 (입고/이동) — 항상 단일일(target)
# ─────────────────────────────────────────────────────────────────────
_INBOUND_COLS = ["OWNER", "ITEM ID", "구분", "수량", "LOCATION", "LOT 번호",
                 "입고일자", "작업자계정", "작업자", "입고 차수", "입하번호",
                 "입고 유형", "작업일시"]
_MOVE_COLS    = ["OWNER", "ITEM ID", "이동수량", "From Location", "To Location",
                 "작업일시", "작업자", "사용 시스템", "조정 사유", "상세 설명"]


def fetch_item_history(session: requests.Session, owner_ids: list, target: date,
                       warehouse_id: str = "YA") -> dict:
    """실적관리 > ITEM HISTORY 화면과 동일한 API.
    한 번의 호출로 입하/입고실적, 입하/적치실적, 피킹실적, 이동, 재고조정을 모두 반환.
    우리가 쓰는 건 inboundHistoryList2(적치실적=입고) / moveHistoryList(이동) 뿐.
    """
    ymd = target.strftime("%Y%m%d")
    resp = session.get(
        f"{WMS_URL}/v1/performance/itemHistory/getPerformanceItemHistoryList",
        params=[
            ("warehouseId", warehouse_id), ("fromDt", ymd), ("toDt", ymd), ("historyYn", "N"),
        ] + [("ownerIdArr", oid) for oid in owner_ids],
    )
    resp.raise_for_status()
    return resp.json()


def _build_inbound_df(rows: list, owner_map: dict):
    import pandas as pd
    recs = [{
        "OWNER": owner_map.get(r["ownerId"], r["ownerId"]),
        "ITEM ID": r["itemId"],
        "구분": r["gubun"],
        "수량": r["confirmQty"],
        "LOCATION": r["toLocation"],
        "LOT 번호": r["lotNo"],
        "입고일자": r["ipgoDate"],
        "작업자계정": r["fstUsrCd"],
        "작업자": r["userNm"],
        "입고 차수": r["wpnSeq"],
        "입하번호": r["inboundNo"],
        "입고 유형": r["receiptTypeNm"],
        "작업일시": r["historyDt"],
    } for r in rows]
    return pd.DataFrame(recs, columns=_INBOUND_COLS)


def _build_move_df(rows: list, owner_map: dict):
    import pandas as pd
    recs = [{
        "OWNER": owner_map.get(r["ownerId"], r["ownerId"]),
        "ITEM ID": r["itemId"],
        "이동수량": r["currentStockQty"],
        "From Location": r["locationId"],
        "To Location": r["toLocationId"],
        "작업일시": r["moveDt"],
        "작업자": r["userNm"],
        "사용 시스템": r["moveSystem"],
        "조정 사유": r["adjustReason"],
        "상세 설명": r["adjustRemark"],
    } for r in rows]
    return pd.DataFrame(recs, columns=_MOVE_COLS)


def download_inbound_move(session: requests.Session, target: date,
                          owner_map: dict, owner_3pl_ids: list) -> dict:
    """브랜드별 입고_/이동_ raw 다운로드. 반환: {"입고_<brand>"|"이동_<brand>": Path}"""
    save_dir = INBOUND_RAW_DIR / target.strftime("%m")
    save_dir.mkdir(parents=True, exist_ok=True)

    all_brands = {**NIGHT_BRANDS, **DAY_BRANDS}   # 브랜드 그룹은 피킹과 동일 (야간 구분 없음, 항상 단일일)
    mmdd = target.strftime("%m%d")
    downloaded = {}

    print(f"\n입고/이동 데이터 다운로드 (target={target}) ...")

    for brand, owner_ids in all_brands.items():
        if owner_ids is None:   # 3PL
            owner_ids = owner_3pl_ids

        print(f"  [{brand}] {mmdd} 수집 중...")
        try:
            data = fetch_item_history(session, owner_ids, target, BRAND_WAREHOUSE[brand])

            inbound_df = _build_inbound_df(data.get("inboundHistoryList2", []), owner_map)
            move_df    = _build_move_df(data.get("moveHistoryList", []), owner_map)

            if len(inbound_df):
                p = save_dir / f"입고_{brand}_{mmdd}.xlsx"
                inbound_df.to_excel(str(p), index=False)
                downloaded[f"입고_{brand}"] = p
                print(f"    입고 {len(inbound_df)}건 → {p.name}")
            else:
                print(f"    입고 0건 — 파일 미저장")

            if len(move_df):
                p = save_dir / f"이동_{brand}_{mmdd}.xlsx"
                move_df.to_excel(str(p), index=False)
                downloaded[f"이동_{brand}"] = p
                print(f"    이동 {len(move_df)}건 → {p.name}")
            else:
                print(f"    이동 0건 — 파일 미저장")

        except Exception as e:
            print(f"    오류: {e}")

    return downloaded


# ─────────────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────────────
async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date",  help="집계 대상 날짜 YYYY-MM-DD (기본: 어제)")
    ap.add_argument("--force", action="store_true", help="중복 실행 무시")
    ap.add_argument("--skip-inbound", action="store_true", help="입고/이동 다운로드 생략 (피킹만)")
    args = ap.parse_args()

    if args.date:
        target = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target = (datetime.now() - timedelta(days=1)).date()

    target_str = str(target)
    today_str  = str(datetime.now().date())

    if not args.force and already_ran(target_str):
        print(f"[{target_str}] 이미 실행 완료. (--force 로 재실행)")
        return

    print(f"\n{'='*55}")
    print(f"WMS 데이터 수집 RPA")
    print(f"  실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  집계 대상: {target_str}")
    print(f"{'='*55}\n")

    conn = psycopg2.connect(SUPABASE_DB_URL)
    print("DB 연결 성공")

    cookies = await wms_login()
    session = requests.Session()
    session.cookies.update(cookies)
    session.headers.update({"User-Agent": "Mozilla/5.0", "Referer": WMS_URL})

    try:
        update_workers(session, conn, today_str)

        owners        = fetch_owner_list(session)
        owner_map     = build_owner_name_map(owners)
        owner_3pl_ids = fetch_3pl_owner_ids(owners)

        downloaded = download_all(session, target, owner_3pl_ids, owner_map)

        if not args.skip_inbound:
            downloaded.update(
                download_inbound_move(session, target, owner_map, owner_3pl_ids)
            )
    except Exception as e:
        import traceback
        print(f"\n오류: {e}")
        traceback.print_exc()
        conn.close()
        return

    conn.close()
    mark_ran(target_str)

    print(f"\n{'='*55}")
    print(f"수집 완료  {datetime.now().strftime('%H:%M:%S')}")
    if downloaded:
        print(f"저장 파일 ({len(downloaded)}개):")
        for key, path in downloaded.items():
            print(f"  {path.name}")
    else:
        print("저장된 파일 없음")
    print(f"\n다음: python scripts/batch_run.py --dates {target_str}")
    print(f"      python scripts/inbound_batch_run.py --dates {target_str}")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    asyncio.run(main())
