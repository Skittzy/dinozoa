import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
globalThis.fetch = (async (url: any) => new Response(readFileSync('public/' + String(url).replace(/^\//, ''), 'utf8'))) as any;
const { loadDatabase, nodeLookup, parentLookup } = await import('./src/data/loadTree.ts');
const { GameState, DAILY_RULES, ENDLESS_RULES } = await import('./src/game/gameState.ts');
const { loadAnimalClues, setClueDatabase, selectFact, cluesFor, isClueVersionCompatible, clueCategoryLabel } = await import('./src/game/animalClues.ts');
await loadDatabase();
await loadAnimalClues();
const kentro = 360, stego = 359;
const ready = () => { const s = new GameState(kentro); s.submitGuess('Stegosaurus'); return s; };
assert.equal(new GameState(kentro).reachedFinalClade, false);
const s = ready();
assert.equal(s.reachedFinalClade, true);
assert(s.plausibleCandidates().includes(kentro));
assert(s.plausibleCandidates().some(id => !nodeLookup[id].answer));
assert.equal(s.useExtraHint('factual')?.cost, 0);
assert.equal(s.remaining, 19);
assert.equal(s.useExtraHint('name')?.cost, 1);
assert.equal(s.remaining, 18);
assert.equal(s.useExtraHint('name', 1), null, 'stale purchase cannot buy again');
s.milestoneShown = true;
const restored = new GameState(kentro);
restored.restore([stego], [], false, s.hintProgress());
assert.equal(restored.remaining, s.remaining);
assert.equal(restored.revealedName, s.revealedName);
assert.equal(restored.milestoneShown, true);
assert.equal(restored.extraHintPrice, 1);
assert.deepEqual(restored.hintCounts, s.hintCounts);
const legacy = new GameState(kentro); legacy.restore([stego], []);
assert.equal(legacy.extraHintPrice, 0);
const last = new GameState(kentro, { maxGuesses: 2, hintCost: 3, maxHints: Infinity });
last.submitGuess('Stegosaurus');
assert(last.useExtraHint('name'));
assert.equal(last.remaining, 1);
assert.equal(last.useExtraHint('factual'), null);
assert.equal(last.remaining, 1);
const won = ready(); won.submitGuess('Kentrosaurus'); assert.equal(won.useExtraHint('name'), null);
const lost = new GameState(kentro, { maxGuesses: 1, hintCost: 3, maxHints: Infinity });
lost.submitGuess('Stegosaurus'); assert.equal(lost.useExtraHint('name'), null);
const bought = new GameState(kentro); while (bought.canHint()) bought.useHint();
assert.equal(bought.extraHints.length, 0);
assert.equal(bought.extraHintPrice, 0);
const cladeUnlock = new GameState(kentro, { maxGuesses: 100, hintCost: 3, maxHints: Infinity });
while (cladeUnlock.nextHintId() !== null) assert(cladeUnlock.useHint());
assert(cladeUnlock.reachedFinalClade, 'purchased final clade unlocks extra hints');
assert.equal(cladeUnlock.useExtraHint('factual')?.cost, 0);
assert.equal(ENDLESS_RULES.hintCost, 3);
const endless = new GameState(kentro, ENDLESS_RULES); endless.submitGuess('Stegosaurus');
assert.equal(endless.useExtraHint('name')?.cost, 0);
assert.equal(endless.useExtraHint('name')?.cost, 1);
assert.equal(endless.remaining, 8);
// Unknown evidence stays in the candidate set; explicit contradictions may leave it.
const unknown = ready(); const other = unknown.plausibleCandidates().find(id => id !== kentro)!;
setClueDatabase({ version: 'fixture', animals: { [kentro]: { scientific: 'Kentrosaurus', clues: [{
    id: 'fixture-fact', text: 'Fixture', review: 'reviewed', category: 'test', distinguishing: true,
    sources: [{ label: 'Fixture', url: 'https://example.org' }], excludes: [other]
}] } } });
unknown.useExtraHint('factual');
assert(!unknown.plausibleCandidates().includes(other));
assert(unknown.plausibleCandidates().includes(kentro));
assert.equal(unknown.extraHintUnavailable('factual'), 'No more helpful factual hints are available. Try a Name Clue.');
// An explicitly compatible additive release retains the old fact's evidence.
setClueDatabase({ version: 'additive', compatibleVersions: ['fixture'], animals: {
    [kentro]: { scientific: 'Kentrosaurus', clues: cluesFor(kentro) }
} });
assert(isClueVersionCompatible('fixture'));
assert(!unknown.plausibleCandidates().includes(other));
const retired = new GameState(kentro);
retired.restore([stego], [], false, unknown.hintProgress());
setClueDatabase({ version: 'new-version', animals: {} });
assert(retired.plausibleCandidates().includes(other));
assert.equal(retired.extraHintPrice, 1, 'retired clue cannot reset free allowance');
assert.equal(retired.useExtraHint('factual'), null);
assert.equal(ready().extraHintUnavailable('factual'), 'There are currently no factual hints for this creature. Try a Name Clue.');
// Known shared characters, repeated topics and editorially withheld facts are skipped.
const template = { review: 'reviewed' as const, category: 'test', distinguishing: true,
    text: 'A sourced character', sources: [{ label: 'Fixture', url: 'https://example.org' }] };
setClueDatabase({ version: 'selection', animals: { [kentro]: { scientific: 'Kentrosaurus', clues: [
    { ...template, id: 'shared', sharedBy: [kentro, other] },
    { ...template, id: 'withheld', distinguishing: false },
    { ...template, id: 'specific', topic: 'one', excludes: [other] },
    { ...template, id: 'repeat', topic: 'one' },
] } } });
assert(['specific', 'repeat'].includes(selectFact(kentro, new Set(), [kentro, other])!.id));
assert.equal(selectFact(kentro, new Set(['specific']), [kentro, other]), null);
assert.equal(selectFact(kentro, new Set(), [kentro]), null);
// Every answer can reach its parent and every name clue preserves the answer.
await loadAnimalClues();
// Both categories can come first; ordering is repeatable and independent of file
// order. Filtering a candidate or consuming a clue must not reroll the others.
const originalProfile = cluesFor(kentro);
function sequence(seed: string): string[] {
    const used = new Set<string>();
    while (true) {
        const clue = selectFact(kentro, used, [kentro, other], seed);
        if (!clue) return [...used];
        assert(!used.has(clue.id));
        used.add(clue.id);
        assert(used.size <= originalProfile.length);
    }
}
const orders = new Set<string>(), firstCategories = new Set<string>();
for (let day = 1; day <= 40; day++) {
    const seed = `daily:2026-10-${day}`;
    const order = sequence(seed);
    assert.equal(order.length, originalProfile.length);
    assert.deepEqual(sequence(seed), order);
    const used = new Set([order[0]]);
    assert.equal(selectFact(kentro, used, [kentro, other], seed)?.id, order[1]);
    assert.equal(selectFact(kentro, used, [kentro], seed), null);
    orders.add(order.join(','));
    firstCategories.add(clueCategoryLabel(originalProfile.find(c => c.id === order[0])!));
}
assert(orders.size > 1, 'different round seeds should vary the order');
assert.deepEqual([...firstCategories].sort(), ['Pop culture', 'Scientific']);
const expectedOrder = sequence('same-round');
setClueDatabase({ version: 'reordered', animals: {
    [kentro]: { scientific: 'Kentrosaurus', clues: [...originalProfile].reverse() }
} });
assert.deepEqual(sequence('same-round'), expectedOrder);
await loadAnimalClues();
for (const rules of [DAILY_RULES, ENDLESS_RULES]) {
    const round = new GameState(kentro, rules, 'saved-round');
    round.submitGuess('Stegosaurus');
    const first = round.nextExtraHint('factual');
    assert.deepEqual(round.nextExtraHint('factual'), first, 'checking availability must not reroll');
    assert.equal(round.useExtraHint('factual')?.cost, 0);
    const resumed = new GameState(kentro, rules, 'discard-this-new-seed');
    resumed.restore([stego], [], false, round.hintProgress());
    assert.equal(resumed.hintProgress().factualHintSeed, 'saved-round');
    assert.deepEqual(resumed.nextExtraHint('factual'), round.nextExtraHint('factual'));
    assert.equal(resumed.useExtraHint('factual')?.cost, 1);
    assert.equal(resumed.useExtraHint('factual')?.cost, 1);
    assert.equal(resumed.nextExtraHint('factual'), null);
    assert.equal(resumed.hintCounts.factual, originalProfile.length);
}
const legacySeed = new GameState(kentro, DAILY_RULES, 'daily:legacy');
legacySeed.restore([stego], [], false, { extraHints: [{ type: 'factual', id: '360-01', cost: 0, version: '2026-10-09.2' }] });
assert(isClueVersionCompatible('2026-10-09.2'), 'existing scientific hints remain readable after this additive update');
assert.equal(legacySeed.hintProgress().factualHintSeed, 'daily:legacy');
assert.equal(legacySeed.extraHintPrice, 1);
assert.notEqual(legacySeed.nextExtraHint('factual')?.id, '360-01');
// Existing facts must not be reported as missing after spelling narrows the answer.
const narrowed = new GameState(201);
narrowed.restore([], [parentLookup[201]!]);
assert.equal(narrowed.extraHintUnavailable('factual'), null);
assert.equal(narrowed.useExtraHint('name')?.cost, 0);
assert.equal(narrowed.plausibleCandidates().length, 1);
assert.equal(narrowed.extraHintUnavailable('factual'), 'Factual hints won’t narrow it down any further. Try a Name Clue.');
for (const animal of Object.values(nodeLookup).filter(n => n.answer)) {
    const game = new GameState(animal.id, { maxGuesses: 100, hintCost: 0, maxHints: Infinity });
    game.restore([], [parentLookup[animal.id]!]);
    assert(game.reachedFinalClade, animal.scientific);
    assert(cluesFor(animal.id).length > 0, `${animal.scientific}: no sourced coverage`);
    while (game.nextExtraHint('factual')) {
        const before = game.remaining;
        const price = game.extraHintPrice;
        assert(game.useExtraHint('factual'));
        assert.equal(game.remaining, before - price);
        assert(game.plausibleCandidates().includes(animal.id), animal.scientific);
    }
    while (game.nextExtraHint('name')) {
        assert(game.useExtraHint('name'));
        assert(game.plausibleCandidates().includes(animal.id), animal.scientific);
    }
    assert(!game.revealedName?.includes('_'));
}
// Failed and malformed clue files leave the spelling fallback functional and free.
globalThis.fetch = (async () => new Response('{"version":"broken","animals":{"360":{"scientific":"Kentrosaurus","clues":[null,{"id":"bad"}]}}}')) as any;
await loadAnimalClues();
const offline = ready();
assert.equal(offline.extraHintUnavailable('factual'), 'There are currently no factual hints for this creature. Try a Name Clue.');
assert.equal(offline.useExtraHint('factual'), null);
assert.equal(offline.extraHintPrice, 0);
assert.equal(offline.useExtraHint('name')?.cost, 0);
globalThis.fetch = (async () => { throw new Error('offline'); }) as any;
await loadAnimalClues();
assert.equal(ready().useExtraHint('factual'), null);
assert.equal(ready().extraHintUnavailable('factual'), 'Factual hints couldn’t load. Try a Name Clue.');
const storage = new Map<string, string>();
globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } as any;
const { saveEndlessRun, loadEndlessRun, clearEndlessRun, saveGame, loadGame } = await import('./src/storage/stats.ts');
const dailySave = { answerId: kentro, guessIds: [stego], revealedIds: [], finished: false, ...s.hintProgress() };
saveGame('test-day', dailySave);
saveEndlessRun({ version: 1, score: 1, attempted: 2, solved: ['One'], missed: ['Two'], game: dailySave });
assert.deepEqual(loadEndlessRun()?.game, dailySave);
clearEndlessRun();
assert.deepEqual(loadGame('test-day'), dailySave, 'clearing Endless must preserve Daily');
assert.equal(loadEndlessRun(), null);
globalThis.location = { origin: 'https://dinozoa.com' } as any;
const { buildShareText, buildEndlessShareText } = await import('./src/ui/render.ts');
for (const text of [buildShareText(true, 2, [.5, 1], 10, 1, s.hintCounts),
    buildEndlessShareText(1, 2, 1, ['Kentrosaurus'], ['Stegosaurus'], s.hintCounts)]) {
    assert(text.includes('Factual hints: 1') && text.includes('Name clues: 1'));
    assert(!/Kentrosaurus|Stegosaurus|Tendaguru/.test(text), 'share must not contain answers or clue text');
}
console.log('Hint rules, content selection, migrations, mode isolation, shares and all eligible answers passed.');
