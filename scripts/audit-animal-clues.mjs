import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const tree = JSON.parse(readFileSync('public/data/dinosaur-database.json', 'utf8')).root;
const data = JSON.parse(readFileSync('public/data/animal-clues.json', 'utf8'));
const nodes = new Map(), parents = new Map();
function walk(n, parent) { nodes.set(n.id, n); parents.set(n.id, parent); n.children.forEach(c => walk(c, n)); }
walk(tree, null);
const pool = [...nodes.values()].filter(n => n.answer && !n.children.length);
const ids = new Set();
const coverage = pool.map(animal => {
  const p = data.animals[animal.id];
  assert(p && p.scientific === animal.scientific, `Missing/mismatched profile: ${animal.scientific}`);
  for (const c of p.clues) {
    assert(!ids.has(c.id), `Duplicate clue ID ${c.id}`); ids.add(c.id);
    assert.equal(c.review, 'reviewed');
    assert(c.text?.trim() && c.category && c.scope && c.topic && c.reviewedOn, `Incomplete clue ${c.id}`);
    assert(!c.text.toLowerCase().includes(animal.scientific.toLowerCase()), `Unmasked scientific name: ${c.id}`);
    assert(c.sources.length && c.sources.every(s => s.label && new URL(s.url).protocol === 'https:'), `Bad source ${c.id}`);
    assert(!(c.excludes ?? []).includes(animal.id), `Self-exclusion ${c.id}`);
    assert(c.sharedBy.includes(animal.id));
    for (const other of c.excludes ?? []) {
      assert(nodes.has(other) && !nodes.get(other).children.length, `Invalid candidate ${other}`);
      assert(!c.sharedBy.includes(other), `Contradictory comparison ${c.id}`);
      const evidence = c.comparisonEvidence.find(e => e.animalId === other && e.relationship === 'contradicts');
      assert(evidence?.reason && evidence.sources.length, `Unsupported elimination ${c.id}/${other}`);
    }
    for (const other of c.sharedBy.filter(id => id !== animal.id)) {
      assert(c.comparisonEvidence.some(e => e.animalId === other && e.relationship === 'matches' && e.sources.length), `Unsupported match ${c.id}/${other}`);
    }
    if (!c.distinguishing) assert(c.withheldReason, `Missing withholding reason ${c.id}`);
  }
  const usable = p.clues.filter(c => c.distinguishing);
  assert(usable.length, `No useful source-checked facts: ${animal.scientific}`);
  const siblings = parents.get(animal.id).children.filter(n => !n.children.length).map(n => n.id);
  return {
    id: animal.id, scientific: animal.scientific, finalClade: parents.get(animal.id).scientific,
    directGuessableAnimals: siblings.length, researchedFacts: p.clues.length,
    distinctPlayableTopics: new Set(usable.map(c => c.topic)).size,
    factsWithReviewedSiblingContradictions: usable.filter(c => c.excludes.some(id => siblings.includes(id))).length,
    comparisonStatus: 'Unlisted candidates are unknown. Descriptive facts are not guaranteed to eliminate a candidate.',
    withheld: p.clues.filter(c => !c.distinguishing).map(c => ({ id: c.id, reason: c.withheldReason })),
    notes: p.notes,
  };
});
for (const id of Object.keys(data.animals)) assert(pool.some(n => n.id === Number(id)), `Stale profile ${id}`);
const report = {
  contentVersion: data.version, eligibleAnswers: pool.length, answersWithSourcedFacts: coverage.length,
  sourceCheckedFacts: ids.size,
  playableFacts: coverage.reduce((n, c) => n + c.researchedFacts - c.withheld.length, 0),
  missingAnswerProfiles: [],
  limitations: [
    'Source checks are implementation research, not independent specialist peer review.',
    'Two researched facts per animal; general/redundant facts may be withheld. More anatomical comparisons remain useful future work.',
    `Complete comparison evidence for all ${[...nodes.values()].filter(n => !n.children.length).length} guessable animals is not available. Missing information never excludes a candidate.`,
    'A fact is unavailable when all remaining candidates positively match it, its topic was used, or only the answer remains.',
    'Occurrence at one fossil site is never interpreted as absence elsewhere.',
    'Disputed or species-specific cases have qualifications in their profiles and displayed text.',
  ],
  animals: coverage,
};
if (process.argv.includes('--write')) writeFileSync('docs/animal-clue-coverage.json', JSON.stringify(report, null, 2) + '\n');
else if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync('docs/animal-clue-coverage.json', 'utf8')), report, 'Coverage report is stale; run npm run clues:audit');
console.log(`Clue audit: ${coverage.length}/${pool.length} answers; ${ids.size} sourced facts, ${report.playableFacts} playable; ${coverage.filter(c => c.factsWithReviewedSiblingContradictions).length} answers with explicit sibling contradictions.`);
