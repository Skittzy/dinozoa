// dailyAnimal.ts — turns today's date into exactly one animal, the same for everyone.
//
// Metaphor: one shuffled deck, dealt all the way through, then reshuffled.
//
// The deck used to be reshuffled every New Year and dealt by day-of-year. That
// guaranteed no answer repeated inside a year — but only by needing 365+ distinct
// answers, which forced the pool to include genera almost nobody recognises.
//
// Now the deck is the ~213 RECOGNISABLE animals. We deal straight through it, one
// card a day; when it runs out we reshuffle with a new seed and deal again. So an
// answer can repeat across cycles (roughly twice a year) but NEVER inside one —
// the soonest a repeat can come back is a full pool-length later. Allowing that
// repeat is exactly what buys us a pool of animals players have heard of.

import { nodeLookup } from '../data/loadTree';

// A tiny seeded RNG (Mulberry32). Same seed in → same sequence out (a repeatable "shuffle").
function createSeededRNG(seed: number) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Day 1 of Dinozoa. Puzzle numbers count from here and never reset, so "Dinozoa
// #412" keeps rising instead of dropping back to #1 every January.
//
// This line is the ONLY place the launch date is written down. It has already
// drifted from the prose around it twice: a comment said 1 August and the page
// header said 1 October while the real value was neither. So anything that needs
// to show the date derives it from here through launchDateLabel() rather than
// spelling it out again. Months are zero-indexed — 8 is September.
//
// The <= 0 guards downstream are kept anyway: they cost nothing and stop a
// negative number reaching the UI if this ever moves.
const EPOCH = Date.UTC(2026, 8, 15);
const ONE_DAY = 1000 * 60 * 60 * 24;

// How many whole days since the epoch. Computed in UTC on purpose: the old version
// used the device's local calendar, which meant changing the system clock handed you
// tomorrow's answer, and crossing a timezone could silently break a streak.
export function getDayNumber(date: Date = new Date()): number {
    const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor((utcMidnight - EPOCH) / ONE_DAY);
}

// The puzzle number players see and share. 1-based, monotonic.
export function getPuzzleNumber(date: Date = new Date()): number {
    return getDayNumber(date) + 1;
}

// The launch date as players see it, read off EPOCH instead of typed out a
// second time. Formatted in UTC to match the epoch itself, so it cannot show a
// different day to someone west of Greenwich than the countdown does.
export function launchDateLabel(): string {
    return new Date(EPOCH).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', timeZone: 'UTC',
    });
}

// Kept for the existing tests and any caller that still wants a day-of-year.
export function getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor((date.getTime() - start.getTime()) / oneDay);
}

// The answer pool = every leaf flagged answer=true, i.e. the recognisable ones.
// The other ~258 leaves stay fully guessable — an expert can still triangulate with
// Secodontosaurus, they just won't be asked to name it.
export function getAnswerPool(): number[] {
    const pool: number[] = [];
    for (const node of Object.values(nodeLookup)) {
        if (node.children.length === 0 && node.answer) pool.push(node.id);
    }
    pool.sort((a, b) => a - b); // stable order so the shuffle is deterministic
    return pool;
}

// Today's answer id — deterministic for a given date, identical for every player.
export function getDailyAnimalId(date: Date = new Date()): number {
    const pool = getAnswerPool();
    if (pool.length === 0) throw new Error('answer pool is empty');

    const day = getDayNumber(date);
    // Which pass through the deck, and how far into it. Math.floor (not | 0) so this
    // still behaves for dates before the epoch, where `day` is negative.
    const cycle = Math.floor(day / pool.length);
    const position = ((day % pool.length) + pool.length) % pool.length;

    // Reshuffle once per cycle, so each pass deals a different order.
    const shuffle = createSeededRNG(cycle + 1);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(shuffle() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool[position];
}

// How long until the next animal, in milliseconds. The answer flips at 00:00 UTC,
// the same instant dateKey() rolls over, so the countdown can never disagree with
// the puzzle the player is actually looking at.
export function msUntilNextAnimal(now: Date = new Date()): number {
    const nextUtcMidnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(0, nextUtcMidnight - now.getTime());
}

// A stable date key like "2026-07-09", used for saving today's game.
// UTC so the saved-game key rolls over at the same instant as the answer does.
export function dateKey(date: Date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
