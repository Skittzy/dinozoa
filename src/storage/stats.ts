// stats.ts — the only file that talks to localStorage.
//
// Two things are saved:
//   1. Long-term stats: plays, wins, current streak, best streak, best score.
//   2. Today's in-progress game, so refreshing the page keeps your guesses and hints.

export interface Stats {
    bestScore: number | null;
    streak: number;
    maxStreak: number;
    lastPlayedDate: string | null;
    gamesPlayed: number;
    gamesWon: number;
}

import type { HintCounts, HintProgress } from '../game/hintTypes';

export interface SavedGame extends HintProgress {
    answerId: number;
    guessIds: number[];
    revealedIds: number[];
    finished: boolean;
    /** Optional: absent in games saved before the give up button existed. */
    surrendered?: boolean;
}

const STATS_KEY = 'dinozoa.stats';
const gameKey = (dateKey: string) => `dinozoa.game.${dateKey}`;

function readJSON<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeJSON(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* private mode: the game still works, it just won't persist */
    }
}

export function loadStats(): Stats {
    const s = readJSON<Partial<Stats>>(STATS_KEY);
    return {
        bestScore: s?.bestScore ?? null,
        streak: s?.streak ?? 0,
        maxStreak: s?.maxStreak ?? 0,
        lastPlayedDate: s?.lastPlayedDate ?? null,
        gamesPlayed: s?.gamesPlayed ?? 0,
        gamesWon: s?.gamesWon ?? 0,
    };
}

function previousDay(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Called once when today's game ends, win or lose.
export function recordResult(dateKey: string, won: boolean, guessCount: number): Stats {
    const stats = loadStats();
    if (stats.lastPlayedDate === dateKey) return stats; // already counted today

    stats.gamesPlayed += 1;
    if (won) {
        stats.gamesWon += 1;
        stats.streak = stats.lastPlayedDate === previousDay(dateKey) ? stats.streak + 1 : 1;
        stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
        stats.bestScore = stats.bestScore === null ? guessCount : Math.min(stats.bestScore, guessCount);
    } else {
        stats.streak = 0;
    }
    stats.lastPlayedDate = dateKey;

    writeJSON(STATS_KEY, stats);
    return stats;
}

// Wipes the long-term record. Today's in-progress game is left alone on purpose, so
// clearing your history doesn't also hand you a fresh set of 20 guesses.
export function clearStats(): void {
    try {
        localStorage.removeItem(STATS_KEY);
    } catch {
        /* storage unavailable */
    }
}

export function loadGame(dateKey: string): SavedGame | null {
    return readJSON<SavedGame>(gameKey(dateKey));
}

export function saveGame(dateKey: string, game: SavedGame): void {
    writeJSON(gameKey(dateKey), game);
}

// ---------------------------------------------------------------------------
// ENDLESS MODE — kept in its own key, deliberately.
//
// Endless must never touch dinozoa.stats. A practice loss zeroing someone's
// 40-day daily streak is the kind of bug that loses a player permanently, so the
// two live in separate storage and share no code path.
export interface EndlessStats {
    runs: number;
    bestScore: number;      // most animals solved in a single run
    bestAttempted: number;  // how many were seen during that best run
}

const ENDLESS_KEY = 'dinozoa.endless';

const EMPTY_ENDLESS: EndlessStats = { runs: 0, bestScore: 0, bestAttempted: 0 };

export function loadEndlessStats(): EndlessStats {
    return { ...EMPTY_ENDLESS, ...(readJSON<EndlessStats>(ENDLESS_KEY) ?? {}) };
}

export function recordEndlessRun(score: number, attempted: number): EndlessStats {
    const s = loadEndlessStats();
    s.runs += 1;
    if (score > s.bestScore) {
        s.bestScore = score;
        s.bestAttempted = attempted;
    }
    writeJSON(ENDLESS_KEY, s);
    return s;
}

// A separate run record preserves the current animal, hints and completed rounds.
export interface SavedEndlessRun {
    version: 1;
    score: number;
    attempted: number;
    missed: string[];
    solved: string[];
    hintCounts?: HintCounts;
    game: SavedGame;
}
const ENDLESS_RUN_KEY = 'dinozoa.endless.current';
export function loadEndlessRun(): SavedEndlessRun | null {
    const value = readJSON<SavedEndlessRun>(ENDLESS_RUN_KEY);
    return value?.version === 1 && value.game && Number.isInteger(value.game.answerId)
        && Array.isArray(value.game.guessIds) && Array.isArray(value.game.revealedIds)
        && Number.isInteger(value.score) && value.score >= 0
        && Number.isInteger(value.attempted) && value.attempted >= value.score
        && Array.isArray(value.solved) && value.solved.every(s => typeof s === 'string')
        && Array.isArray(value.missed) && value.missed.every(s => typeof s === 'string') ? value : null;
}
export function saveEndlessRun(run: SavedEndlessRun): void { writeJSON(ENDLESS_RUN_KEY, run); }
export function clearEndlessRun(): void {
    try { localStorage.removeItem(ENDLESS_RUN_KEY); } catch { /* storage unavailable */ }
}
