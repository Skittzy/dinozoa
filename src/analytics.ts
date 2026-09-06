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
