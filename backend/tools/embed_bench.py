"""Latency and memory of the local embedding model, for ai-providers.md.

Run inside a backend pod (the image has the model): `python tools/embed_bench.py`. Each thread
count runs in a fresh process, so its memory is that of one worker that has loaded the model.
"""

import os
import resource
import statistics
import subprocess
import sys
import time
from pathlib import Path

# Run as a script from anywhere: the backend root holds the app package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SUMMARY = (
    "我認為應該拉下拉桿救五個人，因為在無法避免傷亡的情況下，讓更多人活下來比較重要；"
    "但我也承認親手造成一個人死亡會讓我很難接受。"
)


def memory_mb() -> tuple[float, float]:
    """(now, peak) resident memory of this process."""
    try:
        with open("/proc/self/status") as status:
            fields = dict(line.split(":", 1) for line in status)
        return int(fields["VmRSS"].split()[0]) / 1024, int(fields["VmHWM"].split()[0]) / 1024
    except FileNotFoundError:  # macOS: no /proc, and ru_maxrss is in bytes
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20
        return peak, peak


def p50_ms(texts: list[str], runs: int) -> float:
    from app.modules.ai_providers.service import embed

    times = []
    for _ in range(runs):
        start = time.perf_counter()
        embed(texts)
        times.append((time.perf_counter() - start) * 1000)
    return statistics.median(times)


def measure() -> None:
    from app.modules.ai_providers.service import embed

    start = time.perf_counter()
    embed([SUMMARY])
    load = time.perf_counter() - start
    one = p50_ms([SUMMARY], 30)
    klass = p50_ms([SUMMARY[: 40 + 2 * i] for i in range(30)], 5)
    now, peak = memory_mb()
    print(
        f"| {os.environ['EMBEDDING_THREADS']} | {one:.0f} ms | {klass:.0f} ms | "
        f"{now:.0f} MB | {peak:.0f} MB | {load:.1f} s |"
    )


if __name__ == "__main__":
    if len(sys.argv) > 1:
        measure()
    else:
        print("| 執行緒 | 一份統整 p50 | 30 人一班 p50 | 載入後記憶體 | 記憶體峰值 | 載入時間 |")
        print("|---|---|---|---|---|---|", flush=True)
        for threads in ("1", "4"):
            env = {**os.environ, "EMBEDDING_THREADS": threads}
            subprocess.run([sys.executable, __file__, "measure"], env=env, check=True)
