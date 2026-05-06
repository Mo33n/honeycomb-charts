#!/usr/bin/env node
/**
 * CT-P1-22: inventory segment plans under a directory; flags unsupported `renderPlanVersion` majors.
 * Usage: node honeycomb/scripts/migrate-render-plan-version.mjs [--root=honeycomb/compiled]
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RENDER_PLAN_VERSION } from '../lib/compiler-core.mjs';
import { renderPlanMajor } from '../lib/load-plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
	let root = join(__dirname, '..', 'compiled');
	for (const a of argv) {
		if (a.startsWith('--root=')) {
			root = resolve(a.slice('--root='.length));
		}
	}
	return { root };
}

async function main() {
	const { root } = parseArgs(process.argv.slice(2));
	const expected = renderPlanMajor(RENDER_PLAN_VERSION);
	let files = [];
	try {
		files = await readdir(root);
	} catch (e) {
		console.error(`Cannot read root ${root}:`, e instanceof Error ? e.message : e);
		process.exitCode = 2;
		return;
	}
	const segmentPlans = files.filter(f => f.endsWith('.segmentPlan.json'));
	let bad = 0;
	for (const name of segmentPlans) {
		const text = await readFile(join(root, name), 'utf8');
		const j = JSON.parse(text);
		const v = j && typeof j === 'object' ? j.renderPlanVersion : undefined;
		if (typeof v !== 'string') {
			console.warn(`${name}: missing renderPlanVersion`);
			bad++;
			continue;
		}
		if (renderPlanMajor(v) !== expected) {
			console.warn(`${name}: unsupported major in ${JSON.stringify(v)} (toolchain ${RENDER_PLAN_VERSION})`);
			bad++;
		}
	}
	console.log(
		`Checked ${String(segmentPlans.length)} segment plans under ${root} (expected major ${String(expected)}). Issues: ${String(bad)}.`
	);
	if (bad > 0) {
		process.exitCode = 1;
	}
}

main();
