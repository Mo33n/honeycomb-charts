#!/usr/bin/env node
/**
 * CT-G0.2a spike: compiled generic partial → `mergeGenericFootprintSeriesOptions` (@honeycomb/charts dist).
 * Requires built package: `npm run build --prefix ./packages/core`.
 *
 * Usage: node honeycomb/scripts/spike-generic-adapter.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mapSegmentPlanToGenericPartial } from '../lib/adapter-generic.mjs';
import { compileLayoutCatalog } from '../lib/compiler-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');
const genericOptionsModule = join(honeycombRoot, 'packages/core/dist/options/generic-footprint-series-options.js');

async function main() {
	const { defaultGenericFootprintSeriesOptions, mergeGenericFootprintSeriesOptions } = await import(
		pathToFileURL(genericOptionsModule).href
	);

	const raw = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
	const themes = raw.themes && typeof raw.themes === 'object' ? raw.themes : {};
	const { layouts } = compileLayoutCatalog(raw);

	let failed = false;
	for (const L of layouts) {
		if (L.engine !== 'genericFootprint' || L.lwcGenericFootprintPartial === undefined) {
			continue;
		}
		try {
			const plan = /** @type {Record<string, unknown>} */ (L.segmentPlan);
			const ref = typeof plan.themeRef === 'string' ? plan.themeRef : '';
			const theme =
				ref && themes[ref] && typeof themes[ref] === 'object' ? /** @type {Record<string, unknown>} */ (themes[ref]) : undefined;
			const partial = mapSegmentPlanToGenericPartial(plan, theme ? { theme } : {});
			mergeGenericFootprintSeriesOptions(defaultGenericFootprintSeriesOptions, partial);
			console.log(`OK genericFootprint → merge: ${L.id}`);
		} catch (e) {
			console.error(`FAIL ${L.id}:`, e);
			failed = true;
		}
	}

	if (failed) {
		process.exit(1);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
