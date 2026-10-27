# AI Agent Guide: Adaptive GPS Trip Speed Coloring

## Purpose

Improve the speed-colored GPS trip line so that speed variations remain easy to see even when much of a trip occurs within a narrow speed range.

The trip is drawn as a continuous line. Low speeds use green, middle speeds transition through yellow and orange, and high speeds use red. The recorded speed data must remain unchanged: this guide only defines how speeds map to visual colors.

## Recommended default

Use **relative-to-trip percentile-based color mapping** as the default display mode.

Also provide an optional **absolute speed** mode for users who want the same speed to have approximately the same color across different trips.

### Mode A: Relative to trip (default)

Calculate color thresholds from the valid speed distribution of the current trip. Use percentiles so that the common speed range gets more of the color spectrum.

Illustrative mapping:

| Speed percentile / boundary | Color role |
|---|---|
| At or below the near-stationary threshold | Green; handle separately |
| 10th percentile of eligible moving speeds | Green |
| 30th percentile | Yellow-green |
| 50th percentile | Yellow |
| 70th percentile | Orange |
| 90th percentile | Orange-red |
| Highest valid speed | Red |

These percentiles and colors are starting points, not fixed requirements. Tune them based on visual testing. Interpolate smoothly between color stops to avoid visible bands.

Percentiles are calculated from the trip's eligible speed samples, not from distance or elapsed time unless the product deliberately chooses that weighting. Keep the choice consistent and documented.

### Mode B: Absolute speed

Use fixed speed thresholds or a fixed speed-to-color scale across trips. For example, a given speed should map to approximately the same color in every trip.

This mode is best for comparing actual speeds across trips. It may show less color variety when most of a trip's speeds fall within a narrow range; that is expected.

## Processing requirements

1. **Use valid speed samples.** Exclude missing, invalid, or clearly implausible readings from threshold calculation. Apply the app's existing GPS-quality and maximum-speed rules; do not invent a new speed cap without product approval.
2. **Handle stops separately.** Treat speeds at or below a configurable near-stationary threshold (suggested initial value: 3 km/h) as green and exclude them from moving-speed percentile calculations. Avoid allowing long stops to dominate the distribution.
3. **Reduce GPS noise carefully.** If needed, apply light smoothing to noisy speed readings before calculating colors. Preserve genuine acceleration and braking, and do not alter the stored trip data.
4. **Calculate percentiles robustly.** Compute the selected percentiles from valid moving-speed samples. Handle small datasets and repeated values without errors.
5. **Preserve extremes.** The lowest eligible moving speeds should remain near green, and the highest valid speed should reach red. Do not let an isolated invalid GPS spike determine the red endpoint.
6. **Interpolate colors continuously.** For speeds between thresholds, interpolate between adjacent color stops in a perceptually smooth way. Avoid abrupt jumps or hard color bands.
7. **Keep results deterministic.** The same speed and same trip thresholds must produce the same color. Re-rendering the same trip should not change its colors.
8. **Handle edge cases.** If there are too few valid moving samples, or percentiles collapse because many readings have the same speed, fall back to a sensible stable mapping. Do not divide by zero or create unstable color flicker. In a nearly constant-speed trip, explain that speed-only coloring cannot reveal variation that is not present in the data.
9. **Keep GPS geometry independent.** Color mapping must not change the recorded route, sample timestamps, distances, or speed values.

## Legend and user interpretation

- In **Relative to trip** mode, display the actual speed values associated with the color stops for that trip, with units (for example, km/h). Make it clear that colors are relative to the trip.
- In **Absolute speed** mode, display the fixed thresholds and use the same scale consistently across trips.
- If the user taps or selects a line segment, show its measured speed and, where useful, its mapped color or percentile.
- Do not imply that orange always means one fixed speed in relative mode.

## UI recommendation

Offer a simple setting:

- **Relative to trip** — “Emphasizes speed variation within this trip.”
- **Absolute speed** — “Uses consistent colors for comparing speeds across trips.”

Default to **Relative to trip**. Preserve the user's selected mode between sessions if the app already supports persistent display preferences.

## Acceptance criteria

The implementation is successful when:

- A trip whose speeds cluster around its average uses a broader, more informative range of colors in relative mode.
- Low-speed or stopped sections remain green.
- The highest valid speed maps to red.
- Colors transition smoothly along the route.
- Invalid GPS spikes do not dominate the scale.
- The legend reports meaningful actual speeds for the selected mode.
- Absolute mode maps the same speed to approximately the same color across trips.
- Stored speed, time, distance, and route data are never modified by visualization logic.
- Short, constant-speed, and noisy trips degrade gracefully without crashes or flickering.

## Important limitation

Percentile coloring improves visual contrast; it does **not** change the underlying trip speeds or make the trip's speed distribution more varied. If a trip genuinely contains little speed variation, a speed-only line cannot display meaningful variation that is not present in the data. If needed, expose another metric—such as acceleration or braking—as a separate visualization mode rather than mixing it invisibly into speed colors.

## Implementation note for the AI agent

Before changing the app, inspect the existing trip rendering pipeline, speed units, GPS filtering, color interpolation, and settings conventions. Integrate this behavior into the current architecture rather than replacing unrelated functionality. Keep the change scoped to display logic, add tests for percentile calculation and edge cases, and describe any assumptions that require product decisions.
