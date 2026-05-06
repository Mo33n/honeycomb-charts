/**
 * Layout direction for L/R segments (RFC §5.4 / PM Q13). **`ltr`** paints left segment then right.
 * **`mirrorSegments`** swaps **physical placement** (right segment first inside the slot); `metricId`
 * and `objectId` segment letters (`L`/`R`) stay tied to logical left/right config.
 */
export type FootprintLayoutDirection = 'ltr' | 'mirrorSegments';

export function segmentOrder<Horz>(left: Horz, right: Horz, direction: FootprintLayoutDirection): { first: Horz; second: Horz } {
	if (direction === 'mirrorSegments') {
		return { first: right, second: left };
	}
	return { first: left, second: right };
}
