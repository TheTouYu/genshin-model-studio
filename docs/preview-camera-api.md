# Preview Camera API

The existing `gmsPreview` renderer supports `setCamera({projection, yaw, pitch, radius})` and `getCamera()`. Both local `web/draw/preview.js` and deployment `public/draw/preview.js` implement the same contract.

- `projection`: `perspective` (default) or `orthographic`. Invalid nonempty modes throw without changing the camera.
- `yaw`: azimuth around +Y in radians. Front +Z is 0; side is PI/2; back is PI.
- `pitch`: polar angle, not elevation. Use PI/2 for level front/side/back. Zero looks down from above.
- `radius`: distance to target, clamped to existing renderer limits. In orthographic mode it controls visible height as `2 * radius * tan(25 degrees)`.
- `getCamera()`: JSON-serializable projection, yaw, pitch, radius, target `[x,y,z]`, aspect. Returned arrays are copies.
- `setTarget(x,y,z)`: existing API for target position. Restore target separately from `setCamera`.

Projection switching keeps target/orbit and synchronous rendering. Drag, zoom and resize continue to use the existing renderer; no additional WebGL context is allocated. For reproducible evidence record camera state after automatic content fitting, set explicit camera values, make previewCanvas visible, capture through browser-harness, then inspect the screenshot with read_image. Orthographic projection prevents perspective size differences but does not automatically align images or prove reference similarity.

Browser verification on http://localhost:8787/?t=body-r2-camera: orthographic/perspective round trip preserves orbit and target; invalid mode rejected; visible nonblank model screenshot at `delivery/r0-toes/body-r2-ortho-front.png`. This verifies renderer behavior, not body shape acceptance.
