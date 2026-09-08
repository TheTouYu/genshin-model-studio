# Motion Regression Suite v2

Accepted mesh remains 113 vertices / 222 triangles. v1 assets remain in delivery/motion-baseline.

## Hierarchy

15 nodes: root, spine, neck, bilateral shoulder/elbow/wrist/hip/knee/ankle. Root -> spine -> neck and shoulders; root -> hips. This is a minimum whole-body inspection rig, not a complete anatomical skeleton. Fingers, toes, clavicle and multiple vertebra segments are absent.

## Clips

23 clips: 14 individual joint sweeps plus head-look, head-nod, bow, torso-turn, side-bend, arm-raise, elbow-curl, squat-study, walk-in-place-study. Coverage includes all 14 articulated joints; it does not imply every anatomical degree of freedom or full range of motion. Root stays fixed.

rig.json stores hierarchy, pivots and per-vertex rigid binding. clips.json stores named joint tracks, local Euler axes, radians, seconds, linear keyframes and loop intent. bundle.json is the explicit browser input. No main-app localStorage is modified.

## Reproduce

1. node scripts/parts/build-motion-assets.mjs
2. bash scripts/sample-motion-regression.sh
3. Inspect verification.json: geometry failures, invariantFailures, per-joint axis/clip coverage and deletionAllowed. Command exit success alone is not pose acceptance.

Browser sampling uses the same runtime as playback, at 0.125-second intervals. Latest run: 759 poses, 747 geometry passes, 12 failures, no bone-length/unrelated-region violations, exact rest reset. Failed poses remain available. Continuous-time collision absence is not proven.

## After Model Changes

Regenerate the bundle and browser samples, never reuse the old pose set. Current builder targets accepted r1 mesh and named control regions; topology changes require rebuilding the vertex binding, including the crown center binding. Do not apply old vertex indices to a new mesh. Pivot edits require human review against anatomical landmarks: bone-length checks detect changes during animation, not a consistently wrong rest pivot.

Compare the same clips/timestamps/views with the previous version. Numeric gates detect intersections and malformed geometry but do not prove natural motion. Squat and walk are joint-exercise studies without foot locking, root compensation, balance or IK. Rigid binding can reveal but does not repair unnatural bending.

## Evidence

verification.json and samples.json preserve actual browser results. bow.png and head-look.png were read visually. tests/motion-assets.test.ts checks source identity, bindings, hierarchy, joint coverage, keyframes and web/package equality.
