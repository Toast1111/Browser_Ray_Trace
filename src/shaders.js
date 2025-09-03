const vertGL2 = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
out vec2 v_uv;
void main(){
  v_uv = a_uv; 
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const vertGL1 = `
precision highp float;
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main(){
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fragment body shared by GL1/GL2, using macros for output
const fragCommon = `
#ifdef GL_ES
precision highp float;
#endif

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp sampler2D;
#else
precision mediump sampler2D;
#endif

// Uniforms
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_camPos, u_camFwd, u_camRight, u_camUp;
uniform float u_fovY;
uniform int u_scene;

// Utility
float sdSphere(vec3 p, float r){ return length(p)-r; }
float sdPlane(vec3 p, vec3 n, float h){ return dot(p, normalize(n)) + h; }
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }

vec2 opU(vec2 a, vec2 b){ return (a.x<b.x)?a:b; } // distance, material id

// Scenes
vec2 mapScene0(vec3 p){
  // Floor
  vec2 d = vec2(sdPlane(p, vec3(0,1,0), 0.0), 1.0);
  // Static spheres
  d = opU(d, vec2(sdSphere(p-vec3(-1.2,1.0,0.0), 1.0), 2.0));
  d = opU(d, vec2(sdSphere(p-vec3(1.4,0.6,1.2), 0.6), 3.0));
  d = opU(d, vec2(sdSphere(p-vec3(0.0,0.5,-1.5), 0.5), 4.0));
  return d;
}

vec2 mapScene1(vec3 p){
  // Box room with one reflective sphere
  vec2 d = vec2(1e9, 0.0);
  float room = sdBox(p-vec3(0.0,1.5,0.0), vec3(4.0,2.0,4.0));
  // Inside-out room via box shell: distance to inside walls
  d = opU(d, vec2(room, 1.0));
  d = opU(d, vec2(sdSphere(p-vec3(0.5,1.0,0.0), 1.0), 5.0));
  return d;
}

vec2 mapScene2(vec3 p){
  vec2 d = vec2(sdPlane(p, vec3(0,1,0), 0.0), 1.0);
  float t = u_time;
  for (int i=0;i<6;i++){
    float fi = float(i);
    float ang = t*0.6 + fi*1.0472; // around circle
    vec3 c = vec3( cos(ang)*2.2, 0.8+0.3*sin(t*1.5+fi), sin(ang)*2.2 );
    d = opU(d, vec2(sdSphere(p - c, 0.5), 2.0 + mod(fi,3.0)));
  }
  return d;
}

vec2 map(vec3 p){
  if (u_scene==0) return mapScene0(p);
  if (u_scene==1) return mapScene1(p);
  return mapScene2(p);
}

// Normals via finite differences
vec3 calcNormal(vec3 p){
  const float h=1e-3;
  vec2 k=vec2(1.0,-1.0);
  return normalize( k.xyy*map(p+k.xyy*h).x +
                    k.yyx*map(p+k.yyx*h).x +
                    k.yxy*map(p+k.yxy*h).x +
                    k.xxx*map(p+k.xxx*h).x );
}

// Ray march
vec2 march(vec3 ro, vec3 rd){
  float t=0.0; float m=0.0;
  for (int i=0;i<128;i++){
    vec2 h = map(ro + rd*t);
    if (h.x<0.0005){ m=h.y; break; }
    t += h.x;
    if (t>80.0) break;
  }
  return vec2(t, m);
}

float softShadow(vec3 ro, vec3 rd){
  float res=1.0;
  float t=0.02;
  for (int i=0;i<48;i++){
    float h = map(ro + rd*t).x;
    res = min(res, 8.0*h/t);
    t += clamp(h, 0.01, 0.5);
    if (t>40.0) break;
  }
  return clamp(res,0.0,1.0);
}

vec3 palette(float m){
  if (m<1.5) return vec3(0.8);
  if (m<2.5) return vec3(0.9,0.2,0.2);
  if (m<3.5) return vec3(0.2,0.8,0.9);
  if (m<4.5) return vec3(0.8,0.8,0.2);
  if (m<5.5) return vec3(0.85);
  return vec3(0.7);
}

vec3 shade(vec3 ro, vec3 rd, vec3 pos, vec3 nor, float m){
  // Lighting
  vec3 ldir = normalize(vec3(0.6, 0.8, 0.3));
  float diff = max(dot(nor, ldir), 0.0);
  float sh = softShadow(pos + nor*0.01, ldir);
  vec3 hal = normalize(ldir - rd);
  float spec = pow(max(dot(nor, hal), 0.0), 64.0);
  vec3 base = palette(m);

  float amb = 0.12;
  vec3 col = base*(amb + diff*0.9*sh) + vec3(1.0)*spec*0.25*sh;

  // Cheap reflections on certain materials
  if (m>4.5){
    vec3 rdir = reflect(rd, nor);
    vec2 h = march(pos + nor*0.02, rdir);
    if (h.x<80.0){
      vec3 rpos = pos + rdir*h.x;
      vec3 rn = calcNormal(rpos);
      vec3 rcol = palette(h.y);
      float rdiff = max(dot(rn, ldir), 0.0)*softShadow(rpos+rn*0.01, ldir);
      col = mix(col, rcol*(0.1+rdiff*0.9), 0.5);
    }
  }
  return col;
}

void mainImage(out vec4 outColor, in vec2 fragCoord){
  vec2 res = u_res;
  vec2 uv = (fragCoord - 0.5*res) / res.y; // -x..x, -y..y
  float fy = u_fovY; 
  float s = tan(0.5*fy);
  vec3 rd = normalize(u_camFwd + uv.x * s * u_camRight + uv.y * s * u_camUp);
  vec3 ro = u_camPos;

  vec2 h = march(ro, rd);
  vec3 col;
  if (h.x>79.9){
    // background
    float t = 0.5*(rd.y+1.0);
    col = mix(vec3(0.08,0.10,0.14), vec3(0.05,0.07,0.12) + vec3(0.05,0.1,0.2)*t, 0.7);
  } else {
    vec3 pos = ro + rd*h.x;
    vec3 nor = calcNormal(pos);
    col = shade(ro, rd, pos, nor, h.y);
    // Grid on plane
    if (h.y<1.5){
      vec2 g = pos.xz;
      vec2 cell = abs(fract(g)-0.5);
      float line = smoothstep(0.48, 0.49, max(cell.x, cell.y));
      col = mix(col, col*0.7, line);
    }
  }
  outColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}
`;

const fragGL2 = `#version 300 es
precision highp float;
out vec4 fragColor;
${fragCommon}
void main(){
  mainImage(fragColor, gl_FragCoord.xy);
}
`;

const fragGL1 = `
precision highp float;
${fragCommon}
void main(){
  vec4 color; mainImage(color, gl_FragCoord.xy); gl_FragColor = color;
}
`;

export function getShaders(isWebGL2){
  return {
    vert: isWebGL2 ? vertGL2 : vertGL1,
    frag: isWebGL2 ? fragGL2 : fragGL1,
  };
}
