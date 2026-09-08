/*
 * Anatomy control cage: semantic landmarks -> low-poly preview mesh.
 * This layer is intentionally separate from final clothing and export meshes.
 * It gives a human-editable structural graph before any automatic elevation.
 */
(function (root) {
  'use strict';

  var DEFAULT_POINTS = {
    crown: [0, 1.60, 0], chin: [0, 1.36, 0.025], neckBase: [0, 1.28, 0],
    sternum: [0, 1.18, 0.075], waist: [0, .91, 0], pelvis: [0, .80, 0],
    shoulderL: [-.17, 1.24, 0], shoulderR: [.17, 1.24, 0],
    clavicleL: [-.075, 1.265, .055], clavicleR: [.075, 1.265, .055],
    acromionL: [-.205, 1.235, .005], acromionR: [.205, 1.235, .005],
    axillaFrontL: [-.165, 1.145, .065], axillaFrontR: [.165, 1.145, .065],
    axillaBackL: [-.165, 1.145, -.065], axillaBackR: [.165, 1.145, -.065],
    upperArmRootL: [-.19, 1.16, 0], upperArmRootR: [.19, 1.16, 0],
    elbowL: [-.245, .94, 0], elbowR: [.245, .94, 0],
    wristL: [-.265, .73, 0], wristR: [.265, .73, 0],
    hipL: [-.145, .79, 0], hipR: [.145, .79, 0],
    kneeL: [-.115, .51, 0], kneeR: [.115, .51, 0],
    ankleL: [-.085, .105, .015], ankleR: [.085, .105, .015],
    toeL: [-.085, .025, .12], toeR: [.085, .025, .12]
  };

  var EDGES = [
    ['crown','chin'],['chin','neckBase'],['neckBase','sternum'],['sternum','waist'],['waist','pelvis'],
    ['neckBase','clavicleL'],['clavicleL','acromionL'],['acromionL','upperArmRootL'],
    ['clavicleL','sternum'],['acromionL','axillaFrontL'],['axillaFrontL','upperArmRootL'],['axillaFrontL','axillaBackL'],
    ['axillaBackL','upperArmRootL'],['upperArmRootL','elbowL'],['elbowL','wristL'],
    ['neckBase','clavicleR'],['clavicleR','acromionR'],['acromionR','upperArmRootR'],
    ['clavicleR','sternum'],['acromionR','axillaFrontR'],['axillaFrontR','upperArmRootR'],['axillaFrontR','axillaBackR'],
    ['axillaBackR','upperArmRootR'],['upperArmRootR','elbowR'],['elbowR','wristR'],
    ['pelvis','hipL'],['hipL','kneeL'],['kneeL','ankleL'],['ankleL','toeL'],
    ['pelvis','hipR'],['hipR','kneeR'],['kneeR','ankleR'],['ankleR','toeR'],
    ['shoulderL','shoulderR'],['hipL','hipR'],['axillaBackL','axillaBackR'],['axillaFrontL','axillaFrontR']
  ];

  function clonePoint(p) { return [p[0], p[1], p[2]]; }
  function clonePoints(points) { var out = {}; Object.keys(points).forEach(function (k) { out[k] = clonePoint(points[k]); }); return out; }
  function add(a,b) { return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]; }
  function sub(a,b) { return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
  function mul(a,s) { return [a[0]*s,a[1]*s,a[2]*s]; }
  function lerp(a,b,t) { return add(a,mul(sub(b,a),t)); }
  function norm(a) { var l=Math.hypot(a[0],a[1],a[2])||1; return mul(a,1/l); }
  function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
  function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

  function createAnatomyControlGraph(overrides) {
    var points = clonePoints(DEFAULT_POINTS), src = overrides || {};
    Object.keys(src).forEach(function (k) { if (points[k] && Array.isArray(src[k]) && src[k].length === 3) points[k] = clonePoint(src[k]); });
    return { schemaVersion: 1, units: 'm', coordinateSystem: '+Y up +Z front', points: points, edges: EDGES.map(function (e) { return e.slice(); }), regions: {
      torso: ['neckBase','sternum','waist','pelvis'],
      shoulderL: ['clavicleL','acromionL','axillaFrontL','axillaBackL','upperArmRootL'],
      shoulderR: ['clavicleR','acromionR','axillaFrontR','axillaBackR','upperArmRootR'],
      armL: ['upperArmRootL','elbowL','wristL'], armR: ['upperArmRootR','elbowR','wristR'],
      legL: ['hipL','kneeL','ankleL','toeL'], legR: ['hipR','kneeR','ankleR','toeR']
    }};
  }

  function moveControlPoint(graph, id, deltaOrPosition) {
    if (!graph || !graph.points[id]) throw new Error('unknown anatomy control point: ' + id);
    var d = deltaOrPosition || [0,0,0];
    graph.points[id] = d.pos ? clonePoint(d.pos) : add(graph.points[id], d);
    return graph;
  }

  function controlPoint(graph, id) { if (!graph.points[id]) throw new Error('unknown anatomy control point: ' + id); return clonePoint(graph.points[id]); }

  function ring(center, axis, rx, rz, sides) {
    var up = norm(axis), ref = Math.abs(up[1]) > .9 ? [0,0,1] : [0,1,0], u = norm(cross(up, ref)), v = cross(up, u), out=[];
    for (var i=0;i<sides;i++) { var a=2*Math.PI*i/sides; out.push(add(center,add(mul(u,Math.cos(a)*rx),mul(v,Math.sin(a)*rz)))); }
    return out;
  }
  function appendTube(mesh, centers, radii, sides, color) {
    var bases=[];
    for (var i=0;i<centers.length;i++) { bases.push(mesh.vertices.length); var axis=sub(centers[Math.min(i+1,centers.length-1)],centers[Math.max(0,i-1)]); ring(centers[i],axis,radii[i][0],radii[i][1],sides).forEach(function(p){mesh.vertices.push(p);}); }
    for (var r=0;r<centers.length-1;r++) for(var j=0;j<sides;j++){var a=bases[r]+j,b=bases[r]+(j+1)%sides,c=bases[r+1]+(j+1)%sides,d=bases[r+1]+j;mesh.faces.push(a,b,c,a,c,d);mesh.colors.push(color,color);}
    function cap(base, reverse){var p=[0,0,0];for(var k=0;k<sides;k++)p=add(p,mesh.vertices[base+k]);p=mul(p,1/sides);var ci=mesh.vertices.length;mesh.vertices.push(p);for(var q=0;q<sides;q++){var x=base+q,y=base+(q+1)%sides;mesh.faces.push.apply(mesh.faces,reverse?[ci,y,x]:[ci,x,y]);mesh.colors.push(color);}}
    cap(bases[0],true); cap(bases[bases.length-1],false);
  }

  function buildAnatomyCage(graph, options) {
    graph = graph || createAnatomyControlGraph(); options=options||{};
    var sides = Math.max(4, options.sides || 8), mesh={vertices:[],faces:[],colors:[]}, p=graph.points;
    var landmark = options.preset === 'landmark';
    appendTube(mesh,landmark?[p.neckBase,p.pelvis]:[p.neckBase,p.sternum,p.waist,p.pelvis],landmark?[ [.085,.075],[.145,.09] ]:[ [.085,.075],[.18,.10],[.125,.085],[.145,.09] ],sides,'#d9d9de');
    appendTube(mesh,landmark?[p.acromionL,p.axillaFrontL,p.upperArmRootL,p.elbowL,p.wristL]:[p.clavicleL,p.acromionL,p.upperArmRootL,p.elbowL,p.wristL],landmark?[ [.075,.065],[.060,.055],[.055,.05],[.045,.042],[.035,.032] ]:[ [.065,.055],[.075,.065],[.055,.05],[.045,.042],[.035,.032] ],sides,'#f3c9a7');
    appendTube(mesh,landmark?[p.acromionR,p.axillaFrontR,p.upperArmRootR,p.elbowR,p.wristR]:[p.clavicleR,p.acromionR,p.upperArmRootR,p.elbowR,p.wristR],landmark?[ [.075,.065],[.060,.055],[.055,.05],[.045,.042],[.035,.032] ]:[ [.065,.055],[.075,.065],[.055,.05],[.045,.042],[.035,.032] ],sides,'#f3c9a7');
    appendTube(mesh,[p.hipL,p.kneeL,p.ankleL,p.toeL],[ [.09,.085],[.07,.065],[.045,.04],[.05,.08] ],sides,'#f3c9a7');
    appendTube(mesh,[p.hipR,p.kneeR,p.ankleR,p.toeR],[ [.09,.085],[.07,.065],[.045,.04],[.05,.08] ],sides,'#f3c9a7');
    var target = options.targetFaces || 300, current=mesh.faces.length/3;
    return { schemaVersion:1, stage:'control-cage', graph:graph, mesh:mesh, stats:{vertices:mesh.vertices.length,faces:current,controlPoints:Object.keys(graph.points).length,edges:graph.edges.length,targetFaces:target,withinBudget:current<=target}, density:{sides:sides,levels:0,preset:landmark?'landmark':'structural'}, provenance:{generatedFrom:'semantic anatomy control graph',algorithm:'deterministic tubes with explicit shoulder control landmarks',editableLevel:landmark?'landmark skeleton':'structural cage'}};
  }

  function cageWireframe(cage) {
    return { points:Object.keys(cage.graph.points).map(function(id){return {id:id,position:clonePoint(cage.graph.points[id])};}), edges:cage.graph.edges.map(function(e){return {from:e[0],to:e[1],a:clonePoint(cage.graph.points[e[0]]),b:clonePoint(cage.graph.points[e[1]])};}), faces:cage.mesh.faces.slice(), stats:cage.stats };
  }

  function anatomyStructureReport(graph, options) {
    graph = graph || createAnatomyControlGraph(); options = options || {};
    var p = graph.points; var width = function(a,b){ return Math.abs(p[a][0]-p[b][0]); };
    var shoulderWidth = width('acromionL','acromionR');
    var upperArmWidth = width('upperArmRootL','upperArmRootR');
    var shoulderDepth = (Math.abs(p.acromionL[2]-p.axillaBackL[2]) + Math.abs(p.acromionR[2]-p.axillaBackR[2])) / 2;
    var axillaDrop = Math.abs(p.acromionL[1] - p.axillaFrontL[1]);
    var checks = { shoulderWiderThanArm: shoulderWidth > upperArmWidth, shoulderHasDepth: shoulderDepth > 0.04, axillaHasDrop: axillaDrop > 0.04, shoulderSymmetric: Math.abs(p.acromionL[0] + p.acromionR[0]) < 1e-9 && Math.abs(p.acromionL[1]-p.acromionR[1]) < 1e-9, acromionToArmConnected: !!graph.edges.some(function(e){return e[0]==='acromionL'&&e[1]==='upperArmRootL';}) };
    return { measurements:{shoulderWidth:shoulderWidth,upperArmWidth:upperArmWidth,shoulderDepth:shoulderDepth,axillaDrop:axillaDrop}, checks:checks, pass:Object.keys(checks).every(function(k){return checks[k];}), referenceFit:false, notes:options.notes || ['Structural cage checks are not final mesh gates.'] };
  }

  root.createAnatomyControlGraph=createAnatomyControlGraph;
  root.moveAnatomyControlPoint=moveControlPoint;
  root.anatomyControlPoint=controlPoint;
  root.buildAnatomyCage=buildAnatomyCage;
  root.cageWireframe=cageWireframe;
  root.anatomyStructureReport=anatomyStructureReport;
  if (typeof module !== 'undefined') module.exports={createAnatomyControlGraph:createAnatomyControlGraph,moveAnatomyControlPoint:moveControlPoint,anatomyControlPoint:controlPoint,buildAnatomyCage:buildAnatomyCage,cageWireframe:cageWireframe,anatomyStructureReport:anatomyStructureReport};
})(typeof globalThis !== 'undefined' ? globalThis : this);
