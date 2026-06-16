#!/usr/bin/env node
/**
 * Copy honeycomb/lib runtime modules + config.json into packages/core/vendor/
 * for npm / GitHub package installs. Rewrites chart-binding core import to dist/.
 */
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const honeycombRoot = join(packageRoot, '..', '..');

/** Runtime lib modules consumed by chart-binding / mutation-scheduler (not CLI validators). */
const RUNTIME_LIB_FILES = [
	'adapter-generic.mjs',
	'chart-binding.mjs',
	'compiler-core.mjs',
	'data-mapping.mjs',
	'errors.mjs',
	'load-plan.mjs',
	'mutation.mjs',
	'mutation-scheduler.mjs',
	'path-parser.mjs',
	'segment-profile.mjs',
	'validate-segment-plan.mjs',
];

/** Repo-relative import → in-package import for published vendor copy. */
const CHART_BINDING_CORE_IMPORT = {
	from: "from '../packages/core/dist/index.js'",
	to: "from '../../dist/index.js'",
};

async function main() {
	const vendorRoot = join(packageRoot, 'vendor');
	const vendorLib = join(vendorRoot, 'lib');
	await rm(vendorRoot, { recursive: true, force: true });
	await mkdir(vendorLib, { recursive: true });

	for (const file of RUNTIME_LIB_FILES) {
		const sourcePath = join(honeycombRoot, 'lib', file);
		let content = await readFile(sourcePath, 'utf8');
		if (file === 'chart-binding.mjs') {
			content = content.replaceAll(CHART_BINDING_CORE_IMPORT.from, CHART_BINDING_CORE_IMPORT.to);
		}
		await writeFile(join(vendorLib, file), content, 'utf8');
	}

	await cp(join(honeycombRoot, 'config.json'), join(vendorRoot, 'catalog.json'));
	console.log(
		`[sync-vendor] ${String(RUNTIME_LIB_FILES.length)} lib module(s) + catalog.json → vendor/`,
	);
}

main().catch((err) => {
	console.error('[sync-vendor]', err);
	process.exit(1);
});
