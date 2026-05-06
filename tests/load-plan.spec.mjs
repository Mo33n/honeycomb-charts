import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RENDER_PLAN_VERSION } from '../lib/compiler-core.mjs';
import { CompileLayoutError } from '../lib/errors.mjs';
import { loadSegmentPlanFromJson, loadSegmentPlanFromUrl, renderPlanMajor } from '../lib/load-plan.mjs';

describe('loadSegmentPlanFromJson', () => {
	it('accepts a valid plan', () => {
		const plan = {
			renderPlanVersion: RENDER_PLAN_VERSION,
			layoutId: 'x',
			engine: 'genericFootprint',
			requiredKeys: ['bid'],
		};
		assert.strictEqual(loadSegmentPlanFromJson(plan), plan);
	});

	it('rejects wrong major version', () => {
		assert.throws(
			() =>
				loadSegmentPlanFromJson({
					renderPlanVersion: '99.0.0',
					layoutId: 'x',
					engine: 'genericFootprint',
				}),
			e => e instanceof CompileLayoutError && e.code === 'RENDER_PLAN_MAJOR_UNSUPPORTED'
		);
	});

	it('rejects non-generic engine', () => {
		assert.throws(
			() =>
				loadSegmentPlanFromJson(
					{
						renderPlanVersion: RENDER_PLAN_VERSION,
						layoutId: 'x',
						engine: 'footprint',
					},
					{ engine: 'genericFootprint' }
				),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_INVALID'
		);
	});

	it('renderPlanMajor parses semver head', () => {
		assert.equal(renderPlanMajor('1.0.0'), 1);
		assert.equal(renderPlanMajor('2'), 2);
	});

	it('rejects invalid segmentPlanVersion when present', () => {
		assert.throws(
			() =>
				loadSegmentPlanFromJson({
					renderPlanVersion: RENDER_PLAN_VERSION,
					layoutId: 'x',
					engine: 'genericFootprint',
					segmentPlanVersion: 9,
				}),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_INVALID'
		);
	});

	it('rejects invalid layoutRevision when present', () => {
		assert.throws(
			() =>
				loadSegmentPlanFromJson({
					renderPlanVersion: RENDER_PLAN_VERSION,
					layoutId: 'x',
					engine: 'genericFootprint',
					layoutRevision: -1,
				}),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_INVALID'
		);
	});
});

describe('loadSegmentPlanFromUrl', () => {
	const validPlan = () => ({
		renderPlanVersion: RENDER_PLAN_VERSION,
		layoutId: 'from_url',
		engine: 'genericFootprint',
	});

	it('loads JSON via injected fetch', async () => {
		const body = JSON.stringify(validPlan());
		const plan = await loadSegmentPlanFromUrl('https://cdn.example.com/plans/x.json', {
			fetch: async () =>
				new Response(body, {
					status: 200,
					headers: { 'content-length': String(Buffer.byteLength(body, 'utf8')) },
				}),
			engine: 'genericFootprint',
		});
		assert.equal(plan.layoutId, 'from_url');
	});

	it('rejects oversized Content-Length', async () => {
		await assert.rejects(
			() =>
				loadSegmentPlanFromUrl('https://cdn.example.com/big.json', {
					maxBytes: 10,
					fetch: async () => new Response('{}', { status: 200, headers: { 'content-length': '99999' } }),
				}),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_TOO_LARGE'
		);
	});

	it('rejects non-JSON body', async () => {
		await assert.rejects(
			() =>
				loadSegmentPlanFromUrl('https://cdn.example.com/bad.json', {
					fetch: async () => new Response('not json', { status: 200 }),
				}),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_NON_JSON'
		);
	});

	it('enforces requireSameOriginAs', async () => {
		await assert.rejects(
			() =>
				loadSegmentPlanFromUrl('https://evil.example.com/p.json', {
					requireSameOriginAs: 'https://good.example.com/app',
					fetch: async () => new Response('{}', { status: 200 }),
				}),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_ORIGIN_FORBIDDEN'
		);
	});
});
