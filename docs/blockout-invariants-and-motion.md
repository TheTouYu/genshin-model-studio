# Blockout Invariants and Motion Trial

## Accepted Baseline

The user preliminarily accepted `delivery/body-blockout-r1/mesh.json`: 113 vertices, 222 triangles. Preserve this artifact. This is static blockout approval, not reference-fit, rigging, or export approval. The 129-vertex calf/foot draft is not the accepted replacement.

## Proposed Invariants

- One connected shared-vertex body; no open or non-manifold edges, degenerate faces, or rest-pose self-intersections.
- Complete head/neck, chest/waist/pelvis, paired arms with elbow/wrist/palm blocks, paired legs with knee/ankle/foot blocks.
- Front/back distinction, bilateral rest-pose symmetry, head/body scale, and positive palm/foot volume.
- Shoulder and hip sockets remain part of the trunk surface, not coincident disconnected pieces.
- Joint parent-child hierarchy, pivot positions, and affected surface regions remain explicit during simplification.
- Comparison tolerance for silhouettes and pivot movement must be declared before accepting a deletion; no invented reference-fit percentage.

## Minimal Next Experiment

1. Freeze the accepted baseline and its file/loaded-preview fingerprint.
2. Add an inspection-only rig: pelvis -> spine/chest -> neck/head; chest -> shoulder -> elbow -> wrist -> palm; pelvis -> hip -> knee -> ankle -> foot, on both sides. Shoulder sockets are not the upper-arm ring centers by definition; inspect their positions first.
3. Show joint markers and bone links with visibility control. Use rotation controls plus play/pause/reset for a bounded motion demonstration. A moving marker without mesh deformation does not pass.
4. First exercise one elbow: forearm/palm follow, upper arm and trunk remain anchored; restoring rest pose recovers the original mesh exactly. Then shoulder, wrist, hip, knee and ankle. Check connectedness and self-intersection across sampled poses, not just endpoints.
5. Only after a working baseline motion test, remove one redundant vertex or ring candidate at a time, symmetrically where required. Preserve the accepted mesh as comparison.
6. Report mesh vertex count separately from skeleton joint count, pose freedom and control count. Compare front/side/quarter views and identical motion phases before and after.

## Boundaries

No automatic high-density refinement, clothing, or export in this experiment. Fewer vertices alone does not prove equivalent structure. Motion inspection is not a claim of anatomically correct skinning or game skeleton export. Both reference fitting and dynamic acceptance remain pending.

## Coaching Status

Current-conversation trial: invariant-preserving simplification plus motion validation. Existing coaching candidates `coarse-stage-gate` and `validation-validity` support stage separation and evidence scope; they do not independently validate this rigging method. No historical mining or global instruction changes were performed.
