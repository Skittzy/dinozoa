// endlessMode.ts — the Endless run loop.
//
// A run is a chain of randomly chosen animals. You get 10 guesses and 3 free
// hints each. Solving one raises your score; failing one does NOT end the run —
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
import { loadEndlessStats, recordEndlessRun } from './storage/stats';

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

    let score = 0;         // animals solved — this IS the score
    let attempted = 0;     // animals seen
    // Per-round outcomes. Accuracy only needs the two counters above, but the
    // missed list is what the DEMO DATABASE TEST block in render.ts consumes, so
    // it is recorded either way — it costs one array push per round.
    const missed: string[] = [];
    const solved: string[] = [];
    let state = new GameState(pickAnimal(), ENDLESS_RULES);

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
        if (state.over) { renderer.setHint(false, ''); return; }
        if (state.nextHintId() === null) {
            renderer.setHint(false, 'No more ranks left to reveal.');
        } else if (state.hintsLeft <= 0) {
            renderer.setHint(false, 'No hints left for this animal.');
        } else {
            renderer.setHint(true,
                `${state.hintsLeft} free hint${state.hintsLeft === 1 ? '' : 's'} left for this animal.`);
        }
    };

    // Move to the next animal. Called both after a win (via Continue) and
    // immediately after a failure, since failing costs nothing but the animal.
    const nextAnimal = () => {
        state = new GameState(pickAnimal(), ENDLESS_RULES);
        renderer.unlockInput();
        input.value = '';
        tree.update(state);
        setHeader();
        refreshControls();
        void renderer.showLca(nodeLookup[rootId], { intro: true });
        renderer.setStatus('New animal. Guess anything to begin.', 'info');
        input.focus();
    };

    const endRun = () => {
        const stats = recordEndlessRun(score, attempted);
        renderer.lockInput();
        void renderer.showEndlessSummary(score, attempted, stats, missed, solved);
    };

    const finishAnimal = (won: boolean) => {
        attempted += 1;
        const name = state.answerNode.common || state.answerNode.scientific;
        if (won) { score += 1; solved.push(name); } else { missed.push(name); }
        renderer.lockInput();
        refreshControls();
        setHeader();

        setTimeout(() => {
            void renderer.showEndlessRoundModal(
                won, state.answerNode, state.guesses.length, score, attempted,
                nextAnimal, endRun);
        }, 700);
    };

    // ---- first paint ----
    tree.update(state);
    setHeader();
    refreshControls();
    void renderer.showLca(nodeLookup[rootId], { intro: true });
    renderer.setStatus('Round 1 — good luck.', 'info');

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
    });

    // ---- one-time explainer ----
    // Endless has its own rules and they aren't guessable from the screen, so it
    // gets its own card. Shown once per browser and never again — this mode is for
    // repeat runs, and a popup on every entry would be pure friction.
    const SEEN_KEY = 'dinozoa.seenEndless';
    let seenEndless = false;
    try { seenEndless = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* private mode */ }
    if (!seenEndless) {
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
