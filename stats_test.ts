// Verifies that stats persist without any login or server, using a stand-in for the
// browser's localStorage. "Refreshing the page" is simulated by re-reading the store.

const store = new Map<string, string>();
(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
};

const { loadStats, recordResult, clearStats, saveGame, loadGame } = await import('./src/storage/stats.ts');

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`); }
    else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

console.log('1) defaults on a brand-new browser');
{
    const s = loadStats();
    check('starts empty', s.gamesPlayed === 0 && s.gamesWon === 0 && s.streak === 0
        && s.maxStreak === 0 && s.bestScore === null);
}

console.log('\n2) a win is recorded');
{
    const s = recordResult('2026-07-20', true, 6);
    check('play + win counted', s.gamesPlayed === 1 && s.gamesWon === 1);
    check('streak starts at 1', s.streak === 1 && s.maxStreak === 1);
    check('best score stored', s.bestScore === 6);
}

console.log('\n3) it survives a refresh');
{
    const raw = store.get('dinozoa.stats');
    check('actually written to storage', typeof raw === 'string' && raw.includes('"gamesWon"'));
    const reread = loadStats();          // what a fresh page load would do
    check('same numbers after reload', reread.gamesWon === 1 && reread.bestScore === 6 && reread.streak === 1);
}

console.log('\n4) streak maths');
{
    recordResult('2026-07-21', true, 9);                 // next day
    check('consecutive day extends streak', loadStats().streak === 2, String(loadStats().streak));
    check('best score keeps the LOWER value', loadStats().bestScore === 6, String(loadStats().bestScore));
    recordResult('2026-07-21', true, 2);                 // same day again
    check('same day counted only once', loadStats().gamesPlayed === 2, String(loadStats().gamesPlayed));
    recordResult('2026-07-24', true, 4);                 // gap
    check('a missed day restarts the streak', loadStats().streak === 1, String(loadStats().streak));
    check('best streak remembered', loadStats().maxStreak === 2, String(loadStats().maxStreak));
    recordResult('2026-07-25', false, 20);               // a loss
    check('loss zeroes the streak', loadStats().streak === 0);
    check('loss still counts as a play', loadStats().gamesPlayed === 4, String(loadStats().gamesPlayed));
    check('loss does not count as a win', loadStats().gamesWon === 3, String(loadStats().gamesWon));
}

console.log('\n5) today\'s game persists separately');
{
    saveGame('2026-07-25', { answerId: 42, guessIds: [1, 2, 3], revealedIds: [7], finished: false });
    const g = loadGame('2026-07-25');
    check('guesses restored after refresh', !!g && g.guessIds.length === 3 && g.revealedIds[0] === 7);
    check('a different day is a different game', loadGame('2026-07-26') === null);
}

console.log('\n6) reset');
{
    clearStats();
    const s = loadStats();
    check('stats wiped', s.gamesPlayed === 0 && s.streak === 0 && s.bestScore === null);
    check("today's game deliberately kept", loadGame('2026-07-25') !== null);
}

console.log('\n7) survives storage being unavailable (private mode)');
{
    const saved = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
        getItem: () => { throw new Error('denied'); },
        setItem: () => { throw new Error('denied'); },
        removeItem: () => { throw new Error('denied'); },
    };
    let threw = false;
    try { recordResult('2026-07-27', true, 3); loadStats(); clearStats(); } catch { threw = true; }
    check('never throws, just stops persisting', !threw);
    (globalThis as any).localStorage = saved;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
