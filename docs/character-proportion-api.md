# Character Proportion API

`characterProportionReport(mesh, options)` is exported by `scripts/parts/lib/proportion-check.js` as a browser global and CommonJS property. Load it in `node:vm` alongside existing modeling scripts. It does not overwrite the generic `proportionReport(mesh, bands)` in `ganyu-seam-check.js`.

## Inputs

- `mesh.vertices`: world-space `[x,y,z]` positions in metres, +Y up, +Z front.
- `options.chinY`: explicit anatomical chin landmark height. Without it, `headBody` is `null`, never a fixed baseline value.
- `options.centerZ`: sagittal origin (default 0) for chest/hip depth measurements.
- `options.windows`: named `[minY,maxY,minX,maxX]` regions. Names: shoulder, chest, waist, hip, palm, finger. Torso defaults are provisional 1.6 m project windows, not automatic anatomical detection. Palm and finger require explicit windows.
- `options.fingerRootSpan`: independently measured four-finger root span in metres. No fabricated default.
- `options.targets`: optional named ratio ranges `[min,max]`. No reference-fit claim is inferred from them.

## Outputs

`bands` contains measured widths, depths, Y spans and sample counts. A region with fewer than two samples is `null`. `ratios` contains headBody, shoulderWaist, hipWaist, palmFingerLen, fingerSpread, chestAsym and hipAsym. Missing or zero-denominator ratios are `null`. `missing` lists unavailable regions/ratios. `abnormal` lists measured ratios outside explicitly supplied targets.

`complete` only means all measurements are available. `abnormal: []` alone is not a pass: inspect `missing`, then validate targets against reference measurements. `referenceFit` is always false because this API measures geometry, not image agreement.

## Example

```js
const report = characterProportionReport(mesh, {
  chinY: 1.36,
  windows: {
    palm: [0.69, 0.77, 0.26, 0.35],
    finger: [0.60, 0.69, 0.26, 0.35]
  },
  targets: { headBody: [6.3, 7.2] }
});
```

The values above are provisional examples, not measured acceptance limits.

## Limits And Tests

Measurements sample existing vertices, not triangle-plane intersections. Sparse rings can leave a region empty or underestimate width; report that explicitly. Hand windows can include nearby limbs unless the caller excludes them. Hair/footwear must be excluded when measuring anatomical height.

`tests/character-proportion.test.ts` covers actual height dependence, missing data, configurable windows/targets and both global script load orders. Run `npm test`.
