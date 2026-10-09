import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadDatabase, nodeLookup, parentLookup, ancestorsOf } from './src/data/loadTree.ts';
import { findLCA } from './src/game/lca.ts';
import { GameState, HINT_COST } from './src/game/gameState.ts';

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(readFileSync('public/data/dinosaur-database.json', 'utf8'));
try { await loadDatabase(); } finally { globalThis.fetch = originalFetch; }
const nodes = Object.values(nodeLookup);
const byName = new Map(nodes.map(n => [n.scientific, n]));
const id = (name: string) => {
    assert.ok(byName.has(name), `missing node: ${name}`);
    return byName.get(name)!.id;
};
const legacy = nodes.filter(n => n.id <= 627).sort((a,b) => a.id-b.id)
    .map(n => [n.id, n.scientific, n.common, n.rank, n.answer, n.alt ?? []]);
assert.equal(legacy.length, 627);
// Freeze published identities, aliases and eligibility, not the old hierarchy.
assert.equal(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    'f556037ed4515d8681baeec849b5fe1869750402b5f252fd2c72291f4075359c');
const leaves = nodes.filter(n => !n.children.length);
assert.equal(leaves.length, 472);
assert.equal(leaves.filter(n => n.answer).length, 129);
assert.ok(leaves.every(n => n.rank === 'genus'));
assert.equal(new Set(nodes.map(n => n.scientific)).size, nodes.length);

const cases = [
    ['Mammuthus','Smilodon','Placentalia'],
    ['Mammuthus','Arsinoitherium','Paenungulata'],
    ['Smilodon','Megaloceros','Laurasiatheria'],
    ['Gigantopithecus','Castoroides','Euarchontoglires'],
    ['Aenocyon','Arctodus','Caniformia'],
    ['Diprotodon','Procoptodon','Diprotodontia'],
    ['Diprotodon','Thylacoleo','Vombatiformes'],
    ['Diprotodon','Thylacosmilus','Metatheria'],
    ['Uintatherium','Mammuthus','Eutheria'],
    ['Macrauchenia','Hyracotherium','Panperissodactyla'],
    ['Mammuthus','Palaeoloxodon','Elephantidae'],
    ['Coelodonta','Elasmotherium','Rhinocerotidae'],
    ['Coelodonta','Paraceratherium','Rhinocerotoidea'],
    ['Doedicurus','Glyptodon','Cingulata'],
    ['Eremotherium','Megatherium','Megatheriidae'],
    ['Megatherium','Megalonyx','Folivora'],
    ['Bison','Megaloceros','Ruminantia'],
    ['Basilosaurus','Livyatan','Pelagiceti'],
    ['Basilosaurus','Ambulocetus','Cetacea'],
    ['Pachyrhinosaurus','Styracosaurus','Centrosaurinae'],
    ['Triceratops','Pentaceratops','Chasmosaurinae'],
    ['Triceratops','Pachyrhinosaurus','Ceratopsidae'],
    ['Edmontosaurus','Maiasaura','Saurolophinae'],
    ['Corythosaurus','Parasaurolophus','Lambeosaurinae'],
    ['Corythosaurus','Edmontosaurus','Hadrosauridae'],
    ['Apatosaurus','Brontosaurus','Apatosaurinae'],
    ['Barosaurus','Diplodocus','Diplodocinae'],
    ['Albertosaurus','Gorgosaurus','Albertosaurinae'],
    ['Tyrannosaurus','Tarbosaurus','Tyrannosaurinae'],
    ['Alioramus','Qianzhousaurus','Alioramini'],
    ['Guanlong','Yutyrannus','Proceratosauridae'],
    ['Mosasaurus','Globidens','Mosasaurinae'],
    ['Mosasaurus','Tylosaurus','Mosasauridae'],
    ['Elasmosaurus','Styxosaurus','Elasmosauridae'],
    ['Rhomaleosaurus','Pliosaurus','Plesiosauria'],
    ['Gastornis','Phorusrhacos','Aves'],
    ['Leptoceratops','Protoceratops','Ceratopsia'],
    ['Sauroposeidon','Dreadnoughtus','Somphospondyli'],
    ['Beipiaosaurus','Alxasaurus','Therizinosauria'],
    ['Alxasaurus','Therizinosaurus','Therizinosauroidea'],
    ['Dakotaraptor','Deinonychus','Dromaeosauridae'],
];
for (const [a,b,expected] of cases) {
    assert.equal(nodeLookup[findLCA(id(a),id(b))].scientific, expected, `${a} / ${b}`);
}
for (const name of ['Eudromaeosauria','Giganotosaurini','Lognkosauria','Edmontosaurini','Neostegosauria']) {
    assert.ok(!byName.has(name), `${name} is outside the low-risk release`);
}
const profiles = JSON.parse(readFileSync('public/data/clade-content.json','utf8'));
for (const n of nodes.filter(n => n.id > 627)) {
    const p = profiles[n.scientific];
    assert.ok(p.summary?.trim() && p.sources?.length, `sourced description: ${n.scientific}`);
    assert.ok(p.sources.every((s: {url: string}) => s.url.startsWith('https://')));
    assert.equal(id(p.taxonomy.parent), parentLookup[n.id]);
    assert.ok(n.children.length > 0 && !n.answer);
}

const restored = new GameState(id('Gastornis'));
restored.restore([156], [91]); // published Tyrannosaurus / Phorusrhacidae IDs
assert.equal(restored.guesses[0].guessNode.scientific,'Tyrannosaurus');
assert.equal(restored.guessesUsed, 1+HINT_COST);
assert.equal(restored.revealedIds.length, 1);
assert.ok(ancestorsOf(restored.answerId).includes(restored.revealedIds[0]));
assert.equal(nodeLookup[restored.bestKnownId()].scientific,'Aves');
assert.equal(nodeLookup[restored.nextHintId()!].scientific,'Gastornithidae');
console.log(`  ok  ${cases.length} shared ancestors, legacy identities, content coverage and saved hints`);
