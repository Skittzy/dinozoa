# Hint feature implementation checklist

## Milestones

- [x] 1. Rules, factual/name selectors, candidate reasoning and save migration, with tests.
- [x] 2. Reward popup, persistent controls, results and playable preview.
- [x] 3. Individually sourced factual coverage for all eligible answers; explicit gaps report.
- [x] 4. Full tests, production build, desktop/mobile/accessibility verification.
- [x] 5. Simplify the milestone to an announcement; verify dismissal and in-game hint choices.
- [x] 6. Emphasise the unlock with a larger heading and distinct, non-interactive hint badges; verify mobile fit.
- [x] 7. Make the last-clade heading largest and boldest, keep the unlock heading secondary, and use “First hint is FREE!”; production build and 320×480 visual check pass.
- [x] 8. Research generic UI patterns and align popup, controls and revealed clues with Dinozoa's existing design; inspect all three at desktop/mobile sizes.
- [x] 9. Replace white hint-button fills with warm paper and group revealed hints in one outlined paper panel; inspect desktop/390px/320px layouts and pass the production build.
- [x] 10. Use solid green/ochre hint buttons with contrasting white/brown text; verify roughly 5:1 text contrast, desktop/mobile layouts and the production build. Popup and journal styling are unchanged.
- [x] 11. Soften the button fills to sage and warm sand with brown text and gentler borders/hover states; inspect desktop/mobile layouts and pass the production build.
- [x] 12. Match both button backgrounds to the cream hint panel, using green/ochre borders and icons for distinction; inspect desktop/mobile layouts and pass the production build.
- [x] 13. Apply explicit dark-brown hint/popup text and soften button/panel borders; confirm computed text colour is `rgb(63, 44, 26)` at desktop/mobile sizes and pass the production build.
- [x] 14. Use regular-weight unlock text, green “FREE!”, matching 2px panel/button borders, “Exchange 1 guess” pricing and a question-mark dot matching its stroke; verify popup and hint purchases at 1280×900, 390×740 and 320×480, inspect mobile screenshots and pass the production build.
- [x] 15. Give animals without playable factual clues a clear custom message; distinguish missing coverage from exhausted hints, redundant hints and loading failures. Hint-rule tests, production build and a mobile browser check of the missing-facts message/free Name Clue fallback pass.
- [x] 16. Restore the original “Hint” button label shared by Daily and Endless; production build passes.

## Decisions

- Daily and Endless use the same hint prices; Endless keeps 10 guesses.
- Extra-hint allowance resets per animal. Legacy Daily saves remain compatible.
- Source links are exposed after finishing, so article titles do not spoil the hidden answer.
- Unknown evidence never eliminates a candidate. Automatic factual elimination requires explicit reviewed incompatibility.

## Validation and progress

- Baseline working tree was clean.
- All seven test suites and the dataset audit pass. TypeScript and the production build pass.
- A playable preview was provided during implementation. Practice URLs are
  `http://127.0.0.1:5173/?hint-preview=359` and `?hint-preview=360`, with isolated saves and no Daily results.
- The popup, persistent controls, both modes, result counts and spoiler-free shares are complete.
- Exa supplied individual source searches for 119/129 animals; web-search fallback supplied
  the remaining ten and additional primary-source checks. The shipped dataset links to
  185 distinct source pages. Search results were reviewed and clues paraphrased individually.
- Content covers 129/129 eligible answers with 258 sourced facts. Two weak facts are withheld;
  a repeated topic is deduplicated. Detailed limitations and each animal’s status are in
  `animal-clues.md` and `animal-clue-coverage.json`.
- The in-app browser was unavailable. Automated checks used isolated Playwright Chromium
  and WebKit profiles instead; both passed desktop and mobile flow checks.
- Production smoke checks confirm the practice parameter cannot override the daily answer,
  the complete dataset is served, and the built Endless factual-hint flow works.
- The revised popup uses a prominent unlock heading and book/question-mark labels, with
  Continue playing and a close control. Hint purchases and reveals happen only in the
  main game. Chromium/WebKit checks verify every dismissal method, unchanged free
  allowance, typing focus, both modes and mobile layouts; the production build passes.
- The design-alignment pass reuses the existing font stack, earth palette, outlined
  controls and modal classes. Screenshots of the popup and both revealed hint types
  were inspected at 1280×900, 390×740 and 320×480. The final production build and both
  browser suites pass; the design rationale and research links are in the specification.

## Original brief: verification checklist

- [x] 1. Central prices, shared free allowance, last-guess protection and stopped purchases after results.
- [x] 2. Actual immediate-parent milestone; guesses and bought clades unlock, inspection does not.
- [x] 3. Local dataset, stable IDs, original sourced text, review/scope/comparison metadata.
- [x] 4. All eligible answers researched, including all 49 answers in crowded final groups.
- [x] 5. All guessable candidates, aliases collapsed, deterministic choice, unknown evidence retained.
- [x] 6. Progressive spelling, informative positions, length included, no unchanged-pattern charges.
- [x] 7. Atomic purchases, recorded costs, rapid-tap protection and separate counts.
- [x] 8. Old-save compatibility, Daily/Endless persistence, content-version policy and no free resets.
- [x] 9. Short reward announcement, tree animation, Continue playing, keyboard and reduced motion.
- [x] 10. Persistent book/question-mark controls, explicit unavailable states and in-game hint journal.
- [x] 11. Instructions, result/share counts, submitted-guess scores retained, citations after completion.
- [x] 12. Final checks and visual inspection complete.

## Failures found and resolved

- A paid factual hint was initially expected after a Name Clue had already narrowed the
  candidates to one. Selection now skips facts shared by every remaining candidate;
  tests verify this unavailability does not spend guesses.
- Native modal Tab behaviour could move focus outside the controls, particularly with
  Safari’s default keyboard preferences. Explicit forward/backward cycling fixes this.
- Mobile button content had unequal heights and alignment. Equal grid layouts fixed it.
- On very short screens, autofocus on the footer opened the popup already scrolled down.
  Initial focus now goes to the heading without scrolling, keeping the reward and close
  control visible; keyboard focus indicators remain on all interactive controls.
- Waiting for all third-party resources made a WebKit navigation check time out. Tests
  now wait for DOM readiness and actual app controls instead.
- Restoring typing focus after dismissing the celebration reopened autocomplete over
  the hint controls. Focus restoration now closes suggestions until the player types.
- An unavailable message under one hint stretched the other button. Buttons now retain
  their compact height, with explanatory text laid out below them.

## Remaining content work (not missing implementation)

- Broader evidence-backed comparisons for non-answer siblings; only three answer profiles
  currently have explicit contradictions against siblings. Descriptive clues never claim
  unsupported eliminations.
- More distinct clues for the three profiles with one playable topic, and player feedback
  on difficulty/usefulness across the initial dataset.
- Independent palaeontology review and physical-device testing would strengthen confidence;
  browser mobile emulation is not a physical iPhone/Android test.
