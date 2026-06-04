import { decodeHitField } from './hit-id-codec.js';

export interface ParsedFootprintHit {
	readonly logicalBarIndex: number;
	readonly price: number;
	readonly metricId: string;
	readonly segment: 'L' | 'R';
	readonly overlayId: string;
}

/** Parses `objectId` from {@link FootprintRenderer} hit tests (RFC §5.6). */
export function parseFootprintObjectId(objectId: string): ParsedFootprintHit | null {
	if (!objectId.startsWith('fp|')) {
		return null;
	}
	const parts = objectId.split('|');
	if (parts.length < 5) {
		return null;
	}
	const idx = Number(parts[1]);
	const price = Number(parts[2]);
	const metricId = decodeHitField(parts[3] ?? '');
	const segment = parts[4] === 'L' || parts[4] === 'R' ? parts[4] : null;
	const ovRaw = parts[5] ?? 'ov:__cell__';
	if (!ovRaw.startsWith('ov:')) {
		return null;
	}
	const overlayId = decodeHitField(ovRaw.slice('ov:'.length));
	if (
		!Number.isFinite(idx) ||
		!Number.isFinite(price) ||
		segment === null ||
		metricId.length === 0 ||
		overlayId.length === 0
	) {
		return null;
	}
	return { logicalBarIndex: idx, price, metricId, segment, overlayId };
}

/** Payload for tooltips and `aria-live` mirroring (RFC §5.6, PRD NFR-2). */
export interface FootprintCrosshairPayload extends ParsedFootprintHit {
	readonly value?: number;
	readonly revision?: number;
}

export function buildFootprintCrosshairPayload(
	objectId: string | undefined,
	extras?: { readonly value?: number; readonly revision?: number }
): FootprintCrosshairPayload | null {
	const base = objectId === undefined ? null : parseFootprintObjectId(objectId);
	if (base === null) {
		return null;
	}
	return {
		...base,
		...(extras?.value !== undefined ? { value: extras.value } : {}),
		...(extras?.revision !== undefined ? { revision: extras.revision } : {}),
	};
}

export interface ParsedGenericFootprintHit {
	readonly logicalBarIndex: number;
	readonly price: number;
	readonly slotIndex: number;
	readonly overlayId: string;
	readonly metricId: string;
}

/** Parses `objectId` from {@link GenericFootprintRenderer} hit tests (ADR-0005). */
export function parseGenericFootprintObjectId(objectId: string): ParsedGenericFootprintHit | null {
	if (!objectId.startsWith('gf|')) {
		return null;
	}
	const parts = objectId.split('|');
	if (parts.length < 6) {
		return null;
	}
	const logicalBarIndex = Number(parts[1]);
	const price = Number(parts[2]);
	const slotIndex = Number(parts[3]);
	const ovRaw = parts[4] ?? '';
	const mRaw = parts[5] ?? '';
	if (!ovRaw.startsWith('ov:') || !mRaw.startsWith('m:')) {
		return null;
	}
	const overlayId = decodeHitField(ovRaw.slice('ov:'.length));
	const metricId = decodeHitField(mRaw.slice('m:'.length));
	if (
		!Number.isFinite(logicalBarIndex) ||
		!Number.isFinite(price) ||
		!Number.isFinite(slotIndex) ||
		overlayId.length === 0 ||
		metricId.length === 0
	) {
		return null;
	}
	return { logicalBarIndex, price, slotIndex, overlayId, metricId };
}

/** Payload for generic footprint tooltips and crosshair mirroring. */
export interface GenericFootprintCrosshairPayload extends ParsedGenericFootprintHit {
	readonly value?: number;
	readonly revision?: number;
}

export function buildGenericFootprintCrosshairPayload(
	objectId: string | undefined,
	extras?: { readonly value?: number; readonly revision?: number }
): GenericFootprintCrosshairPayload | null {
	const base = objectId === undefined ? null : parseGenericFootprintObjectId(objectId);
	if (base === null) {
		return null;
	}
	return {
		...base,
		...(extras?.value !== undefined ? { value: extras.value } : {}),
		...(extras?.revision !== undefined ? { revision: extras.revision } : {}),
	};
}
