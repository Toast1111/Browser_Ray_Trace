import { getShaders, getPathTracerShaders } from './shaders.js';

const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const fpsEl = document.getElementById('fps');
const resEl = document.getElementById('res');
const glEl = document.getElementById('gl');
const scaleInput = document.getElementById('scale');
const scaleVal = document.getElementById('scale-val');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const sceneSelect = document.getElementById('scene-select');
const modeSelect = document.getElementById('mode-select');
const ptControls = document.getElementById('pt-controls');
const sppInput = document.getElementById('spp');
const sppVal = document.getElementById('spp-val');
const bouncesInput = document.getElementById('bounces');
const bouncesVal = document.getElementById('bounces-val');
const sppAccumEl = document.getElementById('spp-accum');

let gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
let isWebGL2 = true;
if (!gl) {
  gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
  isWebGL2 = false;
}
if (!gl) {
  alert('WebGL is not supported on this device/browser.');
  throw new Error('WebGL unsupported');
}

glEl.textContent = `GL: ${isWebGL2 ? 'WebGL2' : 'WebGL1'}`;

// Compile shader utility
function compile(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error(source.split('\n').map((l,i)=>`${(i+1).toString().padStart(3)}: ${l}`).join('\n'));
    throw new Error('Shader compile error: ' + log);
  }
  return s;
}

function linkProgram(vsSrc, fsSrc) {
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

// Fullscreen quad
const { vert, frag } = getShaders(isWebGL2);
const program = linkProgram(vert, frag);
const vao = gl.createVertexArray ? gl.createVertexArray() : null;
if (vao) gl.bindVertexArray(vao);
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
// 2D positions + 2D UV
const verts = new Float32Array([
  -1, -1, 0, 0,
   1, -1, 1, 0,
  -1,  1, 0, 1,
   1,  1, 1, 1,
]);
gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'a_pos');
const aUV = gl.getAttribLocation(program, 'a_uv');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(aUV);
gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);

const uTime = gl.getUniformLocation(program, 'u_time');
const uRes = gl.getUniformLocation(program, 'u_res');
const uCamPos = gl.getUniformLocation(program, 'u_camPos');
const uCamFwd = gl.getUniformLocation(program, 'u_camFwd');
const uCamRight = gl.getUniformLocation(program, 'u_camRight');
const uCamUp = gl.getUniformLocation(program, 'u_camUp');
const uFovY = gl.getUniformLocation(program, 'u_fovY');
const uScene = gl.getUniformLocation(program, 'u_scene');

// Camera state
const cam = {
  target: [0, 1, 0],
  dist: 6,
  yaw: Math.PI * 0.35,
  pitch: Math.PI * 0.20,
  fovY: 55 * Math.PI/180,
};

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function vec3(x,y,z){ return [x,y,z]; }
function add(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function mul(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function norm(a){ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }

function camVectors() {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw),   sy = Math.sin(cam.yaw);
  const fwd = norm(vec3(cy*cp, sp, sy*cp));
  const right = norm(cross(fwd, [0,1,0]));
  const up = norm(cross(right, fwd));
  const pos = sub(cam.target, mul(fwd, cam.dist));
  return { pos, fwd, right, up };
}

// Inputs
let dragging = false; let lastX=0, lastY=0; let twoFinger=false; let lastPinch=0;
canvas.addEventListener('mousedown', (e)=>{ dragging=true; lastX=e.clientX; lastY=e.clientY; resetAccum(); });
window.addEventListener('mouseup', ()=> dragging=false);
window.addEventListener('mousemove', (e)=>{
  if (!dragging) return;
  const dx = (e.clientX-lastX), dy=(e.clientY-lastY);
  lastX=e.clientX; lastY=e.clientY;
  cam.yaw -= dx * 0.005;
  cam.pitch = clamp(cam.pitch - dy*0.005, -1.2, 1.2);
  resetAccum();
});
canvas.addEventListener('wheel', (e)=>{
  cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY)*0.1), 1.5, 30);
  resetAccum();
});

canvas.addEventListener('touchstart', (e)=>{
  if (e.touches.length===1){ dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; }
  if (e.touches.length===2){ twoFinger=true; lastPinch = Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
  ); }
},{passive:true});
canvas.addEventListener('touchend', ()=>{ dragging=false; twoFinger=false; }, {passive:true});
canvas.addEventListener('touchmove', (e)=>{
  if (twoFinger && e.touches.length===2){
    const pinch = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const d = (lastPinch - pinch) / 200; // pinch out -> zoom in
    cam.dist = clamp(cam.dist * (1 + d), 1.5, 30);
    lastPinch = pinch;
  } else if (dragging && e.touches.length===1){
    const t = e.touches[0];
    const dx = (t.clientX-lastX), dy=(t.clientY-lastY);
    lastX=t.clientX; lastY=t.clientY;
    cam.yaw -= dx * 0.005;
    cam.pitch = clamp(cam.pitch - dy*0.005, -1.2, 1.2);
  }
}, {passive:true});

resetBtn.onclick = ()=>{
  cam.target = [0,1,0]; cam.dist=6; cam.yaw=Math.PI*0.35; cam.pitch=Math.PI*0.20; cam.fovY=55*Math.PI/180;
};

let paused = false;
pauseBtn.onclick = ()=>{ paused=!paused; pauseBtn.textContent = paused? 'Resume' : 'Pause'; };

// Resize / DPR
let scale = parseFloat(scaleInput.value);
scaleVal.textContent = `${scale.toFixed(2)}x`;
scaleInput.oninput = ()=>{ scale = parseFloat(scaleInput.value); scaleVal.textContent = `${scale.toFixed(2)}x`; resize(); };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
  const w = Math.max(1, Math.floor(window.innerWidth * dpr * scale));
  const h = Math.max(1, Math.floor(window.innerHeight * dpr * scale));
  canvas.width = w; canvas.height = h;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  gl.viewport(0,0,w,h);
  resEl.textContent = `Res: ${w}x${h} @${(dpr*scale).toFixed(2)}x`;
  initPTTargets(w, h);
  resetAccum();
}
window.addEventListener('resize', resize);
resize();

statusEl.textContent = 'READY';

// Render loop
let lastT = performance.now();
let acc = 0; let frames=0; let lastFpsT = lastT;
function frame(t) {
  const dt = (t - lastT) / 1000; lastT = t; acc += dt; frames++;
  if (t - lastFpsT > 500) { fpsEl.textContent = `FPS: ${(frames*1000/(t-lastFpsT)).toFixed(1)}`; frames=0; lastFpsT=t; }
  if (!paused) {
  render(t/1000);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- Path Tracing integration ----------------
let mode = 'rm';
modeSelect.value = mode;
modeSelect.onchange = ()=>{
  mode = modeSelect.value;
  ptControls.style.display = mode==='pt' ? 'flex' : 'none';
  sppAccumEl.style.display = mode==='pt' ? 'inline' : 'none';
  resetAccum();
};

let pt = null; // PT resources
let accumFrame = 0;
sppVal.textContent = sppInput.value; bouncesVal.textContent = bouncesInput.value;
sppInput.oninput = ()=>{ sppVal.textContent = sppInput.value; resetAccum(); };
bouncesInput.oninput = ()=>{ bouncesVal.textContent = bouncesInput.value; resetAccum(); };
sceneSelect.onchange = ()=> resetAccum();

function createTex(w,h, internal, format, type){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (isWebGL2){
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, type, null);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function initPTTargets(w, h){
  if (!pt){ pt = {}; }
  // extensions for float
  let type = gl.UNSIGNED_BYTE, internal = gl.RGBA, format = gl.RGBA;
  if (isWebGL2){
    // Try half-float, fallback to 8-bit
    const ext = gl.getExtension('EXT_color_buffer_float');
    if (ext) { internal = gl.RGBA16F; format = gl.RGBA; type = gl.HALF_FLOAT; }
  } else {
    const hf = gl.getExtension('OES_texture_half_float');
    const rt = gl.getExtension('WEBGL_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    if (hf && rt) type = hf.HALF_FLOAT_OES;
  }
  // Accumulation ping-pong
  pt.texA = pt.texA || createTex(w,h, internal, format, type);
  pt.texB = pt.texB || createTex(w,h, internal, format, type);
  // Reallocate if size changed
  const reinit = (tex)=>{
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (isWebGL2){ gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null); }
    else { gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, type, null); }
    gl.bindTexture(gl.TEXTURE_2D, null);
  };
  reinit(pt.texA); reinit(pt.texB);

  pt.fbo = pt.fbo || gl.createFramebuffer();
  resetAccum();
}

const ptShaders = getPathTracerShaders(isWebGL2);
const ptProgram = linkProgram(ptShaders.vert, ptShaders.frag);
const dispProgram = linkProgram(ptShaders.vert, ptShaders.display);

// PT uniforms
const PT = {
  u_res: gl.getUniformLocation(ptProgram, 'u_res'),
  u_time: gl.getUniformLocation(ptProgram, 'u_time'),
  u_scene: gl.getUniformLocation(ptProgram, 'u_scene'),
  u_bounces: gl.getUniformLocation(ptProgram, 'u_bounces'),
  u_spp: gl.getUniformLocation(ptProgram, 'u_spp'),
  u_frame: gl.getUniformLocation(ptProgram, 'u_frame'),
  u_camPos: gl.getUniformLocation(ptProgram, 'u_camPos'),
  u_camFwd: gl.getUniformLocation(ptProgram, 'u_camFwd'),
  u_camRight: gl.getUniformLocation(ptProgram, 'u_camRight'),
  u_camUp: gl.getUniformLocation(ptProgram, 'u_camUp'),
  u_fovY: gl.getUniformLocation(ptProgram, 'u_fovY'),
  u_prev: gl.getUniformLocation(ptProgram, 'u_prev'),
};

const DP = {
  u_tex: gl.getUniformLocation(dispProgram, 'u_tex'),
  u_res: gl.getUniformLocation(dispProgram, 'u_res'),
};

function resetAccum(){ accumFrame = 0; if (sppAccumEl) sppAccumEl.textContent = 'Samples: 0'; }

function renderPT(time){
  const { pos, fwd, right, up } = camVectors();
  // Render into texB reading texA, then swap
  gl.bindFramebuffer(gl.FRAMEBUFFER, pt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pt.texB, 0);
  gl.useProgram(ptProgram);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pt.texA);
  gl.uniform1i(PT.u_prev, 0);
  gl.uniform2f(PT.u_res, canvas.width, canvas.height);
  gl.uniform1f(PT.u_time, time);
  gl.uniform1i(PT.u_scene, parseInt(sceneSelect.value,10));
  gl.uniform1i(PT.u_bounces, parseInt(bouncesInput.value,10));
  gl.uniform1i(PT.u_spp, parseInt(sppInput.value,10));
  gl.uniform1i(PT.u_frame, accumFrame);
  gl.uniform3f(PT.u_camPos, pos[0], pos[1], pos[2]);
  gl.uniform3f(PT.u_camFwd, fwd[0], fwd[1], fwd[2]);
  gl.uniform3f(PT.u_camRight, right[0], right[1], right[2]);
  gl.uniform3f(PT.u_camUp, up[0], up[1], up[2]);
  gl.uniform1f(PT.u_fovY, cam.fovY);
  if (vao) gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Now display texB to default framebuffer (with sRGB-ish gamma already baked in)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(dispProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pt.texB);
  gl.uniform1i(DP.u_tex, 0);
  gl.uniform2f(DP.u_res, canvas.width, canvas.height);
  if (vao) gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Swap A/B and increment frame count
  const tmp = pt.texA; pt.texA = pt.texB; pt.texB = tmp;
  accumFrame++;
  if (sppAccumEl) sppAccumEl.textContent = `Samples: ${accumFrame*parseInt(sppInput.value,10)}`;
}

function renderRM(time){
  gl.useProgram(program);
  const { pos, fwd, right, up } = camVectors();
  gl.uniform1f(uTime, time);
  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform3f(uCamPos, pos[0], pos[1], pos[2]);
  gl.uniform3f(uCamFwd, fwd[0], fwd[1], fwd[2]);
  gl.uniform3f(uCamRight, right[0], right[1], right[2]);
  gl.uniform3f(uCamUp, up[0], up[1], up[2]);
  gl.uniform1f(uFovY, cam.fovY);
  gl.uniform1i(uScene, parseInt(sceneSelect.value,10));
  if (vao) gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function render(time){
  if (mode==='pt') renderPT(time);
  else renderRM(time);
}
