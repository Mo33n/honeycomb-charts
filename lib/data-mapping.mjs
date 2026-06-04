/**
 * Pure host-side mapping from pipeline field names → canonical metric ids (`dataContract.aliases`).
 * @module honeycomb/lib/data-mapping
 */
import { CompileLayoutError } from './errors.mjs';

/**
 * @param {unknown} aliases
 * @returns {Record<string, string>}
 */
export function normalizeAliases(aliases) {
	if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
		return {};
	}
	/** @type {Record<string, string>} */
	const out = {};
	/** @type {Map<string, string>} canonical target → first source key */
	const targetToSource = new Map();
	for (const [k, v] of Object.entries(aliases)) {
		if (typeof k !== 'string' || !k.trim()) {
			continue;
		}
		if (typeof v !== 'string' || !v.trim()) {
			continue;
		}
		const src = k.trim();
		const dst = v.trim();
		const prev = targetToSource.get(dst);
		if (prev !== undefined && prev !== src) {
			throw new CompileLayoutError(
				'DATA_MAPPING_ALIAS_COLLISION',
				`aliases "${prev}" and "${src}" both map to "${dst}"`,
				{}
			);
		}
		targetToSource.set(dst, src);
		out[src] = dst;
	}
	return out;
}

/**
 * @param {unknown} dataContract catalog `dataContract` object (or subset with `aliases`)
 * @returns {{ aliases: Record<string, string> }} argument suitable for {@link applyDataMapping}
 */
export function dataMappingFromDataContract(dataContract) {
	const aliases =
		dataContract && typeof dataContract === 'object' && !Array.isArray(dataContract)
			? normalizeAliases(/** @type {Record<string, unknown>} */ (dataContract).aliases)
			: {};
	return { aliases };
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, string>} aliases
 * @param {boolean} stripAliasSources
 */
function mapScalarRow(row, aliases, stripAliasSources) {
	const out = { ...row };
	for (const [src, dst] of Object.entries(aliases)) {
		if (!Object.prototype.hasOwnProperty.call(row, src)) {
			continue;
		}
		out[dst] = row[src];
	}
	if (stripAliasSources) {
		for (const src of Object.keys(aliases)) {
			delete out[src];
		}
	}
	return out;
}

/**
 * Returns a new candle-like object: applies `aliases` on the bar row and on each `footprint_levels[]` row.
 *
 * @param {unknown} candle
 * @param {{ aliases?: Record<string, string> }} mapping
 * @param {{ stripAliasSources?: boolean }} [options]
 * @returns {Record<string, unknown>}
 */
export function applyDataMapping(candle, mapping, options = {}) {
	if (!candle || typeof candle !== 'object' || Array.isArray(candle)) {
		throw new CompileLayoutError('DATA_MAPPING_INVALID', 'candle must be a non-array object', {});
	}
	const aliases = normalizeAliases(mapping?.aliases);
	const strip = options.stripAliasSources === true;
	const src = /** @type {Record<string, unknown>} */ (candle);

	const { footprint_levels: _fl, ...barRest } = src;
	const base = mapScalarRow(barRest, aliases, strip);

	if (src.footprint_levels !== undefined) {
		if (!Array.isArray(src.footprint_levels)) {
			throw new CompileLayoutError('DATA_MAPPING_INVALID', 'footprint_levels must be an array when present', {});
		}
		base.footprint_levels = src.footprint_levels.map((L, i) => {
			if (!L || typeof L !== 'object' || Array.isArray(L)) {
				throw new CompileLayoutError(
					'DATA_MAPPING_INVALID',
					`footprint_levels[${String(i)}] must be a non-array object`,
					{}
				);
			}
			return mapScalarRow(/** @type {Record<string, unknown>} */ (L), aliases, strip);
		});
	}

	return base;
}
