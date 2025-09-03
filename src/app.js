import { getShaders } from './shaders.js';

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
canvas.addEventListener('mousedown', (e)=>{ dragging=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener('mouseup', ()=> dragging=false);
window.addEventListener('mousemove', (e)=>{
  if (!dragging) return;
  const dx = (e.clientX-lastX), dy=(e.clientY-lastY);
  lastX=e.clientX; lastY=e.clientY;
  cam.yaw -= dx * 0.005;
  cam.pitch = clamp(cam.pitch - dy*0.005, -1.2, 1.2);
});
canvas.addEventListener('wheel', (e)=>{
  cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY)*0.1), 1.5, 30);
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

function render(time) {
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
