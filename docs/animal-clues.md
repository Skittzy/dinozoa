# Factual and name hints

The feature is entirely local. `animal-clues.json` loads with the taxonomy; it contains
258 individually source-checked facts for the current 129 eligible answers, linking to
185 distinct museum, university, government, research-paper or curated research-database
pages. Clues are original paraphrases. This was an implementation source review, not an
independent review by a palaeontologist.

## Coverage and limitations

`animal-clue-coverage.json` lists every eligible answer, its immediate parent, the number
of direct guessable animals in that group, playable topics, withheld facts and research
qualifications. It is generated from the actual tree and checked by `npm test`.

- Every current answer has two researched facts. 256 facts are eligible for selection.
- Two general facts are withheld: the ceratopsian rostral beak in Psittacosaurus and
  curved claws/serrated teeth in Coelophysis. Their sources remain recorded.
- Jaekelopterus’s two facts concern the same claw discovery. They share a topic so a
  player cannot buy both. Jaekelopterus, Psittacosaurus and Coelophysis currently have
  only one independently playable topic each.
- Thirteen answers are the only direct guessable animal in their last branch. Once the
  milestone supplies that information, factual clues cannot narrow the candidate set;
  the factual button explains its unavailability. Name Clue remains available.
- Detailed contradiction evidence currently helps three answers within their final
  group. Most clues are identification cues for players, **not automatic eliminations**.
  Full comparison coverage of the 472 guessable animals remains incomplete. Additional
  anatomical comparisons and gameplay balancing are the main content improvement left.
- Historical and discovery clues vary in difficulty. Some knowledgeable players will
  identify an animal immediately; others may prefer the spelling option. No claim is
  made that every clue reduces every player's uncertainty equally.
- Dracorex, Dakotaraptor and Troodon have explicit uncertainty qualifications. Haast’s
  eagle, megalodon, mammoths, woolly rhinos and other species-specific examples are
  qualified in the text rather than applied indiscriminately to their whole genus.
- Existing taxonomy disputes and other tree corrections are outside this feature.

Source coverage is complete for the current answer pool; stronger comparisons and
specialist review are still worthwhile. No unsupported facts were filled in to force
coverage. Avoid interpreting a source-checked flag as proof of scientific certainty.

## Selection and evidence

`GameState.plausibleCandidates()` starts with all guessable leaf IDs, including animals
outside the answer pool. Aliases already resolve to those same IDs. Guesses constrain
the set by their actual lowest-common-ancestor feedback. Bought clades, the final-branch
announcement, name length/revealed positions and explicitly contradicted facts add
constraints.

Each clue carries:

- Stable `id`, `text`, `category`, sources, scope and review date/status.
- `topic`, shared by alternative wording about the same information.
- `distinguishing`; false records must explain why they are withheld.
- `sharedBy`: animals positively documented to fit the clue.
- `excludes`: only animals with a documented contradiction.
- `comparisonEvidence`: the explanation and citations supporting each nontrivial match
  or exclusion. Etymology comparisons cite the other animal’s documented name meaning.

Missing evidence is unknown. A Tanzanian fossil occurrence does **not** exclude an animal
with fossils in Wyoming. The anatomical Pterygotus clue explicitly records that
Jaekelopterus shares its crushing pincers, so it is skipped when those are the only two
possibilities. General characters already implied by the clade should be withheld.

Selection skips used topics, withheld facts and facts positively shared by every remaining
candidate. It prefers a moderate evidenced split, with stable clue-ID tie breaking.
Descriptive identification cues remain available when comparisons are unknown; these
do not silently remove animals. The interface never promises a numerical reduction.

Name Clues progressively reveal canonical-name positions, favouring positions that
distinguish candidates. The underscore pattern also supplies length. Guesses still accept
existing aliases. When the entire spelling is revealed, the button stops charging.

## Editing content

1. Find the animal’s stable ID in the generated taxonomy. Verify the current eligible pool.
2. Read an appropriate museum or research source and write a short original clue. Keep
   estimates, disputed interpretations and species/specimen scope explicit.
3. Add source URLs and useful labels. Do not reuse a clue ID for a different claim.
4. Assess whether the clue helps in its actual final group. Record shared topics and
   known matches. Add exclusions **only** with explicit evidence about the competing
   animal; do not infer them from missing records or geographic absence.
5. Withhold weak/unsupported claims using `distinguishing: false` and `withheldReason`.
   A missing useful clue must leave Name Clue available without spending anything.
6. Bump the database version after a content change. Run `npm run clues:audit`, review
   the generated coverage differences, then `npm test` and `npm run build`.

The database is maintained directly. It is not generated from live Wikipedia summaries,
and running `build_db.py` does not rewrite clue text. The audit flags missing or stale
profiles when the answer pool changes.

## Saved content policy

Each purchase stores its type, ID, paid cost, version and name position when applicable.
Saving also records whether the celebration has already appeared. Old Daily saves need
neither field and keep their existing guesses and clade hints.

A removed fact or a different database version retains its original cost and free-hint
usage. Its text is replaced with a clear retired-content message; its old exclusions stop
being applied. A failed file load is described as unavailable, not as a content revision.
The game never substitutes another fact for free. Name records are independently versioned.
This deliberately conservative policy retires saved facts even when a version change
only affects another animal. Future content archives could retain old descriptions.

Full sources appear on the completed-round screen, so article names and URLs cannot
accidentally spoil an active puzzle. Shared results contain counts only.

## Browser verification

Start `npm run dev`, then use an existing Playwright installation:

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/verify-hints-browser.cjs
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/verify-hints-browser.cjs --webkit
```

Playwright’s Chromium and WebKit browsers must be installed in that environment. If they
use a custom directory, also set `PLAYWRIGHT_BROWSERS_PATH`. Playwright is optional test
tooling; it is not a project/runtime dependency. `HINT_TEST_URL` can override the dev URL.
Tests create isolated browser profiles and local saves, never use a personal browser
profile, and require the development-only preview.

Verified flows include actual guesses, bought clades, inspection without unlocking,
double-tap protection, the shared free allowance, last-guess protection, load failure,
keyboard focus/Escape, tutorial ordering, persistent journals, completed-game citations,
Endless resume/transitions/counts, and Daily isolation. Mobile checks use 390×740 and
320×480 viewports with touch and reduced-motion settings. These are browser simulations,
not tests on a physical iPhone or Android device.

For visual feedback, open `http://127.0.0.1:5173/?hint-preview=359` or `?hint-preview=360`.
Each is an isolated practice round starting at the milestone. It keeps its own save and
does not record Daily results. To restart one, remove only its
`dinozoa.game.hint-preview.<id>` localStorage key. Production builds ignore the parameter.
