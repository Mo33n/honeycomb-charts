/**
 * Encode/decode variable segments in footprint hit-test `objectId` strings.
 * Uses URI encoding so metric and overlay ids may contain `|` without breaking parsers.
 */

export function encodeHitField(value: string): string {
	return encodeURIComponent(value);
}

/** Decodes a hit field; returns the raw string when not URI-encoded (legacy ids). */
export function decodeHitField(encoded: string): string {
	try {
		return decodeURIComponent(encoded);
	} catch {
		return encoded;
	}
}

export function buildFootprintObjectId(input: {
	readonly logicalBarIndex: number | string;
	readonly price: number;
	readonly metricId: string;
	readonly segment: 'L' | 'R';
	readonly overlayId: string;
}): string {
	return `fp|${String(input.logicalBarIndex)}|${String(input.price)}|${encodeHitField(input.metricId)}|${input.segment}|ov:${encodeHitField(input.overlayId)}`;
}

export function buildGenericFootprintObjectId(input: {
	readonly logicalBarIndex: number | string;
	readonly price: number;
	readonly slotIndex: number | string;
	readonly overlayId: string;
	readonly metricId: string;
}): string {
	return `gf|${String(input.logicalBarIndex)}|${String(input.price)}|${String(input.slotIndex)}|ov:${encodeHitField(input.overlayId)}|m:${encodeHitField(input.metricId)}`;
}
