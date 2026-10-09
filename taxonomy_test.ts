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
const published = nodes.filter(n => n.id <= 673).sort((a,b) => a.id-b.id)
    .map(n => [n.id, n.scientific, n.common, n.rank, n.answer, n.alt ?? []]);
assert.equal(published.length, 673);
assert.equal(createHash('sha256').update(JSON.stringify(published)).digest('hex'),
    'df6d0692f1b8c83fdd3979b7cb8777cb334bde7df5dc2a9bef02ae5e6f88939f');
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
    ['Gastornis','Phorusrhacos','Neognathae'],
    ['Leptoceratops','Protoceratops','Ceratopsia'],
    ['Sauroposeidon','Dreadnoughtus','Somphospondyli'],
    ['Beipiaosaurus','Alxasaurus','Therizinosauria'],
    ['Alxasaurus','Therizinosaurus','Therizinosauroidea'],
    ['Dakotaraptor','Deinonychus','Eudromaeosauria'],
    ['Dakotaraptor','Dromaeosaurus','Dromaeosaurinae'],
    ['Dakotaraptor','Utahraptor','Eudromaeosauria'],
    ['Dakotaraptor','Bambiraptor','Dromaeosauridae'],
    ['Saurornitholestes','Bambiraptor','Dromaeosauridae'],
    ['Velociraptor','Zhenyuanlong','Dromaeosauridae'],
    ['Velociraptor','Balaur','Dromaeosauridae'],
    ['Austroraptor','Buitreraptor','Unenlagiinae'],
    ['Austroraptor','Dakotaraptor','Dromaeosauridae'],
    ['Achelousaurus','Pachyrhinosaurus','Pachyrhinosaurini'],
    ['Triceratops','Torosaurus','Triceratopsini'],
    ['Triceratops','Regaliceratops','Chasmosaurinae'],
    ['Brachylophosaurus','Maiasaura','Brachylophosaurini'],
    ['Edmontosaurus','Shantungosaurus','Edmontosaurini'],
    ['Gryposaurus','Kritosaurus','Kritosaurini'],
    ['Prosaurolophus','Saurolophus','Saurolophini'],
    ['Charonosaurus','Parasaurolophus','Parasaurolophini'],
    ['Corythosaurus','Velafrons','Lambeosaurini'],
    ['Corythosaurus','Nipponosaurus','Lambeosaurinae'],
    ['Tsintaosaurus','Nipponosaurus','Lambeosaurinae'],
    ['Argentinosaurus','Patagotitan','Lognkosauria'],
    ['Argentinosaurus','Dreadnoughtus','Titanosauria'],
    ['Argentinosaurus','Saltasaurus','Titanosauria'],
    ['Alamosaurus','Saltasaurus','Saltasauridae'],
    ['Malawisaurus','Saltasaurus','Lithostrotia'],
    ['Isisaurus','Rapetosaurus','Lithostrotia'],
    ['Notocolossus','Patagotitan','Titanosauria'],
    ['Baryonyx','Suchomimus','Baryonychinae'],
    ['Spinosaurus','Irritator','Spinosaurinae'],
    ['Spinosaurus','Ichthyovenator','Spinosaurinae'],
    ['Spinosaurus','Oxalaia','Spinosauridae'],
    ['Baryonyx','Cristatusaurus','Spinosauridae'],
    ['Meraxes','Tyrannotitan','Giganotosaurini'],
    ['Giganotosaurus','Carcharodontosaurus','Carcharodontosaurinae'],
    ['Giganotosaurus','Acrocanthosaurus','Carcharodontosauridae'],
    ['Carnotaurus','Ekrixinatosaurus','Brachyrostra'],
    ['Abelisaurus','Majungasaurus','Abelisaurinae'],
    ['Carnotaurus','Majungasaurus','Abelisauridae'],
    ['Majungasaurus','Rugops','Abelisauridae'],
    ['Ankylosaurus','Zuul','Ankylosaurini'],
    ['Ankylosaurus','Tarchia','Ankylosauridae'],
    ['Iguanodon','Dryosaurus','Dryomorpha'],
    ['Iguanodon','Camptosaurus','Ankylopollexia'],
    ['Iguanodon','Lurdusaurus','Styracosterna'],
    ['Iguanodon','Ouranosaurus','Hadrosauriformes'],
    ['Edmontosaurus','Ouranosaurus','Hadrosauroidea'],
    ['Mantellisaurus','Altirhinus','Hadrosauroidea'],
    ['Iguanodon','Muttaburrasaurus','Iguanodontia'],
    ['Conchoraptor','Nemegtomaia','Heyuanninae'],
    ['Khaan','Rinchenia','Oviraptoridae'],
    ['Khaan','Oviraptor','Oviraptoridae'],
    ['Troodon','Saurornithoides','Troodontinae'],
    ['Latenivenatrix','Zanabazar','Troodontinae'],
    ['Troodon','Sinornithoides','Troodontidae'],
    ['Troodon','Byronosaurus','Troodontidae'],
    ['Ichthyosaurus','Stenopterygius','Thunnosauria'],
    ['Ichthyosaurus','Excalibosaurus','Parvipelvia'],
    ['Temnodontosaurus','Shonisaurus','Ichthyosauria'],
    ['Aepyornis','Dinornis','Palaeognathae'],
    ['Gastornis','Raphus','Neognathae'],
    ['Dinornis','Raphus','Aves'],
    ['Pelagornis','Raphus','Aves'],
];
for (const [a,b,expected] of cases) {
    assert.equal(nodeLookup[findLCA(id(a),id(b))].scientific, expected, `${a} / ${b}`);
}
for (const name of ['Neostegosauria','Panoplosauridae','Majungasaurinae','Temnospondyli']) {
    assert.ok(!byName.has(name), `${name} is outside the selected reference framework`);
}
const profiles = JSON.parse(readFileSync('public/data/clade-content.json','utf8'));
for (const n of nodes.filter(n => n.id > 627)) {
    const p = profiles[n.scientific];
    assert.ok(p.summary?.trim() && p.sources?.length, `sourced description: ${n.scientific}`);
    assert.ok(p.sources.every((s: {url: string}) => s.url.startsWith('https://')));
    assert.equal(id(p.taxonomy.parent), parentLookup[n.id]);
    assert.ok(n.children.length > 0 && !n.answer);
    if (n.id > 673) {
        assert.equal(p.review?.status, 'conditional');
        assert.ok(p.review.basis?.trim(), `reference topology: ${n.scientific}`);
        assert.ok(p.summary.length <= 460, `card must not truncate the caveat: ${n.scientific}`);
    }
}
assert.equal(nodes.filter(n => n.id > 673).length, 35);

const descendants = (name: string): string[] => {
    const n = byName.get(name)!;
    return n.children.length ? n.children.flatMap(c => descendants(c.scientific)).sort() : [name];
};
assert.deepEqual(descendants('Eudromaeosauria'),
    ['Achillobator','Dakotaraptor','Deinonychus','Dromaeosaurus','Saurornitholestes','Utahraptor','Velociraptor']);
assert.deepEqual(descendants('Lognkosauria'), ['Argentinosaurus','Futalognkosaurus','Patagotitan','Puertasaurus']);
assert.deepEqual(descendants('Lithostrotia'), ['Alamosaurus','Isisaurus','Malawisaurus','Rapetosaurus','Saltasaurus']);

const restored = new GameState(id('Gastornis'));
restored.restore([156], [91]); // published Tyrannosaurus / Phorusrhacidae IDs
assert.equal(restored.guesses[0].guessNode.scientific,'Tyrannosaurus');
assert.equal(restored.guessesUsed, 1+HINT_COST);
assert.equal(restored.revealedIds.length, 1);
assert.ok(ancestorsOf(restored.answerId).includes(restored.revealedIds[0]));
assert.equal(nodeLookup[restored.bestKnownId()].scientific,'Neognathae');
assert.equal(nodeLookup[restored.nextHintId()!].scientific,'Gastornithidae');
const raptorSave = new GameState(id('Dakotaraptor'));
raptorSave.restore([id('Velociraptor')], [id('Dromaeosauridae')]);
assert.equal(raptorSave.guessesUsed, 1+HINT_COST);
assert.equal(nodeLookup[raptorSave.bestKnownId()].scientific, 'Eudromaeosauria');
assert.equal(nodeLookup[raptorSave.useHint()!].scientific, 'Dromaeosaurinae');
console.log(`  ok  ${cases.length} shared ancestors, legacy identities, content coverage and saved hints`);
