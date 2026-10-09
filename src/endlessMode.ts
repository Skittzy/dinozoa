// endlessMode.ts — the Endless run loop.
//
// A run is a chain of randomly chosen animals. You get 10 guesses per animal with the same hint prices as Daily. Solving one raises your score; failing one does NOT end the run —
// it just moves you straight on to the next animal. There are no lives and no
// death, so the only way a run ends is by choosing to end it.
//
// That is deliberate. This mode exists first as a database-testing tool: the point
// is to see a lot of animals quickly and notice which ones feel unfairly obscure,
// which a punishing failure state would get in the way of.
//
// It shares the referee, the tree and the renderer with the daily game, and shares
// NO storage with it. See stats.ts for why that separation is strict.

import { nodeLookup, rootId } from './data/loadTree';
import { GameState, ENDLESS_RULES } from './game/gameState';
import type { GuessOutcome } from './game/gameState';
import { getAnswerPool } from './game/dailyAnimal';
import { Renderer } from './ui/render';
import { TreeView } from './ui/treeView';
import { loadEndlessStats, recordEndlessRun, loadEndlessRun, saveEndlessRun, clearEndlessRun } from './storage/stats';
import { HintUI } from './ui/hints';
import { newHintSeed } from './game/animalClues';
import { EMPTY_HINT_COUNTS, type HintCounts } from './game/hintTypes';
import { track } from './analytics';

export interface EndlessHandles {
    renderer: Renderer;
    tree: TreeView;
    form: HTMLFormElement;
    input: HTMLInputElement;
    hintBtn: HTMLButtonElement;
    candidates: (raw: string) => string[];
}

export function runEndless(h: EndlessHandles): void {
    const { renderer, tree, form, input, hintBtn } = h;

    // Truly random, straight from the base answer pool — no difficulty curve and
    // no weighting. If the pool still contains taxa that feel unfair, this mode
    // should surface them at the same rate the daily would.
    const pool = getAnswerPool();

    const saved = loadEndlessRun();
    let score = saved?.score ?? 0;
    let attempted = saved?.attempted ?? 0;     // animals seen
    // Per-round outcomes. Accuracy only needs the two counters above, but the
    // missed list is what the DEMO DATABASE TEST block in render.ts consumes, so
    // it is recorded either way — it costs one array push per round.
    const missed: string[] = saved?.missed ?? [];
    const solved: string[] = saved?.solved ?? [];
    const runHints: HintCounts = { ...EMPTY_HINT_COUNTS };
    for (const kind of ['clade', 'factual', 'name'] as const) {
        const count = saved?.hintCounts?.[kind];
        if (Number.isInteger(count) && count! >= 0) runHints[kind] = count!;
    }
    let state = new GameState(saved && pool.includes(saved.game.answerId) ? saved.game.answerId : pickAnimal(), ENDLESS_RULES, newHintSeed());
    if (saved && state.answerId === saved.game.answerId) {
        state.restore(saved.game.guessIds, saved.game.revealedIds, saved.game.surrendered, saved.game);
    }
    const persist = () => saveEndlessRun({ version: 1, score, attempted, missed, solved, hintCounts: runHints,
        game: { answerId: state.answerId, guessIds: state.guesses.map(g => g.guessId),
            revealedIds: [...state.revealedIds], finished: state.over, surrendered: state.surrendered,
            ...state.hintProgress() } });
    const hintUI = new HintUI(() => state, () => { persist(); refreshControls(); });

    function pickAnimal(): number {
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // The header has to say loudly which mode you're in — an endless run and the
    // daily look identical below the fold, and mistaking one for the other is a
    // bad surprise. Big title, faint subtitle, then the score as real tiles
    // rather than a run-on sentence.
    const title = document.getElementById('animal-no')!;
    // The daily countdown element lives near the BOTTOM of the pane, under the
    // hint row. Reusing it put the mode subtitle below the input instead of under
    // the heading, so endless gets its own element inserted right after the title.
    const sub = document.createElement('p');
    sub.className = 'endless-sub';
    sub.textContent = 'Endless mode — guess any prehistoric animal to begin';
    title.insertAdjacentElement('afterend', sub);
    const hud = document.createElement('div');
    hud.className = 'endless-hud';
    // Score sits in the middle and is physically larger than its neighbours —
    // it's the number the whole mode is about, so it shouldn't be one of three
    // identical tiles competing for attention.
    hud.innerHTML =
        `<div class="eh-tile"><div class="eh-value" id="eh-rounds">0</div>` +
        `<div class="eh-label">Rounds</div></div>` +
        `<div class="eh-tile eh-score"><div class="eh-value" id="eh-score">0</div>` +
        `<div class="eh-label">Score</div></div>` +
        `<div class="eh-tile eh-best"><div class="eh-value" id="eh-best">0</div>` +
        `<div class="eh-label">Best</div></div>`;
    sub.insertAdjacentElement('afterend', hud);   // title -> subtitle -> tiles

    const setHeader = () => {
        title.textContent = 'Endless';
        document.getElementById('eh-score')!.textContent = String(score);
        document.getElementById('eh-rounds')!.textContent = String(attempted);
        document.getElementById('eh-best')!.textContent =
            String(Math.max(loadEndlessStats().bestScore, score));
    };

    const refreshControls = () => {
        renderer.setRemaining(state.remaining);
        hintUI.refresh();
        hintBtn.hidden = state.reachedFinalClade;
        if (state.over) { renderer.setHint(false, ''); return; }
        renderer.setHint(state.canHint(), state.reachedFinalClade ? 'Extra hints unlocked below.'
            : state.remaining <= state.rules.hintCost ? 'A clade hint costs 3 guesses. Keep one guess to answer.'
            : 'Exchange 3 guesses to reveal the next clade.');
    };

    // Move to the next animal. Called both after a win (via Continue) and
    // immediately after a failure, since failing costs nothing but the animal.
    const nextAnimal = () => {
        state = new GameState(pickAnimal(), ENDLESS_RULES, newHintSeed());
        renderer.unlockInput();
        input.value = '';
        tree.update(state);
        setHeader();
        refreshControls();
        void renderer.showLca(nodeLookup[rootId], { intro: true });
        renderer.setStatus('New animal. Guess anything to begin.', 'info');
        persist();
        input.focus();
    };

    const endRun = () => {
        const stats = recordEndlessRun(score, attempted);
        track('endless-run-ended');
        clearEndlessRun();
        renderer.lockInput();
        void renderer.showEndlessSummary(score, attempted, stats, missed, solved, runHints);
    };

    const finishAnimal = (won: boolean) => {
        attempted += 1;
        for (const kind of ['clade', 'factual', 'name'] as const) runHints[kind] += state.hintCounts[kind];
        const name = state.answerNode.common || state.answerNode.scientific;
        if (won) { score += 1; solved.push(name); } else { missed.push(name); }
        renderer.lockInput();
        refreshControls();
        setHeader();
        persist();

        setTimeout(() => {
            void renderer.showEndlessRoundModal(
                won, state.answerNode, state.guesses.length, score, attempted,
                nextAnimal, endRun, state.hintCounts);
        }, 700);
    };

    // ---- first paint ----
    tree.update(state);
    setHeader();
    refreshControls();
    void renderer.showLca(nodeLookup[state.over ? state.answerId : state.bestKnownId()], { solved: state.over });
    renderer.setStatus(saved ? 'Run restored. Keep narrowing it down.' : 'Round 1 — good luck.', 'info');
    if (state.over) {
        renderer.lockInput();
        renderer.showEndlessRoundModal(state.won, state.answerNode, state.guesses.length,
            score, attempted, nextAnimal, endRun, state.hintCounts);
    }
    persist();

    // ---- guessing ----
    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const raw = input.value.trim();
        if (!raw || state.over) return;

        let outcome: GuessOutcome = { status: 'unknown' };
        for (const c of h.candidates(raw)) {
            const o = state.submitGuess(c);
            if (o.status !== 'unknown') { outcome = o; break; }
        }

        if (outcome.status === 'unknown') {
            renderer.setStatus(`"${raw}" isn't in the database — try another animal.`, 'bad');
            return;
        }
        if (outcome.status === 'duplicate') {
            renderer.setStatus(`You already guessed ${outcome.record.guessNode.scientific}.`, 'bad');
            input.value = '';
            return;
        }
        if (outcome.status === 'over') return;

        tree.update(state);
        input.value = '';
        // Phone only: show the player where their guess landed instead of making
        // them scroll for it. Skipped once the game is over, because the end-game
        // modal is about to cover the screen anyway.
        if (!state.over && tree.revealOnNarrow()) input.blur();

        if (outcome.status === 'win') {
            void renderer.showLca(state.answerNode, { solved: true });
            renderer.setStatus(
                `Solved in ${state.guesses.length} guess${state.guesses.length === 1 ? '' : 'es'}!`,
                'win');
            finishAnimal(true);
            return;
        }
        if (outcome.status === 'lose') {
            void renderer.showLca(state.answerNode, { solved: true });
            renderer.setStatus('Out of guesses — on to the next one.', 'bad');
            finishAnimal(false);
            return;
        }

        void renderer.showLca(outcome.record.info.lcaNode, {});
        renderer.setStatus(`Shared clade: ${outcome.record.info.lcaNode.scientific}.`, 'info');
        refreshControls();
        persist();
    });

    // ---- hints ----
    hintBtn.addEventListener('click', () => {
        if (!state.canHint()) return;
        const revealed = state.useHint();
        if (revealed === null) return;
        tree.update(state);
        refreshControls();
        void renderer.showLca(nodeLookup[revealed], { picked: true });
        renderer.setStatus(`Hint: the answer is inside ${nodeLookup[revealed].scientific}.`, 'info');
        persist();
    });

    // ---- one-time explainer ----
    // Endless has its own rules and they aren't guessable from the screen, so it
    // gets its own card. Shown once per browser and never again — this mode is for
    // repeat runs, and a popup on every entry would be pure friction.
    const SEEN_KEY = 'dinozoa.seenEndless.hints-v2';
    let seenEndless = false;
    try { seenEndless = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* private mode */ }
    if (!seenEndless && !saved) {
        renderer.showEndlessIntro();
        try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
    }

    // =====================================================================
    // DEVELOPER TOOL — DISABLED FOR LAUNCH.
    //
    // Revealed the current animal so the answer pool could be reviewed without
    // playing every round out. Commented rather than deleted: it is genuinely
    // useful whenever the pool changes, and leaving it live means anyone who
    // finds __dinoReveal() or the triple-D shortcut can spoil their own game and
    // poison any playtest data.
    //
    // TO RE-ENABLE: uncomment the block below.
    // =====================================================================
    // =====================================================================
    // DEVELOPER TOOL — REMOVE BEFORE LAUNCH.
    //
    // Reveals the current animal so the answer pool can be reviewed quickly
    // without playing each round out. Two ways in, neither reachable by accident:
    //   • press  D  three times in a row
    //   • run    __dinoReveal()    in the browser console
    //
    // To remove: delete this whole block. Nothing else references it.
    // const reveal = () => {
    // renderer.setStatus(`[dev] The animal is ${state.answerNode.scientific}.`, 'info');
    // eslint-disable-next-line no-console
    // console.log('[dev] answer:', state.answerNode.scientific, state.answerNode);
    // };
    // (window as unknown as Record<string, unknown>).__dinoReveal = reveal;
    // let taps: number[] = [];
    // document.addEventListener('keydown', (ev) => {
    // if (ev.key !== 'd' && ev.key !== 'D') return;
    // if (document.activeElement === input) return;   // don't fire while typing
    // const now = Date.now();
    // taps = [...taps, now].filter((t) => now - t < 1200);
    // if (taps.length >= 3) { taps = []; reveal(); }
    // });
    // ======================================================================
}
