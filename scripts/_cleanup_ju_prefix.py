"""picking_worker_daily의 worker_name에서 ㈜ 접두어 일괄 제거 (일회성 정리).

㈜는 KGA 엑셀 수식이 21시 이전 작업자에 붙이던 옛 주/야 구분자.
같은 사람이 21시 경계에 걸치면 "㈜[주간]X"와 "[주간]X" 두 행으로 쪼개져
있으므로 (금요일 wave 연장 케이스), 겹치는 행은 수치 합산 후 병합하고
나머지는 단순 이름 변경한다. --dry-run 지원.
"""
import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import psycopg2

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
DB_URL = os.getenv("SUPABASE_POOLER_URL") or os.getenv("SUPABASE_DB_URL")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM picking_worker_daily WHERE worker_name LIKE '%%㈜%%'")
    total = cur.fetchone()[0]
    print(f"㈜ 포함 행: {total}건")
    if total == 0:
        print("정리할 것 없음")
        return

    # 1) 병합 대상: 같은 (날짜, 구역)에 ㈜제거 후 이름이 기존 무접두 행과 겹치는 쌍
    cur.execute("""
        SELECT a.work_date, a.zone, a.worker_name, b.worker_name
        FROM picking_worker_daily a
        JOIN picking_worker_daily b
          ON a.work_date = b.work_date AND a.zone = b.zone
         AND REPLACE(a.worker_name, '㈜', '') = b.worker_name
        WHERE a.worker_name LIKE '%%㈜%%'
        ORDER BY a.work_date, a.zone, a.worker_name
    """)
    pairs = cur.fetchall()
    print(f"병합 대상(쪼개진 작업자): {len(pairs)}쌍")
    for wd, zone, ju_name, bare_name in pairs:
        print(f"  {wd} {zone}: {ju_name} + {bare_name} → 합산")

    if args.dry_run:
        print("[dry-run] 실제 변경 없음")
        return

    # 병합: 무접두 행(b)에 ㈜행(a) 수치 합산 후 ㈜행 삭제
    for wd, zone, ju_name, bare_name in pairs:
        cur.execute("""
            UPDATE picking_worker_daily b SET
                std_time_hr = b.std_time_hr + a.std_time_hr,
                act_time_hr = b.act_time_hr + a.act_time_hr,
                pick_amount = COALESCE(b.pick_amount, 0) + COALESCE(a.pick_amount, 0),
                pick_box    = COALESCE(b.pick_box, 0)    + COALESCE(a.pick_box, 0),
                wms_time_hr = CASE
                    WHEN b.wms_time_hr IS NULL AND a.wms_time_hr IS NULL THEN NULL
                    ELSE COALESCE(b.wms_time_hr, 0) + COALESCE(a.wms_time_hr, 0)
                END
            FROM picking_worker_daily a
            WHERE b.work_date = %s AND b.zone = %s AND b.worker_name = %s
              AND a.work_date = %s AND a.zone = %s AND a.worker_name = %s
        """, (wd, zone, bare_name, wd, zone, ju_name))
        cur.execute("""
            DELETE FROM picking_worker_daily
            WHERE work_date = %s AND zone = %s AND worker_name = %s
        """, (wd, zone, ju_name))
    print(f"병합 완료: {len(pairs)}쌍")

    # 2) 나머지: 단순 이름 변경
    cur.execute("""
        UPDATE picking_worker_daily
        SET worker_name = REPLACE(worker_name, '㈜', '')
        WHERE worker_name LIKE '%%㈜%%'
    """)
    print(f"이름 변경 완료: {cur.rowcount}건")

    conn.commit()
    cur.close()
    conn.close()
    print("커밋 완료")


if __name__ == "__main__":
    main()
