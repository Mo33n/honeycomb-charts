#!/usr/bin/env node
/**
 * Validates honeycomb/config.json, resolves templateRef on generic tracks,
 * normalizes data bindings → metricId (today's honeycomb-charts contract),
 * writes LWC merge partials plus engine-neutral segmentPlan.json.
 *
 * Usage: node honeycomb/compile-layout.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileLayoutCatalog } from './lib/compiler-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const configPath = join(root, 'config.json');
const outDir = join(root, 'compiled');

async function main() {
	const raw = JSON.parse(await readFile(configPath, 'utf8'));
	const result = compileLayoutCatalog(raw);

	await mkdir(outDir, { recursive: true });

	for (const L of result.layouts) {
		await writeFile(join(outDir, `${L.id}.segmentPlan.json`), JSON.stringify(L.segmentPlan, null, 2), 'utf8');
		if (L.lwcGenericFootprintPartial !== undefined) {
			await writeFile(
				join(outDir, `${L.id}.generic.partial.json`),
				JSON.stringify(L.lwcGenericFootprintPartial, null, 2),
				'utf8'
			);
		}
	}

	await writeFile(join(outDir, 'index.json'), JSON.stringify(result.index, null, 2), 'utf8');
	console.log(`OK: ${String(result.layouts.length)} layout(s) → ${outDir}`);
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
