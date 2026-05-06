/**
 * LOD policy for number glyphs (PRD FR-32 / HC1-C). Matches the renderer’s raw font estimate
 * `Math.floor(cellHeightCssPx * 0.75)` before `clampFont`.
 */

/** Same factor as `FootprintRenderer` row font sizing. */
export const FOOTPRINT_LOD_FONT_HEIGHT_RATIO = 0.75 as const;

export function footprintCellRawFontPxFromHeight(cellHeightCssPx: number): number {
	return Math.floor(cellHeightCssPx * FOOTPRINT_LOD_FONT_HEIGHT_RATIO);
}

/**
 * When `lodOmitNumberGlyphs` is **false** (default), always **true** (MVP behavior).
 *
 * When **true**, returns **false** iff the cell is **too short** to reach `minFontPx` at the raw
 * scale factor — number glyphs are omitted for that cell. **`maxFontPx`** is accepted for API
 * stability and forward use; v1.1 omission uses **only** the `minFontPx` floor gate.
 */
export function shouldDrawFootprintNumberGlyph(
	cellHeightCssPx: number,
	minFontPx: number,
	maxFontPx: number,
	lodOmitNumberGlyphs: boolean
): boolean {
	void maxFontPx;
	if (!lodOmitNumberGlyphs) {
		return true;
	}
	return footprintCellRawFontPxFromHeight(cellHeightCssPx) >= minFontPx;
}
