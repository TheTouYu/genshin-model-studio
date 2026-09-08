# Body Checkpoint Build

Run from the repository root after `npm run build --silent`:

```sh
node scripts/build-body-cage.mjs delivery/r0-toes body-r3
```

This evaluates `ganyu-lib.js`, `ganyu-cage-branch.js`, `ganyu-seam-check.js` and `ganyu-body-cage.js` in a single `node:vm` global context, then writes `.mesh.json`, `.work.json`, `.controls.json` and `.report.json`. A checkpoint name contains only letters, digits, underscores and hyphens. Use a new name to preserve prior failed evidence.

The generator saves diagnostic checkpoints even when the geometry gate fails. Its successful process exit means the checkpoint was generated, not that geometry passed. Inspect `report.gate.ok`, `report.seam`, `referenceFit`, `visualAcceptance` and `gameAcceptance` separately. This script never produces GIA. Reports include SHA-256 hashes of all loaded control scripts, the compiled verifier, and the full mesh JSON. `geometryNanometres` hashes only vertices rounded to integer nanometres, face indices and colors, so browser/Node floating-point last-bit differences do not masquerade as model changes. It does not relax geometric gates or modify vertices.

The work JSON is an editable browser mesh preview with resource 10009019, not a game export. Formal candidates must run through panelize/export-mesh with gate and QA enabled, plus independent browser inspection of the resulting panel items.

R2 evidence: `iteration-records/26-r2-body-reference-and-gates.json` and `27-r2-tool-contracts.json`. R2 is rejected for local self intersections; reference fitting and character appearance remain incomplete.
