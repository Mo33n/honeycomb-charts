import type { DensityClamp } from './zoom-effective-width.js';

/** Named tuning bundles for {@link attachViewportSegmentProfile} / `createHoneycombChartBinding` viewport options. */
export type ViewportSegmentProfilePresetId = 'default' | 'dense';

const DEFAULT_DENSITY: DensityClamp = { min: 0.25, max: 4 };

/**
 * `dense` — switch to simpler layouts earlier (lower nominal px/bar for the per-bar floor).
 * `default` — current demo-style calibration.
 */
export function resolveViewportSegmentProfilePreset(
	preset: ViewportSegmentProfilePresetId | undefined
): { nominalPxPerBar: number; densityClamp: DensityClamp } {
	if (preset === 'dense') {
		return { nominalPxPerBar: 18, densityClamp: DEFAULT_DENSITY };
	}
	return { nominalPxPerBar: 22, densityClamp: DEFAULT_DENSITY };
}
