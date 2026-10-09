export type ExtraHintKind = 'factual' | 'name';
export interface ExtraHintRecord {
    type: ExtraHintKind;
    id: string;
    cost: number;
    version: string;
    position?: number;
}
export interface HintProgress {
    factualHintSeed?: string;
    milestoneShown?: boolean;
    extraHints?: ExtraHintRecord[];
}
export interface HintCounts { clade: number; factual: number; name: number }
export const EMPTY_HINT_COUNTS: HintCounts = { clade: 0, factual: 0, name: 0 };
export function hintCountText(counts: HintCounts): string {
    return `Clade hints: ${counts.clade} · Factual hints: ${counts.factual} · Name clues: ${counts.name}`;
}
