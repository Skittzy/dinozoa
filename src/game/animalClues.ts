/** Reviewed facts shipped with the game. Missing comparisons mean unknown. */
export interface ClueSource { label: string; url: string }
export interface AnimalClue {
    id: string;
    text: string;
    category: string;
    media?: { title: string; medium: 'film' | 'television' };
    sources: ClueSource[];
    review: 'reviewed';
    scope?: string;
    topic?: string;
    /** Positive evidence that these animals also fit; omitted animals are unknown. */
    sharedBy?: number[];
    comparisonEvidence?: Array<{ animalId: number; relationship: 'matches' | 'contradicts';
        reason: string; sources: ClueSource[]; sourceClue?: string }>;
    /** Only explicit, sourced contradictions belong here; never missing records. */
    excludes?: number[];
    /** A distinctive descriptive fact can help without proving exclusions. */
    distinguishing: boolean;
}
export interface ClueProfile { scientific: string; clues: AnimalClue[]; notes?: string }
export interface ClueDatabase {
    version: string;
    /** Additive releases may explicitly retain unchanged facts from these versions. */
    compatibleVersions?: string[];
    animals: Record<string, ClueProfile>;
}

let database: ClueDatabase = { version: 'unavailable', animals: {} };
export function setClueDatabase(value: ClueDatabase): void { database = value; }
export function clueVersion(): string { return database.version; }
export function cluesFor(id: number): AnimalClue[] { return database.animals[id]?.clues ?? []; }
export function playableCluesFor(id: number): AnimalClue[] {
    return cluesFor(id).filter(c => c.review === 'reviewed' && c.sources.length > 0
        && c.distinguishing && !c.excludes?.includes(id));
}
export function currentClue(answerId: number, clueId: string): AnimalClue | undefined {
    return cluesFor(answerId).find(c => c.id === clueId);
}
export function isClueVersionCompatible(version: string): boolean {
    return version === database.version || database.compatibleVersions?.includes(version) === true;
}
export function clueCategoryLabel(clue: AnimalClue): string {
    return clue.category === 'pop culture' ? 'Pop culture' : 'Scientific';
}
export function newHintSeed(): string {
    return Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(16)).join('-');
}
export async function loadAnimalClues(): Promise<void> {
    database = { version: 'unavailable', animals: {} };
    try {
        const response = await fetch('data/animal-clues.json');
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.version === 'string' && data.animals && typeof data.animals === 'object') {
            // A malformed profile must not break the game or charge for a blank fact.
            const animals: Record<string, ClueProfile> = {};
            for (const [id, profile] of Object.entries(data.animals)) {
                const p = profile as ClueProfile;
                if (!p || typeof p.scientific !== 'string' || !Array.isArray(p.clues)) continue;
                animals[id] = { ...p, clues: p.clues.filter(c => c && typeof c.id === 'string'
                    && typeof c.text === 'string' && c.text.trim() && Array.isArray(c.sources)
                    && c.sources.some(s => typeof s?.url === 'string' && s.url.startsWith('https://'))
                    && (!c.excludes || Array.isArray(c.excludes))
                    && (!c.sharedBy || Array.isArray(c.sharedBy))).map(c => ({ ...c,
                        sources: c.sources.filter(s => typeof s?.label === 'string'
                            && typeof s.url === 'string' && s.url.startsWith('https://')) })) };
            }
            database = { version: data.version, animals,
                compatibleVersions: Array.isArray(data.compatibleVersions)
                    ? data.compatibleVersions.filter((v: unknown) => typeof v === 'string') : [] };
        }
    } catch { /* The spelling fallback remains available when facts cannot load. */ }
}

// Seeded priorities shuffle clues without depending on file order or rerolling on
// refresh. Each clue keeps its priority when guesses filter the eligible set.
function cluePriority(seed: string, answerId: number, clueId: string): number {
    let hash = 2166136261;
    for (const char of `${seed}:${answerId}:${clueId}`) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    }
    hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
    hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
    return (hash ^ (hash >>> 15)) >>> 0;
}

export function selectFact(answerId: number, used: ReadonlySet<string>, candidates: number[], seed = ''): AnimalClue | null {
    const knownTopics = new Set(cluesFor(answerId).filter(c => used.has(c.id)).map(c => c.topic ?? c.id));
    const available = playableCluesFor(answerId).filter(c => !used.has(c.id) && !knownTopics.has(c.topic ?? c.id)
        // Do not charge for a character positively known to fit every candidate.
        && candidates.some(id => !(c.sharedBy ?? [answerId]).includes(id)));
    available.sort((a, b) => cluePriority(seed, answerId, a.id) - cluePriority(seed, answerId, b.id)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return available[0] ?? null;
}
