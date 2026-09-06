#!/usr/bin/env python3
"""
cache_wiki.py — bake the Wikipedia blurbs and images into a local file.

WHY
---
The info card fetches a description and a picture from Wikipedia every time a new
taxon appears. That works, and the per-IP rate limits are irrelevant for a browser
app because every player requests from their own address. The reasons to cache are
different ones:

  * Speed. Two round trips to Wikipedia after every guess is the slowest thing in
    the game. A cache hit renders instantly.
  * Reliability. Wikipedia occasionally rate-limits, redirects, or renames an
    article. A cached copy cannot break mid-game.
  * Attribution. Resolving the artist once, at build time, is more dependable than
    parsing extmetadata in the browser on every load.

The cache is a separate file from the database on purpose. `build_db.py` rewrites
the database whenever the tree or answer pool changes, and a combined file would
lose the cache on every regeneration.

USAGE
-----
    python3 tools/cache_wiki.py                 # every leaf animal
    python3 tools/cache_wiki.py --answers-only  # only the 129 possible answers
    python3 tools/cache_wiki.py --clades        # also cache the internal clades

Writes `public/data/wiki-cache.json`. The game loads it if present and falls back
to live fetching for anything missing, so a partial cache is perfectly usable and
deleting the file simply restores the old behaviour.

Run it AFTER build_db.py. Re-run it whenever the answer pool changes. Expect a few
minutes for the full tree; it is deliberately polite about request rate.

EDIT THE USER AGENT BELOW before running. Wikimedia asks scripts to identify
themselves with real contact details.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# --- EDIT THIS -------------------------------------------------------------
USER_AGENT = "Dinozoa/1.0 (https://dinozoa.com; hello@dinozoa.com) python-urllib"
# ---------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "..", "public", "data", "dinosaur-database.json")
OUT = os.path.join(HERE, "..", "public", "data", "wiki-cache.json")

SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
IMAGES = ("https://en.wikipedia.org/w/api.php?action=query&format=json"
          "&generator=images&titles={title}&gimlimit=60"
          "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800")

# Kept deliberately in step with scoreImage() in src/ui/wiki.ts. If you change the
# heuristic there, change it here too, or the cached picture and the live one will
# disagree for the same animal.
LIFELIKE = ("restoration", "reconstruction", "reconstitution", "life", "artist",
            "impression", "paleoart", "palaeoart", "_by_", " by ")
# "model" is deliberately absent: on taxon pages it matches scientific modelling
# ("Robustly modeled tail of Carnotaurus") far more often than 3D creature art.
RENDERED = ("render", "3d", "cgi", "digital")
# Part of an animal is not the animal.
PARTIAL = ("tail", "limb", "forelimb", "hindlimb", " arm", " hand", " foot",
           " feet", " paw", " horn", " crest", "frill", "brain", "endocast",
           "muscle", "myolog", "anatomy", "dissect", " eye", " skin")
# Film stills, statues and toys are "of" the animal but are not science.
POP_CULTURE = ("king kong", "kong", "godzilla", "jurassic", "movie", "film",
               "cinema", "poster", "screenshot", "statue", "sculpt",
               "animatronic", "toy", "lego", "figurine", "mascot", "costume",
               "cartoon", "comic", "stamp", "logo")
# Wikipedia filenames are multilingual; the English track words missed a
# Spanish-titled Smilodon trackway entirely.
NON_ENGLISH_TRACES = ("huella", "rastro", "icnita", "pisada", "empreinte",
                      "fahrte", "abdruck", "impronta", "orma")
MIN_ACCEPT = 30
NOT_LIFELIKE = ("skelet", "skull", "fossil", "holotype", "specimen", "cast",
                "mount", "bone", "teeth", "tooth", "dentition", "vertebra",
                "femur", "humerus", "claw", "jaw", "pelvis", "footprint", "track",
                "ichno", "egg", "nest", "quarry", "excavation", "size", "scale",
                "comparison", "chart", "diagram", "cladogram", "phylogen",
                "timeline", "strat", "map", "distribution", "locality")


def score_image(filename: str, index: int = 0, names: tuple[str, ...] = ()) -> int:
    name = filename[5:] if filename.lower().startswith("file:") else filename
    low = name.lower()
    if low.endswith(".svg") or not low.endswith((".jpg", ".jpeg", ".png", ".webp")):
        return -100

    # Must be an image OF this taxon. Wikipedia taxon articles carry pictures of
    # relatives, and those outscore the correct image when their filename happens
    # to be more descriptive. See the same guard in src/ui/wiki.ts.
    if names:
        hay = low.replace("_", " ").replace("-", " ")
        if not any(n and len(n) >= 4 and n.lower() in hay for n in names):
            return -100
    if any(k in low for k in POP_CULTURE):
        return -100
    bad = sum(1 for k in NOT_LIFELIKE if k in low)
    bad += sum(1 for k in PARTIAL if k in low)
    bad += sum(1 for k in NON_ENGLISH_TRACES if k in low)
    life = sum(1 for k in LIFELIKE if k in low)
    # Match the TS side's [\s_-](nt|bw|db)\b rule, which substring matching misses.
    # The API returns titles with SPACES ("Thylacoleo BW.jpg"), not underscores.
    # Checking only "_bw"/"-bw" silently rejected every space-separated file, which
    # is most palaeoart by the prolific NT/BW/DB contributors — the cache ended up
    # worse than the live lookup it was supposed to speed up.
    stem = low.rsplit(".", 1)[0]
    if any(stem.endswith(sfx) for sfx in
           ("_nt", "_bw", "_db", "-nt", "-bw", "-db", " nt", " bw", " db")):
        life += 1
    rendered = sum(1 for k in RENDERED if k in low)
    score = -40 * bad + 30 * life
    if rendered and not life and not bad:
        score += 30
    if not bad:
        score += 15 * rendered
    return score + max(0, 10 - index)


def get(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        if err.code == 429:
            time.sleep(5)
            return get(url)
        raise
    except Exception:
        return None


def strip_html(value: str | None) -> str | None:
    if not value:
        return None
    out, depth = [], 0
    for ch in value:
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
        elif depth == 0:
            out.append(ch)
    text = " ".join("".join(out).split())
    return text if 0 < len(text) < 120 else None


def best_image(title: str, names: tuple[str, ...] = ()) -> tuple[str | None, str | None, str | None]:
    """Returns (image url, artist, file description page)."""
    data = get(IMAGES.format(title=urllib.parse.quote(title.replace(" ", "_"), safe="")))
    if not data:
        return None, None, None
    best = None
    for page in (data.get("query", {}).get("pages") or {}).values():
        info = (page.get("imageinfo") or [{}])[0]
        src = info.get("thumburl") or info.get("url")
        if not src:
            continue
        s = score_image(page.get("title", ""), page.get("index", 0), names)
        if s >= MIN_ACCEPT and (best is None or s > best[0]):
            meta = info.get("extmetadata") or {}
            best = (s, src,
                    strip_html((meta.get("Artist") or {}).get("value")),
                    info.get("descriptionurl"))
    return (best[1], best[2], best[3]) if best else (None, None, None)


def collect(node, answers_only: bool, clades: bool, out: list) -> None:
    leaf = not node.get("children")
    if leaf:
        if not answers_only or node.get("answer"):
            out.append((node["scientific"], node.get("common") or ""))
    elif clades:
        out.append((node["scientific"], ""))
    for child in node.get("children", []):
        collect(child, answers_only, clades, out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--answers-only", action="store_true",
                    help="cache only the animals that can be the daily answer")
    ap.add_argument("--clades", action="store_true",
                    help="also cache internal clade pages")
    ap.add_argument("--delay", type=float, default=0.15,
                    help="seconds between requests")
    args = ap.parse_args()

    if "example.com" in USER_AGENT:
        print("WARNING: set USER_AGENT at the top of this file to real contact\n"
              "         details before running. Wikimedia asks scripts to identify\n"
              "         themselves.\n", file=sys.stderr)

    with open(DB, encoding="utf-8") as fh:
        db = json.load(fh)

    titles: list[tuple[str, str]] = []
    collect(db["root"], args.answers_only, args.clades, titles)

    # Keep anything already cached so an interrupted run can be resumed.
    cache: dict[str, dict] = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            cache = json.load(fh)
        titles = [t for t in titles if t[0] not in cache]
        print(f"resuming: {len(cache)} already cached", file=sys.stderr)

    print(f"fetching {len(titles)} taxa...", file=sys.stderr)
    for i, (title, common) in enumerate(titles, 1):
        entry: dict[str, str] = {}
        summary = get(SUMMARY.format(title=urllib.parse.quote(title.replace(" ", "_"), safe="")))
        if summary:
            if summary.get("extract"):
                entry["extract"] = summary["extract"]
            page = ((summary.get("content_urls") or {}).get("desktop") or {}).get("page")
            if page:
                entry["pageUrl"] = page
            # Wikipedia follows redirects silently. Record which article it
            # actually served so the game can say whose description it is.
            served = ((summary.get("titles") or {}).get("canonical")
                      or summary.get("title"))
            if served:
                entry["articleTitle"] = served
            lead = ((summary.get("thumbnail") or {}).get("source")
                    or (summary.get("originalimage") or {}).get("source"))
        else:
            lead = None

        img, artist, file_url = best_image(title, (title, common))
        if img:
            entry["imageUrl"] = img
            if artist:
                entry["artist"] = artist
            if file_url:
                entry["fileUrl"] = file_url
        elif lead:
            entry["imageUrl"] = lead

        if entry:
            cache[title] = entry
        if i % 25 == 0:
            print(f"  {i}/{len(titles)}", file=sys.stderr)
            with open(OUT, "w", encoding="utf-8") as fh:   # checkpoint
                json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))
        time.sleep(args.delay)

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(OUT) / 1024
    withimg = sum(1 for v in cache.values() if v.get("imageUrl"))
    withart = sum(1 for v in cache.values() if v.get("artist"))
    print(f"\nwrote {OUT}", file=sys.stderr)
    print(f"  {len(cache)} taxa, {withimg} with an image, {withart} with an artist credit",
          file=sys.stderr)
    print(f"  {size:.0f} KB", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
