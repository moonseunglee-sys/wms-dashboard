# -*- coding: utf-8 -*-
"""
일자 배치: 각 날짜에 대해 자동화 → 불일치 로그 → DB 적재 순차 실행.
사용: python scripts/run_batch_verify.py 2026-06-13 2026-06-15 ...
"""
import subprocess, sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PY = sys.executable
dates = sys.argv[1:]
if not dates:
    sys.exit("날짜 인자 필요")

results = {}
for d in dates:
    print(f"\n{'='*64}\n  [{d}] 자동화 실행\n{'='*64}", flush=True)
    r1 = subprocess.run([PY, "-u", "scripts/picking_automation_v2.py", "--date", d], cwd=str(BASE))
    if r1.returncode != 0:
        results[d] = f"자동화 실패(exit={r1.returncode})"
        continue
    subprocess.run([PY, "-X", "utf8", "scripts/log_discrepancy.py", "--date", d], cwd=str(BASE))
    r3 = subprocess.run([PY, "-X", "utf8", "scripts/load_picking_db.py", "--date", d], cwd=str(BASE))
    results[d] = "OK" if r3.returncode == 0 else f"적재 실패(exit={r3.returncode})"

print(f"\n{'='*64}\n  배치 완료\n{'='*64}")
for d, r in results.items():
    print(f"  {d}: {r}")
