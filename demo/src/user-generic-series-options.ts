/**
 * Options merged after the layout catalog in {@link addHoneycombLayoutSeries} /
 * {@link createHoneycombChartBinding} (`bindingOptions.userSeriesOptions`).
 * Adjust per instrument (tick size) or user preference.
 */
export const userGenericSeriesOptions = {
	priceFormat: { type: 'price' as const, precision: 3, minMove: 0.001 },
};
