// render.ts — everything that writes to the page. No game logic lives here.

import type { DinoNode } from '../data/loadTree';
import type { Stats } from '../storage/stats';
import { fetchTaxonImage, isRedirect } from './wiki';
import type { EndlessStats } from '../storage/stats';
import { SUPPORT_URL } from '../config';
import { msUntilNextAnimal } from '../game/dailyAnimal';

const $ = (id: string) => document.getElementById(id)!;

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function trimBlurb(text: string, max = 460): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const stop = cut.lastIndexOf('. ');
    return (stop > 120 ? cut.slice(0, stop + 1) : cut) + ' …';
}

export class Renderer {
    private remaining = $('remaining');
    private status = $('status');
    private panel = $('lca-panel');
    private hintBtn = $('hint-btn') as HTMLButtonElement;
    private hintNote = $('hint-note');
    private modal = $('modal');

    setRemaining(n: number): void {
        this.remaining.textContent = `(${n} remaining)`;
    }

    setStatus(message: string, tone: 'info' | 'good' | 'bad' | 'win' = 'info'): void {
        this.status.textContent = message;
        this.status.dataset.tone = tone;
    }

    setHint(enabled: boolean, note: string): void {
        this.hintBtn.disabled = !enabled;
        this.hintNote.textContent = note;
        // Once the game is over the hint row has nothing useful left to say, and
        // leaving a dead button beside a duplicate "Solved!" just adds noise. An
        // empty note is the signal to take the whole row out.
        const row = this.hintNote.parentElement;
        if (row) row.hidden = note === '';
    }

    lockInput(): void {
        ($('guess-input') as HTMLInputElement).disabled = true;
        ($('guess-btn') as HTMLButtonElement).disabled = true;
        this.hintBtn.disabled = true;
    }

    // Endless needs the input back for the next animal; the daily never calls this.
    unlockInput(): void {
        ($('guess-input') as HTMLInputElement).disabled = false;
        ($('guess-btn') as HTMLButtonElement).disabled = false;
    }

    // Shared photo loader for both end-of-game popups.
    private async fillMedia(answer: DinoNode): Promise<void> {
        const data = await fetchTaxonImage(answer.scientific, true, [answer.common]);   // always a leaf
        const media = document.getElementById('modal-media');
        if (!media || !data.imageUrl) return;
        const img = new Image();
        img.alt = answer.scientific;
        img.className = 'lca-img';
        img.onload = () => { media.innerHTML = ''; media.appendChild(img); };
        img.onerror = () => {
            img.onerror = null;
            if (data.fallbackUrl && img.src !== data.fallbackUrl) img.src = data.fallbackUrl;
        };
        img.src = data.imageUrl;
    }

    // ---- the "nearest shared ancestor" card ----
    async showLca(
        node: DinoNode,
        opts: { solved?: boolean; hinted?: boolean; picked?: boolean; intro?: boolean } = {},
    ): Promise<void> {
        const heading = opts.solved ? 'You found it'
            : opts.hinted ? 'Revealed rank'
            : opts.picked ? 'Selected group'
            : opts.intro ? 'Everything starts here'
            : 'Nearest shared ancestor';
        const common = node.common && node.common !== node.scientific ? node.common : '';

        this.panel.innerHTML =
            `<div class="lca-eyebrow">${heading}</div>` +
            `<h2 class="lca-name">${escapeHtml(node.scientific)}</h2>` +
            `<div class="lca-rank">${escapeHtml(node.rank)}${common ? ' · ' + escapeHtml(common) : ''}</div>` +
            `<p class="lca-blurb" id="lca-blurb">Looking this group up…</p>` +
            `<div class="lca-media" id="lca-media"><span class="lca-fallback">🦴</span></div>` +
            `<a class="lca-source" id="lca-source" href="https://en.wikipedia.org/wiki/${encodeURIComponent(node.scientific)}" target="_blank" rel="noopener">From Wikipedia ↗</a>` +
            `<p class="lca-credit" id="lca-credit" hidden></p>`;
        this.panel.dataset.state = 'ready';

        // Leaves get a life restoration; clades keep Wikipedia's lead image, which
        // for a group is usually a composite plate covering several of its members.
        const isLeaf = node.children.length === 0;
        const data = await fetchTaxonImage(node.scientific, isLeaf, [node.common]);
        const blurb = document.getElementById('lca-blurb');
        const media = document.getElementById('lca-media');
        const source = document.getElementById('lca-source') as HTMLAnchorElement | null;
        if (!blurb || !media) return; // panel was replaced by a newer guess

        // Many minor clades have no Wikipedia article and redirect to a parent, so
        // the extract describes the PARENT. Showing it unlabelled under this
        // taxon's heading reads as a bug: the Avetheropoda card opened with
        // "Tetanurae is a clade that includes...". Say whose article it is.
        const redirected = isRedirect(node.scientific, data.articleTitle);
        if (data.extract && redirected) {
            blurb.textContent =
                `${node.scientific} does not have its own Wikipedia article. `
                + `It is covered under ${data.articleTitle}: ${trimBlurb(data.extract)}`;
        } else {
            blurb.textContent = data.extract
                ? trimBlurb(data.extract)
                : `${node.scientific} is a ${node.rank} in the prehistoric tree of life.`;
        }
        if (source) {
            source.textContent = redirected
                ? `${data.articleTitle} on Wikipedia ↗`
                : 'From Wikipedia ↗';
        }
        if (source && data.pageUrl) source.href = data.pageUrl;

        // Wikipedia palaeoart is largely CC BY-SA, under which crediting the author
        // is a licence condition rather than a courtesy. Shown only when the API
        // actually told us who made it; the row stays hidden otherwise.
        const credit = document.getElementById('lca-credit');
        if (credit) {
            if (data.artist) {
                const who = escapeHtml(data.artist);
                credit.innerHTML = data.fileUrl
                    ? `Image: <a href="${escapeHtml(data.fileUrl)}" target="_blank" rel="noopener">${who}</a>`
                    : `Image: ${who}`;
                credit.hidden = false;
            } else {
                credit.hidden = true;
            }
        }
        if (data.imageUrl) {
            const img = new Image();
            img.alt = node.scientific;
            img.className = 'lca-img';
            img.onload = () => { media.innerHTML = ''; media.appendChild(img); };
            // If the wider render doesn't exist, drop back to the size Wikipedia gave us.
            img.onerror = () => {
                img.onerror = null;                       // never loop
                if (data.fallbackUrl && img.src !== data.fallbackUrl) img.src = data.fallbackUrl;
            };
            img.src = data.imageUrl;
        }
    }

    // ---- endless: the one-time explainer ----
    showEndlessIntro(): void {
        const row = (icon: string, text: string) =>
            `<li><span class="ei-icon" aria-hidden="true">${icon}</span><span>${text}</span></li>`;
        this.modal.innerHTML =
            `<div class="modal-card" role="dialog" aria-modal="true" aria-label="Endless mode">` +
            `<button class="modal-close" id="modal-close" aria-label="Close">&times;</button>` +
            `<h2 class="modal-title">Endless mode</h2>` +
            `<p class="modal-line">Random animals, one after another, for as long as you like.</p>` +
            `<ul class="endless-intro">` +
            row('🎯', 'Your <b>score</b> is how many you identify correctly. Beat your best run.') +
            row('🔟', '<b>10 guesses</b> per animal, and <b>3 free hints</b> — the hints cost you nothing here.') +
            row('♾️', 'Miss one and the run <b>keeps going</b>. There are no lives, so a wrong animal just moves you on.') +
            row('🔥', 'Nothing here touches your daily streak or stats.') +
            `</ul>` +
            `<div class="modal-actions">` +
            `<button id="endless-intro-go" class="modal-btn share-btn">Start digging</button></div>` +
            `</div>`;
        this.modal.classList.add('open');
        const close = () => this.modal.classList.remove('open');
        ($('modal-close') as HTMLButtonElement).onclick = close;
        ($('endless-intro-go') as HTMLButtonElement).onclick = close;
        this.modal.onclick = (ev) => { if (ev.target === this.modal) close(); };
    }

    // ---- endless: the between-animals popup ----
    // Continue keeps the run going; End run closes it out and offers the share.
    showEndlessRoundModal(won: boolean, answer: DinoNode, guessCount: number,
                          score: number, attempted: number,
                          onContinue: () => void, onEnd: () => void): void {
        const common = answer.common && answer.common !== answer.scientific ? answer.common : '';
        const title = won ? winTitle(guessCount) : 'Out of guesses.';
        const line = won
            ? `Solved in ${guessCount} guess${guessCount === 1 ? '' : 'es'}.`
            : 'That one was:';
        // The score has already been incremented by the time we're called, so show
        // the OLD value first and let the animation below deliver the point.
        const from = won ? score - 1 : score;

        this.modal.innerHTML =
            `<div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">` +
            `<h2 class="modal-title">${escapeHtml(title)}</h2>` +
            `<p class="modal-line">${escapeHtml(line)}</p>` +
            `<div class="modal-answer">` +
            `<div class="modal-media" id="modal-media"><span class="lca-fallback">🦕</span></div>` +
            `<div><div class="modal-animal">${escapeHtml(common || answer.scientific)}</div>` +
            `<div class="modal-sci">${escapeHtml(answer.scientific)}</div></div>` +
            `</div>` +
            // Stacked, not side by side: score is the reward and gets its own row.
            `<div class="score-hero" id="score-hero">` +
            `<div class="sh-value" id="sh-score">${from}</div>` +
            `<div class="sh-label">Score</div></div>` +
            `<div class="rounds-row"><span class="rr-value">${attempted}</span>` +
            `<span class="rr-label">rounds played</span></div>` +
            `<div class="modal-actions">` +
            `<button id="endless-next" class="modal-btn share-btn">Continue</button>` +
            `<button id="endless-end" class="modal-btn">End run</button>` +
            `</div></div>`;
        this.modal.classList.add('open');

        if (won) {
            window.setTimeout(() => {
                const v = $('sh-score');
                if (v) v.textContent = String(score);
                $('score-hero')?.classList.add('bumped');
            }, 430);
        }

        ($('endless-next') as HTMLButtonElement).onclick = () => {
            this.modal.classList.remove('open');
            onContinue();
        };
        ($('endless-end') as HTMLButtonElement).onclick = () => {
            this.modal.classList.remove('open');
            onEnd();
        };
        void this.fillMedia(answer);
    }

    // ---- endless: end-of-run summary + share ----
    showEndlessSummary(score: number, attempted: number, stats: EndlessStats,
                       missed: string[] = [], solved: string[] = []): void {
        const isBest = score >= stats.bestScore && score > 0;
        this.modal.innerHTML =
            `<div class="modal-card" role="dialog" aria-modal="true" aria-label="Run over">` +
            `<button class="modal-close" id="modal-close" aria-label="Close">&times;</button>` +
            `<h2 class="modal-title">Run over</h2>` +
            `<p class="modal-line">${isBest ? 'New personal best!' : randomPraise()}</p>` +
            `<div class="modal-stats stats-centred stats-four">` +
            `<div><div class="ms-value">${score}</div><div class="ms-label">Score</div></div>` +
            `<div><div class="ms-value">${attempted}</div><div class="ms-label">Rounds</div></div>` +
            `<div><div class="ms-value">${accuracyLabel(score, attempted)}</div>` +
            `<div class="ms-label">Accuracy</div></div>` +
            `<div><div class="ms-value">${stats.bestScore}</div><div class="ms-label">Best ever</div></div>` +
            `</div>` +
            `<div class="modal-actions">` +
            `<button id="share-btn" class="modal-btn share-btn">` +
            `<span class="share-icon" aria-hidden="true">` +
            SHARE_SQUARES.map((c) => `<i style="background:${c}"></i>`).join('') +
            `</span><span class="share-label">Share score</span></button>` +
            `<button id="endless-again" class="modal-btn">New run</button>` +
            `</div>` +
            `<p class="modal-foot" id="share-note"></p>` +
            `</div>`;
        this.modal.classList.add('open');

        ($('modal-close') as HTMLButtonElement).onclick = () => this.modal.classList.remove('open');
        ($('endless-again') as HTMLButtonElement).onclick = () => location.reload();
        ($('share-btn') as HTMLButtonElement).onclick = async () => {
            const text = buildEndlessShareText(score, attempted, stats.bestScore, missed, solved);
            try {
                await navigator.clipboard.writeText(text);
                $('share-note').textContent = 'Copied! Share it with your friends.';
            } catch {
                $('share-note').textContent = text;
            }
        };
    }

    // ---- account / stats panel ----
    // There is no login and no server: everything here comes out of localStorage, which
    // is tied to this browser on this device and survives refreshes and restarts.
    showAccount(stats: Stats, endless: EndlessStats, onReset: () => void): void {
        const winPct = stats.gamesPlayed === 0
            ? 0 : Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
        const cell = (v: string | number, label: string) =>
            `<div><div class="ms-value">${v}</div><div class="ms-label">${label}</div></div>`;

        this.modal.innerHTML =
            `<div class="modal-card" role="dialog" aria-modal="true" aria-label="Your stats">` +
            `<button class="modal-close" id="modal-close" aria-label="Close">×</button>` +
            `<div class="account-avatar" aria-hidden="true">` +
            `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="8" r="4" fill="currentColor"/>` +
            `<path d="M3.5 21c0-4.7 3.8-7.5 8.5-7.5s8.5 2.8 8.5 7.5z" fill="currentColor"/></svg></div>` +
            `<h2 class="modal-title">Your stats</h2>` +
            // The streak is the number people actually care about, so it gets the
            // centre spot on its own rather than being one tile among seven.
            `<div class="streak-hero ms-streak${stats.streak > 0 ? ' lit' : ''}">` +
            `<div class="streak-hero-value">` +
            `<span class="flame" aria-hidden="true">🔥</span><span>${stats.streak}</span></div>` +
            `<div class="streak-hero-label">Day streak</div></div>` +
            `<div class="modal-stats account-stats">` +
            cell(stats.gamesPlayed, 'Played') +
            cell(stats.gamesWon, 'Wins') +
            cell(`${winPct}%`, 'Win rate') +
            cell(stats.maxStreak, 'Best streak') +
            cell(stats.bestScore === null ? '—' : stats.bestScore, 'Fewest guesses') +
            cell(endless.bestScore, 'Best endless run') +
            `</div>` +
            `<p class="modal-foot" id="account-note">${
                stats.lastPlayedDate ? 'Last played ' + escapeHtml(prettyDate(stats.lastPlayedDate)) + '.' : 'No games finished yet.'
            }</p>` +
            // The support link sits above the reset button and below the numbers.
            // Somebody reading their own streak is already engaged; the end-game
            // popup is deliberately left alone, because its one job is getting the
            // result copied into a chat and a second call to action costs that.
            `<a class="support-btn" href="${SUPPORT_URL}" target="_blank" rel="noopener">` +
            `<span class="support-cup" aria-hidden="true">☕</span>` +
            `<span>Buy me a coffee</span></a>` +
            `<p class="support-note">Dinozoa is free, has no ads, and always will. ` +
            `If you play often and feel like chipping in, it's appreciated.</p>` +
            `<div class="modal-actions"><button id="reset-btn" class="modal-btn danger">Reset stats</button></div>` +
            `</div>`;
        this.modal.classList.add('open');

        const close = () => this.modal.classList.remove('open');
        ($('modal-close') as HTMLButtonElement).onclick = close;
        this.modal.onclick = (ev) => { if (ev.target === this.modal) close(); };

        // Two-step, so a stray click can't wipe a long streak.
        const reset = $('reset-btn') as HTMLButtonElement;
        let armed = false;
        reset.onclick = () => {
            if (!armed) {
                armed = true;
                reset.textContent = 'Tap again to confirm';
                $('account-note').textContent = 'This clears your streak and history for good.';
                window.setTimeout(() => {
                    if (!armed) return;
                    armed = false;
                    reset.textContent = 'Reset stats';
                }, 4000);
                return;
            }
            armed = false;
            onReset();
        };
    }

    // ---- end-of-game modal ----
    async showEndModal(won: boolean, answer: DinoNode, guessCount: number, stats: Stats,
                       warmths: number[] = [], puzzleNo = 0): Promise<void> {
        const common = answer.common && answer.common !== answer.scientific ? answer.common : '';
        const title = won ? 'You win!' : 'No more guesses.';
        const line = won
            ? `Solved in ${guessCount} guess${guessCount === 1 ? '' : 'es'}.`
            : `Today's animal was:`;

        this.modal.innerHTML =
            `<div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">` +
            `<button class="modal-close" id="modal-close" aria-label="Close">×</button>` +
            `<h2 class="modal-title">${escapeHtml(title)}</h2>` +
            `<p class="modal-line">${escapeHtml(line)}</p>` +
            `<p class="modal-countdown" id="modal-countdown">${countdownLabel()}</p>` +
            `<div class="modal-answer">` +
            `<div class="modal-media" id="modal-media"><span class="lca-fallback">🦕</span></div>` +
            `<div><div class="modal-animal">${escapeHtml(common || answer.scientific)}</div>` +
            `<div class="modal-sci">${escapeHtml(answer.scientific)}</div></div>` +
            `</div>` +
            `<div class="modal-stats">` +
            `<div><div class="ms-value">${stats.gamesPlayed}</div><div class="ms-label">Plays</div></div>` +
            `<div><div class="ms-value">${stats.gamesWon}</div><div class="ms-label">Wins</div></div>` +
            `<div class="ms-streak"><div class="ms-value">` +
            `<span class="flame" aria-hidden="true">🔥</span>` +
            `<span id="streak-value">${won && stats.streak > 0 ? stats.streak - 1 : stats.streak}</span>` +
            `</div><div class="ms-label">Streak</div></div>` +
            `<div><div class="ms-value">${stats.maxStreak}</div><div class="ms-label">Max</div></div>` +
            `</div>` +
            `<div class="modal-actions">` +
            `<button id="share-btn" class="modal-btn share-btn">` +
            `<span class="share-icon" aria-hidden="true">` +
            SHARE_SQUARES.map((c) => `<i style="background:${c}"></i>`).join('') +
            `</span><span class="share-label">Share result</span></button></div>` +
            `<p class="modal-foot" id="share-note"></p>` +
            `</div>`;
        this.modal.classList.add('open');

        // Light the flame and tick the number up, but only on a fresh win — not
        // when the popup is reopened later by clicking the answer in the tree.
        if (won && stats.streak > 0) {
            const cell = this.modal.querySelector('.ms-streak');
            window.setTimeout(() => {
                const v = $('streak-value');
                if (v) v.textContent = String(stats.streak);
                cell?.classList.add('lit');
            }, 420);
        }

        const close = () => this.modal.classList.remove('open');
        ($('modal-close') as HTMLButtonElement).onclick = close;
        this.modal.onclick = (ev) => { if (ev.target === this.modal) close(); };

        ($('share-btn') as HTMLButtonElement).onclick = async () => {
            const text = buildShareText(won, guessCount, warmths, puzzleNo, stats.streak);
            try {
                await navigator.clipboard.writeText(text);
                $('share-note').textContent = 'Copied! Share it with your friends.';
            } catch {
                // Clipboard is blocked on insecure origins and in some mobile
                // browsers. Show the text so it can still be selected by hand
                // rather than silently doing nothing.
                $('share-note').textContent = text;
            }
        };

        const data = await fetchTaxonImage(answer.scientific, true, [answer.common]);   // always a leaf
        const media = document.getElementById('modal-media');
        if (media && data.imageUrl) {
            const img = new Image();
            img.alt = answer.scientific;
            img.className = 'lca-img';
            img.onload = () => { media.innerHTML = ''; media.appendChild(img); };
            img.onerror = () => {
                img.onerror = null;
                if (data.fallbackUrl && img.src !== data.fallbackUrl) img.src = data.fallbackUrl;
            };
            img.src = data.imageUrl;
        }
    }
}


// --- the share grid --------------------------------------------------------
//
// A score line is a status update; a GRID is a thing people paste into a group
// chat. Wordle spread on the strength of that difference. Each square is one
// guess, coloured by how close it was, so the shape of the run is legible at a
// glance and — crucially — it spoils nothing.
//
// Thresholds match the four RAMP stop positions in treeView.ts (0.35 / 0.68),
// so a square is the same colour the box was on screen.
const SHARE_SQUARES = ['#b6231f', '#d96812', '#f5c60a', '#218329'];

function warmthSquare(w: number): string {
    if (w >= 0.999) return '🟩';
    if (w >= 0.68) return '🟨';
    if (w >= 0.35) return '🟧';
    return '🟥';
}

export function buildShareText(won: boolean, guessCount: number, warmths: number[],
                               puzzleNo: number, streak: number): string {
    // Before 1 Oct 2026 the puzzle number is <= 0; don't paste "Dinozoa #-38"
    // into anyone's group chat during pre-launch testing.
    const label = puzzleNo >= 1 ? `#${puzzleNo}` : 'preview';
    const head = `Dinozoa ${label} ${won ? `${guessCount}/20` : 'X/20'}`;
    // Long games would wrap badly in a chat window, so cap the grid at 20 and
    // break it into rows of 5 — the shape stays readable either way.
    const squares = warmths.map(warmthSquare);
    const rows: string[] = [];
    for (let i = 0; i < squares.length; i += 5) rows.push(squares.slice(i, i + 5).join(''));
    const tail = streak > 1 ? `\nStreak: ${streak}` : '';
    return `${head}\n${rows.join('\n')}${tail}\n${location.origin}`;
}


// "2026-08-23" is a database key, not something to show a person. Rendered from
// the parts rather than new Date(...) so a UTC key can't slide to the previous
// day for anyone west of Greenwich.
export function prettyDate(key: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return key;
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];
    const day = Number(m[3]);
    const month = MONTHS[Number(m[2]) - 1] ?? '';
    return `${day} ${month} ${m[1]}`;
}


// The countdown ticker in main.ts fires up to a second after the popup is built,
// which made the line pop in late and look broken. Seeding it here means the
// popup is correct the instant it renders and the ticker only keeps it fresh.
export function countdownLabel(now: Date = new Date()): string {
    const ms = msUntilNextAnimal(now);
    const pad = (n: number) => String(n).padStart(2, '0');
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `Next animal in <strong>${pad(h)}:${pad(m)}:${pad(sec)}</strong>`;
}

// Accuracy is deliberately absent from the live HUD and present only here, once
// the run is over. On screen it would punish continuing — at 3/3 you are on 100%
// and the next animal can only lower it — which pushes people to stop early, the
// opposite of what a mode built around seeing lots of animals wants.
//
// Suppressed under 5 rounds: 1/1 is 100% and 1/2 is 50%, and neither means
// anything.
export function accuracyLabel(score: number, attempted: number): string {
    if (attempted < 5) return '—';
    return `${Math.round((score / attempted) * 100)}%`;
}

// =========================================================================
// FINISHED PRODUCT — active
//
// Score alone conflates two different players: 9-of-14 and 9-of-40 both "got 9",
// and only one of them was good at it. Accuracy is the skill number, score is the
// endurance number, and the share carries both.
//
// To switch to the testing build, comment this function out and uncomment the
// DEMO DATABASE TEST block below. Nothing else has to change — the caller already
// passes `missed` and `solved`.
// =========================================================================
export function buildEndlessShareText(score: number, attempted: number, best: number,
                                      _missed: string[] = [], _solved: string[] = []): string {
    const acc = attempted >= 5 ? ` — ${Math.round((score / attempted) * 100)}% accuracy` : '';
    const bestLine = best > score ? `\nMy best run: ${best}.` : '';
    return `Dinozoa — Endless mode\n` +
        `I identified ${score} of ${attempted} prehistoric animal${attempted === 1 ? '' : 's'}${acc}.` +
        bestLine +
        `\nThink you can beat that?\n${location.origin}`;
}

// =========================================================================
// DEMO DATABASE TEST — commented out
//
// Swap this in when running a public demo to tune the answer pool. Accuracy is a
// summary statistic that throws away the information you actually need: WHICH
// animals were missed matters far more than what fraction were. This turns every
// tester into a data point naming specific offenders rather than a number you
// cannot act on.
//
// TO ENABLE: comment out buildEndlessShareText above, then uncomment everything
// below. Remember to swap back before launch — players do not want to paste a
// list of their failures into a group chat.
// =========================================================================
// export function buildEndlessShareText(score: number, attempted: number, best: number,
//                                       missed: string[] = [], _solved: string[] = []): string {
//     const pct = attempted > 0 ? Math.round((score / attempted) * 100) : 0;
//     // Capped so a 40-round run does not paste a wall of text into a comment box.
//     const CAP = 15;
//     const shown = missed.slice(0, CAP).join(', ');
//     const rest = missed.length > CAP ? ` +${missed.length - CAP} more` : '';
//     const missedLine = missed.length ? `\nMissed: ${shown}${rest}` : '\nMissed: none';
//     const bestLine = best > score ? `\nBest run: ${best}` : '';
//     return `Dinozoa endless — ${score}/${attempted} (${pct}%)` +
//         missedLine + bestLine;
// }


// A fixed sign-off gets stale fast when the mode is built for repeated runs, so
// the summary picks a different one each time.
const PRAISE = [
    'Nice dig.', 'Good run.', 'Good guesses!', 'Solid excavation.',
    'That was a proper dig.', 'Bones recovered.', 'Not bad at all.',
];

function randomPraise(): string {
    return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}


// Endless is played in long sessions, so a single fixed headline goes stale fast.
// A fast solve gets its own set — being told "that was fast" only lands if it
// actually was.
const WIN_TITLES = ['Got it!', 'Good job!', 'Nailed it.', 'Found it!', 'Well dug.'];
const FAST_TITLES = ['That was fast!', 'Quick work!', 'Barely a scratch.', 'Straight to it!'];

function winTitle(guessCount: number): string {
    const pool = guessCount < 5 ? FAST_TITLES : WIN_TITLES;
    return pool[Math.floor(Math.random() * pool.length)];
}
