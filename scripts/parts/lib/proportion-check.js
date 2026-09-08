/* Character measurements use explicit anatomical landmarks, never fixed ratios. */
(function (root) {
  function characterProportionReport(mesh, opts) {
    opts = opts || {};
    var vertices = mesh.vertices || [], missing = [], abnormal = [];
    var windows = opts.windows || {};
    function band(name, defaults) {
      var w = windows[name] || defaults;
      var pts = vertices.filter(function (p) {
        return p[1] >= w[0] && p[1] <= w[1] && p[0] >= w[2] && p[0] <= w[3];
      });
      if (pts.length < 2) { missing.push(name); return null; }
      function span(axis) { var a = pts.map(function (p) { return p[axis]; }); return Math.max.apply(Math,a)-Math.min.apply(Math,a); }
      var zs = pts.map(function (p) { return p[2] - (opts.centerZ || 0); });
      return {w:span(0),d:span(2),length:span(1),front:Math.max.apply(Math,zs),back:Math.min.apply(Math,zs),n:pts.length};
    }
    var bands = {
      shoulder:band('shoulder',[1.25,1.31,-0.19,0.19]),
      chest:band('chest',[1.15,1.27,-0.19,0.19]),
      waist:band('waist',[0.99,1.09,-0.16,0.16]),
      hip:band('hip',[0.86,0.97,-0.18,0.18]),
      palm:windows.palm ? band('palm',windows.palm) : null,
      finger:windows.finger ? band('finger',windows.finger) : null
    };
    function ratio(a,b) { return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > 1e-9 ? a/b : null; }
    var ys = vertices.map(function (p) {return p[1];});
    var top = ys.length ? Math.max.apply(Math,ys) : null;
    var bottom = ys.length ? Math.min.apply(Math,ys) : null;
    var chin = opts.chinY;
    var ratios = {
      headBody: Number.isFinite(chin) && top > chin && chin > bottom ? ratio(top-bottom,top-chin) : null,
      shoulderWaist:ratio(bands.shoulder && bands.shoulder.w,bands.waist && bands.waist.w),
      hipWaist:ratio(bands.hip && bands.hip.w,bands.waist && bands.waist.w),
      palmFingerLen:ratio(bands.palm && bands.palm.length,bands.finger && bands.finger.length),
      fingerSpread:ratio(opts.fingerRootSpan,bands.palm && bands.palm.w),
      chestAsym:ratio(bands.chest && bands.chest.front,bands.chest && -bands.chest.back),
      hipAsym:ratio(bands.hip && -bands.hip.back,bands.hip && bands.hip.front)
    };
    Object.keys(ratios).forEach(function (name) {
      var value=ratios[name], range=(opts.targets || {})[name];
      if (value == null) missing.push(name);
      else if (range && (value < range[0] || value > range[1])) abnormal.push(name+': '+value);
    });
    return {bands:bands,ratios:ratios,missing:missing,abnormal:abnormal,complete:missing.length===0,referenceFit:false};
  }
  root.characterProportionReport = characterProportionReport;
  if (typeof module !== 'undefined') module.exports = {characterProportionReport:characterProportionReport};
})(typeof globalThis !== 'undefined' ? globalThis : this);
