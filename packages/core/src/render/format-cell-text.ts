export interface FormatNumberCellOptions {
	readonly maxChars: number;
}

function abbreviateMagnitude(n: number): string {
	const sign = n < 0 ? '-' : '';
	const v = Math.abs(n);
	if (v >= 1e12) {
		return `${sign}${(v / 1e12).toFixed(1)}T`;
	}
	if (v >= 1e9) {
		return `${sign}${(v / 1e9).toFixed(1)}B`;
	}
	if (v >= 1e6) {
		return `${sign}${(v / 1e6).toFixed(1)}M`;
	}
	if (v >= 1e3) {
		return `${sign}${(v / 1e3).toFixed(1)}K`;
	}
	return `${sign}${v.toFixed(0)}`;
}

/** PRD C9 — abbreviate / ellipsis when text overflows cell width. */
export function formatNumberCellText(value: number, options: FormatNumberCellOptions): string {
	const raw = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
	if (raw.length <= options.maxChars) {
		return raw;
	}
	const abbr = abbreviateMagnitude(value);
	if (abbr.length <= options.maxChars) {
		return abbr;
	}
	if (options.maxChars <= 1) {
		return '…';
	}
	return `${abbr.slice(0, Math.max(0, options.maxChars - 1))}…`;
}
