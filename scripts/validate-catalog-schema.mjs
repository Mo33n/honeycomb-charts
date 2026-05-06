#!/usr/bin/env node
/**
 * Validates honeycomb/config.json against config.schema.json (AJV draft 2020-12).
 *
 * Usage:
 *   node honeycomb/scripts/validate-catalog-schema.mjs
 *   node honeycomb/scripts/validate-catalog-schema.mjs --config=path/to/config.json --schema=path/to/schema.json
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatAjvErrors, validateCatalogAgainstSchema } from '../lib/validate-catalog-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');

function parseArgs(argv) {
	const out = {
		config: join(honeycombRoot, 'config.json'),
		schema: join(honeycombRoot, 'config.schema.json'),
	};
	for (const a of argv) {
		if (a.startsWith('--config=')) {
			out.config = a.slice('--config='.length);
		} else if (a.startsWith('--schema=')) {
			out.schema = a.slice('--schema='.length);
		}
	}
	return out;
}

async function main() {
	const { config: configPath, schema: schemaPath } = parseArgs(process.argv.slice(2));
	const [schema, data] = await Promise.all([
		JSON.parse(await readFile(schemaPath, 'utf8')),
		JSON.parse(await readFile(configPath, 'utf8')),
	]);
	const r = validateCatalogAgainstSchema(schema, data);
	if (!r.ok) {
		console.error(formatAjvErrors(`Catalog schema validation failed: ${configPath}`, r.errors));
		process.exit(1);
	}
	console.log(`OK: ${configPath} matches ${schemaPath}`);
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
