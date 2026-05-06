/**
 * Immutable bar mutations (RFC-0002 §3).
 * @module honeycomb/lib/mutation
 */
import { CompileLayoutError } from './errors.mjs';
import { parsePath } from './path-parser.mjs';

/** Baseline used when `add` targets a missing numeric leaf (RFC-0002 §3.2). Exported for hosts documenting policy (CT-P1-10). */
export const ADD_MISSING_NUMERIC_LEAF_BASE = 0;

/**
 * @typedef {{ readonly op: 'set'; readonly path: string; readonly value: number }} SetOp
 * @typedef {{ readonly op: 'add'; readonly path: string; readonly delta: number }} AddOp
 * @typedef {SetOp | AddOp} MutationOp
 */

/**
 * @typedef {{ readonly candleId: number | string; readonly revision?: number; readonly ops: ReadonlyArray<MutationOp> }} MutationBatch
 */

/**
 * @param {unknown} n
 * @returns {n is number}
 */
function isFiniteNumber(n) {
	return typeof n === 'number' && Number.isFinite(n);
}

/**
 * @param {unknown} value
 */
function assertFiniteNumber(value, context) {
	if (!isFiniteNumber(value)) {
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', `${context} must be a finite number`, {});
	}
}

/**
 * @param {Record<string, unknown> | unknown[]} parent
 * @param {import('./path-parser.mjs').PathSegment} part
 * @returns {unknown}
 */
function readChild(parent, part) {
	if (part.type === 'ident') {
		if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
			throw new CompileLayoutError('PATH_NOT_FOUND', `cannot read property ${JSON.stringify(part.name)} on non-object`, {});
		}
		const p = /** @type {Record<string, unknown>} */ (parent);
		return p[part.name];
	}
	if (!Array.isArray(parent)) {
		throw new CompileLayoutError('PATH_NOT_FOUND', 'expected array at numeric path segment', {});
	}
	if (part.index < 0 || part.index >= parent.length) {
		throw new CompileLayoutError('PATH_NOT_FOUND', `array index out of range: ${part.index}`, {});
	}
	return parent[part.index];
}

/**
 * @param {Record<string, unknown> | unknown[]} parent
 * @param {import('./path-parser.mjs').PathSegment} part
 * @returns {Record<string, unknown> | unknown[]}
 */
function requireChildObject(parent, part) {
	const v = readChild(parent, part);
	if (v === undefined || v === null) {
		throw new CompileLayoutError('PATH_NOT_FOUND', 'missing intermediate on path', {});
	}
	if (typeof v !== 'object') {
		throw new CompileLayoutError('PATH_NOT_FOUND', 'intermediate is not an object', {});
	}
	return /** @type {Record<string, unknown> | unknown[]} */ (v);
}

/**
 * @param {Record<string, unknown> | unknown[]} parent
 * @param {import('./path-parser.mjs').PathSegment} leaf
 * @returns {number | undefined}
 */
function readLeafNumber(parent, leaf) {
	const v = readChild(parent, leaf);
	if (v === undefined) return undefined;
	if (!isFiniteNumber(v)) {
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', 'existing leaf is not a finite number', {});
	}
	return v;
}

/**
 * @param {Record<string, unknown> | unknown[]} parent
 * @param {import('./path-parser.mjs').PathSegment} leaf
 * @param {number} value
 */
function writeLeaf(parent, leaf, value) {
	if (leaf.type === 'ident') {
		if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
			throw new CompileLayoutError('PATH_NOT_FOUND', 'cannot write on non-object parent', {});
		}
		/** @type {Record<string, unknown>} */ (parent)[leaf.name] = value;
		return;
	}
	if (!Array.isArray(parent)) {
		throw new CompileLayoutError('PATH_NOT_FOUND', 'cannot write numeric index on non-array', {});
	}
	if (leaf.index < 0 || leaf.index >= parent.length) {
		throw new CompileLayoutError('PATH_NOT_FOUND', `array index out of range for write: ${leaf.index}`, {});
	}
	parent[leaf.index] = value;
}

/**
 * Apply ops in order on a deep clone of `bar`. MVP: numeric leaves only (`set` / `add`).
 * For `add`, a **missing** numeric leaf is treated as **0** (RFC-0002 §3.2 baseline).
 *
 * @param {Record<string, unknown>} bar
 * @param {ReadonlyArray<MutationOp>} ops
 * @returns {Record<string, unknown>}
 */
export function applyOpsToBar(bar, ops) {
	if (!bar || typeof bar !== 'object' || Array.isArray(bar)) {
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', 'bar must be a non-array object', {});
	}
	const next = /** @type {Record<string, unknown>} */ (structuredClone(bar));

	for (const op of ops) {
		if (op.op === 'set') {
			assertFiniteNumber(op.value, 'set.value');
			const parsed = parsePath(op.path);
			const segs = parsed.segments;
			if (segs.length === 0) {
				throw new CompileLayoutError('PATH_REJECTED', 'path must have at least one segment', {});
			}
			let parent = /** @type {Record<string, unknown> | unknown[]} */ (next);
			for (let i = 0; i < segs.length - 1; i++) {
				parent = requireChildObject(parent, segs[i]);
			}
			writeLeaf(parent, segs[segs.length - 1], op.value);
			continue;
		}
		if (op.op === 'add') {
			assertFiniteNumber(op.delta, 'add.delta');
			const parsed = parsePath(op.path);
			const segs = parsed.segments;
			if (segs.length === 0) {
				throw new CompileLayoutError('PATH_REJECTED', 'path must have at least one segment', {});
			}
			let parent = /** @type {Record<string, unknown> | unknown[]} */ (next);
			for (let i = 0; i < segs.length - 1; i++) {
				parent = requireChildObject(parent, segs[i]);
			}
			const leaf = segs[segs.length - 1];
			const cur = readLeafNumber(parent, leaf);
			const base = cur === undefined ? ADD_MISSING_NUMERIC_LEAF_BASE : cur;
			writeLeaf(parent, leaf, base + op.delta);
			continue;
		}
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', `unknown op: ${JSON.stringify(/** @type {{ op?: string }} */ (op).op)}`, {});
	}

	return next;
}

/**
 * Apply a batch with optional revision dedupe (RFC-0002 §3.3). When `revision` is present and
 * `lastRevisionByCandleId` is provided, a revision **≤** the last stored for `candleId` is a full no-op.
 *
 * **Revision policy (CT-P1-10):** If `strictRevision` is true, `revision` **requires** `lastRevisionByCandleId`
 * so dedupe cannot be accidentally disabled while still sending revision headers.
 *
 * @param {Record<string, unknown>} bar
 * @param {MutationBatch} batch
 * @param {{ lastRevisionByCandleId?: Map<number | string, number>; strictRevision?: boolean }} [ctx]
 * @returns {{ bar: Record<string, unknown>; applied: true } | { bar: Record<string, unknown>; applied: false; reason: 'stale_revision' }}
 */
export function applyMutationBatch(bar, batch, ctx = {}) {
	if (!batch || typeof batch !== 'object') {
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', 'batch must be an object', {});
	}
	const { candleId, revision, ops } = batch;
	if (candleId === undefined || candleId === null || (typeof candleId !== 'number' && typeof candleId !== 'string')) {
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', 'batch.candleId must be a number or string', {});
	}
	if (!Array.isArray(ops)) {
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', 'batch.ops must be an array', {});
	}
	const map = ctx.lastRevisionByCandleId;
	if (revision !== undefined) {
		if (!isFiniteNumber(revision)) {
			throw new CompileLayoutError('MUTATION_INVALID_VALUE', 'batch.revision must be a finite number when present', {});
		}
		if (ctx.strictRevision && !map) {
			throw new CompileLayoutError(
				'MUTATION_INVALID_VALUE',
				'batch.revision requires ctx.lastRevisionByCandleId when strictRevision is true',
				{}
			);
		}
		if (map) {
			const prev = map.get(candleId);
			if (prev !== undefined && revision <= prev) {
				return { bar, applied: false, reason: 'stale_revision' };
			}
		}
	}
	const next = applyOpsToBar(bar, ops);
	if (revision !== undefined && map) {
		map.set(candleId, revision);
	}
	return { bar: next, applied: true };
}
