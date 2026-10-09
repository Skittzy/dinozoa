# Hint feature specification

## Final scope decisions

- Both modes charge 3 guesses for clade hints. The first extra hint (factual or name, shared allowance) is free; subsequent extra hints cost 1 guess. Endless retains its 10-guess budget.
- Factual research must cover every eligible answer before this task is complete; unsupported or non-distinguishing cases must be explicitly reported.
- The milestone popup only announces the unlock. Hint selection and reveals stay in the main game, keeping the popup short and easy to dismiss.
- Scientific and sourced pop-culture clues share the Factual Hint button and existing prices. Reveal a small category label beside each fact. Shuffle eligible clues without enforcing a category order, using a shared Daily seed and a saved random seed for each Endless round.
- The attached brief below supplies the remaining requirements. These final decisions supersede its earlier Endless-pricing question and staged-content rollout.

## Design alignment

The live game uses the classic palette. `src/main.ts` clears the old optional theme
selection; the unused Dig/Strata styles are not the current visual reference.
The reference components are the existing guess/clade buttons, information card,
and result/tutorial dialogs in `src/style.css`.

- Inherit the existing Segoe UI Variable/system font stack, with the game's familiar
  600/700/800 weights. Monospace remains useful for the revealed spelling pattern.
- Use warm brown ink (`#3f2c1a`), sandstone paper, green (`#4f7a2f`) and ochre
  (`#c99700` borders, `#8a6a00` text). Reuse `--ink`, `--muted`, `--line`, `--card`,
  `--green` and `--gold` instead of introducing a separate pastel palette.
- Hint buttons keep the normal 2px borders and `.35rem` corners. Both use the same
  cream `--card` background as the revealed-hint panel, with brown text. Subtle sage
  (`#c4d0a4`, matching the information card) and sand (`#dac68f`) borders distinguish
  the types; green/ochre icons remain stronger. Hover gently darkens the paper to
  `--card-2`; prices read “Free” or “Exchange 1 guess” in plain secondary text, wrapping
  naturally on small screens. The question-mark dot diameter matches its curve's stroke.
- Revealed clues share one `--card` paper panel with a soft 2px `--line` outline,
  matching the button border thickness. Entries
  are separated by rules, with a label and icon; the solid background lifts them out
  of the page grain and makes them easier to find.
- Category labels use green for Scientific and dark ochre for Pop culture, with
  semibold journal text. Keep the words visible alongside the colour distinction.
  Avoid nested cards, coloured left rails, pill badges and floating hover effects.
- The popup reuses `modal-card`, `modal-close` and `share-btn`: flat beige paper,
  existing corner radius/shadow, ordinary dark backdrop and rectangular action.
  The branch symbol uses rectangular nodes like the actual tree. There is no glow,
  gradient highlight, background blur or circular icon medallion.
- Preserve the last-clade heading as the largest/boldest text, a prominent smaller
  unlock heading, the exact “First hint is FREE!” message, and dismissal-only actions.
  The unlock heading uses regular weight. Main popup headings/copy and revealed clue
  text explicitly use Dinozoa's dark brown `--ink` (`#3f2c1a`); “FREE!” uses the existing
  darker green (`#3d6224`) for emphasis. Smaller labels retain the muted brown colour.

Research supporting these choices:

- [NN/G: AI Prototyping in Real Design Contexts](https://www.nngroup.com/articles/ai-prototyping/)
  reports generic styles and problems with hierarchy, grouping and overused colours;
  detailed product design references produced closer matches to the intended design.
- [Kosta Canatselis: Spot the Slop](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c)
  critiques interchangeable gradients, uniform rounded panels and decorative colour,
  and argues for intentional hierarchy and attention to non-happy-path states.

These describe design tendencies and professional judgments, not a way to determine
whether a site was made with AI. The practical goal here is consistency with Dinozoa.

## Implementation brief

1. Define the rules separately from the interface.
   Keep the existing Daily rules: 20 guesses, with clade hints costing three guesses.
   Add these rules for the newly unlocked hints:
   - One free extra hint per puzzle, shared between Factual Hint and Name Clue.
   - Every additional extra hint costs one guess, regardless of type.
   - Players can switch between types.
   - Opening or dismissing the popup costs nothing.
   - Charge only when a new hint is successfully revealed.
   - A paid hint must leave at least one guess available.
   - All hint purchases stop when the game ends.
   Existing clade hints must not consume the new free allowance.
   Endless pricing remains an open decision. It currently offers three free clade hints per animal. My suggested default is to preserve those and add the same extra-hint allowance—one free, then one guess each—resetting per animal. Keep this configurable rather than silently applying Daily’s clade-hint pricing.
2. Detect the actual milestone from game progress.
   Implement the condition in [gameState.ts](/Users/mk/VisualStudioProjects/Dinozoa_Github/dinozoa/src/game/gameState.ts).
   The player reaches the milestone when their deepest discovered clade equals the answer’s immediate parent in the current tree. Use bestKnownId() and the existing parentLookup; do not rely on a hard-coded rank such as “family.”
   Check after a successful guess or purchased clade hint. A player selecting a clade to inspect its description must not unlock anything.
   Require an active, unfinished game. If the same guess wins or exhausts the guess budget, show the normal result screen instead.
   This unlock should apply to every eligible answer, including those in smaller groups. Crowded groups are the content-writing priority, not a permanent eligibility restriction.
   The announcement intentionally tells the player that no deeper branch leads to the answer. Treat that information as part of the assistance.
3. Create a local, sourced factual-hint dataset.
   Add public/data/animal-clues.json, keyed by the animals’ stable IDs.
   Each clue should have a stable clue ID, short display text, category, source references, review status, and any necessary uncertainty or species-level qualification. Also record enough reviewed information to assess which competing animals the clue distinguishes.
   Write original summaries after checking research papers, museum resources, or other suitable references. The shipped text must be reviewed before becoming playable.
   Suitable categories include fossil occurrence, geological age and distinctive anatomy. Use size or diet where the evidence and wording are sufficiently reliable.
   No live AI, live Wikipedia-summary generation, or new backend is required. The browser loads this file and selects an existing clue.
   Aim for several useful clues per eligible answer where the evidence permits. Derive coverage from the actual answer pool rather than hard-coding its current size of 129.
4. Prioritise content for the worst remaining dead ends.
   Start with the 49 eligible answers currently sharing their immediate parent with at least three other guessable animals. Stegosauridae, Pachycephalosauridae and Tyrannosaurinae are clear starting points.
   Expand factual coverage to all eligible answers over time. Name clues should work for every answer from the first release.
   Distinguishing clues also require knowledge about competing animals. Writing facts only about the answer is insufficient to conclude that other animals do not match.
   Treat unreviewed or missing information as unknown, never as evidence that an animal contradicts a clue. If an answer lacks a useful reviewed fact, keep Name Clue available and explain the factual option’s unavailability without consuming anything.
   For animals with no playable factual clues in the dataset, say “There are currently no factual hints for this creature. Try a Name Clue.” Distinguish this from exhausted hints, hints that cannot narrow the remaining possibilities, and a clue-file loading failure.
5. Select clues that help with the player’s remaining possibilities.
   Add a pure logic module such as src/game/animalClues.ts.
   Determine plausible candidates using previous guesses, their shared-ancestor feedback, revealed clades and already-revealed extra hints. Start from guessable animals, collapsing aliases to their animal IDs.
   Do not silently restrict this reasoning to eligible daily answers: players can currently guess animals outside that pool.
   For Factual Hints, shuffle unused, reviewed clues that add information. Scientific and pop-culture clues are equally eligible; neither category always comes first. Skip redundant clues, such as a diet shared by every remaining animal.
   Any automatic elimination must follow reviewed evidence. A fact about where fossils have been found must not become an unsupported claim about every place the animal could have lived.
   Use seeded priorities with stable tie-breaking, independent of dataset ordering. Daily uses the date key and answer ID; Endless generates and saves a fresh seed per animal. Refreshing or checking button availability must not reroll the next clue. Later guesses filter eligibility without changing the remaining clues' relative order.
6. Implement progressive Name Clues.
   Add a module such as src/game/nameClues.ts.
   Build the clue from the answer’s canonical scientific name. Continue accepting existing common names and aliases when guessing.
   Reveal part of the spelling progressively. Prefer letters that distinguish remaining possibilities instead of always revealing the first letter—for example, revealing “D” alone does not distinguish Dakotaraptor from Dromaeosaurus.
   Display the accumulated pattern after each reveal. Remember that a full-length underscore pattern also reveals the name’s length; count that as part of the clue’s information.
   Never charge for an unchanged pattern. Stop offering further name reveals when the name is fully revealed.
   Before purchase, use a generic question-mark icon. Any decorative preview must not accidentally reveal the actual answer’s letters or length for free.
7. Store hint use and calculate costs centrally.
   Extend GameState with an extra-hint history. Each entry should identify its type, what was revealed, its cost and the relevant content version.
   Calculate the remaining budget from:
   guesses used =
     submitted guesses
     + clade-hint costs
     + extra-hint costs
   Keep all affordability checks and deductions in GameState, rather than in button handlers.
   Make revealing a hint one operation: validate availability, select the clue, record its cost, then display it. Prevent rapid taps from purchasing the same hint twice.
   Track clade, factual and name hint counts separately for results and sharing.
8. Persist the milestone and revealed hints.
   Extend SavedGame in [stats.ts](/Users/mk/VisualStudioProjects/Dinozoa_Github/dinozoa/src/storage/stats.ts).
   Save the milestone’s announcement status, extra-hint history, revealed name positions and data needed to restore the same factual clues.
   Make new fields optional when reading older saves. Existing guesses, purchased clade hints, results and streaks must survive migration.
   After refreshing, restore the same clues, remaining guesses and free-hint status. A previously displayed milestone popup must not automatically appear again.
   Define a content-version policy so updating or removing a clue cannot reset its cost or quietly replace it with another free clue.
9. Build the rewarding milestone popup.
   Add the popup through [hints.ts](/Users/mk/VisualStudioProjects/Dinozoa_Github/dinozoa/src/ui/hints.ts), with styling in [style.css](/Users/mk/VisualStudioProjects/Dinozoa_Github/dinozoa/src/style.css).
   Make the last-clade achievement the largest, boldest heading. Follow it with a smaller but prominent unlock heading and distinct hint labels. Keep the discovered clade and a compact tree symbol above them, with a short branch-drawing animation to mark progress.
   Proposed copy:
   {clade name}
   You found the last Clade!
   New Hints unlocked!
   Factual Hints · Name Clues
   First hint is FREE!
   Continue playing
   
   Keep hint choices and revealed clues out of the popup. Its only actions are dismissing it and returning to play.
   Use a prominent secondary unlock heading and two non-interactive labels: a green book for Factual Hints and an ochre question mark for Name Clues. These announce the available features; they are not buttons.
   Use the clade’s image, rather than the hidden animal’s result-screen image.
   Include a close control and Continue playing. Support keyboard focus, Escape and backdrop dismissal, screen readers and reduced-motion preferences. Return focus to the guess input on dismissal. On mobile, the popup must fit or scroll comfortably, with usable touch targets.
   Show it once per round and avoid overlapping the tutorial, account dialog or result screen.
10. Replace the exhausted clade-hint control with two persistent choices.
   Update [main.ts](/Users/mk/VisualStudioProjects/Dinozoa_Github/dinozoa/src/main.ts) and the controls in [index.html](/Users/mk/VisualStudioProjects/Dinozoa_Github/dinozoa/index.html).
   Before the milestone, display the clade-hint control and its price.
   After unlocking, replace the “No more ranks left to reveal” state with:
   Factual Hint · Free  Name Clue · Free
   Once either free hint is used, update both prices:
   Factual Hint · Exchange 1 guess  Name Clue · Exchange 1 guess
   Give both buttons the revealed-hint panel's cream background and brown text. Distinguish Factual Hint with a soft sage border/green book icon and Name Clue with a soft sand border/ochre question-mark icon. Both keep the normal game-button shape and have equal visual prominence. State clearly when an option is unavailable or unaffordable.
   Display revealed hints in a persistent area near the guessing controls. Browsing another clade’s description must not erase them.
   Show selected hints immediately in the persistent area within the game. The milestone popup cannot purchase or reveal hints.
11. Update results, instructions and optional measurement.
   Include separate hint counts in the result and share text, for example:
Clade hints: 1 · Factual hints: 1 · Name clues: 0

   Do not include the answer, factual-clue text or revealed letters in the share message.
   Preserve the meaning of existing guess statistics; distinguish submitted guesses from budget spent on hints rather than silently changing historical scores.
   Update the how-to-play text with the unlock condition and shared free allowance.
   Keep full source references with the clue data. Plan their presentation carefully: article titles and URLs can reveal the answer. A straightforward default is to expose full citations on the completed-game screen.
   Optionally add GoatCounter events for reaching the milestone and using each hint type, through the existing guarded analytics helper. These would help evaluate whether the feature reduces abandonment.
12. Verify the complete flow before release.
   Add meaningful tests for the new game rules and content, then run the existing suite and production build:
npm test
npm run build
   Verify that:
- Unlocking works through guesses and purchased clade hints.
- Merely inspecting a clade does not unlock hints.
- Winning or losing takes precedence over the celebration.
- The first factual-or-name choice is free, including when switching types.
- Later hints deduct exactly one guess and preserve a final guess.
- Unavailable clues and repeated taps cannot waste guesses.
- Refreshing preserves hints, costs and popup status.
- Older saves remain valid.
- Candidate filtering never eliminates the actual answer.
- Every playable factual clue has reviewed supporting sources.
- Mobile scrolling, keyboard access and reduced-motion behaviour work.
- Daily and Endless state remain separate.
   Build the logic and persistence first, then the popup and controls, then expand the reviewed clue coverage. That lets the visual reward sit on a reliable hint system from the start.
