# Appearance Phase Task Spec (queued until body gate passes)

Preconditions: body checkpoint passes `verify` (selfIntersections=0, areaRatio<=20), watertight one piece, head grown to chin y≈1.36 (front pick 257px/1.3595m, side 253px/1.3654m), knee control y≈0.515, waist half width ≈0.12–0.13, palms restored.

Target: `reference/ganyu-3view.png` soccer-uniform GANYU #10. Structure references `reference/body-wire-*.png` include clothes/hair/shoes.

Deliverables, in order:
1. Face: skin stays on the head mesh of the connected body. Deform jaw/nose/eye sockets via shared control points; only eye/eyelash details may be separate small parts. No separate face patch glued onto the head.
2. Hair + horns: separate closed shell components; crown at y≈1.6, side locks, rear curls; hooked horns at the right height. Must clear the body surface; explicit caps for watertightness, do not assume `surface` closes them.
3. Jersey + shorts: separate cloth shells offset outside the torso; collar, sleeve hems, jersey hem y≈0.883, shorts hem y≈0.722, waist cloth y≈1.000. No cloth faces inside the body cage.
4. Gloves + socks: material regions on connected hand/leg or separate shells; sock top y≈0.436; preserve shared-topology fingers.
5. Soccer boots: measured heel/instep/forefoot shell, sole thickness, lace path, studs; sole at y=0 (sole pick 1184px), toe front z≈0.043–0.050 region.
6. GANYU / 10 graphics: surface-conforming closed glyph contours with real counters; no rods/discs, no z-fighting offsets; readability check.

Evidence per feature: source mesh gate, browser multiview screenshots (orthographic front pitch=π/2, side, back, iso), read_image review, then panelize preview, then gated export. No --no-gate. GIA root=0.1 double compensation. Game acceptance needs user confirmation.

Do not reuse old ganyu-*.js scripts wholesale: they call gms.clear(), use old ~1.2m coords, and rod fingers. Extract only reusable curve/color data.
