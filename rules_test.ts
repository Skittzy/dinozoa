// Runs the REAL game modules in Node by stubbing fetch to read from disk.
import { readFileSync } from 'node:fs';

const origFetch = globalThis.fetch;
globalThis.fetch = (async (url: any) => {
    const u = String(url);
    // The app requests 'data/...' relatively so the same build works from any
    // subpath. Node's fetch rejects relative URLs, so serve those off disk here.
    if (u.startsWith('data/') || u.startsWith('/data/') || u.startsWith('./data/')) {
        const file = 'public/' + u.replace(/^\.?\//, '');
        return new Response(readFileSync(file, 'utf8'), { status: 200 });
    }
    return origFetch(url);
}) as any;

const tree = await import('./src/data/loadTree.ts');
const { loadDatabase, nodeLookup, ancestorsOf, depthLookup } = tree;
const { GameState, MAX_GUESSES, HINT_COST } = await import('./src/game/gameState.ts');
const { getDailyAnimalId } = await import('./src/game/dailyAnimal.ts');

await loadDatabase();

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`); }
    else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const answerId = getDailyAnimalId(new Date(2026, 6, 30));
const answer = nodeLookup[answerId];
console.log(`Today's answer: ${answer.scientific} (${answer.common}), depth ${depthLookup[answerId]}\n`);

// ---- 1. 20-guess cap ----
console.log('1) guess cap');
{
    const g = new GameState(answerId);
    const leaves = Object.values(nodeLookup).filter((n: any) => n.children.length === 0 && n.id !== answerId) as any[];
    let outcome: any = null;
    for (let i = 0; i < 25; i++) outcome = g.submitGuess(leaves[i].scientific);
    check('exactly 20 guesses recorded', g.guesses.length === MAX_GUESSES, `got ${g.guesses.length}`);
    check('game is lost', g.lost && g.over && !g.won);
    check('remaining is 0', g.remaining === 0);
    check('21st guess rejected with "over"', outcome.status === 'over', JSON.stringify(outcome.status));
    // the 20th guess should have reported 'lose'
    const g2 = new GameState(answerId);
    let last: any;
    for (let i = 0; i < 20; i++) last = g2.submitGuess(leaves[i].scientific);
    check('20th guess returns lose', last.status === 'lose', last.status);
}

// ---- 2. hints ----
console.log('\n2) hints');
{
    const g = new GameState(answerId);
    const lineage = ancestorsOf(answerId).reverse(); // [root ... answer]
    check('starts at root', g.bestKnownId() === tree.rootId, `best=${g.bestKnownId()} root=${tree.rootId}`);
    const first = g.nextHintId();
    check('first hint is the root\'s child on the answer path', first === lineage[1],
        `${first && nodeLookup[first].scientific} vs ${nodeLookup[lineage[1]].scientific}`);

    const before = g.remaining;
    const revealed = g.useHint();
    check('hint costs exactly 3 guesses', g.remaining === before - HINT_COST, `${before} -> ${g.remaining}`);
    check('revealed node is on the answer lineage', ancestorsOf(answerId).includes(revealed!));
    check('bestKnown advanced to it', g.bestKnownId() === revealed);

    // chain hints until exhausted; must never reveal the answer itself
    const g3 = new GameState(answerId);
    const seen: number[] = [];
    while (g3.canHint()) { const r = g3.useHint(); if (r === null) break; seen.push(r); }
    check('never reveals the answer itself', !seen.includes(answerId));
    check('hint chain starts below the root', seen.length === 0 || ancestorsOf(seen[0]).includes(tree.rootId));
    check('each hint goes strictly deeper',
        seen.every((id, i) => i === 0 || depthLookup[id] > depthLookup[seen[i - 1]]));
    check('hint blocked when <= 3 guesses remain', g3.remaining <= HINT_COST || g3.nextHintId() === null,
        `remaining=${g3.remaining}`);
    check('hints never push the player below 1 remaining', g3.remaining >= 1, `remaining=${g3.remaining}`);
}

// ---- 3. hint + guess interaction ----
console.log('\n3) hints and guesses share the same budget');
{
    const g = new GameState(answerId);
    g.useHint(); g.useHint();                       // 6 spent
    const leaves = Object.values(nodeLookup).filter((n: any) => n.children.length === 0 && n.id !== answerId) as any[];
    for (let i = 0; i < 14; i++) g.submitGuess(leaves[i].scientific);   // 14 more = 20
    check('2 hints + 14 guesses exhausts the budget', g.guessesUsed === 20 && g.lost,
        `used=${g.guessesUsed} lost=${g.lost}`);
}

// ---- 4. winning ----
console.log('\n4) winning');
{
    const g = new GameState(answerId);
    g.submitGuess('Stegosaurus');
    const win = g.submitGuess(answer.scientific);
    check('correct guess wins', win.status === 'win' && g.won && g.over);
    check('no further guesses accepted', g.submitGuess('Triceratops').status === 'over');
    check('score counts guesses only', g.guesses.length === 2);
}

// ---- 5. restore ----
console.log('\n5) restore from storage');
{
    const a = new GameState(answerId);
    a.useHint();
    a.submitGuess('Stegosaurus');
    const b = new GameState(answerId);
    b.restore(a.guesses.map(x => x.guessId), [...a.revealedIds]);
    check('guesses restored', b.guesses.length === a.guesses.length);
    check('hints restored', b.revealedIds.length === a.revealedIds.length);
    check('remaining matches', b.remaining === a.remaining, `${b.remaining} vs ${a.remaining}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
