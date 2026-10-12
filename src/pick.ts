/**
 * The variety rule: a candidate not among the recently shown, at random; if
 * every candidate was shown recently, the one shown longest ago. `recent` is
 * newest first.
 */
export function pick(candidates: string[], recent: string[], random: () => number = Math.random): string | null {
	if (!candidates.length) return null;
	const seen = new Set(recent);
	const fresh = candidates.filter((id) => !seen.has(id));
	if (fresh.length) return fresh[Math.floor(random() * fresh.length)]!;
	const set = new Set(candidates);
	return [...recent].reverse().find((id) => set.has(id)) ?? candidates[0]!;
}

/** The closest slug to a mistyped one, for "did you mean". */
export function closest(input: string, options: string[]): string | null {
	let best: string | null = null;
	let bestScore = Infinity;
	for (const o of options) {
		const d = distance(input, o);
		if (d < bestScore) [best, bestScore] = [o, d];
	}
	return best && bestScore <= Math.max(2, Math.floor(input.length / 3)) ? best : null;
}

function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0]!;
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cur = row[j]!;
			row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = cur;
		}
	}
	return row[b.length]!;
}
