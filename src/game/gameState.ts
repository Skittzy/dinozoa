// gameState.ts — the referee. Holds the secret answer, the guesses, and the hints.
// It never touches the DOM.

import { nodeLookup, nameLookup, normaliseName, ancestorsOf, rootId, depthLookup, parentLookup } from '../data/loadTree';
import type { DinoNode } from '../data/loadTree';
import { findLCA, lcaInfo } from './lca';
import type { LcaInfo } from './lca';
import { clueVersion, currentClue, isClueVersionCompatible, playableCluesFor, selectFact } from './animalClues';
import { matchesName, namePattern, nextNamePosition } from './nameClues';
import type { ExtraHintKind, ExtraHintRecord, HintCounts, HintProgress } from './hintTypes';

export const MAX_GUESSES = 20;
export const HINT_COST = 3;

export interface GuessRecord {
    guessId: number;
    guessNode: DinoNode;
    info: LcaInfo;
    order: number;
}

export type GuessOutcome =
    | { status: 'unknown' }
    | { status: 'duplicate'; record: GuessRecord }
    | { status: 'over' }
    | { status: 'ok'; record: GuessRecord }
    | { status: 'win'; record: GuessRecord }
    | { status: 'lose'; record: GuessRecord };

// Modes share hint prices; Endless has a shorter per-animal guess budget.
export interface Rules {
    maxGuesses: number;
    hintCost: number;    // guesses deducted per hint; 0 = free
    maxHints: number;    // how many hints are available at all
    extraHintCost?: number;
    freeExtraHints?: number;
}

export const DAILY_RULES: Rules = {
    maxGuesses: MAX_GUESSES,
    hintCost: HINT_COST,
    maxHints: Infinity,   // the guess cost is the limit
    extraHintCost: 1,
    freeExtraHints: 1,
};

export const ENDLESS_RULES: Rules = {
    maxGuesses: 10,
    hintCost: HINT_COST,
    maxHints: Infinity,
    extraHintCost: 1,
    freeExtraHints: 1,
};

export class GameState {
    readonly answerId: number;
    readonly rules: Rules;
    readonly guesses: GuessRecord[] = [];
    readonly revealedIds: number[] = [];   // ranks bought with hints
    readonly extraHints: ExtraHintRecord[] = [];
    milestoneShown = false;
    won = false;
    /** Set when the player chooses to stop early. Counts as a loss, see `lost`. */
    surrendered = false;

    private byId = new Map<number, GuessRecord>();
    private factualHintSeed: string;

    constructor(answerId: number, rules: Rules = DAILY_RULES, factualHintSeed = `answer-${answerId}`) {
        this.answerId = answerId;
        this.rules = rules;
        this.factualHintSeed = factualHintSeed;
    }

    get answerNode(): DinoNode {
        return nodeLookup[this.answerId];
    }

    get guessesUsed(): number {
        return this.guesses.length + this.revealedIds.length * this.rules.hintCost
            + this.extraHints.reduce((sum, h) => sum + h.cost, 0);
    }

    get remaining(): number {
        return Math.max(0, this.rules.maxGuesses - this.guessesUsed);
    }

    get hintsLeft(): number {
        return Math.max(0, this.rules.maxHints - this.revealedIds.length);
    }

    get lost(): boolean {
        return !this.won && (this.surrendered || this.remaining <= 0);
    }

    get over(): boolean {
        return this.won || this.lost;
    }

    resolve(rawName: string): number | null {
        const id = nameLookup[normaliseName(rawName)];
        return id === undefined ? null : id;
    }

    private makeRecord(guessId: number): GuessRecord {
        return {
            guessId,
            guessNode: nodeLookup[guessId],
            info: lcaInfo(this.answerId, guessId),
            order: this.guesses.length + 1,
        };
    }

    // The deepest ancestor of the answer the player has uncovered so far
    // (from guesses AND hints). Starts at the root.
    bestKnownId(): number {
        let best = rootId;
        const consider = (id: number) => {
            if (depthLookup[id] > depthLookup[best]) best = id;
        };
        for (const g of this.guesses) if (g.guessId !== this.answerId) consider(g.info.lcaId);
        for (const id of this.revealedIds) consider(id);
        return best;
    }

    // The next rank down the answer's lineage — what a hint would reveal.
    // Returns null if the only thing left to reveal IS the answer.
    nextHintId(): number | null {
        const lineage = ancestorsOf(this.answerId).reverse(); // [root, ..., answer]
        const best = this.bestKnownId();
        const idx = lineage.indexOf(best);
        if (idx === -1 || idx + 1 >= lineage.length) return null;
        const next = lineage[idx + 1];
        return next === this.answerId ? null : next;
    }

    // A hint must leave at least one guess behind, so we need MORE than it costs.
    // With a free hint (cost 0) that check passes trivially and the cap does the work.
    canHint(): boolean {
        return !this.over
            && this.remaining > this.rules.hintCost
            && this.hintsLeft > 0
            && this.nextHintId() !== null;
    }

    useHint(): number | null {
        if (!this.canHint()) return null;
        const id = this.nextHintId();
        if (id === null) return null;
        this.revealedIds.push(id);
        return id;
    }

    get reachedFinalClade(): boolean {
        return (this.guesses.length > 0 || this.revealedIds.length > 0)
            && this.bestKnownId() === parentLookup[this.answerId];
    }

    get extraHintPrice(): number {
        return this.extraHints.length < (this.rules.freeExtraHints ?? 1) ? 0 : (this.rules.extraHintCost ?? 1);
    }

    get namePositions(): number[] {
        return this.extraHints.filter(h => h.type === 'name' && h.position !== undefined).map(h => h.position!);
    }

    get revealedName(): string | null {
        return this.namePositions.length ? namePattern(this.answerNode.scientific, this.namePositions) : null;
    }

    get hintCounts(): HintCounts {
        return { clade: this.revealedIds.length,
            factual: this.extraHints.filter(h => h.type === 'factual').length,
            name: this.extraHints.filter(h => h.type === 'name').length };
    }

    /** Includes non-answer leaves: players do not know the private answer pool. */
    plausibleCandidates(): number[] {
        return Object.values(nodeLookup).filter(n => {
            if (n.children.length || this.byId.has(n.id)) return false;
            if (!this.guesses.every(g => findLCA(n.id, g.guessId) === g.info.lcaId)) return false;
            const lineage = ancestorsOf(n.id);
            if (!this.revealedIds.every(id => lineage.includes(id))) return false;
            // The milestone explicitly reveals that the answer is a direct child.
            if (this.reachedFinalClade && parentLookup[n.id] !== this.bestKnownId()) return false;
            if (this.namePositions.length && !matchesName(n.scientific, this.answerNode.scientific, this.namePositions)) return false;
            return this.extraHints.every(h => h.type !== 'factual'
                || !isClueVersionCompatible(h.version)
                || !currentClue(this.answerId, h.id)?.excludes?.includes(n.id));
        }).map(n => n.id);
    }

    nextExtraHint(kind: ExtraHintKind): ExtraHintRecord | null {
        const candidates = this.plausibleCandidates();
        if (kind === 'name') {
            const position = nextNamePosition(this.answerNode.scientific, this.namePositions,
                candidates.map(id => nodeLookup[id].scientific));
            return position === null ? null : { type: kind, id: `name-${position}`, position,
                cost: this.extraHintPrice, version: 'name-1' };
        }
        const clue = selectFact(this.answerId, new Set(this.extraHints.map(h => h.id)), candidates, this.factualHintSeed);
        return clue ? { type: kind, id: clue.id, cost: this.extraHintPrice, version: clueVersion() } : null;
    }

    extraHintUnavailable(kind: ExtraHintKind): string | null {
        if (this.over) return 'This round has finished.';
        if (!this.reachedFinalClade) return 'Reach the last branch to unlock extra hints.';
        if (this.remaining <= this.extraHintPrice) return 'Keep your last guess to answer.';
        if (!this.nextExtraHint(kind)) {
            if (kind === 'name') return 'The whole name is revealed.';
            if (clueVersion() === 'unavailable') return 'Factual hints couldn’t load. Try a Name Clue.';
            if (!playableCluesFor(this.answerId).length) {
                return 'There are currently no factual hints for this creature. Try a Name Clue.';
            }
            return this.hintCounts.factual > 0
                ? 'No more helpful factual hints are available. Try a Name Clue.'
                : 'Factual hints won’t narrow it down any further. Try a Name Clue.';
        }
        return null;
    }

    useExtraHint(kind: ExtraHintKind, expectedCount = this.extraHints.length): ExtraHintRecord | null {
        if (expectedCount !== this.extraHints.length || this.extraHintUnavailable(kind)) return null;
        const hint = this.nextExtraHint(kind);
        if (!hint) return null;
        this.extraHints.push(hint);
        return hint;
    }

    hintProgress(): HintProgress {
        return { factualHintSeed: this.factualHintSeed, milestoneShown: this.milestoneShown,
            extraHints: this.extraHints.map(h => ({ ...h })) };
    }

    submitGuess(rawName: string): GuessOutcome {
        if (this.over) return { status: 'over' };

        const guessId = this.resolve(rawName);
        if (guessId === null) return { status: 'unknown' };

        const existing = this.byId.get(guessId);
        if (existing) return { status: 'duplicate', record: existing };

        const record = this.makeRecord(guessId);
        this.guesses.push(record);
        this.byId.set(guessId, record);

        if (guessId === this.answerId) {
            this.won = true;
            return { status: 'win', record };
        }
        if (this.remaining <= 0) return { status: 'lose', record };
        return { status: 'ok', record };
    }

    // Rebuild from saved ids when restoring today's game.
    restore(guessIds: number[], revealedIds: number[], surrendered = false, hints: HintProgress = {}): void {
        // Has to come back with the guesses. Without it a reload would quietly
        // hand a surrendered game back as playable, which is both a bug and a way
        // to take a surrender back after seeing the answer.
        this.surrendered = surrendered;
        if (typeof hints.factualHintSeed === 'string' && hints.factualHintSeed.trim()
            && hints.factualHintSeed.length <= 200) this.factualHintSeed = hints.factualHintSeed;
        this.milestoneShown = hints.milestoneShown === true;
        const seenHints = new Set<string>();
        const positions = new Set<number>();
        for (const h of Array.isArray(hints.extraHints) ? hints.extraHints : []) {
            if (!h || !['factual', 'name'].includes(h.type) || typeof h.id !== 'string'
                || typeof h.version !== 'string' || !Number.isInteger(h.cost) || h.cost < 0 || h.cost > 20
                || seenHints.has(h.id)) continue;
            if (h.type === 'name' && (!Number.isInteger(h.position) || h.position! < 0
                || h.position! >= this.answerNode.scientific.length || positions.has(h.position!))) continue;
            // Retired/versioned facts retain their charge and allowance use. The
            // UI explains their unavailability instead of substituting a free fact.
            this.extraHints.push({ ...h });
            seenHints.add(h.id);
            if (h.type === 'name') positions.add(h.position!);
        }
        for (const id of revealedIds) {
            // A taxonomy correction can move an old hint off the answer's path.
            // Keep its cost, but show the nearest ancestor still shared today.
            if (nodeLookup[id] !== undefined) this.revealedIds.push(findLCA(this.answerId, id));
        }
        for (const id of guessIds) {
            if (this.byId.has(id) || nodeLookup[id] === undefined) continue;
            const record = this.makeRecord(id);
            this.guesses.push(record);
            this.byId.set(id, record);
            if (id === this.answerId) this.won = true;
        }
    }
}
