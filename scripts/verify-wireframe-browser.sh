#!/usr/bin/env bash
set -euo pipefail
browser-harness <<'PY'
info = page_info()
assert info['url'].startswith('http://localhost:8787/'), info
result = js("""(() => {
  const p = window.gmsPreview;
  if (!p) throw new Error('Preview unavailable');
  const stats = p.getMeshStats();
  if (!stats.some(s => s.triangles > 0)) throw new Error('No mesh loaded');
  const before = JSON.stringify(p.getCamera());
  const work = localStorage.getItem('gms.draw.work.v1');
  const mode = p.getWireframe();
  for (let i=0; i<20; i++) p.setWireframe(!p.getWireframe());
  const canvas = document.querySelector('#previewCanvas, #canvas');
  const gl = canvas.getContext('webgl2');
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  const measure = enabled => {
    p.setWireframe(enabled); p.setCamera({});
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let bright = 0;
    for(let i=0;i<pixels.length;i+=4) if(pixels[i]>90 && pixels[i+1]>90 && pixels[i+2]>90) bright++;
    return bright;
  };
  const wirePixels = measure(true), solidPixels = measure(false);
  p.setWireframe(mode);
  return {stats, wirePixels, solidPixels, cameraStable:before===JSON.stringify(p.getCamera()), storageUnchanged:work===localStorage.getItem('gms.draw.work.v1'), glError:gl.getError(), buttonCount:document.querySelectorAll('#toggleWireframe').length};
})()""")
assert result['cameraStable'], result
assert result['storageUnchanged'], result
assert result['glError'] == 0, result
assert result['buttonCount'] == 1, result
assert result['wirePixels'] > 0 and result['solidPixels'] > 0, result
assert result['wirePixels'] != result['solidPixels'], result
print(result)
PY
