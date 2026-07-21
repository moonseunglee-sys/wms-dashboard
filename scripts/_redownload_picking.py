"""특정 날짜(들)만 피킹 PALLET HISTORY 재다운로드 (일회성 재처리용).

wms_rpa.py의 로그인/다운로드 로직을 그대로 재사용. 입고/이동은 건드리지 않음
(get_file_spec 수정으로 야간 파일범위가 바뀐 뒤, 이미 처리된 날짜를 새 규칙으로
재다운로드할 때 사용).
"""
import argparse
import asyncio
import sys
from datetime import datetime

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from wms_rpa import wms_login, fetch_owner_list, build_owner_name_map, download_all, WMS_URL

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import requests


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dates", nargs="+", required=True)
    args = ap.parse_args()
    targets = [datetime.strptime(d, "%Y-%m-%d").date() for d in args.dates]

    cookies = await wms_login()
    session = requests.Session()
    session.cookies.update(cookies)
    session.headers.update({"User-Agent": "Mozilla/5.0", "Referer": WMS_URL})

    owners = fetch_owner_list(session)
    owner_map = build_owner_name_map(owners)

    for target in targets:
        downloaded = download_all(session, target, owner_map)
        print(f"[{target}] {len(downloaded)}개 파일:", [p.name for p in downloaded.values()])


if __name__ == "__main__":
    asyncio.run(main())
