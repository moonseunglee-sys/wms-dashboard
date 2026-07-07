"""
WMS 피킹 데이터 수집 RPA
매일 08:30 자동 실행 (Windows 작업 스케줄러)

흐름:
1. WMS 로그인 (Playwright → 쿠키 추출)
2. 작업자 목록 API → workers 테이블 업데이트
3. 브랜드별 PALLET HISTORY 다운로드 → data/raw/YYYY/MM/ 저장

파일명/날짜 범위:
  - 일룸  (T60I01+T60I03, 야간 있음): 일룸_{MMDD}_{END}.xlsx   date_from=target, date_to=next_weekday
  - 데스커(T60I02,        야간 있음): 데스커_{MMDD}_{END}.xlsx  date_from=target, date_to=next_weekday
  - 퍼시스(T60F01,        주간 전용): 퍼시스_{MMDD}.xlsx        date_from=date_to=target
  - 3PL  (owner 미확정,   주간 전용): 3PL_{MMDD}.xlsx           TODO: owner ID 확인 필요

next_weekday 규칙:
  평일  target → target+1일 (다음날)
  토요일 target → target+2일 (월요일)     ex) 토/일/월
  공휴일 전날  → 수동 --date 사용 권장

다음 단계 (수동 또는 별도 트리거):
  python scripts/batch_run.py --dates YYYY-MM-DD

실행:
  python scripts/wms_rpa.py                     # 기본: 어제 날짜
  python scripts/wms_rpa.py --date 2026-07-04   # 특정 날짜
  python scripts/wms_rpa.py --force             # 중복 실행 무시

.env 필수:
  WMS_ID=아이디
  WMS_PW=비밀번호
  SUPABASE_URL=postgresql://...
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

DATA_DIR     = BASE_DIR / "data" / "raw"
WMS_URL      = "https://wms.letus4u.com"
WMS_ID       = os.getenv("WMS_ID", "")
WMS_PW       = os.getenv("WMS_PW", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")

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
async def wms_login() -> dict:
    print("WMS 로그인 중...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx  = await browser.new_context()
        page = await ctx.new_page()
        await page.goto(WMS_URL, wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.locator("input[name='loginId']").fill(WMS_ID)
        await page.locator("input[name='password']").first.fill(WMS_PW)
        await page.locator("button:has-text('인증 번호 발송')").click()
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)
        cookies = await ctx.cookies()
        await browser.close()

    cdict = {c["name"]: c["value"] for c in cookies}
    print(f"  로그인 완료 (쿠키 {len(cdict)}개)")
    return cdict


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
# Step 3: PALLET HISTORY 다운로드
# ─────────────────────────────────────────────────────────────────────
def fetch_3pl_owner_ids(session: requests.Session) -> list:
    """WMS owner 목록 조회 → 그룹사(_GROUP_OWNERS) 제외 활성 owner IDs 반환"""
    resp = session.get(
        f"{WMS_URL}/v1/master/owner/list",
        params={"warehouseId": "YA"},
    )
    resp.raise_for_status()
    owners = resp.json()
    ids = [
        o["ownerId"] for o in owners
        if o.get("isUse") and o["ownerId"] not in _GROUP_OWNERS
    ]
    print(f"  3PL owner: {len(ids)}개 (그룹사 {len(_GROUP_OWNERS)}개 제외)")
    return ids


def fetch_pallet_history(session: requests.Session, owner_ids: list,
                         date_from: date, date_to: date):
    resp = session.get(
        f"{WMS_URL}/v1/performance/palletHistory/getPerformancePalletHistoryList",
        params=[
            ("warehouseId", "YA"), ("itemId", ""),
            ("fromDt", date_from.strftime("%Y%m%d")),
            ("toDt",   date_to.strftime("%Y%m%d")),
            ("historyYn", "N"),
        ] + [("ownerIdArr", oid) for oid in owner_ids],
    )
    resp.raise_for_status()

    import pandas as pd
    return pd.DataFrame(resp.json())


def download_all(session: requests.Session, target: date) -> dict:
    """전체 브랜드 다운로드. 반환: {brand: Path}"""
    save_dir = DATA_DIR / target.strftime("%Y/%m")
    save_dir.mkdir(parents=True, exist_ok=True)

    all_brands = {**NIGHT_BRANDS, **DAY_BRANDS}
    downloaded = {}

    print(f"\n데이터 다운로드 (target={target}) ...")

    for brand, owner_ids in all_brands.items():
        # 3PL: 그룹사 제외 전체 owner를 런타임에 조회
        if owner_ids is None:
            owner_ids = fetch_3pl_owner_ids(session)

        d_from, d_to, fname = get_file_spec(brand, target)
        day_label = f"{d_from.strftime('%m/%d')}~{d_to.strftime('%m/%d')}" \
                    if d_from != d_to else d_from.strftime('%m/%d')

        print(f"  [{brand}] {day_label} 수집 중...")
        try:
            df = fetch_pallet_history(session, owner_ids, d_from, d_to)
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
# 메인
# ─────────────────────────────────────────────────────────────────────
async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date",  help="집계 대상 날짜 YYYY-MM-DD (기본: 어제)")
    ap.add_argument("--force", action="store_true", help="중복 실행 무시")
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

    conn = psycopg2.connect(SUPABASE_URL)
    print("DB 연결 성공")

    cookies = await wms_login()
    session = requests.Session()
    session.cookies.update(cookies)
    session.headers.update({"User-Agent": "Mozilla/5.0", "Referer": WMS_URL})

    try:
        update_workers(session, conn, today_str)
        downloaded = download_all(session, target)
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
        for brand, path in downloaded.items():
            print(f"  {path.name}")
    else:
        print("저장된 파일 없음")
    print(f"\n다음: python scripts/batch_run.py --dates {target_str}")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    asyncio.run(main())
