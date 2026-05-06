/**
 * Dot-path parsing for partial updates (RFC-0002 §2).
 * @module honeycomb/lib/path-parser
 */
import { CompileLayoutError } from './errors.mjs';

/** @type {ReadonlySet<string>} */
const FORBIDDEN_IDENTIFIERS = new Set(['__proto__', 'constructor', 'prototype']);

export const DEFAULT_MAX_PATH_DEPTH = 12;
export const DEFAULT_MAX_PATH_CHARS = 256;

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const UINT_RE = /^\d+$/;

/**
 * @typedef {{ readonly type: 'ident'; readonly name: string }} PathIdent
 * @typedef {{ readonly type: 'index'; readonly index: number }} PathIndex
 * @typedef {PathIdent | PathIndex} PathSegment
 */

/**
 * @typedef {{ readonly path: string; readonly segments: ReadonlyArray<PathSegment> }} ParsedPath
 */

/**
 * Parse a normative MVP dot path (RFC-0002 §2). Throws {@link CompileLayoutError} before any mutation.
 *
 * @param {string} path
 * @param {{ maxDepth?: number; maxChars?: number }} [options]
 * @returns {ParsedPath}
 */
export function parsePath(path, options = {}) {
	if (typeof path !== 'string') {
		throw new CompileLayoutError('PATH_REJECTED', 'path must be a string', {});
	}
	const maxDepth = options.maxDepth ?? DEFAULT_MAX_PATH_DEPTH;
	const maxChars = options.maxChars ?? DEFAULT_MAX_PATH_CHARS;
	const trimmed = path.trim();
	if (trimmed.length === 0) {
		throw new CompileLayoutError('PATH_REJECTED', 'path must not be empty', {});
	}
	if (trimmed.length > maxChars) {
		throw new CompileLayoutError('PATH_TOO_LONG', `path exceeds max length (${maxChars})`, {});
	}
	if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
		throw new CompileLayoutError('PATH_REJECTED', 'path must not start or end with "."', {});
	}
	if (trimmed.includes('..')) {
		throw new CompileLayoutError('PATH_REJECTED', 'path must not contain ".."', {});
	}

	const raw = trimmed.split('.');
	if (raw.length > maxDepth) {
		throw new CompileLayoutError('PATH_TOO_DEEP', `path exceeds max depth (${maxDepth})`, {});
	}

	/** @type {PathSegment[]} */
	const segments = [];
	for (const seg of raw) {
		if (seg === '') {
			throw new CompileLayoutError('PATH_REJECTED', 'path must not contain empty segments', {});
		}
		if (UINT_RE.test(seg)) {
			const index = Number.parseInt(seg, 10);
			if (index < 0 || !Number.isFinite(index)) {
				throw new CompileLayoutError('PATH_INVALID_INDEX', `invalid array index: ${JSON.stringify(seg)}`, {});
			}
			segments.push(Object.freeze({ type: 'index', index }));
			continue;
		}
		if (!IDENT_RE.test(seg)) {
			throw new CompileLayoutError('PATH_INVALID_SEGMENT', `invalid path segment: ${JSON.stringify(seg)}`, {});
		}
		if (FORBIDDEN_IDENTIFIERS.has(seg)) {
			throw new CompileLayoutError('PATH_REJECTED', `forbidden path segment: ${JSON.stringify(seg)}`, {});
		}
		segments.push(Object.freeze({ type: 'ident', name: seg }));
	}

	return Object.freeze({
		path: trimmed,
		segments: Object.freeze(segments),
	});
}
