# Control Cage Sampling Contract

`cageLoft(ctrlRings, opts)` in `scripts/parts/lib/ganyu-lib.js` produces an open tube grid. It is not a replacement for shared-boundary limb extrusion. Use `profileLoft` plus `extrudePatch` for the current body until separately validated.

Angular sampling uses periodic Catmull-Rom within each control ring. Longitudinal sampling then interpolates those ring samples with open Catmull-Rom. Angular refinement must not mix heights from different control rows. `opts.segs` controls longitudinal cells; `opts.sides` controls angular columns. Returned `mesh.colors` has one color per triangle, with two identical colors per quad cell. `colorFn(u,v)` receives normalized cell centers, and the default is CSS `#ffffff`.

`cagePoint(cage, ring, point)` returns a copied position. `cageMove(cage, ring, point, [dx,dy,dz])` updates a control point and rebuilds; `{pos:[x,y,z]}` sets an absolute control coordinate. The original control array is edited by design.

Known limits: no automatic caps; `opts.up` retains legacy coordinate mapping (Z-up request swaps control Y/Z), unlike world-space `profileLoft`; dense/angularStops currently select counts rather than honoring arbitrary knot values. Do not claim API parity between the loft functions. These limitations must be resolved before using those options for reference fitting.

`subdivSurface(mesh, levels)` has a focused tetrahedron regression for deterministic 4x triangle subdivision, per-face colors, closed edges and nonmutation. The fixture also runs the geometric export gate: the old equal-four-point edge average collapsed all six tetrahedron edge points to the origin and created 16 degenerate triangles. Edge smoothing now weights endpoints by 3/8 each and opposite vertices by 1/8 each. This does not certify shoulder, hip, finger or crease behavior. Test the actual branch mesh and reference silhouette before accepting refinement.

Regressions: `tests/cage-sampling.test.ts`. The R2 investigation found and fixed mixed-axis interpolation (planar first-ring samples alternated y=0 and 0.4375) and vertex-count colors masquerading as per-face colors (24 colors for 32 triangles).
