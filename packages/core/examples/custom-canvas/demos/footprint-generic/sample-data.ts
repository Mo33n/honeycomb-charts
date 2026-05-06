import { DEFAULT_FOOTPRINT_THEME } from './theme.js';
import type { FootprintBar, FootprintGenericViewModel } from './types.js';

function lvl(price: number, bid: number, ask: number, vol: number): { price: number; values: Record<string, number> } {
	const delta = bid - ask;
	return { price, values: { bid, ask, vol, delta } };
}

/**
 * Example view model: **slots** + **weights** + **theme** + **padding** are the customization surface.
 * Layout here: **volume histogram** | **Δ / vol ratio** | **delta histogram**, plus optional `pocMetricId`.
 */
export function createFootprintGenericSampleViewModel(): FootprintGenericViewModel {
	const bars: FootprintBar[] = [
		{
			open: 100.0,
			high: 101.2,
			low: 99.4,
			close: 100.6,
			header: { text: '-10 162', color: '#ef5350' },
			footer: { left: 'Vol 12.4k', right: 'Δ -842', leftColor: '#b2b5be', rightColor: '#ef5350' },
			levels: [
				lvl(101.2, 8, 22, 30),
				lvl(100.8, 44, 18, 62),
				lvl(100.4, 120, 55, 175),
				lvl(100.0, 210, 90, 300),
				lvl(99.6, 95, 140, 235),
				lvl(99.4, 30, 48, 78),
			],
		},
		{
			open: 100.6,
			high: 101.0,
			low: 100.0,
			close: 100.35,
			header: { text: '-10 487', color: '#ef5350' },
			footer: { left: 'Vol 9.1k', right: 'Δ -1.1k', leftColor: '#b2b5be', rightColor: '#ef5350' },
			levels: [
				lvl(101.0, 20, 35, 55),
				lvl(100.7, 88, 42, 130),
				lvl(100.35, 160, 70, 230),
				lvl(100.0, 102, 118, 220),
			],
		},
		{
			open: 100.35,
			high: 100.9,
			low: 99.9,
			close: 100.75,
			header: { text: '+2 044', color: '#26a69a' },
			footer: { left: 'Vol 11.0k', right: 'Δ +310', leftColor: '#b2b5be', rightColor: '#26a69a' },
			levels: [
				lvl(100.9, 25, 12, 37),
				lvl(100.6, 72, 38, 110),
				lvl(100.35, 140, 60, 200),
				lvl(100.1, 95, 88, 183),
				lvl(99.9, 28, 55, 83),
			],
		},
		{
			open: 100.75,
			high: 101.4,
			low: 100.5,
			close: 101.15,
			header: { text: '+8 901', color: '#26a69a' },
			footer: { left: 'Vol 15.2k', right: 'Δ +4.2k', leftColor: '#b2b5be', rightColor: '#26a69a' },
			levels: [
				lvl(101.4, 18, 30, 48),
				lvl(101.1, 55, 48, 103),
				lvl(100.85, 130, 72, 202),
				lvl(100.6, 200, 95, 295),
				lvl(100.5, 88, 102, 190),
			],
		},
	];

	return {
		bars,
		slots: [
			{
				role: 'histogram',
				metricId: 'vol',
				grow: 'left',
				histogramColor: 'rgba(144, 202, 249, 0.58)',
			},
			{ role: 'ratio', metricId: 'delta', ratioDenominatorId: 'vol' },
			{
				role: 'histogram',
				metricId: 'delta',
				grow: 'right',
				histogramColor: 'rgba(255, 183, 77, 0.58)',
			},
		],
		slotWeights: [1.15, 1, 1.15],
		theme: DEFAULT_FOOTPRINT_THEME,
		candleStripFraction: 0.12,
		headerBandHeight: 18,
		footerBandHeight: 16,
		padding: { left: 8, right: 8, top: 6, bottom: 6 },
		gapBetweenBars: 6,
		pocMetricId: 'vol',
	};
}
