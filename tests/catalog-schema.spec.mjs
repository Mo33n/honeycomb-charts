import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { validateCatalogAgainstSchema } from '../lib/validate-catalog-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');

describe('config.schema.json (AJV)', () => {
	it('accepts production config.json', async () => {
		const schema = JSON.parse(await readFile(join(honeycombRoot, 'config.schema.json'), 'utf8'));
		const data = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		const r = validateCatalogAgainstSchema(schema, data);
		assert.equal(r.ok, true, r.ok === false && r.errors ? JSON.stringify(r.errors, null, 2) : '');
	});

	it('accepts generic segment with heatmapCell track', async () => {
		const schema = JSON.parse(await readFile(join(honeycombRoot, 'config.schema.json'), 'utf8'));
		const data = {
			schemaVersion: '1.0.0',
			layouts: [
				{
					id: 'heat_demo',
					engine: 'genericFootprint',
					segment: {
						tracks: [
							{
								role: 'heatmapCell',
								metricId: 'h1',
								colorMode: 'sequential',
								scaleRef: 'x',
							},
						],
						trackWeights: [1],
					},
				},
			],
		};
		const r = validateCatalogAgainstSchema(schema, data);
		assert.equal(r.ok, true, r.ok === false && r.errors ? JSON.stringify(r.errors, null, 2) : '');
	});

	it('accepts segmentProfiles + overlays + segmentProfileRef', async () => {
		const schema = JSON.parse(await readFile(join(honeycombRoot, 'config.schema.json'), 'utf8'));
		const data = {
			schemaVersion: '1.0.0',
			segmentProfiles: {
				resp: {
					hysteresisPx: 4,
					rules: [
						{ minWidthPx: 0, layoutId: 'lo' },
						{ minWidthPx: 100, layoutId: 'hi' },
					],
				},
			},
			layouts: [
				{
					id: 'lo',
					engine: 'genericFootprint',
					segment: { tracks: [{ role: 'number', metricId: 'a' }], trackWeights: [1] },
				},
				{
					id: 'hi',
					engine: 'genericFootprint',
					segment: { tracks: [{ role: 'number', metricId: 'b' }], trackWeights: [1] },
				},
				{
					id: 'host',
					engine: 'genericFootprint',
					segmentProfileRef: 'resp',
					segment: {
						tracks: [
							{
								role: 'number',
								metricId: 'c',
								overlays: [{ id: 'tint', kind: 'cellBand', fill: 'rgba(0,0,255,0.1)' }],
							},
						],
						trackWeights: [1],
					},
				},
			],
		};
		const r = validateCatalogAgainstSchema(schema, data);
		assert.equal(r.ok, true, r.ok === false && r.errors ? JSON.stringify(r.errors, null, 2) : '');
	});

	it('rejects generic segment without trackWeights', async () => {
		const schema = JSON.parse(await readFile(join(honeycombRoot, 'config.schema.json'), 'utf8'));
		const data = {
			schemaVersion: '1.0.0',
			layouts: [
				{
					id: 'bad_generic',
					engine: 'genericFootprint',
					segment: {
						tracks: [{ role: 'number', metricId: 'x' }],
					},
				},
			],
		};
		const r = validateCatalogAgainstSchema(schema, data);
		assert.equal(r.ok, false);
	});
});
