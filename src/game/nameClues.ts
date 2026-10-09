export function namePattern(name: string, positions: readonly number[]): string {
    const shown = new Set(positions);
    return [...name.toUpperCase()].map((c, i) => /[A-Z]/.test(c) && !shown.has(i) ? '_' : c).join(' ');
}

export function matchesName(name: string, answer: string, positions: readonly number[]): boolean {
    const a = name.toUpperCase(), b = answer.toUpperCase();
    return a.length === b.length && positions.every(i => a[i] === b[i]);
}

/** Prefer a letter that separates candidates, with stable position tie-breaking. */
export function nextNamePosition(name: string, revealed: readonly number[], candidates: string[]): number | null {
    const upper = name.toUpperCase();
    const available = [...upper].map((c, i) => ({ c, i }))
        .filter(({ c, i }) => /[A-Z]/.test(c) && !revealed.includes(i));
    const reduction = (i: number) => candidates.filter(c => {
        const v = c.toUpperCase();
        return v.length !== upper.length || v[i] !== upper[i];
    }).length;
    available.sort((a, b) => reduction(b.i) - reduction(a.i) || a.i - b.i);
    return available[0]?.i ?? null;
}
