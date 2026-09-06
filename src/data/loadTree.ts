// loadTree.ts — fetches the JSON once, then walks the tree to build fast lookups.
//
// Metaphor: like the index at the back of a textbook. Without it, finding an animal
// means re-reading every page (re-scanning the whole tree) on every single guess.
// The index makes lookups instant.

// 1. The shape of each node in the JSON.
export interface DinoNode {
    id: number;
    scientific: string;
    common: string;
    rank: string;
    answer: boolean;        // true = eligible to be the daily answer (popular / semi-popular)
    alt?: string[];         // slang / pop-culture names: "trex", "raptor", "dodo"
    children: DinoNode[];
}

// 2. The lookup "notebooks".
export const nodeLookup: Record<number, DinoNode> = {};       // id -> node
export const parentLookup: Record<number, number | null> = {}; // id -> parent id (null at root)
export const depthLookup: Record<number, number> = {};         // id -> depth (root = 0)

// Name index for turning a typed guess ("t. rex", "Velociraptor") into an id.
export const nameLookup: Record<string, number> = {};          // normalised name -> id
export const guessableNames: string[] = [];                    // every leaf's display name (for autocomplete)
export const altNames: Array<{ typed: string; maps: string }> = [];   // slang -> genus, for autocomplete

export let rootId = -1;

// Normalise a name so "T. rex", "t rex", "  T.  Rex " all match.
export function normaliseName(raw: string): string {
    return raw.toLowerCase().replace(/[.\-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

// 3. The recursive tree walker — fills every notebook in one pass.
function walkTree(node: DinoNode, parentId: number | null, depth: number) {
    nodeLookup[node.id] = node;
    parentLookup[node.id] = parentId;
    depthLookup[node.id] = depth;

    // Only leaves (real animals) are guessable / indexable by name.
    if (node.children.length === 0) {
        nameLookup[normaliseName(node.scientific)] = node.id;
        if (node.common) nameLookup[normaliseName(node.common)] = node.id;
        // Slang and pop-culture names resolve to the same animal: "trex", "rex",
        // "raptor", "dodo", "sabertooth". normaliseName already folds away dots,
        // hyphens and case, so "T-Rex" and "t. rex" both land on "t rex" — but
        // "trex" with no separator is a different string and is listed explicitly.
        for (const a of node.alt ?? []) nameLookup[normaliseName(a)] = node.id;
        // Prefer the common name for display when it differs from the genus.
        const display = node.common && node.common !== node.scientific
            ? `${node.scientific} (${node.common})`
            : node.scientific;
        guessableNames.push(display);
        // Surface the slang in autocomplete too, labelled with the genus it maps
        // to. Without this someone typing "trex" sees no suggestion and assumes
        // the name is invalid rather than trying it.
        for (const a of node.alt ?? []) altNames.push({ typed: a, maps: node.scientific });
    }

    for (const child of node.children) {
        walkTree(child, node.id, depth + 1);
    }
}

// 4. Download + parse the database, then build the lookups.
export async function loadDatabase(): Promise<void> {
    // Files in /public are served from the site root by Vite.
    const response = await fetch('data/dinosaur-database.json');
    if (!response.ok) throw new Error(`Could not load database (${response.status})`);
    const data = await response.json();

    const top: DinoNode = data.root;
    rootId = top.id;
    walkTree(top, null, 0);

    guessableNames.sort((a, b) => a.localeCompare(b));
    // Dev-only. import.meta.env.DEV is false in a production build, so Vite drops
    // this branch entirely rather than shipping console noise to players.
    if (import.meta.env?.DEV) {
        console.log(`Database loaded: ${Object.keys(nodeLookup).length} nodes, ${guessableNames.length} guessable animals.`);
    }
}

// --- small helpers shared by the game logic ---

// Full lineage from a node up to the root: [node, parent, ..., root].
export function ancestorsOf(id: number): number[] {
    const chain: number[] = [];
    let cur: number | null = id;
    while (cur !== null && cur !== undefined) {
        chain.push(cur);
        cur = parentLookup[cur] ?? null;
    }
    return chain;
}
