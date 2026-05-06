import type {
	FootprintBar,
	FootprintBarGeometry,
	FootprintGenericViewModel,
	FootprintLayout,
	FootprintPriceProjection,
} from './types.js';

function globalPriceBounds(bars: readonly FootprintBar[]): { pMin: number; pMax: number } {
	let pMin = Infinity;
	let pMax = -Infinity;
	for (const b of bars) {
		pMin = Math.min(pMin, b.low);
		pMax = Math.max(pMax, b.high);
	}
	if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) {
		return { pMin: 0, pMax: 1 };
	}
	const pad = (pMax - pMin) * 0.035 || 0.2;
	return { pMin: pMin - pad, pMax: pMax + pad };
}

function gridStep(pMin: number, pMax: number): number {
	const span = pMax - pMin;
	if (span <= 0.75) {
		return 0.125;
	}
	if (span <= 2) {
		return 0.25;
	}
	if (span <= 5) {
		return 0.5;
	}
	return 1;
}

export function footprintGridStep(pMin: number, pMax: number): number {
	return gridStep(pMin, pMax);
}

export function validateFootprintViewModel(vm: FootprintGenericViewModel): void {
	if (vm.slots.length < 1) {
		throw new Error('FootprintGenericViewModel: at least one slot is required');
	}
	if (vm.slotWeights.length !== vm.slots.length) {
		throw new Error('FootprintGenericViewModel: slotWeights.length must equal slots.length');
	}
	for (let i = 0; i < vm.slots.length; i++) {
		const s = vm.slots[i]!;
		if (s.role === 'ratio' && s.ratioDenominatorId.trim() === '') {
			throw new Error(`FootprintGenericViewModel: slot ${String(i)} ratio requires ratioDenominatorId`);
		}
	}
}

export function buildFootprintLayout(vm: FootprintGenericViewModel, cssW: number, cssH: number): FootprintLayout {
	const pad = vm.padding;
	const innerX = pad.left;
	const innerY = pad.top;
	const innerW = Math.max(1, cssW - pad.left - pad.right);
	const innerH = Math.max(1, cssH - pad.top - pad.bottom);
	const chartTop = innerY + vm.headerBandHeight;
	const chartBottom = innerY + innerH - vm.footerBandHeight;
	const chartHeight = Math.max(24, chartBottom - chartTop);
	const { pMin, pMax } = globalPriceBounds(vm.bars);
	const price: FootprintPriceProjection = { top: chartTop, height: chartHeight, pMin, pMax };

	const n = vm.bars.length;
	const gap = vm.gapBetweenBars;
	const usable = innerW - gap * (n + 1);
	const barW = n > 0 ? usable / n : innerW;

	const f = Math.max(0, Math.min(0.35, vm.candleStripFraction));
	const slotAreaW = Math.max(40, barW * (1 - f) - 4);
	const candleW = Math.max(5, barW - slotAreaW - 4);

	const wSum = vm.slotWeights.reduce((a, b) => a + b, 0) || 1;
	const slotWidths = vm.slotWeights.map(w => (slotAreaW * w) / wSum);

	const barGeometries: FootprintBarGeometry[] = [];
	let x = innerX + gap;
	for (let i = 0; i < n; i++) {
		const slotXs: number[] = [];
		let sx = x;
		for (let s = 0; s < slotWidths.length; s++) {
			slotXs.push(sx);
			sx += slotWidths[s] ?? 0;
		}
		const candleX = x + slotAreaW + 4;
		barGeometries.push({
			index: i,
			x,
			width: barW,
			slotXs,
			slotWidths,
			candleX,
			candleW,
		});
		x += barW + gap;
	}

	return {
		innerX,
		innerY,
		innerW,
		innerH,
		chartTop,
		chartHeight,
		price,
		barGeometries,
	};
}
