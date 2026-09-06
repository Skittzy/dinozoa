// lca.ts — the heart of the game.
//
// findLCA(answerId, guessId) returns the deepest node that is an ancestor of BOTH
// the answer and the guess. Metaphor: the family reunion — walk up both family trees
// until you hit a relative you share. The deeper that shared ancestor sits, the more
// closely related the two animals are, and the "warmer" the guess.

import { parentLookup, nodeLookup, depthLookup, ancestorsOf, rootId } from '../data/loadTree';
import type { DinoNode } from '../data/loadTree';

// Return the id of the least common ancestor of the answer and the guess.
export function findLCA(answerId: number, guessId: number): number {
    const answerLineage = new Set(ancestorsOf(answerId));

    let cur: number | null = guessId;
    while (cur !== null && cur !== undefined) {
        if (answerLineage.has(cur)) return cur;
        cur = parentLookup[cur] ?? null;
    }
    return rootId; // they share the root at the very least
}

// Rich result used by the rest of the game.
export interface LcaInfo {
    lcaId: number;
    lcaNode: DinoNode;
    lcaDepth: number;   // 0 = root
    answerDepth: number;
    stepsAway: number;  // how many ranks lie between the answer and the shared ancestor (0 = solved)
    warmth: number;     // 0..1, higher = closer
}

export function lcaInfo(answerId: number, guessId: number): LcaInfo {
    const lcaId = findLCA(answerId, guessId);
    const lcaDepth = depthLookup[lcaId];
    const answerDepth = depthLookup[answerId];
    return {
        lcaId,
        lcaNode: nodeLookup[lcaId],
        lcaDepth,
        answerDepth,
        stepsAway: answerDepth - lcaDepth,
        warmth: answerDepth === 0 ? 0 : lcaDepth / answerDepth,
    };
}
