# Fingers Phase Task Spec (after palms land)

Precondition: palm blocks exist on both wrists via extrudePatch shared boundary; body gate green (selfIntersections 0, areaRatio<=20, watertight one piece, exact mirror).

Goal: five fingers per hand grown from the palm front/bottom boundary as one connected mesh — NO rod fingers, NO independent loft merge, NO polyDomePatch.

Mechanics: use extrudePatch (or shared-boundary ring extrude) from five adjacent patch blocks along the palm front edge (front=+Z side, fingers curl forward/down). Each finger = 2-3 rings tapering to a rounded cap; thumb from the palm side block angled ~45° outward-down. Finger bases must remain vertex-shared with the palm; seamCheck onePiece and mirror exactness must hold.

Provisional dimensions (flagged provisional, verify against reference and user): total hand length ~0.175m; palm 0.095m; middle finger 0.080m; index/ring 0.072m; pinky 0.058m; finger radius ~0.0075m at base tapering to ~0.0055m; thumb 0.060m, base radius 0.009m; palm width 0.085m, thickness 0.020m.

Acceptance: body-cage tests assert 10 finger tips exist (vertex count per finger band), per-face colors, exact bilateral mirror, opposite winding shared edges, gate ok via verifyMesh (no --no-gate), plus browser orthographic front/side captures for visual review.

Follow the same local-frame/radial extrusion rules that fixed shoulders/hips; keep ring sampling uniform full circles.
