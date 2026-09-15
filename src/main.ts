// main.ts — wires the pieces together: data -> game -> UI.

import './style.css';
import { loadDatabase, guessableNames, nodeLookup, rootId, altNames } from './data/loadTree';
import { getDailyAnimalId, dateKey, getPuzzleNumber, msUntilNextAnimal,
         launchDateLabel } from './game/dailyAnimal';
import { GameState, MAX_GUESSES, HINT_COST } from './game/gameState';
import type { GuessOutcome } from './game/gameState';
import { Renderer } from './ui/render';
import { TreeView } from './ui/treeView';
import { loadStats, loadGame, saveGame, recordResult, clearStats,
         loadEndlessStats } from './storage/stats';
import { runEndless } from './endlessMode';
import { SUPPORT_URL, SOURCE_URL } from './config';
import { track, retentionBand } from './analytics';
import { offerInstallAfterModal } from './ui/installPrompt';
import { attachSuggest } from './ui/suggest';

// Mode lives in the URL rather than in a variable, so switching is a navigation.
// That keeps exactly one GameState per page load — no re-wiring of the dozen
// closures below — and gives back-button and bookmarking for free.
const ENDLESS = new URLSearchParams(location.search).has('endless');

async function main() {
    await loadDatabase();

    const today = new Date();
    const key = dateKey(today);
    const answerId = getDailyAnimalId(today);

    const state = new GameState(answerId);
    const saved = loadGame(key);
    if (saved && saved.answerId === answerId) {
        state.restore(saved.guessIds ?? [], saved.revealedIds ?? [], saved.surrendered ?? false);
    }

    const renderer = new Renderer();

    // Clicking any box in the tree — clade or animal — swaps the info card over to it.
    const tree = new TreeView(
        document.getElementById('tree') as unknown as SVGSVGElement,
        (taxonId) => {
            // Daily only. Endless reuses this same TreeView instance, so without the
            // ENDLESS guard this closure still tests the DAILY state.
            if (!ENDLESS && (state.won || state.lost) && taxonId === state.answerId) {
                void renderer.showEndModal(
                    state.won, state.answerNode, state.guesses.length, loadStats(),
                    state.guesses.map((g) => g.info.warmth), puzzleNo);
                return;
            }
            void renderer.showLca(nodeLookup[taxonId], { picked: true });
        },
    );

    // Before launch the count is <= 0, so say so plainly rather than printing
    // "Animal #-8" at anyone testing early. The date is derived from EPOCH and
    // never written here — hardcoding it is exactly how the header ended up
    // advertising a launch two weeks after the real one.
    const puzzleNo = getPuzzleNumber(today);
    document.getElementById('animal-no')!.textContent =
        puzzleNo >= 1 ? `Animal #${puzzleNo}` : `Preview — launches ${launchDateLabel()}`;

    const form = document.getElementById('guess-form') as HTMLFormElement;
    const input = document.getElementById('guess-input') as HTMLInputElement;

    // Canonical names first, then the slang, each labelled with the genus it maps
    // to so a row reads "trex -> Tyrannosaurus" rather than looking duplicated.
    //
    // Wired HERE, above the ENDLESS branch further down, so both modes get it. The
    // old <datalist> lived up here for the same reason; anything below that branch
    // simply does not exist in an endless run.
    attachSuggest(input, [
        ...guessableNames.map((n) => {
            // guessableNames are "Scientific (common)" when the two differ.
            const m = n.match(/^(.*?)\s*\((.*)\)\s*$/);
            return m ? { value: n, main: m[1], hint: m[2] } : { value: n, main: n };
        }),
        ...altNames.map((a) => ({ value: a.typed, main: a.typed, hint: `\u2192 ${a.maps}` })),
    ]);
    const hintBtn = document.getElementById('hint-btn') as HTMLButtonElement;
    const giveUpBtn = document.getElementById('giveup-btn') as HTMLButtonElement;

    // Half the budget SPENT, not half the guesses typed. Hints are paid for out
    // of the same twenty, so three hints and one guess is ten gone with only one
    // entry in state.guesses — and somebody who has been buying help is, if
    // anything, more stuck than somebody who has just been guessing.
    //
    // Late enough either way that surrendering is a considered decision about a
    // puzzle you have engaged with, rather than the first exit offered to
    // somebody who has not started.
    const GIVE_UP_AFTER = 10;

    // "Scientific (common)" from the autocomplete -> try each part
    const candidates = (raw: string): string[] => {
        const out = [raw];
        const paren = raw.match(/^(.*?)\s*\((.*)\)\s*$/);
        if (paren) { out.push(paren[1], paren[2]); }
        return out;
    };

    const persist = () => saveGame(key, {
        answerId,
        guessIds: state.guesses.map((g) => g.guessId),
        revealedIds: [...state.revealedIds],
        finished: state.over,
        surrendered: state.surrendered,
    });

    const refreshControls = () => {
        renderer.setRemaining(state.remaining);
        giveUpBtn.hidden = state.over || state.guessesUsed < GIVE_UP_AFTER;
        if (state.over) {
            renderer.setHint(false, '');   // hides the row; status carries the outcome
            return;
        }
        if (state.nextHintId() === null) {
            renderer.setHint(false, 'No more ranks left to reveal.');
        } else if (state.remaining <= HINT_COST) {
            renderer.setHint(false, `A hint costs ${HINT_COST} guesses — not enough left.`);
        } else {
            renderer.setHint(true, `Need a hint? Exchange ${HINT_COST} guesses to reveal a rank!`);
        }
    };

    const finish = (won: boolean, gaveUp = false) => {
        const stats = recordResult(key, won, state.guesses.length);
        track(won ? 'game-won' : gaveUp ? 'game-gave-up' : 'game-lost');
        // Sent on every finished game, so a day's dashboard shows the mix: how
        // many of the people who played today were here for the first time, and
        // how many have been coming back for weeks.
        track(retentionBand(stats.gamesPlayed));
        renderer.lockInput();
        refreshControls();
        persist();
        const warmths = state.guesses.map((g) => g.info.warmth);
        setTimeout(() => void renderer.showEndModal(
            won, state.answerNode, state.guesses.length, stats, warmths, puzzleNo), 700);
        // Armed now, shown only once the end screen has been opened and closed —
        // see installPrompt.ts for why it must not appear beside the share button.
        offerInstallAfterModal(document.getElementById('modal')!);
    };

    // ---- giving up ----
    // Without this, somebody stuck at guess twelve has two options: grind out
    // eight blind guesses, or close the tab. The second is worse for everyone.
    // They never see the answer, never reach the share button, and never appear
    // in the day's numbers at all.
    //
    // It records as a loss. An unrecorded surrender would be a free way to keep a
    // streak alive on a day you could not solve, which would quietly make the
    // streak meaningless. It is tracked as its OWN event though, because running
    // out at twenty and quitting at ten are different failures: the first says the
    // puzzle was hard, the second says it was opaque, and only one of those is
    // worth changing the answer pool over.
    let armedAt = 0;
    const disarm = () => {
        armedAt = 0;
        giveUpBtn.textContent = 'Give up';
        giveUpBtn.classList.remove('armed');
    };
    giveUpBtn.onclick = () => {
        // GOTCHA 1. This handler is registered above the `if (ENDLESS) return`
        // below, so it exists in endless runs too, closing over the DAILY state,
        // the DAILY persist and the DAILY finish. Right now nothing unhides the
        // button in endless so it can never fire there, but that is a property of
        // code in another function rather than anything stated here. Without this
        // line, one change to how the hint row is shown turns an endless player
        // tapping a stray button into a surrendered daily game.
        if (ENDLESS) return;
        if (state.over) return;
        // Two taps rather than a confirm dialog. Losing the day's game to a
        // mis-tap on a phone is a miserable way to discover this button exists.
        if (Date.now() - armedAt > 4000) {
            armedAt = Date.now();
            giveUpBtn.textContent = 'Sure?';
            giveUpBtn.classList.add('armed');
            setTimeout(() => { if (!state.over) disarm(); }, 4000);
            return;
        }
        disarm();
        state.surrendered = true;
        persist();
        tree.update(state);
        // Same view as running out of guesses: the end screen names the animal,
        // so this path does not need to reveal it twice.
        void renderer.showLca(nodeLookup[state.bestKnownId()]);
        renderer.setStatus('Gave up for today.', 'bad');
        finish(false, true);
    };

    // ---- countdown to the next animal ----
    // Ticks every second against 00:00 UTC, the same instant the answer flips.
    const countdownEl = document.getElementById('countdown')!;
    const tickCountdown = () => {
        const ms = msUntilNextAnimal();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const label = `Next animal in <strong>${pad(h)}:${pad(m)}:${pad(sec)}</strong>`;
        countdownEl.innerHTML = label;
        // The end-game popup is rebuilt from scratch each time it opens, so look
        // its countdown up fresh on every tick rather than caching the node.
        const inModal = document.getElementById('modal-countdown');
        if (inModal) inModal.innerHTML = label;
    };
    // Endless has no daily deadline, and the ticker writes into #countdown — which
    // endless reuses for its subtitle. Left running it overwrote that subtitle
    // once a second with a countdown that means nothing in this mode.
    if (!ENDLESS) {
        tickCountdown();
        setInterval(tickCountdown, 1000);
    }

    // ---- how to play ----
    // Shown automatically the first time only. Teaching happens by stepping the
    // demo, not by reading a wall of text, so each step carries one short line.
    const howto = document.getElementById('howto')!;
    const howtoStep = document.getElementById('howto-step')!;
    const nextBtn = document.getElementById('howto-next') as HTMLButtonElement;
    const backBtn = document.getElementById('howto-back') as HTMLButtonElement;
    const playBtn = document.getElementById('howto-play') as HTMLButtonElement;
    const groups = [...howto.querySelectorAll<SVGGElement>('.hd')];
    const dots = [...howto.querySelectorAll<HTMLSpanElement>('.howto-dots span')];

    const LINES = [
        // Two taxonomic corrections to the drafted copy:
        //   - Animalia is a KINGDOM, not a family, so "root family" was wrong.
        //   - Dinosauria is a CLADE, not a family. (Ceratopsidae genuinely is a
        //     family, so the green line was already correct and kept as written.)
        'Guess the hidden prehistoric animal of the day! You get 20 guesses.',
        'Guess anything! A bad guess only shares the base kingdom Animalia — red means the answer is far away.',
        'Warmer colours mean a closer relative! Stegosaurus at least shares the Dinosauria clade with the answer!',
        'Green means you are almost there! Styracosaurus shares the same family Ceratopsidae with the answer!',
        'The information panel always describes the closest clade your guess shares with the answer. Read it for clues about the hidden animal!',
        'Tap any animal or clade in the tree to read about it instead!',
        'Find the answer and complete the tree!',
    ];

    let step = -1;
    const showStep = (n: number) => {
        step = n;
        howtoStep.textContent = LINES[n];
        // data-until lets a group DISAPPEAR again — the hidden "?" gives way to
        // the answer, and each info-panel example gives way to the next.
        groups.forEach((g) => {
            const from = Number(g.dataset.step);
            const until = g.dataset.until === undefined ? Infinity : Number(g.dataset.until);
            g.classList.toggle('on', from <= n && n <= until);
        });
        dots.forEach((d, i) => d.classList.toggle('on', i <= n));
        const last = n >= LINES.length - 1;
        // Explicit values on all three. Clearing the inline style instead would
        // fall back to the stylesheet, where .howto-play and .howto-back default
        // to display:none, so they'd never appear at all.
        nextBtn.style.display = last ? 'none' : 'inline-block';
        nextBtn.textContent = n === 0 ? 'Tutorial' : 'Next';
        playBtn.style.display = last ? 'inline-block' : 'none';
        backBtn.style.display = n > 0 ? 'inline-block' : 'none';
    };

    const openHowto = () => { showStep(0); howto.classList.add('open'); };
    const closeHowto = () => howto.classList.remove('open');

    nextBtn.onclick = () => showStep(Math.min(step + 1, LINES.length - 1));
    backBtn.onclick = () => showStep(Math.max(step - 1, 0));
    playBtn.onclick = closeHowto;
    (document.getElementById('howto-close') as HTMLButtonElement).onclick = closeHowto;
    howto.onclick = (ev) => { if (ev.target === howto) closeHowto(); };
    (document.getElementById('help-btn') as HTMLButtonElement).onclick = openHowto;

    const SEEN_KEY = 'dinozoa.seenHowto';
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* private mode */ }
    if (!seen) {
        openHowto();
        try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
    }

    // ---- footer links ----
    // Set from config so the URL lives in exactly one place. The anchor ships with
    // href="#" so it is a real link for layout and focus before this runs.
    const footerSupport = document.getElementById('footer-support') as HTMLAnchorElement | null;
    if (footerSupport) footerSupport.href = SUPPORT_URL;
    document.querySelectorAll<HTMLAnchorElement>('.site-footer a[href*="github.com"]')
        .forEach((a) => { a.href = SOURCE_URL; });

    // ---- header nav / hamburger ----
    const topnav = document.getElementById('topnav')!;
    const menuBtn = document.getElementById('menu-btn') as HTMLButtonElement;
    menuBtn.onclick = () => {
        const open = topnav.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', String(open));
    };
    // Tapping anywhere else closes it, which is what every mobile menu does and
    // what people will try without being told.
    document.addEventListener('click', (ev) => {
        if (!topnav.contains(ev.target as Node) && ev.target !== menuBtn
            && !menuBtn.contains(ev.target as Node)) {
            topnav.classList.remove('open');
            menuBtn.setAttribute('aria-expanded', 'false');
        }
    });
    if (ENDLESS) {
        const link = document.getElementById('endless-link') as HTMLAnchorElement;
        link.textContent = 'Daily Puzzle';
        link.href = './';
    }

    // ---- design ----
    // The alternate skins (strata / dig / layers) are still in THEMES and in
    // style.css, but nothing selects them any more. Anyone whose browser still
    // remembers a skin from an earlier build gets put back on the classic one,
    // otherwise they'd be stranded in a design with no way out.
    try { localStorage.removeItem('dinozoa.theme'); } catch { /* private mode: fine */ }
    delete document.documentElement.dataset.theme;

    // ---- account button: show the stats kept on this device ----
    // Wired ABOVE the endless branch on purpose. It used to sit below, after the
    // early `return`, so the button silently did nothing in endless mode — the
    // element was there, the handler never was. Anything both modes share has to
    // be attached before that return.
    const openAccount = () => {
        renderer.showAccount(loadStats(), loadEndlessStats(), () => {
            clearStats();
            openAccount();               // redraw the panel with the cleared numbers
            refreshControls();           // the daily scoreboard reads from stats too
        });
    };
    (document.getElementById('account-btn') as HTMLButtonElement).addEventListener('click', openAccount);

    if (ENDLESS) {
        document.body.classList.add('endless');
        runEndless({ renderer, tree, form, input, hintBtn, candidates });
        return;
    }

    // ---- first paint (also covers a restored game) ----
    // A refresh replays the whole tree from the root downwards, so you get to watch the
    // history of your guesses redraw itself rather than having it appear all at once.
    tree.update(state);
    refreshControls();
    if (state.guesses.length > 0 || state.revealedIds.length > 0) {
        const best = state.bestKnownId();
        void renderer.showLca(nodeLookup[state.won ? answerId : best], { solved: state.won });
        renderer.setStatus(
            state.won
                ? `Solved in ${state.guesses.length} guess${state.guesses.length === 1 ? '' : 'es'}!`
                : state.lost ? 'Out of guesses for today.' : 'Keep narrowing it down.',
            state.won ? 'win' : state.lost ? 'bad' : 'info',
        );
    } else {
        // Nothing guessed yet: introduce the root, so the card is never empty.
        void renderer.showLca(nodeLookup[rootId], { intro: true });
        renderer.setStatus('Guess any prehistoric animal to begin.', 'info');
    }
    if (state.over) {
        const stats = loadStats();
        renderer.lockInput();
        void renderer.showEndModal(state.won, state.answerNode, state.guesses.length, stats,
            state.guesses.map((g) => g.info.warmth), puzzleNo);
    }

    // ---- guessing ----
    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const raw = input.value.trim();
        if (!raw || state.over) return;

        let outcome: GuessOutcome = { status: 'unknown' };
        for (const c of candidates(raw)) {
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

        // The denominator. Visits count bots, bounces and people who read the
        // About box and left; this counts someone who actually played. Without it
        // "forty games finished" is a number with nothing to divide by.
        //
        // First guess of the day only. A restored game comes back with its
        // guesses already in it, so a reload cannot count the same player twice.
        if (state.guesses.length === 1) track('game-started');

        tree.update(state);
        input.value = '';
        // Phone only: show the player where their guess landed instead of making
        // them scroll for it. Skipped once the game is over, because the end-game
        // modal is about to cover the screen anyway.
        if (!state.over && tree.revealOnNarrow()) input.blur();

        if (outcome.status === 'win') {
            void renderer.showLca(state.answerNode, { solved: true });
            // Same wording as refreshControls, so the line doesn't change phrasing
            // between winning live and coming back to a finished game.
            renderer.setStatus(
                `Solved in ${state.guesses.length} guess${state.guesses.length === 1 ? '' : 'es'}!`,
                'win');
            finish(true);
            return;
        }

        void renderer.showLca(nodeLookup[state.bestKnownId()]);
        if (outcome.status === 'lose') {
            renderer.setStatus('Out of guesses for today.', 'bad');
            finish(false);
            return;
        }

        renderer.setStatus(
            `Shared ${outcome.record.info.lcaNode.rank}: ${outcome.record.info.lcaNode.scientific}.`,
            'good',
        );
        refreshControls();
        persist();
    });


    // ---- hints: trade HINT_COST guesses for the next rank down ----
    hintBtn.addEventListener('click', () => {
        const revealed = state.useHint();
        if (revealed === null) { refreshControls(); return; }
        tree.update(state);
        void renderer.showLca(nodeLookup[revealed], { hinted: true });
        renderer.setStatus(
            `Revealed: ${nodeLookup[revealed].scientific} (cost ${HINT_COST} of your ${MAX_GUESSES} guesses).`,
            'good',
        );
        refreshControls();
        persist();
    });
}

main().catch((err) => {
    // The database is a 200KB fetch. On a flaky connection it fails, and the old
    // handler wrote to #status — a line most players never look at — leaving what
    // looked like a dead page. Take over the whole pane and offer a retry.
    console.error(err);
    const pane = document.querySelector('.tree-frame') ?? document.body;
    const box = document.createElement('div');
    box.className = 'load-error';
    box.innerHTML =
        '<h2>Couldn\u2019t load today\u2019s animal</h2>' +
        '<p>The tree of life didn\u2019t download. This is usually a connection ' +
        'problem rather than anything you did.</p>' +
        '<button type="button" id="retry-btn" class="modal-btn">Try again</button>';
    pane.replaceChildren(box);
    document.getElementById('retry-btn')!.onclick = () => location.reload();

    const status = document.getElementById('status');
    if (status) {
        status.textContent = 'Could not load the game.';
        status.dataset.tone = 'bad';
    }
    const input = document.getElementById('guess-input') as HTMLInputElement | null;
    if (input) input.disabled = true;
});
