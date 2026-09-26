import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  PART_TYPES, CATEGORIES, COLORS, FINISHES,
  createPart, partData, makeMaterial, partBaseSize, disposeObject,
} from './parts.js';
import { KITS, kitAllParts } from './kits.js';
import { matTexture, floorTexture, wallTexture } from './textures.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const DEG = Math.PI / 180;

const store = {
  get(k, def) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch { /* 容量オーバーなどは無視 */ }
  },
};

// =====================================================================
// レンダラー・シーン
// =====================================================================
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#fbeff3');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 300);
camera.position.set(5.5, 4.5, 6.5);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0.8, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance = 1.2;
orbit.maxDistance = 40;
orbit.minPolarAngle = 0;
orbit.maxPolarAngle = Math.PI; // 真下からも見られる（360°）
orbit.autoRotateSpeed = 2.2;

scene.add(new THREE.HemisphereLight('#ffffff', '#f2d4dc', 0.6));
const sun = new THREE.DirectionalLight('#fff4ea', 1.7);
sun.position.set(6, 11, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const fill = new THREE.DirectionalLight('#dfe9ff', 0.4);
fill.position.set(-6, 4, -5);
scene.add(fill);

// ---------- 作業台 ----------
const bench = new THREE.Group();
scene.add(bench);
const matTex = matTexture();
matTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const matMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95 }),
);
matMesh.rotation.x = -Math.PI / 2;
matMesh.receiveShadow = true;
bench.add(matMesh);
const benchWood = makeMaterial('#d9a877', 'wood');
const slab = new THREE.Mesh(new RoundedBoxGeometry(13.2, 0.8, 13.2, 4, 0.25), benchWood);
slab.position.y = -0.41;
slab.receiveShadow = true;
bench.add(slab);
for (const [x, z] of [[-5.8, -5.8], [5.8, -5.8], [-5.8, 5.8], [5.8, 5.8]]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 5, 24), benchWood);
  leg.position.set(x, -3.3, z);
  bench.add(leg);
}

const workGroup = new THREE.Group(); // 工作中のパーツ
scene.add(workGroup);
const slotGroup = new THREE.Group(); // キットのはめこみ位置ガイド
scene.add(slotGroup);

// ---------- お部屋ジオラマ ----------
const room = new THREE.Group();
room.visible = false;
scene.add(room);
const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), floorMat);
floorMesh.position.y = -0.1;
floorMesh.receiveShadow = true;
room.add(floorMesh);
const floorBase = new THREE.Mesh(
  new RoundedBoxGeometry(8.6, 0.5, 8.6, 3, 0.15),
  new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
);
floorBase.position.set(-0.2, -0.45, -0.2);
floorBase.receiveShadow = true;
room.add(floorBase);
const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
const trimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });

const backWall = new THREE.Group();
const bw = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4, 0.2), wallMat);
bw.position.set(-0.2, 2, -4.1);
bw.receiveShadow = true;
backWall.add(bw);
const bwTrim = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.2, 0.06), trimMat);
bwTrim.position.set(-0.2, 0.1, -3.98);
backWall.add(bwTrim);
// 窓（手続き的に作る）
const win = new THREE.Group();
const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(1.8, 1.4),
  new THREE.MeshStandardMaterial({ color: '#cfeaff', emissive: '#bfe3ff', emissiveIntensity: 0.6 }),
);
win.add(glass);
for (const [w, h, x, y] of [[2, 0.1, 0, 0.75], [2, 0.14, 0, -0.75], [0.1, 1.5, -0.95, 0], [0.1, 1.5, 0.95, 0], [0.05, 1.4, 0, 0], [1.8, 0.05, 0, 0]]) {
  const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
  f.position.set(x, y, 0.04);
  win.add(f);
}
win.position.set(1.2, 2.3, -3.995);
backWall.add(win);
room.add(backWall);

const leftWall = new THREE.Group();
const lw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8.2), wallMat);
lw.position.set(-4.1, 2, 0.1);
lw.receiveShadow = true;
leftWall.add(lw);
const lwTrim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 8.2), trimMat);
lwTrim.position.set(-3.98, 0.1, 0.1);
leftWall.add(lwTrim);
room.add(leftWall);

const roomItems = new THREE.Group();
room.add(roomItems);

// ---------- 選択表示・ギズモ ----------
const selBox = new THREE.BoxHelper(undefined, '#ff5c8a');
selBox.visible = false;
selBox.material.depthTest = false;
selBox.renderOrder = 10;
scene.add(selBox);

const tcontrols = new TransformControls(camera, renderer.domElement);
tcontrols.setSize(0.9);
scene.add(tcontrols);

// =====================================================================
// サムネイル（パーツや家具の小さな画像を作る）
// =====================================================================
const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
thumbRenderer.setSize(128, 128);
thumbRenderer.setPixelRatio(1);
thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
const thumbScene = new THREE.Scene();
thumbScene.environment = new THREE.PMREMGenerator(thumbRenderer).fromScene(new RoomEnvironment(), 0.04).texture;
thumbScene.add(new THREE.HemisphereLight('#ffffff', '#f2d4dc', 0.7));
const thumbSun = new THREE.DirectionalLight('#ffffff', 1.4);
thumbSun.position.set(3, 6, 4);
thumbScene.add(thumbSun);
const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.01, 200);

function renderThumb(obj) {
  thumbScene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sphere.radius, 0.05);
  const dist = (r / Math.sin(15 * DEG)) * 1.02;
  const dir = new THREE.Vector3(1, 0.75, 1.35).normalize();
  thumbCam.position.copy(sphere.center).addScaledVector(dir, dist);
  thumbCam.near = dist / 50;
  thumbCam.far = dist * 4;
  thumbCam.updateProjectionMatrix();
  thumbCam.lookAt(sphere.center);
  thumbRenderer.render(thumbScene, thumbCam);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  thumbScene.remove(obj);
  return url;
}

function groupFromParts(parts) {
  const g = new THREE.Group();
  for (const d of parts) g.add(createPart(d));
  return g;
}

function thumbOfParts(parts) {
  const g = groupFromParts(parts);
  const url = renderThumb(g);
  disposeObject(g);
  return url;
}

// =====================================================================
// 状態
// =====================================================================
const state = {
  mode: 'build',
  tool: null, // {kind:'part', data} | {kind:'kitpart', uid} | {kind:'furniture', fid} | {kind:'paint'}
  color: '#f4a7b9',
  finish: 'wood',
  grid: 0.1,
  snap: true,
  surfaceSnap: true,
  multi: false,
  selected: null,
  gizmo: 'translate',
  roomGizmo: 'translate',
  mute: store.get('wkk.mute', false),
  editingId: null,
  kit: null,
  stash: null,
  roomStyle: store.get('wkk.roomStyle', { floor: 'wood', floorColor: '#e8c9a0', wall: 'stripe', wallColor: '#ffe1ea' }),
};

let collection = store.get('wkk.collection', null);
const thumbCache = new Map();

// =====================================================================
// 効果音（WebAudioで合成）
// =====================================================================
let actx = null;
function sfx(kind) {
  if (state.mute) return;
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const tone = (freq, start, dur, type = 'sine', vol = 0.12, endFreq) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + start);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + start + dur);
      g.gain.setValueAtTime(vol, t + start);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(actx.destination);
      o.start(t + start);
      o.stop(t + start + dur + 0.02);
    };
    if (kind === 'place') tone(520, 0, 0.12, 'sine', 0.14, 900);
    else if (kind === 'snap') { tone(1800, 0, 0.03, 'square', 0.06); tone(1200, 0.035, 0.05, 'square', 0.05); tone(700, 0.02, 0.12, 'sine', 0.1); }
    else if (kind === 'select') tone(880, 0, 0.06, 'sine', 0.06);
    else if (kind === 'delete') tone(500, 0, 0.18, 'triangle', 0.12, 180);
    else if (kind === 'nope') tone(220, 0, 0.15, 'sawtooth', 0.05);
    else if (kind === 'paint') tone(660, 0, 0.1, 'triangle', 0.1, 990);
    else if (kind === 'step') [660, 880].forEach((f, i) => tone(f, i * 0.09, 0.14, 'triangle', 0.1));
    else if (kind === 'done') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.25, 'triangle', 0.12));
  } catch { /* 音が出なくても続行 */ }
}

// =====================================================================
// 小さなアニメーション（パチッとはまる・キラキラ・カメラ）
// =====================================================================
const anims = [];
function popIn(obj, fromOffset = null) {
  anims.push({
    obj, t0: performance.now(), dur: 320,
    base: obj.scale.clone(), to: obj.position.clone(),
    from: fromOffset ? obj.position.clone().add(fromOffset) : null,
  });
}

const sparkles = [];
function sparkle(pos, color = '#ffffff', count = 26) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(count * 3);
  const vel = [];
  for (let i = 0; i < count; i++) {
    arr.set([pos.x, pos.y, pos.z], i * 3);
    vel.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 0.5, (Math.random() - 0.5) * 3));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.09, transparent: true, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  sparkles.push({ pts, vel, t0: performance.now() });
}

let camTween = null;
function tweenCamera(toPos, toTarget, dur = 600) {
  camTween = {
    fromPos: camera.position.clone(), fromTarget: orbit.target.clone(),
    toPos: toPos.clone(), toTarget: toTarget.clone(), t0: performance.now(), dur,
  };
}

// =====================================================================
// UI ユーティリティ
// =====================================================================
let toastTimer = 0;
function toast(msg, ms = 1600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function openModal({ title, body, buttons = [] }) {
  $('#modalTitle').textContent = title;
  const b = $('#modalBody');
  b.innerHTML = '';
  if (typeof body === 'string') b.innerHTML = body;
  else if (body) b.appendChild(body);
  const bb = $('#modalButtons');
  bb.innerHTML = '';
  for (const btn of buttons) {
    const el = document.createElement('button');
    el.textContent = btn.label;
    if (btn.primary) el.className = 'primary';
    el.onclick = () => {
      const keep = btn.onClick?.();
      if (keep !== true) closeModal();
    };
    bb.appendChild(el);
  }
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
}
$('#modal').addEventListener('pointerdown', (e) => {
  if (e.target.id === 'modal') closeModal();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateHint() {
  let h = '';
  const t = state.tool;
  if (t?.kind === 'paint') h = '🖌️ パーツをクリックすると今の色でぬれるよ（Escでおしまい）';
  else if (state.mode === 'build') {
    if (t?.kind === 'part') h = 'クリックで置く ／ Shift+クリックで続けて置く ／ R:まわす T:たおす ／ Esc:やめる';
    else if (state.selected) h = 'ドラッグで動かせるよ ／ 1:移動 2:回転 3:サイズ ／ D:複製 Del:けす ／ 矢印キーで微調整';
    else h = 'パーツをえらんで作業台に置こう ／ ドラッグで360°ぐるっと見られるよ';
  } else if (state.mode === 'kit') {
    if (!state.kit) h = '左からキットをえらんでね';
    else if (t?.kind === 'kitpart') h = '光っている場所にパーツを近づけてクリック！パチッとはまるよ';
    else h = '下のランナーからパーツを切りはなしてね（クリック）';
  } else if (state.mode === 'room') {
    if (t?.kind === 'furniture') h = 'お部屋をクリックして置こう ／ Shift+クリックで続けて置く ／ R:まわす ／ Esc:やめる';
    else if (state.selected) h = 'ドラッグで動かせるよ ／ R:45°まわす ／ Del:しまう';
    else h = '左の家具をえらんでお部屋に置こう ／ ドラッグで360°まわせるよ';
  }
  $('#hint').textContent = h;
}

// =====================================================================
// パーツパレット
// =====================================================================
function buildPalette() {
  const root = $('#palette');
  root.innerHTML = '';
  for (const cat of CATEGORIES) {
    const title = document.createElement('div');
    title.className = 'cat-title';
    title.textContent = cat.name;
    root.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'parts-grid';
    for (const [type, def] of Object.entries(PART_TYPES)) {
      if (def.cat !== cat.id) continue;
      const btn = document.createElement('button');
      btn.className = 'part-btn';
      btn.dataset.type = type;
      btn.title = def.name;
      btn.innerHTML = `<img alt="" /><span>${def.name}</span>`;
      btn.onclick = () => {
        if (state.tool?.kind === 'part' && state.tool.data.type === type) setTool(null);
        else setTool({ kind: 'part', data: { type, color: state.color, finish: state.finish, rot: [0, 0, 0], scale: [1, 1, 1] } });
        closeMobilePanels();
      };
      grid.appendChild(btn);
    }
    root.appendChild(grid);
  }
  refreshPaletteThumbs();
}

let paletteTimer = 0;
function refreshPaletteThumbs() {
  clearTimeout(paletteTimer);
  paletteTimer = setTimeout(() => {
    for (const btn of $$('.part-btn')) {
      const m = createPart({ type: btn.dataset.type, color: state.color, finish: state.finish });
      btn.querySelector('img').src = renderThumb(m);
      m.material.dispose();
    }
  }, 60);
}

function refreshPaletteActive() {
  for (const btn of $$('.part-btn')) {
    btn.classList.toggle('active', state.tool?.kind === 'part' && state.tool.data.type === btn.dataset.type);
  }
  $('#btnPaint').classList.toggle('active', state.tool?.kind === 'paint');
}

// =====================================================================
// 色・しあげ
// =====================================================================
function buildPaint() {
  const sw = $('#swatches');
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c;
    b.dataset.color = c;
    b.title = c;
    b.onclick = () => chooseColor(c);
    sw.appendChild(b);
  }
  $('#customColor').addEventListener('input', (e) => chooseColor(e.target.value));
  const fin = $('#finishes');
  for (const f of FINISHES) {
    const b = document.createElement('button');
    b.dataset.finish = f.id;
    b.innerHTML = `<span>${f.icon}</span>${f.name}`;
    b.onclick = () => chooseFinish(f.id);
    fin.appendChild(b);
  }
  $('#btnPaint').onclick = () => setTool(state.tool?.kind === 'paint' ? null : { kind: 'paint' });
  refreshPaintUI();
}

function refreshPaintUI() {
  for (const b of $$('.swatch[data-color]')) b.classList.toggle('active', b.dataset.color === state.color);
  for (const b of $$('#finishes button')) b.classList.toggle('active', b.dataset.finish === state.finish);
  $('#customColor').value = state.color;
}

function paintMesh(mesh, color, finish) {
  const old = mesh.material;
  mesh.material = makeMaterial(color, finish);
  old.dispose();
  mesh.userData.part.color = color;
  mesh.userData.part.finish = finish;
}

function chooseColor(c) {
  state.color = c;
  refreshPaintUI();
  applyPaintChoice();
}
function chooseFinish(f) {
  state.finish = f;
  refreshPaintUI();
  applyPaintChoice();
}
function applyPaintChoice() {
  refreshPaletteThumbs();
  if (state.mode === 'build' && state.selected) {
    paintMesh(state.selected, state.color, state.finish);
    sfx('paint');
    pushHistory();
  }
  if (state.tool?.kind === 'part') {
    state.tool.data.color = state.color;
    state.tool.data.finish = state.finish;
    setTool(state.tool);
  }
}

// =====================================================================
// 工作データの保存・読み込み・履歴
// =====================================================================
function serializeWork() {
  return workGroup.children.map(partData);
}

function clearWork() {
  select(null);
  for (const m of [...workGroup.children]) {
    workGroup.remove(m);
    m.material.dispose();
  }
}

function loadWork(parts) {
  clearWork();
  for (const d of parts) workGroup.add(createPart(d));
}

const history = { stack: [], index: -1 };
function pushHistory() {
  if (state.mode !== 'build') return;
  const snap = JSON.stringify(serializeWork());
  if (history.stack[history.index] === snap) return;
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(snap);
  if (history.stack.length > 120) history.stack.shift();
  history.index = history.stack.length - 1;
  store.set('wkk.work', { parts: JSON.parse(snap), editingId: state.editingId });
  refreshUndo();
}
function undo() {
  if (state.mode !== 'build' || history.index <= 0) return;
  history.index--;
  loadWork(JSON.parse(history.stack[history.index]));
  store.set('wkk.work', { parts: serializeWork(), editingId: state.editingId });
  refreshUndo();
  sfx('select');
}
function redo() {
  if (state.mode !== 'build' || history.index >= history.stack.length - 1) return;
  history.index++;
  loadWork(JSON.parse(history.stack[history.index]));
  store.set('wkk.work', { parts: serializeWork(), editingId: state.editingId });
  refreshUndo();
  sfx('select');
}
function refreshUndo() {
  const on = state.mode === 'build';
  $('#btnUndo').disabled = !on || history.index <= 0;
  $('#btnRedo').disabled = !on || history.index >= history.stack.length - 1;
}

// =====================================================================
// レイキャスト・配置
// =====================================================================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setNDC(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

function raycastSurfaces(objects) {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(objects, true);
  for (const h of hits) {
    if (!h.face || isGhostPart(h.object)) continue;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.dot(raycaster.ray.direction) > 0) n.negate();
    return { point: h.point.clone(), normal: n, object: h.object };
  }
  return null;
}
function isGhostPart(o) {
  while (o) {
    if (o.userData.isGhost) return true;
    o = o.parent;
  }
  return false;
}

const snapV = (v) => (state.snap ? Math.round(v / state.grid) * state.grid : v);
const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();

// hit した面の外側に、obj のバウンディングボックスがぴったり接するように置く
function placeOnSurface(obj, hit) {
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  _box.getCenter(_c);
  _box.getSize(_s);
  const n = hit.normal;
  const ax = Math.abs(n.x) > Math.abs(n.y)
    ? (Math.abs(n.x) > Math.abs(n.z) ? 'x' : 'z')
    : (Math.abs(n.y) > Math.abs(n.z) ? 'y' : 'z');
  const sign = Math.sign(n[ax]) || 1;
  const t = hit.point.clone();
  t[ax] += (sign * _s[ax]) / 2;
  for (const k of ['x', 'y', 'z']) if (k !== ax) t[k] = snapV(t[k]);
  obj.position.copy(t).sub(_c);
  const minY = _box.min.y;
  if (obj.position.y + minY < 0) obj.position.y = -minY;
}

// ---------- ゴースト（置く前の半透明プレビュー） ----------
let ghost = null;
function clearGhost() {
  if (!ghost) return;
  scene.remove(ghost);
  disposeObject(ghost);
  ghost = null;
}
function ghostify(obj) {
  obj.traverse((o) => {
    o.userData.isGhost = true;
    if (o.isMesh) {
      o.material.transparent = true;
      o.material.opacity = 0.55;
      o.material.depthWrite = false;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  obj.userData.isGhost = true;
  obj.visible = false;
  return obj;
}

function setTool(tool) {
  clearGhost();
  state.tool = tool;
  if (tool) {
    select(null);
    if (tool.kind === 'part') {
      ghost = ghostify(createPart({ ...tool.data, pos: [0, 0, 0] }));
    } else if (tool.kind === 'kitpart') {
      ghost = ghostify(createPart({ ...kitPart(tool.uid), pos: [0, 0, 0] }));
    } else if (tool.kind === 'furniture') {
      const g = furnitureGroup(tool.fid);
      if (!g) { state.tool = null; return; }
      g.rotation.y = tool.rotY || 0;
      ghost = ghostify(g);
    }
    if (ghost) scene.add(ghost);
  }
  renderer.domElement.style.cursor = tool?.kind === 'paint' ? 'crosshair' : '';
  refreshPaletteActive();
  refreshRunner();
  refreshRoomCollectionActive();
  updateHint();
  if (ghost && lastPointer) updateGhost();
}

let lastPointer = null;
function workSurfaces() {
  return state.surfaceSnap ? [matMesh, ...workGroup.children] : [matMesh];
}
function roomSurfaces() {
  return [floorMesh, bw, lw, ...roomItems.children];
}

function updateGhost() {
  if (!ghost) return;
  const hit = raycastSurfaces(state.mode === 'room' ? roomSurfaces() : workSurfaces());
  if (!hit) {
    ghost.visible = false;
    return;
  }
  ghost.visible = true;
  placeOnSurface(ghost, hit);
  if (state.tool.kind === 'kitpart') {
    const slot = findKitSlot(ghost.position, state.tool.uid);
    ghost.userData.slot = slot;
    if (slot) {
      ghost.position.fromArray(slot.pos);
      ghost.material.emissive?.set('#3fbf6f');
      ghost.material.opacity = 0.8;
    } else {
      ghost.material.emissive?.set('#000000');
      ghost.material.opacity = 0.45;
    }
  }
}

// =====================================================================
// 選択・編集
// =====================================================================
function select(obj) {
  if (state.selected === obj) return;
  state.selected = obj;
  if (obj) {
    tcontrols.attach(obj);
    selBox.setFromObject(obj);
    selBox.visible = true;
  } else {
    tcontrols.detach();
    selBox.visible = false;
  }
  applyGizmoMode();
  updateInspector();
  updateHint();
}

function applyGizmoMode() {
  const inRoom = state.mode === 'room';
  const mode = inRoom ? state.roomGizmo : state.gizmo;
  tcontrols.setMode(mode);
  tcontrols.setTranslationSnap(state.snap ? state.grid : null);
  tcontrols.setRotationSnap(15 * DEG);
  tcontrols.setScaleSnap(state.snap ? 0.05 : null);
  tcontrols.setSpace(mode === 'translate' ? 'world' : 'local');
  const onlyY = inRoom && mode === 'rotate';
  tcontrols.showX = !onlyY;
  tcontrols.showZ = !onlyY;
  tcontrols.showY = true;
  for (const b of $$('#gizmoMode button')) b.classList.toggle('active', b.dataset.v === state.gizmo);
  for (const b of $$('#roomGizmoMode button')) b.classList.toggle('active', b.dataset.v === state.roomGizmo);
}

tcontrols.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
  if (!e.value) {
    if (state.mode === 'build') pushHistory();
    if (state.mode === 'room') saveRoom();
  }
});
tcontrols.addEventListener('objectChange', () => {
  const o = state.selected;
  if (!o) return;
  if (state.mode === 'room') {
    // 床より下にはいかない
    o.updateMatrixWorld(true);
    _box.setFromObject(o);
    if (_box.min.y < 0) o.position.y -= _box.min.y;
  }
  updateInspectorValues();
});

function updateInspector() {
  const o = state.selected;
  $('#inspector').hidden = !(o && state.mode === 'build');
  $('#roomInspector').hidden = !(o && state.mode === 'room');
  $('#rightPanel').hidden = state.mode === 'kit' || (state.mode === 'room' && !o);
  if (!o) return;
  if (state.mode === 'build') {
    $('#inspTitle').textContent = `えらんだパーツ：${PART_TYPES[o.userData.part.type].name}`;
  } else {
    const f = findFurniture(o.userData.roomItem.fid);
    $('#roomInspTitle').textContent = `えらんだ家具：${f?.name ?? ''}`;
  }
  updateInspectorValues();
}

function updateInspectorValues() {
  const o = state.selected;
  if (!o) return;
  if (state.mode === 'build') {
    const base = partBaseSize(o.userData.part.type);
    for (const k of ['x', 'y', 'z']) {
      const v = Math.abs(o.scale[k]);
      $(`#s${k}`).value = v;
      $(`#s${k}o`).textContent = `${Math.round(base[k] * v * 100) / 10}cm`;
    }
  } else {
    $('#roomScale').value = o.scale.x;
    $('#roomScaleO').textContent = `×${o.scale.x.toFixed(2)}`;
  }
}

for (const k of ['x', 'y', 'z']) {
  const input = $(`#s${k}`);
  input.addEventListener('input', () => {
    const o = state.selected;
    if (!o) return;
    const sign = Math.sign(o.scale[k]) || 1;
    o.scale[k] = sign * parseFloat(input.value);
    updateInspectorValues();
  });
  input.addEventListener('change', () => pushHistory());
}

function rotateSelected(axis, angle) {
  const o = state.selected;
  if (!o) return;
  const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  o.quaternion.premultiply(q);
  if (state.mode === 'build') pushHistory();
  else saveRoom();
  sfx('select');
}
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

function flipSelected(k) {
  const o = state.selected;
  if (!o) return;
  o.scale[k] *= -1;
  pushHistory();
  sfx('select');
}

// 下にあるもの（パーツ・作業台）にくっつける
function dropSelected() {
  const o = state.selected;
  if (!o) return;
  o.updateMatrixWorld(true);
  _box.setFromObject(o);
  const others = state.mode === 'room'
    ? [floorMesh, ...roomItems.children.filter((c) => c !== o)]
    : [matMesh, ...workGroup.children.filter((c) => c !== o)];
  let best = 0;
  const center = _box.getCenter(new THREE.Vector3());
  const probes = [
    [center.x, center.z],
    [_box.min.x + 0.02, _box.min.z + 0.02], [_box.max.x - 0.02, _box.min.z + 0.02],
    [_box.min.x + 0.02, _box.max.z - 0.02], [_box.max.x - 0.02, _box.max.z - 0.02],
  ];
  const rc = new THREE.Raycaster();
  for (const [x, z] of probes) {
    rc.set(new THREE.Vector3(x, _box.min.y + 0.001, z), new THREE.Vector3(0, -1, 0));
    const h = rc.intersectObjects(others, true)[0];
    if (h) best = Math.max(best, h.point.y);
  }
  o.position.y += best - _box.min.y;
  if (state.mode === 'build') pushHistory();
  else saveRoom();
  sfx('snap');
  popIn(o);
}

function duplicateSelected() {
  const o = state.selected;
  if (!o) return;
  if (state.mode === 'build') {
    const d = partData(o);
    const m = createPart(d);
    o.updateMatrixWorld(true);
    _box.setFromObject(o);
    m.position.x += snapV(_box.max.x - _box.min.x + state.grid);
    workGroup.add(m);
    select(m);
    popIn(m);
    pushHistory();
  } else {
    const item = addRoomItem({
      fid: o.userData.roomItem.fid,
      pos: [o.position.x + 1, o.position.y, o.position.z],
      rotY: o.rotation.y,
      scale: o.scale.x,
    });
    if (item) {
      select(item);
      popIn(item);
      saveRoom();
    }
  }
  sfx('place');
}

function deleteSelected() {
  const o = state.selected;
  if (!o) return;
  select(null);
  o.parent.remove(o);
  disposeObject(o);
  sfx('delete');
  if (state.mode === 'build') pushHistory();
  else saveRoom();
}

// 矢印キーでカメラ基準の微調整
function nudgeSelected(dx, dz, dy = 0) {
  const o = state.selected;
  if (!o) return;
  const step = state.mode === 'room' ? 0.25 : state.grid;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  if (Math.abs(fwd.x) > Math.abs(fwd.z)) fwd.set(Math.sign(fwd.x), 0, 0);
  else fwd.set(0, 0, Math.sign(fwd.z));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  o.position.addScaledVector(right, dx * step).addScaledVector(fwd, -dz * step);
  o.position.y = Math.max(o.position.y + dy * step, state.mode === 'room' ? 0 : o.position.y + dy * step);
  if (state.mode === 'build') pushHistory();
  else saveRoom();
}

// =====================================================================
// クリック処理
// =====================================================================
let downInfo = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downInfo = { x: e.clientX, y: e.clientY, button: e.button, onGizmo: tcontrols.dragging || tcontrols.axis !== null };
});
renderer.domElement.addEventListener('pointermove', (e) => {
  lastPointer = e;
  setNDC(e);
  if (ghost) updateGhost();
  else updateHover();
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const d = downInfo;
  downInfo = null;
  if (!d) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || d.onGizmo || d.button !== 0) return;
  setNDC(e);
  lastPointer = e;
  handleClick(e);
});
renderer.domElement.addEventListener('pointerleave', () => {
  if (ghost) ghost.visible = false;
  setHover(null);
});

let hovered = null;
function setHover(o) {
  if (hovered === o) return;
  if (hovered) hovered.traverse((m) => m.isMesh && m.material.emissive?.set('#000000'));
  hovered = o;
  if (hovered) hovered.traverse((m) => m.isMesh && m.material.emissive?.set('#3a1a24'));
}
function updateHover() {
  if (state.mode === 'kit') return setHover(null);
  const o = pickObject();
  setHover(o && o !== state.selected ? o : null);
}

function pickObject() {
  raycaster.setFromCamera(ndc, camera);
  if (state.mode === 'room') {
    const h = raycaster.intersectObjects(roomItems.children, true)[0];
    if (!h) return null;
    let o = h.object;
    while (o && !o.userData.roomItem) o = o.parent;
    return o;
  }
  const h = raycaster.intersectObjects(workGroup.children, false)[0];
  return h ? h.object : null;
}

function handleClick(e) {
  const keep = e.shiftKey || state.multi;
  const t = state.tool;
  if (t?.kind === 'paint') {
    if (state.mode !== 'build') return;
    const o = pickObject();
    if (o) {
      paintMesh(o, state.color, state.finish);
      setHover(null);
      sfx('paint');
      sparkle(o.getWorldPosition(new THREE.Vector3()), state.color, 14);
      pushHistory();
    }
    return;
  }
  if (t && ghost) {
    updateGhost();
    if (!ghost.visible) return;
    if (t.kind === 'part') placePart(keep);
    else if (t.kind === 'kitpart') placeKitPart();
    else if (t.kind === 'furniture') placeFurniture(keep);
    return;
  }
  if (state.mode === 'kit') return;
  const o = pickObject();
  setHover(null);
  select(o);
  if (o) sfx('select');
}

function placePart(keep) {
  const d = { ...state.tool.data };
  const m = createPart(d);
  m.position.copy(ghost.position);
  m.quaternion.copy(ghost.quaternion);
  m.scale.copy(ghost.scale);
  workGroup.add(m);
  popIn(m, new THREE.Vector3(0, 0.25, 0));
  sfx('place');
  sparkle(m.position, '#fff7b0', 16);
  pushHistory();
  if (!keep) {
    setTool(null);
    select(m);
  }
}

// =====================================================================
// 組み立てキット
// =====================================================================
function kitPart(uid) {
  return state.kit?.parts[uid];
}
const kitKey = (d) => `${d.type}|${d.scale.join(',')}|${d.rot.join(',')}`;

function startKit(kit) {
  clearWork();
  const parts = [];
  kit.steps.forEach((s, si) => s.parts.forEach((d, pi) => parts.push({ ...d, uid: parts.length, step: si, label: `${String.fromCharCode(65 + si)}${pi + 1}` })));
  state.kit = { def: kit, parts, step: 0, used: new Set(), filled: new Set() };
  $('#kitList').hidden = true;
  $('#kitGuide').hidden = false;
  $('#kitTitle').textContent = `${kit.emoji} ${kit.name}`;
  buildRunner();
  refreshKitGuide();
  refreshSlots();
  tweenCamera(new THREE.Vector3(4.2, 3.8, 5.2), new THREE.Vector3(0, 0.9, 0));
  updateHint();
  toast(`${kit.emoji} ${kit.name} をつくろう！`);
}

function quitKit() {
  state.kit = null;
  setTool(null);
  clearWork();
  slotGroup.clear();
  $('#kitList').hidden = false;
  $('#kitGuide').hidden = true;
  $('#runner').hidden = true;
  updateHint();
}

function buildKitCards() {
  const root = $('#kitCards');
  root.innerHTML = '';
  for (const kit of KITS) {
    const b = document.createElement('button');
    b.className = 'kit-card';
    const n = kitAllParts(kit).length;
    b.innerHTML = `<img alt="" src="${thumbOfParts(kitAllParts(kit))}" /><div><b>${kit.emoji} ${kit.name}</b><small>むずかしさ ${'★'.repeat(kit.level)}${'☆'.repeat(3 - kit.level)} ・ パーツ ${n}こ</small></div>`;
    b.onclick = () => {
      startKit(kit);
      closeMobilePanels();
    };
    root.appendChild(b);
  }
}

function buildRunner() {
  const k = state.kit;
  const inner = $('#runnerInner');
  inner.innerHTML = '';
  k.def.steps.forEach((s, si) => {
    const g = document.createElement('div');
    g.className = 'runner-group';
    g.dataset.step = si;
    g.dataset.label = `ステップ${si + 1}`;
    for (const d of k.parts.filter((pp) => pp.step === si)) {
      const b = document.createElement('button');
      b.className = 'runner-part';
      b.dataset.uid = d.uid;
      const m = createPart({ ...d, pos: [0, 0, 0] });
      b.innerHTML = `<img alt="" src="${renderThumb(m)}" /><span class="tag">${d.label}</span>`;
      m.material.dispose();
      b.title = `${d.label} ${PART_TYPES[d.type].name}`;
      b.onclick = () => pickRunnerPart(d.uid);
      g.appendChild(b);
    }
    inner.appendChild(g);
  });
  $('#runner').hidden = false;
  refreshRunner();
}

function refreshRunner() {
  const k = state.kit;
  if (!k) return;
  for (const g of $$('.runner-group')) g.classList.toggle('later', +g.dataset.step > k.step);
  for (const b of $$('.runner-part')) {
    const uid = +b.dataset.uid;
    const d = k.parts[uid];
    b.classList.toggle('used', k.used.has(uid));
    b.classList.toggle('picked', state.tool?.kind === 'kitpart' && state.tool.uid === uid);
    b.disabled = k.used.has(uid) || d.step !== k.step;
  }
}

function pickRunnerPart(uid) {
  const k = state.kit;
  if (!k || k.used.has(uid) || k.parts[uid].step !== k.step) return;
  if (state.tool?.kind === 'kitpart' && state.tool.uid === uid) {
    setTool(null);
    return;
  }
  sfx('snap');
  setTool({ kind: 'kitpart', uid });
  highlightSlots(k.parts[uid]);
}

function refreshKitGuide() {
  const k = state.kit;
  const ol = $('#kitSteps');
  ol.innerHTML = '';
  k.def.steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = i < k.step ? 'done' : i === k.step ? 'current' : '';
    li.innerHTML = `<span class="num">${i < k.step ? '✓' : i + 1}</span><b>${escapeHtml(s.title)}</b>${i === k.step ? `<p>${escapeHtml(s.text)}</p>` : ''}`;
    ol.appendChild(li);
  });
  $('#kitProgress').style.width = `${(k.filled.size / k.parts.length) * 100}%`;
}

// 現在のステップの「まだはまっていない場所」をガイド表示
function refreshSlots() {
  for (const c of [...slotGroup.children]) {
    slotGroup.remove(c);
    disposeObject(c);
  }
  const k = state.kit;
  if (!k) return;
  for (const d of k.parts) {
    if (d.step !== k.step || k.filled.has(d.uid)) continue;
    const m = createPart({ ...d, color: '#7fd3ff', finish: 'matte' });
    m.material.transparent = true;
    m.material.opacity = 0.28;
    m.material.depthWrite = false;
    m.material.emissive.set('#3aa8ff');
    m.material.emissiveIntensity = 0.5;
    m.castShadow = m.receiveShadow = false;
    m.userData.slotUid = d.uid;
    m.userData.isGhost = true;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(m.geometry, 30),
      new THREE.LineBasicMaterial({ color: '#2f8fe0', transparent: true, opacity: 0.8 }),
    );
    edges.userData.isGhost = true;
    m.add(edges);
    slotGroup.add(m);
  }
}

function highlightSlots(d) {
  const key = kitKey(d);
  for (const m of slotGroup.children) {
    const s = state.kit.parts[m.userData.slotUid];
    m.userData.match = kitKey(s) === key;
  }
}

function findKitSlot(pos, uid) {
  const k = state.kit;
  const key = kitKey(k.parts[uid]);
  let best = null;
  let bestD = 1.6;
  for (const d of k.parts) {
    if (d.step !== k.step || k.filled.has(d.uid) || kitKey(d) !== key) continue;
    const dist = pos.distanceTo(new THREE.Vector3().fromArray(d.pos));
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

function placeKitPart(slotArg = null, uidArg = null) {
  const k = state.kit;
  const uid = uidArg ?? state.tool.uid;
  const slot = slotArg ?? ghost?.userData.slot;
  if (!slot) {
    toast('光っている場所に近づけてね ✨', 1200);
    sfx('nope');
    return;
  }
  const card = k.parts[uid];
  const m = createPart({ ...card, pos: slot.pos, rot: slot.rot, scale: slot.scale });
  workGroup.add(m);
  popIn(m, new THREE.Vector3(0, 0.6, 0));
  k.used.add(uid);
  k.filled.add(slot.uid);
  sfx('snap');
  sparkle(m.position, '#fff7b0', 22);
  refreshSlots();
  refreshKitGuide();

  // 同じ形のパーツが残っていたら続けて持つ
  const next = k.parts.find((d) => d.step === k.step && !k.used.has(d.uid) && kitKey(d) === kitKey(card));
  const stepDone = k.parts.every((d) => d.step !== k.step || k.filled.has(d.uid));
  if (stepDone) {
    setTool(null);
    k.step++;
    if (k.step >= k.def.steps.length) {
      setTimeout(completeKit, 450);
    } else {
      sfx('step');
      toast(`ステップ${k.step} クリア！🎉`);
      refreshSlots();
      refreshKitGuide();
      refreshRunner();
    }
  } else if (next) {
    setTool({ kind: 'kitpart', uid: next.uid });
    highlightSlots(next);
  } else {
    setTool(null);
  }
  updateHint();
}

function kitAutoPlace() {
  const k = state.kit;
  if (!k) return;
  const slot = k.parts.find((d) => d.step === k.step && !k.filled.has(d.uid));
  if (!slot) return;
  const card = k.parts.find((d) => d.step === k.step && !k.used.has(d.uid) && kitKey(d) === kitKey(slot));
  placeKitPart(slot, card.uid);
}

function completeKit() {
  const k = state.kit;
  if (!k) return;
  const parts = serializeWork();
  const kitDef = k.def;
  sfx('done');
  for (let i = 0; i < 5; i++) {
    setTimeout(() => sparkle(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2), ['#ff7fa3', '#ffe08a', '#7fb6e6', '#7cc08a'][i % 4], 30), i * 120);
  }
  orbit.autoRotate = true;
  $('#vSpin').classList.add('active');
  openModal({
    title: `🎉 ${kitDef.name} 完成！`,
    body: `<p>おめでとう！プラモデルみたいに組み立てられたね。</p><p>「じゆう工作」で色をぬったり、パーツを足して改造もできるよ。</p>`,
    buttons: [
      { label: '💾 コレクションに保存', primary: true, onClick: () => finishKitToBuild(parts, kitDef, true) },
      { label: '🎨 じゆう工作で改造', onClick: () => finishKitToBuild(parts, kitDef, false) },
    ],
  });
}

function finishKitToBuild(parts, kitDef, save) {
  state.kit = null;
  slotGroup.clear();
  $('#kitList').hidden = false;
  $('#kitGuide').hidden = true;
  $('#runner').hidden = true;
  state.stash = null;
  switchMode('build', { keepWork: true, parts });
  state.editingId = null;
  if (save) {
    const item = addToCollection(kitDef.name, parts);
    state.editingId = item.id;
    toast('コレクションに保存したよ 📚');
  }
  pushHistory();
}

// =====================================================================
// コレクション（保存した家具）
// =====================================================================
function seedCollection() {
  if (collection) return;
  collection = KITS.map((k) => ({ id: `sample-${k.id}`, name: k.name, parts: kitAllParts(k), sample: true }));
  saveCollection();
}
function saveCollection() {
  store.set('wkk.collection', collection.map(({ id, name, parts, sample }) => ({ id, name, parts, sample })));
}
function findFurniture(fid) {
  return collection.find((c) => c.id === fid);
}
function furnitureThumb(f) {
  if (!thumbCache.has(f.id)) thumbCache.set(f.id, thumbOfParts(f.parts));
  return thumbCache.get(f.id);
}
function addToCollection(name, parts) {
  const item = { id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, parts };
  collection.push(item);
  saveCollection();
  buildRoomCollection();
  return item;
}
function updateCollectionItem(id, name, parts) {
  const f = findFurniture(id);
  if (!f) return null;
  f.name = name;
  f.parts = parts;
  delete f.sample;
  thumbCache.delete(id);
  saveCollection();
  buildRoomCollection();
  rebuildRoomItems();
  return f;
}

function openSaveDialog() {
  const parts = serializeWork();
  if (!parts.length) {
    toast('まだパーツがないよ 🧩');
    return;
  }
  const editing = state.editingId && findFurniture(state.editingId);
  const wrap = document.createElement('div');
  wrap.innerHTML = `<img alt="" src="${thumbOfParts(parts)}" style="width:140px;display:block;margin:0 auto 10px;background:#fff7fa;border-radius:12px" /><input type="text" maxlength="30" placeholder="家具のなまえ" />`;
  const input = wrap.querySelector('input');
  input.value = editing ? editing.name : 'わたしの家具';
  const buttons = [];
  if (editing) {
    buttons.push({
      label: '✏️ 上書き保存', primary: true,
      onClick: () => {
        updateCollectionItem(editing.id, input.value.trim() || editing.name, parts);
        toast('上書き保存したよ 📚');
      },
    });
  }
  buttons.push({
    label: editing ? '🆕 べつに保存' : '💾 保存', primary: !editing,
    onClick: () => {
      const item = addToCollection(input.value.trim() || 'わたしの家具', parts);
      state.editingId = item.id;
      store.set('wkk.work', { parts, editingId: state.editingId });
      toast('コレクションに保存したよ 📚');
      sfx('done');
    },
  });
  buttons.push({ label: 'キャンセル' });
  openModal({ title: '💾 コレクションに保存', body: wrap, buttons });
  setTimeout(() => input.select(), 50);
}

function openCollection() {
  const grid = document.createElement('div');
  grid.className = 'coll-grid';
  if (!collection.length) grid.innerHTML = '<p class="note">まだ保存した家具がないよ。</p>';
  for (const f of collection) {
    const card = document.createElement('div');
    card.className = 'coll-card';
    card.innerHTML = `<img alt="" src="${furnitureThumb(f)}" /><div>${escapeHtml(f.name)}</div><div class="btnrow"><button data-a="edit">🛠 へんしゅう</button><button data-a="del">🗑</button></div>`;
    card.querySelector('[data-a=edit]').onclick = () => {
      closeModal();
      if (state.mode !== 'build') switchMode('build');
      loadWork(f.parts);
      state.editingId = f.id;
      pushHistory();
      fitView();
      toast(`「${f.name}」を作業台にだしたよ`);
    };
    card.querySelector('[data-a=del]').onclick = () => {
      const btn = card.querySelector('[data-a=del]');
      if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.textContent = 'ほんとに？';
        return;
      }
      collection = collection.filter((c) => c !== f);
      thumbCache.delete(f.id);
      saveCollection();
      if (state.editingId === f.id) state.editingId = null;
      for (const it of [...roomItems.children]) {
        if (it.userData.roomItem.fid === f.id) {
          roomItems.remove(it);
          disposeObject(it);
        }
      }
      saveRoom();
      buildRoomCollection();
      card.remove();
    };
    grid.appendChild(card);
  }
  openModal({ title: '📚 家具コレクション', body: grid, buttons: [{ label: 'とじる' }] });
}

// =====================================================================
// お部屋ジオラマ
// =====================================================================
function furnitureGroup(fid) {
  const f = findFurniture(fid);
  if (!f) return null;
  const inner = groupFromParts(f.parts);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z); // 原点 = 底面の中心
  const g = new THREE.Group();
  g.add(inner);
  g.userData.roomItem = { fid };
  return g;
}

function addRoomItem({ fid, pos, rotY = 0, scale = 1 }) {
  const g = furnitureGroup(fid);
  if (!g) return null;
  g.position.fromArray(pos);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  roomItems.add(g);
  return g;
}

function saveRoom() {
  store.set('wkk.room', roomItems.children.map((g) => ({
    fid: g.userData.roomItem.fid,
    pos: g.position.toArray().map((v) => Math.round(v * 1000) / 1000),
    rotY: Math.round(g.rotation.y * 10000) / 10000,
    scale: Math.round(g.scale.x * 100) / 100,
  })));
}

function loadRoom() {
  let items = store.get('wkk.room', null);
  if (!items) items = defaultRoom();
  for (const it of items) addRoomItem(it);
}

function defaultRoom() {
  const has = (id) => collection.some((c) => c.id === id);
  const items = [];
  const push = (fid, pos, rotY = 0, scale = 1) => has(fid) && items.push({ fid, pos, rotY, scale });
  push('sample-cozyBed', [-2.6, 0, -2.4]);
  push('sample-nightstand', [-1.05, 0, -3.45]);
  push('sample-ribbonLamp', [-1.05, 1.35, -3.45], 0, 0.7);
  push('sample-bookshelf', [2.9, 0, -3.5]);
  push('sample-roundTable', [1.0, 0, 0.9]);
  push('sample-heartChair', [1.0, 0, 2.4], Math.PI);
  push('sample-heartChair', [-0.6, 0, 0.9], Math.PI / 2);
  return items;
}

function rebuildRoomItems() {
  const data = roomItems.children.map((g) => ({ fid: g.userData.roomItem.fid, pos: g.position.toArray(), rotY: g.rotation.y, scale: g.scale.x }));
  if (state.mode === 'room') select(null);
  for (const g of [...roomItems.children]) {
    roomItems.remove(g);
    disposeObject(g);
  }
  for (const it of data) addRoomItem(it);
}

function buildRoomCollection() {
  const root = $('#roomCollection');
  root.innerHTML = '';
  for (const f of collection) {
    const b = document.createElement('button');
    b.className = 'coll-item';
    b.dataset.fid = f.id;
    b.innerHTML = `<img alt="" src="${furnitureThumb(f)}" /><span>${escapeHtml(f.name)}</span>`;
    b.onclick = () => {
      if (state.tool?.kind === 'furniture' && state.tool.fid === f.id) setTool(null);
      else setTool({ kind: 'furniture', fid: f.id, rotY: 0 });
      closeMobilePanels();
    };
    root.appendChild(b);
  }
  refreshRoomCollectionActive();
}
function refreshRoomCollectionActive() {
  for (const b of $$('.coll-item')) b.classList.toggle('active', state.tool?.kind === 'furniture' && state.tool.fid === b.dataset.fid);
}

function placeFurniture(keep) {
  const t = state.tool;
  const item = addRoomItem({ fid: t.fid, pos: ghost.position.toArray(), rotY: ghost.rotation.y });
  if (!item) return;
  popIn(item, new THREE.Vector3(0, 0.5, 0));
  sfx('snap');
  sparkle(item.position.clone().add(new THREE.Vector3(0, 0.5, 0)), '#fff7b0', 20);
  saveRoom();
  if (!keep) {
    setTool(null);
    select(item);
  }
}

function applyRoomStyle() {
  const s = state.roomStyle;
  floorMat.map?.dispose();
  floorMat.map = floorTexture(s.floor, s.floorColor);
  floorMat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  floorMat.needsUpdate = true;
  wallMat.map?.dispose();
  wallMat.map = wallTexture(s.wall, s.wallColor);
  wallMat.needsUpdate = true;
  for (const b of $$('#floorStyle button')) b.classList.toggle('active', b.dataset.v === s.floor);
  for (const b of $$('#wallPattern button')) b.classList.toggle('active', b.dataset.v === s.wall);
  for (const b of $$('#floorColors .swatch')) b.classList.toggle('active', b.dataset.c === s.floorColor);
  for (const b of $$('#wallColors .swatch')) b.classList.toggle('active', b.dataset.c === s.wallColor);
  store.set('wkk.roomStyle', s);
}

function buildRoomStyleUI() {
  const floorColors = ['#e8c9a0', '#c69c6d', '#8a5a3b', '#f3ece2', '#ffd1dc', '#c9ecb4', '#bfe6f2', '#d9c8f0'];
  const wallColors = ['#ffe1ea', '#fff6c9', '#e3f4d8', '#dcefff', '#ece3fa', '#ffffff', '#f3ece2', '#ffd6b8'];
  const mk = (root, colors, key) => {
    for (const c of colors) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c;
      b.dataset.c = c;
      b.onclick = () => {
        state.roomStyle[key] = c;
        applyRoomStyle();
      };
      root.appendChild(b);
    }
  };
  mk($('#floorColors'), floorColors, 'floorColor');
  mk($('#wallColors'), wallColors, 'wallColor');
  for (const b of $$('#floorStyle button')) b.onclick = () => { state.roomStyle.floor = b.dataset.v; applyRoomStyle(); };
  for (const b of $$('#wallPattern button')) b.onclick = () => { state.roomStyle.wall = b.dataset.v; applyRoomStyle(); };
  applyRoomStyle();
}

// =====================================================================
// モード切り替え
// =====================================================================
const camMemory = {
  build: { pos: new THREE.Vector3(5.5, 4.5, 6.5), target: new THREE.Vector3(0, 0.8, 0) },
  kit: { pos: new THREE.Vector3(5.5, 4.5, 6.5), target: new THREE.Vector3(0, 0.8, 0) },
  room: { pos: new THREE.Vector3(9.5, 8.5, 11), target: new THREE.Vector3(0, 1, 0) },
};

function switchMode(mode, opts = {}) {
  if (mode === state.mode && !opts.force) return;
  const prev = state.mode;
  camMemory[prev] = { pos: camera.position.clone(), target: orbit.target.clone() };
  setTool(null);
  select(null);

  // 出るとき
  if (prev === 'kit' && state.kit) {
    state.kit = null;
    slotGroup.clear();
    $('#kitList').hidden = false;
    $('#kitGuide').hidden = true;
    $('#runner').hidden = true;
  }
  if (prev === 'build' && mode === 'kit') {
    state.stash = serializeWork();
    clearWork();
  }
  if (prev === 'kit' && mode !== 'kit') {
    if (opts.keepWork) loadWork(opts.parts);
    else if (state.stash) loadWork(state.stash);
    state.stash = null;
  }
  if (prev === 'room' && mode === 'kit') {
    state.stash = serializeWork();
    clearWork();
  }

  state.mode = mode;
  for (const b of $$('#modeTabs button')) b.classList.toggle('active', b.dataset.mode === mode);
  for (const s of $$('[data-show]')) s.hidden = s.dataset.show !== mode;
  $('#runner').hidden = !(mode === 'kit' && state.kit);
  $('#paintSection').hidden = mode !== 'build';
  const inRoom = mode === 'room';
  room.visible = inRoom;
  bench.visible = !inRoom;
  workGroup.visible = !inRoom;
  slotGroup.visible = mode === 'kit';
  $('#rightPanel').hidden = mode === 'kit';
  const cm = camMemory[mode];
  tweenCamera(cm.pos, cm.target, 500);
  if (inRoom) buildRoomCollection();
  refreshUndo();
  updateInspector();
  updateHint();
}

// =====================================================================
// 視点操作
// =====================================================================
function rotateView(deg) {
  const off = camera.position.clone().sub(orbit.target).applyAxisAngle(AX.y, deg * DEG);
  tweenCamera(orbit.target.clone().add(off), orbit.target, 400);
}
function viewPreset(kind) {
  const off = camera.position.clone().sub(orbit.target);
  const dist = off.length();
  const flat = new THREE.Vector3(off.x, 0, off.z);
  if (flat.lengthSq() < 1e-4) flat.set(0, 0, 1);
  flat.normalize();
  let dir;
  if (kind === 'top') dir = flat.clone().multiplyScalar(0.02).add(new THREE.Vector3(0, 1, 0));
  else if (kind === 'front') dir = new THREE.Vector3(0, 0.15, 1);
  else dir = flat.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, -0.8, 0)); // うらから
  tweenCamera(orbit.target.clone().add(dir.normalize().multiplyScalar(dist)), orbit.target, 600);
}
function zoom(k) {
  const off = camera.position.clone().sub(orbit.target).multiplyScalar(k);
  const len = THREE.MathUtils.clamp(off.length(), orbit.minDistance, orbit.maxDistance);
  off.setLength(len);
  tweenCamera(orbit.target.clone().add(off), orbit.target, 300);
}
function fitView() {
  const group = state.mode === 'room' ? room : workGroup;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) {
    const cm = state.mode === 'room' ? camMemory.room : { pos: new THREE.Vector3(5.5, 4.5, 6.5), target: new THREE.Vector3(0, 0.8, 0) };
    tweenCamera(cm.pos, cm.target);
    return;
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = Math.max(sphere.radius / Math.sin((camera.fov / 2) * DEG) * 1.1, 2.5);
  const dir = camera.position.clone().sub(orbit.target).normalize();
  tweenCamera(sphere.center.clone().addScaledVector(dir, dist), sphere.center);
}

function takePhoto() {
  const hidden = [selBox, tcontrols, slotGroup, ghost].filter((o) => o && o.visible);
  hidden.forEach((o) => (o.visible = false));
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  hidden.forEach((o) => (o.visible = true));
  sfx('snap');
  openModal({
    title: '📷 パシャ！',
    body: `<img alt="とった写真" src="${url}" style="width:100%;border-radius:12px;display:block" /><p class="note">画像を長おし（右クリック）すると保存できるよ。</p>`,
    buttons: [{ label: 'とじる', primary: true }],
  });
}

function showHelp() {
  openModal({
    title: '❓ あそびかた',
    body: `
      <b>🛠️ じゆう工作</b>
      <ul>
        <li>左の「パーツ」をえらんで、作業台をクリックすると置けるよ。パーツの上や横にもくっつくよ。</li>
        <li><b>Shift+クリック</b>で同じパーツを続けて置けるよ。置く前に <b>R</b> でまわす、<b>T</b> でたおす。</li>
        <li>置いたパーツをクリックすると、矢印で動かしたり（<b>1</b>）、まわしたり（<b>2</b>）、のばしたり・ちぢめたり（<b>3</b>）できるよ。</li>
        <li>右のパネルで色と仕上げ（木目・つやつや・メタル・チェック…）を選べるよ。🖌️ぬりぬりモードでポンポンぬれる！</li>
        <li><b>D</b>で複製、<b>Delete</b>でけす、<b>Ctrl+Z</b>で元に戻す。</li>
      </ul>
      <b>📦 組み立てキット</b>
      <ul>
        <li>プラモデルみたいに、ランナーからパーツを切りはなして、光っている場所にはめこもう。</li>
        <li>完成したらコレクションに保存したり、じゆう工作で色をぬって改造もできるよ。</li>
      </ul>
      <b>🏠 お部屋ジオラマ</b>
      <ul>
        <li>作った家具を小さなお部屋にならべよう。家具の上や壁にもかざれるよ。</li>
      </ul>
      <b>🔄 360°ぐるっと見る</b>
      <ul>
        <li>左ドラッグでぐるっと回転、右ドラッグ（2本指）で移動、ホイール（ピンチ）でズーム。</li>
        <li>右下のボタンで「うらから見る」「くるくる回転台」もできるよ。</li>
      </ul>`,
    buttons: [{ label: 'わかった！', primary: true }],
  });
}

// =====================================================================
// キーボード
// =====================================================================
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (!$('#modal').hidden) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && k === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (ctrl) return;

  if (k === 'escape') {
    if (state.tool) setTool(null);
    else select(null);
    return;
  }
  const t = state.tool;
  if (t && ghost && (k === 'r' || k === 't')) {
    if (t.kind === 'part') {
      const q = new THREE.Quaternion().setFromAxisAngle(k === 'r' ? AX.y : AX.x, (e.shiftKey ? -90 : 90) * DEG);
      ghost.quaternion.premultiply(q);
      const eu = new THREE.Euler().setFromQuaternion(ghost.quaternion);
      t.data.rot = [eu.x, eu.y, eu.z];
    } else if (t.kind === 'furniture' && k === 'r') {
      t.rotY = (t.rotY || 0) + (e.shiftKey ? -45 : 45) * DEG;
      ghost.rotation.y = t.rotY;
    }
    updateGhost();
    return;
  }
  const o = state.selected;
  if (!o) return;
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelected(); }
  else if (k === 'd') duplicateSelected();
  else if (k === 'r') rotateSelected(AX.y, (state.mode === 'room' ? 45 : 90) * DEG * (e.shiftKey ? -1 : 1));
  else if (k === 't' && state.mode === 'build') rotateSelected(AX.x, 90 * DEG);
  else if (k === '1') setGizmo('translate');
  else if (k === '2') setGizmo('rotate');
  else if (k === '3' && state.mode === 'build') setGizmo('scale');
  else if (k === 'arrowleft') { e.preventDefault(); nudgeSelected(-1, 0); }
  else if (k === 'arrowright') { e.preventDefault(); nudgeSelected(1, 0); }
  else if (k === 'arrowup') { e.preventDefault(); nudgeSelected(0, 1); }
  else if (k === 'arrowdown') { e.preventDefault(); nudgeSelected(0, -1); }
  else if (k === 'pageup') { e.preventDefault(); nudgeSelected(0, 0, 1); }
  else if (k === 'pagedown') { e.preventDefault(); nudgeSelected(0, 0, -1); }
});

function setGizmo(mode) {
  if (state.mode === 'room') state.roomGizmo = mode;
  else state.gizmo = mode;
  applyGizmoMode();
}

// =====================================================================
// ボタンの配線
// =====================================================================
function closeMobilePanels() {
  $('#leftPanel').classList.remove('open');
  $('#rightPanel').classList.remove('open');
}

function wireUI() {
  for (const b of $$('#modeTabs button')) b.onclick = () => switchMode(b.dataset.mode);
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnCollection').onclick = openCollection;
  $('#btnPhoto').onclick = takePhoto;
  $('#btnHelp').onclick = showHelp;
  const soundIcon = () => ($('#btnSound').textContent = state.mute ? '🔇' : '🔊');
  soundIcon();
  $('#btnSound').onclick = () => {
    state.mute = !state.mute;
    store.set('wkk.mute', state.mute);
    soundIcon();
  };

  $('#gridSize').onchange = (e) => { state.grid = parseFloat(e.target.value); applyGizmoMode(); };
  $('#optSnap').onchange = (e) => { state.snap = e.target.checked; applyGizmoMode(); };
  $('#optSurface').onchange = (e) => { state.surfaceSnap = e.target.checked; };
  $('#optMulti').onchange = (e) => { state.multi = e.target.checked; };
  $('#btnSave').onclick = openSaveDialog;
  $('#btnClear').onclick = () => {
    if (!workGroup.children.length) return;
    openModal({
      title: '🧹 ぜんぶ片付けますか？',
      body: '<p class="note">作業台のパーツをぜんぶしまいます。（↶で元に戻せるよ）</p>',
      buttons: [
        { label: '片付ける', primary: true, onClick: () => { clearWork(); state.editingId = null; pushHistory(); sfx('delete'); } },
        { label: 'やめる' },
      ],
    });
  };

  for (const b of $$('#gizmoMode button')) b.onclick = () => setGizmo(b.dataset.v);
  for (const b of $$('#roomGizmoMode button')) b.onclick = () => setGizmo(b.dataset.v);
  $('#rotY').onclick = () => rotateSelected(AX.y, 90 * DEG);
  $('#rotX').onclick = () => rotateSelected(AX.x, 90 * DEG);
  $('#rotZ').onclick = () => rotateSelected(AX.z, 90 * DEG);
  $('#flipX').onclick = () => flipSelected('x');
  $('#flipY').onclick = () => flipSelected('y');
  $('#dropDown').onclick = dropSelected;
  $('#btnDup').onclick = duplicateSelected;
  $('#btnDel').onclick = deleteSelected;

  $('#roomScale').addEventListener('input', (e) => {
    const o = state.selected;
    if (!o) return;
    o.scale.setScalar(parseFloat(e.target.value));
    updateInspectorValues();
  });
  $('#roomScale').addEventListener('change', saveRoom);
  $('#roomRotL').onclick = () => rotateSelected(AX.y, 45 * DEG);
  $('#roomRotR').onclick = () => rotateSelected(AX.y, -45 * DEG);
  $('#roomDrop').onclick = dropSelected;
  $('#roomDup').onclick = duplicateSelected;
  $('#roomDel').onclick = deleteSelected;
  $('#btnRoomClear').onclick = () => {
    openModal({
      title: '🧹 お部屋を片付けますか？',
      body: '<p class="note">お部屋の家具をぜんぶしまいます。（コレクションは消えないよ）</p>',
      buttons: [
        {
          label: '片付ける', primary: true,
          onClick: () => {
            select(null);
            for (const g of [...roomItems.children]) { roomItems.remove(g); disposeObject(g); }
            saveRoom();
            sfx('delete');
          },
        },
        { label: 'やめる' },
      ],
    });
  };

  $('#btnKitAuto').onclick = kitAutoPlace;
  $('#btnKitQuit').onclick = quitKit;

  $('#vLeft').onclick = () => rotateView(-45);
  $('#vRight').onclick = () => rotateView(45);
  $('#vTop').onclick = () => viewPreset('top');
  $('#vFront').onclick = () => viewPreset('front');
  $('#vUnder').onclick = () => viewPreset('under');
  $('#vSpin').onclick = () => {
    orbit.autoRotate = !orbit.autoRotate;
    $('#vSpin').classList.toggle('active', orbit.autoRotate);
  };
  $('#vIn').onclick = () => zoom(0.75);
  $('#vOut').onclick = () => zoom(1.33);
  $('#vFit').onclick = fitView;

  $('#toggleLeft').onclick = () => {
    $('#rightPanel').classList.remove('open');
    $('#leftPanel').classList.toggle('open');
  };
  $('#toggleRight').onclick = () => {
    $('#leftPanel').classList.remove('open');
    $('#rightPanel').classList.toggle('open');
  };
}

// =====================================================================
// ループ
// =====================================================================
function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05);

  if (camTween) {
    const t = Math.min((now - camTween.t0) / camTween.dur, 1);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
    orbit.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
    if (t >= 1) camTween = null;
  }
  orbit.update();

  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    const t = Math.min((now - a.t0) / a.dur, 1);
    const s = 1 + 0.18 * Math.sin(t * Math.PI) * (1 - t);
    a.obj.scale.copy(a.base).multiplyScalar(s);
    if (a.from) {
      const e = 1 - Math.pow(1 - Math.min(t * 1.6, 1), 3);
      a.obj.position.lerpVectors(a.from, a.to, e);
    }
    if (t >= 1) {
      a.obj.scale.copy(a.base);
      if (a.from) a.obj.position.copy(a.to);
      anims.splice(i, 1);
    }
  }

  for (let i = sparkles.length - 1; i >= 0; i--) {
    const sp = sparkles[i];
    const age = (now - sp.t0) / 1000;
    const pos = sp.pts.geometry.attributes.position;
    for (let k = 0; k < sp.vel.length; k++) {
      sp.vel[k].y -= 6 * dt;
      pos.setXYZ(k, pos.getX(k) + sp.vel[k].x * dt, pos.getY(k) + sp.vel[k].y * dt, pos.getZ(k) + sp.vel[k].z * dt);
    }
    pos.needsUpdate = true;
    sp.pts.material.opacity = Math.max(0, 1 - age / 0.8);
    if (age > 0.8) {
      scene.remove(sp.pts);
      sp.pts.geometry.dispose();
      sp.pts.material.dispose();
      sparkles.splice(i, 1);
    }
  }

  // キットのガイドをふわふわ光らせる
  if (slotGroup.visible && slotGroup.children.length) {
    const pulse = 0.2 + 0.15 * (Math.sin(now / 250) + 1);
    const holding = state.tool?.kind === 'kitpart';
    for (const m of slotGroup.children) {
      const strong = holding && m.userData.match;
      m.material.opacity = strong ? pulse + 0.2 : holding ? 0.1 : pulse;
    }
  }

  // ジオラマ：カメラ側の壁はかくして中を見やすく
  if (room.visible) {
    backWall.visible = camera.position.z > -4;
    leftWall.visible = camera.position.x > -4;
  }

  if (state.selected) selBox.setFromObject(state.selected);
  renderer.render(scene, camera);
}

// =====================================================================
// はじめる
// =====================================================================
function init() {
  seedCollection();
  wireUI();
  buildPalette();
  buildPaint();
  buildKitCards();
  buildRoomStyleUI();
  loadRoom();
  saveRoom();

  const saved = store.get('wkk.work', null);
  if (saved?.parts?.length) {
    loadWork(saved.parts);
    state.editingId = saved.editingId ?? null;
  }
  pushHistory();

  switchMode('build', { force: true });
  resize();
  animate();
  $('#loading').classList.add('hide');
  if (!store.get('wkk.visited', false)) {
    store.set('wkk.visited', true);
    showHelp();
  }
}

init();
