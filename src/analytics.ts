// analytics.ts — the handful of things worth counting, sent to GoatCounter.
//
// GoatCounter already counts visits. What it cannot see is whether anybody
// actually played: someone who bounces off the tutorial and someone who wins in
// four guesses are identical in a pageview count. These events fill that gap,
// and they only work from launch day onwards — there is no way to measure a
// launch after it has happened.
//
// Everything goes through one guarded call, for a reason worth stating. The
// counter script is loaded with `async` and is blocked outright by most ad
// blockers, so `window.goatcounter` is frequently absent. Reaching for `.count`
// on it directly throws a TypeError — in `finish()` that would fire in the
// moment a player wins, and take the end-game modal down with it. Counting is
// never worth breaking the game for, so a missing counter does nothing at all.

interface GoatCounter {
    count?: (vars: { path: string; title?: string; event?: boolean }) => void;
}

declare global {
    interface Window {
        goatcounter?: GoatCounter;
    }
}

/**
 * Which retention band a player is in.
 *
 * The number this reads is already the right one, by accident. recordResult()
 * refuses to raise gamesPlayed twice in the same calendar day, so despite the
 * name it is not a count of games at all: it is the number of separate DAYS this
 * browser has finished a puzzle. Somebody sitting at 12 came back on twelve
 * different days. The attendance register was being kept all along.
 *
 * Reported as a band rather than the raw number, for two reasons. Nothing leaves
 * the browser precise enough to single anyone out, and the dashboard stays
 * readable: five rows saying how many of today's players were new and how many
 * were regulars, instead of forty rows counting off one at a time.
 */
export function retentionBand(daysPlayed: number): string {
    if (daysPlayed <= 1) return 'days-played-1';
    if (daysPlayed <= 3) return 'days-played-2-3';
    if (daysPlayed <= 7) return 'days-played-4-7';
    if (daysPlayed <= 30) return 'days-played-8-30';
    return 'days-played-31-plus';
}

/**
 * Record one custom event. Never throws.
 *
 * `name` is what appears in the GoatCounter dashboard, and must not start with
 * a "/" — GoatCounter reads a leading slash as a page path, which would file
 * the event in among real pageviews instead of under Events.
 */
export function track(name: string, title?: string): void {
    try {
        window.goatcounter?.count?.({ path: name, title: title ?? name, event: true });
    } catch {
        // An analytics failure must never surface to the player.
    }
}
