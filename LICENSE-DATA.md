# Licence for the data

The source code of Dinozoa is licensed under the **GNU Affero General Public
License v3.0** (see `LICENSE`).

The **data** is licensed separately, under
**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International**
(CC BY-NC-SA 4.0).

Copyright (C) 2026 Matej Krsteski

## What "the data" means here

- `public/data/dinosaur-database.json` — the 627-node taxonomic tree, the
  selection of 472 guessable animals, the 129-animal answer pool, and the 270
  alternate and pop-culture names.
- The `SURVEY_POOL`, `ALIASES` and `GENERA` tables inside `build_db.py`, which are
  the source those files are generated from.
- The survey results and the recognition thresholds derived from them.

The code that *processes* this data is under AGPL-3.0. Only the compiled
information itself is under CC BY-NC-SA.

## What the licence allows

- **Share** — copy and redistribute the data in any medium or format.
- **Adapt** — remix, transform and build upon it.

## On these conditions

- **Attribution** — credit Matej Krsteski, link to this licence, and state whether
  changes were made.
- **NonCommercial** — not for commercial purposes.
- **ShareAlike** — distribute any adaptation under this same licence.

Full text: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
Plain-language summary: https://creativecommons.org/licenses/by-nc-sa/4.0/

## Why the data is licensed more strictly than the code

The code is a taxonomic tree renderer. Someone could write an equivalent in a
weekend, and the AGPL is there to keep improvements to it public.

The database is the part that took real work: building the tree, selecting the
guessable set, surveying 80 people on which animals a general audience actually
recognises, and rebuilding the answer pool from those results. That is the piece
worth protecting from being lifted into a commercial product.

## Third-party material

Animal photographs and illustrations are **not** covered by this licence. They are
fetched from Wikipedia at runtime and remain under their own terms, most commonly
CC BY-SA. The game credits the image author where the Wikimedia API supplies one.

Taxonomic names and the relationships between them are facts and are not subject
to copyright.
