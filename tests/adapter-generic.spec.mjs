import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { mapSegmentPlanToGenericPartial } from '../lib/adapter-generic.mjs';
import { compileLayoutCatalog } from '../lib/compiler-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');

describe('mapSegmentPlanToGenericPartial', () => {
	it('matches compiler lwcGenericFootprintPartial for every genericFootprint id', async () => {
		const raw = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		const themes = raw.themes && typeof raw.themes === 'object' ? raw.themes : {};
		const r = compileLayoutCatalog(raw);
		for (const L of r.layouts) {
			if (L.engine !== 'genericFootprint' || L.lwcGenericFootprintPartial === undefined) {
				continue;
			}
			const plan = /** @type {Record<string, unknown>} */ (L.segmentPlan);
			const themeRef = plan.themeRef;
			const theme =
				typeof themeRef === 'string' && themeRef.length > 0 && themes[themeRef] && typeof themes[themeRef] === 'object'
					? /** @type {Record<string, unknown>} */ (themes[themeRef])
					: undefined;
			const mapped = mapSegmentPlanToGenericPartial(plan, theme ? { theme } : {});
			assert.deepEqual(mapped, L.lwcGenericFootprintPartial, `parity failed for ${L.id}`);
		}
	});
});
