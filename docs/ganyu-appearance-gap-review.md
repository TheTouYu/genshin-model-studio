# Ganyu Appearance Gap Review

Target: `reference/ganyu-3view.png`. Structural images: `reference/body-wire-*.png`, which also show clothing, hair and footwear. Current body checkpoint R2 is a rejected blockout, not a finished character.

| Target feature | Current implementation evidence | Required increment |
|---|---|---|
| Body silhouette and stance | R2 has complete limbs and thickened feet; shoulder/hip crossings remain | Repair shared branch transitions, then fit chin/shoulder/knee/ankle landmarks with uncertainty |
| Flat palms and five fingers | R2 ends at palm blocks; old arms script uses independent rods | Grow fingers from connected palm boundary patches, validate webbing and thumb base |
| Face | `ganyu-face.js` uses sphere/discs at old y~1.05 and a separate neck disc | Keep head/neck/face skin on body mesh; deform jaw, nose and eye sockets through control landmarks; separate eye/eyelash details only |
| Hair and horns | `ganyu-hair.js` clears the work and places head near old 1.2m scale; ribbons and cone primitives | Extract reusable control curves, bind to new head frame, establish crown/bangs/side locks/long rear curls and hooked horns |
| Jersey and shorts | Existing independent shell generators belong to old scale | Refit cloth envelope outside body; design collar, sleeve cuffs, hem and crotch openings with explicit shell treatment |
| Gloves and socks | Old independent arm/leg recipes | Define material regions on connected hand/leg or explicit clothing shells, preserving hand topology |
| Soccer boots | `ganyu-shoes.js` uses stacked discs and small plates with old foot dimensions | Build measured heel/instep/forefoot shell, sole thickness, lace path and studs after foot geometry acceptance |
| GANYU / 10 graphics | `ganyu-patterns.js` uses rods and solid discs; zero is a filled disc | Build surface-conforming closed glyph contours with actual counters, verify readability and panel budget |
| Gold trim and crests | Old rods/triangles at fixed coordinates | Parameterize paths on accepted garment surface, no floating labels or arbitrary z offsets |

## Tool Gaps

Reuse `profileLoft`, shared patch extrusion and existing deterministic curve utilities, but validate their actual contracts. Current improvements cover section thickness, mirror correspondence, measured proportions, orthographic cameras and gate accuracy. Missing or unverified capabilities include robust branch transitions, palm-to-finger topology, reference overlays, garment surface sampling and surface-conforming glyphs. No `decal` implementation was found under `scripts/parts/lib` during this review; a scratch issue is not an implemented API.

Visual details are not a reason to bypass source mesh or panel candidate gates. Do not bulk import old scripts: their `gms.clear()` calls, global variables, dimensions and part composition must be separated from reusable shape data first.

## Acceptance Order

Body landmark/silhouette agreement and zero invalid intersections precede fingers and density increases. Character appearance comes next, then independent source-mesh and panelized-preview review. Export only with default gate and QA enabled, root=0.1 position/scale compensation, and no direct 10009019 GIA. Game appearance remains pending user confirmation.
