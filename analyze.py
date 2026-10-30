"""Summarise one run: page side (VISIT lines in the Cypress log) and server side (SSE open/close log).

Usage: python3 -I analyze.py <run.log> <sse-server.log>

- Silent visit: the worker never sent the page a single message during the dwell.
- First worker message: time from `new SharedWorker` to the first message the page received.
- Coverage: share of the time between the first and last server event with a stream open.
"""
import json
import re
import statistics
import sys

visits = []
for line in open(sys.argv[1], errors="replace"):
    m = re.search(r"VISIT (\{.*\})\s*$", line)
    if m:
        visits.append(json.loads(m.group(1)))

silent, first = 0, []
for v in visits:
    new = [x["t"] for x in v["log"] if x["ev"] == "new"]
    ins = [x["t"] for x in v["log"] if x["ev"].startswith("in:")]
    if not ins:
        silent += 1
    elif new:
        first.append(ins[0] - new[0])
print(f"visits {len(visits)}  silent-worker visits {silent}")
if first:
    print(f"first worker message after new SharedWorker: median {statistics.median(first):.0f} ms  max {max(first)} ms")

events = [json.loads(line) for line in open(sys.argv[2])]
if not events:
    print("server: no SSE connections")
    sys.exit()
opened, lives, covered = {}, [], 0
for e in events:
    if e["ev"] == "open":
        opened[e["id"]] = e["t"]
    elif e["id"] in opened:
        life = e["t"] - opened.pop(e["id"])
        lives.append(life)
        covered += life
end = events[-1]["t"]
covered += sum(end - t for t in opened.values())
window = end - events[0]["t"]
opens = sum(1 for e in events if e["ev"] == "open")
print(f"server: streams opened {opens}  coverage {100 * covered / window:.0f}% of {window / 1000:.0f}s")
if lives:
    print(f"stream life median {statistics.median(lives) / 1000:.1f}s  min {min(lives) / 1000:.1f}s  max {max(lives) / 1000:.1f}s")
