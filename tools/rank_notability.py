#!/usr/bin/env python3
"""
rank_notability.py — measure how well known each taxon actually is.

WHY THIS EXISTS
---------------
The FAMOUS allow-list in build_db.py decides which animals can be the daily
answer. That list was assembled by applying three stated recognition gates
(screen canon / museum canon / toy-and-book canon) from the author's own
knowledge. It is defensible, but it is NOT measured — it is one person's
judgement about what a general audience recognises.

This script replaces that judgement with evidence: the number of times each
taxon's English Wikipedia article was actually viewed by human readers over the
last 12 months. That is a direct measurement of public interest, which is the
thing "recognisable" was always a proxy for.

SOURCE
------
Wikimedia REST Pageviews API, `user` agent filter (excludes bots and spiders):
  https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/
      en.wikipedia/all-access/user/{ARTICLE}/monthly/{START}/{END}
Public, no key required. Docs: https://wikimedia.org/api/rest_v1/

Wikimedia asks API consumers to send a descriptive User-Agent with contact
details. EDIT THE CONSTANT BELOW before running, or you may be rate-limited.

USAGE
-----
    python3 tools/rank_notability.py                 # writes notability.csv
    python3 tools/rank_notability.py --top 200       # also prints a FAMOUS block

Then paste the printed block over FAMOUS in build_db.py and re-run
`python3 build_db.py`.

CHOOSING THE CUTOFF
-------------------
Don't pick a pageview threshold in the abstract — look at the sorted curve in
notability.csv and cut where it falls off a cliff. Two sanity anchors: whatever
number Tyrannosaurus scores is the ceiling, and anything scoring below roughly a
tenth of, say, Stegosaurus is almost certainly too obscure to be a fair answer.

A pool of 150-250 is the sweet spot. Below ~120 the repeats get noticeable;
above ~250 you are back to asking people to name animals they've never met.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

# --- EDIT THIS -------------------------------------------------------------
USER_AGENT = "Dinozoa/1.0 (https://dinozoa.com; hello@dinozoa.com) python-urllib"
# ---------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "..", "public", "data", "dinosaur-database.json")
OUT = os.path.join(HERE, "..", "notability.csv")

API = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
       "en.wikipedia/all-access/user/{article}/monthly/{start}/{end}")


def leaves() -> list[tuple[str, str]]:
    """Every guessable leaf as (scientific, common)."""
    with open(DB, encoding="utf-8") as fh:
        db = json.load(fh)
    out: list[tuple[str, str]] = []

    def walk(node):
        if not node.get("children"):
            out.append((node["scientific"], node.get("common") or ""))
        for child in node.get("children", []):
            walk(child)

    walk(db["root"])
    return out


def window() -> tuple[str, str]:
    """The last 12 whole months, as the API's YYYYMMDD strings."""
    today = date.today().replace(day=1)
    end = today - timedelta(days=1)
    start = (end.replace(day=1) - timedelta(days=365)).replace(day=1)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def views(article: str, start: str, end: str) -> int | None:
    """Total human pageviews for one article. None means no such article."""
    url = API.format(article=urllib.parse.quote(article.replace(" ", "_"), safe=""),
                     start=start, end=end)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
        return sum(item["views"] for item in data.get("items", []))
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None          # article doesn't exist under that title
        if err.code == 429:
            time.sleep(5)        # rate limited — back off and retry once
            return views(article, start, end)
        raise


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=0,
                    help="also print a ready-to-paste FAMOUS block of the top N")
    ap.add_argument("--delay", type=float, default=0.12,
                    help="seconds between requests (be polite to Wikimedia)")
    args = ap.parse_args()

    if "example.com" in USER_AGENT:
        print("WARNING: set USER_AGENT at the top of this file to something with your\n"
              "         real contact details, or Wikimedia may throttle you.\n",
              file=sys.stderr)

    start, end = window()
    rows: list[tuple[str, str, int]] = []
    taxa = leaves()
    print(f"measuring {len(taxa)} taxa over {start}-{end}...", file=sys.stderr)

    for i, (sci, common) in enumerate(taxa, 1):
        # Try the scientific name first; genus articles are titled that way.
        # Fall back to the common name so things like "megalodon" still resolve.
        n = views(sci, start, end)
        if n is None and common:
            n = views(common, start, end)
        rows.append((sci, common, n or 0))
        if i % 25 == 0:
            print(f"  {i}/{len(taxa)}", file=sys.stderr)
        time.sleep(args.delay)

    rows.sort(key=lambda r: -r[2])

    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["rank", "scientific", "common", "pageviews_12mo"])
        for rank, (sci, common, n) in enumerate(rows, 1):
            w.writerow([rank, sci, common, n])
    print(f"\nwrote {OUT}", file=sys.stderr)

    missing = [r[0] for r in rows if r[2] == 0]
    if missing:
        print(f"{len(missing)} taxa returned no data (check the article titles): "
              f"{', '.join(missing[:12])}{'...' if len(missing) > 12 else ''}",
              file=sys.stderr)

    print("\ntop 20 by measured readership:", file=sys.stderr)
    for rank, (sci, common, n) in enumerate(rows[:20], 1):
        print(f"  {rank:>3}. {sci:<24} {n:>10,}", file=sys.stderr)

    if args.top:
        chosen = sorted(r[0] for r in rows[:args.top])
        print("\n# Generated by tools/rank_notability.py — top "
              f"{args.top} by English Wikipedia pageviews, {start}-{end}.")
        print("FAMOUS = {")
        for i in range(0, len(chosen), 6):
            print("    " + " ".join(f'"{n}",' for n in chosen[i:i + 6]))
        print("}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
