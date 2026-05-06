/**
 * Runtime guards for compiled segment plans (RFC-0001).
 * @module honeycomb/lib/load-plan
 */
import { RENDER_PLAN_VERSION } from './compiler-core.mjs';
import { CompileLayoutError } from './errors.mjs';

/**
 * @param {string} version e.g. "1.0.0"
 * @returns {number} integer major
 */
export function renderPlanMajor(version) {
	const s = String(version).trim();
	const dot = s.indexOf('.');
	const head = dot === -1 ? s : s.slice(0, dot);
	const n = parseInt(head, 10);
	if (!Number.isFinite(n) || n < 0) {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', `Invalid renderPlanVersion: ${JSON.stringify(version)}`, {});
	}
	return n;
}

/**
 * @param {unknown} plan
 * @param {{ engine?: string }} [options]
 * @returns {Record<string, unknown>} same object reference (asserted)
 */
export function loadSegmentPlanFromJson(plan, options = {}) {
	if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'segmentPlan must be a non-array object', {});
	}
	const p = /** @type {Record<string, unknown>} */ (plan);
	const rv = p.renderPlanVersion;
	if (typeof rv !== 'string') {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'segmentPlan.renderPlanVersion must be a string', {});
	}
	const expectedMajor = renderPlanMajor(RENDER_PLAN_VERSION);
	const gotMajor = renderPlanMajor(rv);
	if (gotMajor !== expectedMajor) {
		throw new CompileLayoutError(
			'RENDER_PLAN_MAJOR_UNSUPPORTED',
			`Unsupported renderPlanVersion major: ${String(rv)} (toolchain ${RENDER_PLAN_VERSION})`,
			{}
		);
	}
	if (typeof p.layoutId !== 'string' || !p.layoutId) {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'segmentPlan.layoutId must be a non-empty string', {});
	}
	if (typeof p.engine !== 'string' || !p.engine) {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'segmentPlan.engine must be a non-empty string', {});
	}
	if (p.engine !== 'genericFootprint') {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'segmentPlan.engine must be genericFootprint', {
			layoutId: typeof p.layoutId === 'string' ? p.layoutId : undefined,
		});
	}
	if (options.engine !== undefined && options.engine !== p.engine) {
		throw new CompileLayoutError(
			'SEGMENT_PLAN_ENGINE_MISMATCH',
			`segmentPlan.engine is ${String(p.engine)} (expected ${String(options.engine)})`,
			{ layoutId: p.layoutId }
		);
	}
	if (p.layoutRevision !== undefined) {
		const lr = p.layoutRevision;
		if (
			typeof lr !== 'number' ||
			!Number.isInteger(lr) ||
			lr < 0 ||
			lr > 0xffffffff
		) {
			throw new CompileLayoutError(
				'SEGMENT_PLAN_INVALID',
				'segmentPlan.layoutRevision must be a uint32 integer when present',
				{ layoutId: p.layoutId }
			);
		}
	}
	if (p.segmentPlanVersion !== undefined) {
		const spv = p.segmentPlanVersion;
		if (spv !== 1 && spv !== 2) {
			throw new CompileLayoutError(
				'SEGMENT_PLAN_INVALID',
				'segmentPlan.segmentPlanVersion must be 1 or 2 when present',
				{ layoutId: p.layoutId }
			);
		}
	}
	return p;
}

/**
 * @param {string} urlString
 * @param {string} baseUrlString
 */
function assertSameOrigin(urlString, baseUrlString) {
	let u;
	let b;
	try {
		u = new URL(urlString);
		b = new URL(baseUrlString);
	} catch {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'Invalid URL for same-origin check', {});
	}
	if (u.origin !== b.origin) {
		throw new CompileLayoutError(
			'SEGMENT_PLAN_ORIGIN_FORBIDDEN',
			`URL origin ${u.origin} does not match allowed origin ${b.origin}`,
			{}
		);
	}
}

/**
 * @param {Headers | Record<string, string | string[] | undefined>} headers
 * @param {number} maxBytes
 */
function contentLengthExceedsMax(headers, maxBytes) {
	const raw =
		typeof headers.get === 'function'
			? headers.get('content-length')
			: Array.isArray(headers['content-length'])
				? headers['content-length'][0]
				: /** @type {string | undefined} */ (headers['content-length']);
	if (raw === undefined || raw === null) {
		return false;
	}
	const n = parseInt(String(raw), 10);
	return Number.isFinite(n) && n > maxBytes;
}

/**
 * @param {string} urlString
 * @param {{
 *   maxBytes?: number;
 *   timeoutMs?: number;
 *   requireSameOriginAs?: string;
 *   engine?: string;
 *   fetch?: typeof fetch;
 * }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadSegmentPlanFromUrl(urlString, options = {}) {
	const maxBytes = options.maxBytes ?? 512 * 1024;
	const timeoutMs = options.timeoutMs ?? 5000;
	const fetchFn = options.fetch ?? globalThis.fetch;
	if (typeof fetchFn !== 'function') {
		throw new CompileLayoutError('SEGMENT_PLAN_FETCH_FAILED', 'global fetch is not available', {});
	}
	if (options.requireSameOriginAs !== undefined) {
		assertSameOrigin(urlString, options.requireSameOriginAs);
	}
	let u;
	try {
		u = new URL(urlString);
	} catch {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', `Invalid URL: ${JSON.stringify(urlString)}`, {});
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', `Unsupported URL protocol: ${u.protocol}`, {});
	}

	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), timeoutMs);
	let res;
	try {
		res = await fetchFn(u.href, { signal: ac.signal });
	} catch (e) {
		const name = e && typeof e === 'object' && 'name' in e ? String(/** @type {{ name?: string }} */ (e).name) : '';
		const msg =
			name === 'AbortError'
				? `Fetch timed out after ${String(timeoutMs)}ms`
				: `Fetch failed: ${e instanceof Error ? e.message : String(e)}`;
		throw new CompileLayoutError('SEGMENT_PLAN_FETCH_FAILED', msg, {});
	} finally {
		clearTimeout(timer);
	}

	if (!res || typeof res.ok !== 'boolean' || !res.ok) {
		const status = res && typeof res.status === 'number' ? res.status : 0;
		throw new CompileLayoutError(
			'SEGMENT_PLAN_FETCH_FAILED',
			`HTTP ${String(status)} ${res && typeof res.statusText === 'string' ? res.statusText : ''}`.trim(),
			{}
		);
	}
	if (contentLengthExceedsMax(res.headers, maxBytes)) {
		throw new CompileLayoutError(
			'SEGMENT_PLAN_TOO_LARGE',
			`Content-Length exceeds maxBytes=${String(maxBytes)}`,
			{}
		);
	}
	let text;
	try {
		const buf = await res.arrayBuffer();
		if (buf.byteLength > maxBytes) {
			throw new CompileLayoutError(
				'SEGMENT_PLAN_TOO_LARGE',
				`Response body exceeds maxBytes=${String(maxBytes)}`,
				{}
			);
		}
		text = new TextDecoder('utf-8').decode(buf);
	} catch (e) {
		if (e instanceof CompileLayoutError) {
			throw e;
		}
		throw new CompileLayoutError(
			'SEGMENT_PLAN_FETCH_FAILED',
			`Failed to read body: ${e instanceof Error ? e.message : String(e)}`,
			{}
		);
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new CompileLayoutError('SEGMENT_PLAN_NON_JSON', 'Response body is not valid JSON', {});
	}
	return loadSegmentPlanFromJson(parsed, { engine: options.engine });
}
