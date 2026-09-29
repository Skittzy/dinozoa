// Exercise the real selector against the shipped database, with no network calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadDatabase, nodeLookup } from './src/data/loadTree.ts';
import { dateKey, getAnswerPool, getDailyAnimalId, getPuzzleNumber,
         msUntilNextAnimal } from './src/game/dailyAnimal.ts';

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(
    readFileSync(new URL('./public/data/dinosaur-database.json', import.meta.url), 'utf8'));
try {
    await loadDatabase();
} finally {
    globalThis.fetch = originalFetch;
}

const answer = (iso: string) => nodeLookup[getDailyAnimalId(new Date(iso))].scientific;
const pool = getAnswerPool();
const dakotaraptor = Object.values(nodeLookup).find(n => n.scientific === 'Dakotaraptor')!;
assert.ok(dakotaraptor.answer && dakotaraptor.children.length === 0);

// Exact UTC boundaries, including players whose local calendar says another day.
assert.equal(answer('2026-09-28T23:59:59.999Z'), 'Glyptodon');
assert.equal(answer('2026-09-29T00:00:00Z'), 'Dakotaraptor');
assert.equal(answer('2026-09-29T23:59:59.999Z'), 'Dakotaraptor');
assert.equal(answer('2026-09-28T17:00:00-07:00'), 'Dakotaraptor');
assert.equal(answer('2026-09-30T01:59:59+02:00'), 'Dakotaraptor');
assert.equal(answer('2026-09-30T00:00:00Z'), 'Suchomimus');
assert.equal(answer('2026-10-27T12:00:00Z'), 'Daeodon');
assert.equal(getPuzzleNumber(new Date('2026-09-29T12:00:00Z')), 15);
assert.equal(dateKey(new Date('2026-09-30T01:59:59+02:00')), '2026-09-29');
assert.equal(msUntilNextAnimal(new Date('2026-09-29T23:59:59.999Z')), 1);
assert.equal(msUntilNextAnimal(new Date('2026-09-30T00:00:00Z')), 86400000);
console.log('  ok  daily selection, UTC boundaries and puzzle number');

// Regression snapshots for stable dates across four cycles.
// Deliberate answer-pool changes will require reviewing these snapshots.
const scheduleHashes = new Map([
    [-1, '07dbed4ef88b2981e7877ddab1e9e0028631978893a328967e4f772937c79505'],
    [0, 'd9fbc06cc55bdacf15b9ad153dffeae20655381286460e6cdcaa27526a9e20e7'],
    [1, 'da1c025ec9ea7816b3f2731bd86477cd6c0575cfb49355f44bd58f16e6600a16'],
    [2, '6861ba5013f78326b42d1960b94e09a1bc4e2ada75dc0046dca0b5ba62810c5a'],
]);
for (const [cycle, expectedHash] of scheduleHashes) {
    const ids = Array.from({ length: pool.length }, (_, i) => getDailyAnimalId(
        new Date(Date.UTC(2026, 8, 15) + (cycle * pool.length + i) * 86400000)));
    assert.deepEqual([...new Set(ids)].sort((a, b) => a - b), pool,
        `cycle ${cycle} must contain every eligible animal exactly once`);
    const unchanged = ids.filter((_, i) => cycle !== 0 || (i !== 14 && i !== 42))
        .map(id => nodeLookup[id].scientific);
    const hash = createHash('sha256').update(JSON.stringify(unchanged)).digest('hex');
    assert.equal(hash, expectedHash, `unaffected dates in cycle ${cycle} must not change`);
}
assert.deepEqual(getAnswerPool(), pool, 'selection must not mutate the shared answer pool');
console.log('  ok  four full cycles preserve eligibility, uniqueness and unaffected dates');

// An unavailable name must fall back to a working shuffled schedule.
const originalName = dakotaraptor.scientific;
try {
    dakotaraptor.scientific = 'Unlisted animal';
    assert.equal(answer('2026-09-29T12:00:00Z'), 'Daeodon');
} finally {
    dakotaraptor.scientific = originalName;
}
console.log('  ok  unavailable animal falls back safely');
