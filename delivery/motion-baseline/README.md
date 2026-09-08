# Reusable Motion Inspection Assets

Baseline: accepted 113-vertex / 222-triangle body, not modified.

- `rig.json`: 13 joints, parent hierarchy, rest pivots in meters, +Y up / +Z front, rigid vertex-to-joint binding and source fingerprint.
- `clips.json`: 12 named joint sweeps; local Euler axis, radians, linear keyframes, seconds, 4-second duration and loop intent. Retarget by joint id only after matching rest axes and proportions; these are inspection clips, not production animation.
- `bundle.json`: complete mesh/rig/clip package.
- `samples.json`: 204 actual browser-generated poses, spaced 0.25 seconds.
- `verification.json`: geometry gate and bone-length/unrelated-vertex checks.
- `rest.png`, `elbow.png`: inspected desktop pose comparison.
- `mobile-loaded.png`: inspected 390x844 cold-load screenshot. `mobile.png` is the retained FAILED viewport-transition capture, not acceptance evidence.

## Current Result

Playback changes the mesh; reset restores exactly. All sampled bone lengths remain invariant within 1e-7m and unrelated vertices remain fixed within 1e-7m. Geometry gates pass 203/204 sampled poses. `shoulderL-sweep` at 3 seconds has 7 local self-intersections. This failure is retained, not hidden by reducing the motion range. Sampling does not certify continuous-time absence of intersection.

No vertices have been deleted. Simplification acceptance is held until the dynamic baseline is repaired. Shoulder socket motion and binding require further work. Rig is currently per-region rigid deformation, with no blend weights, spine articulation, anatomical motion-limit certification or game skeleton export.

## Reproduce

`node scripts/parts/build-motion-assets.mjs` regenerates the asset package from the accepted mesh.
Open `http://localhost:8787/draw/motion-review.html`. It fetches an explicit bundle and never reads or writes the main app localStorage.
`node scripts/parts/verify-motion-samples.mjs` checks the saved browser samples. It writes a report; inspect `deletionAllowed`, not only process exit status.
