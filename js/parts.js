// パーツ（プリミティブ形状）とマテリアルの定義。すべてコードで生成する。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTexture, plaidTexture, dotTexture } from './textures.js';

// ---------- 形状 ----------
function extrude(shape, depth, bevel = true) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 24,
  });
}

// 幅(x)が target になるように均等スケール
function fitWidth(geo, target) {
  geo.computeBoundingBox();
  const w = geo.boundingBox.max.x - geo.boundingBox.min.x;
  const k = target / w;
  geo.scale(k, k, k);
  return geo;
}

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.3, -0.05, 0.5, -0.25, 0.5);
  s.bezierCurveTo(-0.55, 0.5, -0.55, 0.15, -0.55, 0.15);
  s.bezierCurveTo(-0.55, -0.05, -0.35, -0.27, 0, -0.45);
  s.bezierCurveTo(0.35, -0.27, 0.55, -0.05, 0.55, 0.15);
  s.bezierCurveTo(0.55, 0.15, 0.55, 0.5, 0.25, 0.5);
  s.bezierCurveTo(0.1, 0.5, 0, 0.3, 0, 0.25);
  return fitWidth(extrude(s, 0.1), 1);
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.22;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return fitWidth(extrude(s, 0.1), 1);
}

function wedgeGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5);
  s.lineTo(0.5, -0.5);
  s.lineTo(-0.5, 0.5);
  s.closePath();
  return extrude(s, 1, false);
}

function archGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.absarc(0, 0, 0.5, 0, Math.PI, false);
  return extrude(s, 1, false);
}

function halfSphereGeometry() {
  const dome = new THREE.SphereGeometry(0.5, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const cap = new THREE.CircleGeometry(0.5, 40);
  cap.rotateX(Math.PI / 2);
  return mergeGeometries([dome, cap]);
}

function handleGeometry() {
  const g = new THREE.TorusGeometry(0.15, 0.035, 12, 28, Math.PI);
  g.rotateX(Math.PI / 2); // 手前(+z)にアーチが出るように
  return g;
}

export const PART_TYPES = {
  plank:      { name: 'いた',       cat: 'wood',  geo: () => new THREE.BoxGeometry(2, 0.15, 1) },
  thinBoard:  { name: 'うすいた',   cat: 'wood',  geo: () => new THREE.BoxGeometry(2, 0.05, 2) },
  beam:       { name: 'かくざい',   cat: 'wood',  geo: () => new THREE.BoxGeometry(0.2, 2, 0.2) },
  box:        { name: 'はこ',       cat: 'wood',  geo: () => new THREE.BoxGeometry(1, 1, 1) },
  roundBox:   { name: 'まるはこ',   cat: 'wood',  geo: () => new RoundedBoxGeometry(1, 1, 1, 4, 0.12) },
  leg:        { name: 'まるあし',   cat: 'leg',   geo: () => new THREE.CylinderGeometry(0.1, 0.1, 1.5, 24) },
  taperLeg:   { name: 'ほそあし',   cat: 'leg',   geo: () => new THREE.CylinderGeometry(0.12, 0.06, 1.5, 24) },
  pipe:       { name: 'パイプ',     cat: 'leg',   geo: () => new THREE.CylinderGeometry(0.04, 0.04, 2, 16) },
  cylinder:   { name: 'えんちゅう', cat: 'leg',   geo: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 40) },
  capsule:    { name: 'カプセル',   cat: 'leg',   geo: () => new THREE.CapsuleGeometry(0.2, 0.6, 8, 20) },
  disk:       { name: 'まるいた',   cat: 'shape', geo: () => new THREE.CylinderGeometry(1, 1, 0.12, 56) },
  sphere:     { name: 'たま',       cat: 'shape', geo: () => new THREE.SphereGeometry(0.5, 40, 24) },
  halfSphere: { name: 'はんきゅう', cat: 'shape', geo: halfSphereGeometry },
  cone:       { name: 'さんかくすい', cat: 'shape', geo: () => new THREE.ConeGeometry(0.5, 1, 40) },
  wedge:      { name: 'さんかく',   cat: 'shape', geo: wedgeGeometry },
  arch:       { name: 'かまぼこ',   cat: 'shape', geo: archGeometry },
  cushion:    { name: 'クッション', cat: 'deco',  geo: () => new RoundedBoxGeometry(1.2, 0.3, 1.2, 5, 0.14) },
  shade:      { name: 'ランプシェード', cat: 'deco', geo: () => new THREE.CylinderGeometry(0.35, 0.6, 0.8, 40, 1, true) },
  heart:      { name: 'ハート',     cat: 'deco',  geo: heartGeometry },
  star:       { name: 'ほし',       cat: 'deco',  geo: starGeometry },
  handle:     { name: 'とって',     cat: 'deco',  geo: handleGeometry },
  knob:       { name: 'つまみ',     cat: 'deco',  geo: () => new THREE.SphereGeometry(0.08, 20, 12) },
  ring:       { name: 'わっか',     cat: 'deco',  geo: () => new THREE.TorusGeometry(0.4, 0.08, 16, 48) },
};

export const CATEGORIES = [
  { id: 'wood', name: '板・木材' },
  { id: 'leg', name: '脚・ぼう' },
  { id: 'shape', name: 'いろんな形' },
  { id: 'deco', name: 'かざり' },
];

const geoCache = {};
export function getGeometry(type) {
  if (!geoCache[type]) {
    const g = PART_TYPES[type].geo();
    g.center();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geoCache[type] = g;
  }
  return geoCache[type];
}

// スケール1のときの大きさ
export function partBaseSize(type) {
  const bb = getGeometry(type).boundingBox;
  return bb.getSize(new THREE.Vector3());
}

// ---------- 色と仕上げ ----------
export const COLORS = [
  '#ffffff', '#f3ece2', '#e8c9a0', '#c69c6d', '#a47148', '#6b4423',
  '#ffd1dc', '#f4a7b9', '#ff7fa3', '#e63958', '#ffb86b', '#ffe08a',
  '#fff6c9', '#c9ecb4', '#7cc08a', '#3f8f6b', '#bfe6f2', '#7fb6e6',
  '#3d5a80', '#d9c8f0', '#9a82cf', '#9aa0a6', '#555555', '#222222',
];

export const FINISHES = [
  { id: 'wood', name: '木目', icon: '🪵' },
  { id: 'matte', name: 'マット', icon: '🎨' },
  { id: 'gloss', name: 'つやつや', icon: '✨' },
  { id: 'metal', name: 'メタル', icon: '🔩' },
  { id: 'fabric', name: 'チェック', icon: '🧣' },
  { id: 'dots', name: 'ドット', icon: '🫧' },
  { id: 'glass', name: 'ガラス', icon: '💎' },
];

const texCache = {};
function tex(name) {
  if (!texCache[name]) {
    texCache[name] = { wood: woodTexture, fabric: plaidTexture, dots: dotTexture }[name]();
  }
  return texCache[name];
}

export function makeMaterial(color, finish) {
  const base = { color: new THREE.Color(color), side: THREE.DoubleSide };
  switch (finish) {
    case 'wood':
      return new THREE.MeshStandardMaterial({ ...base, map: tex('wood'), roughness: 0.7 });
    case 'gloss':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'metal':
      return new THREE.MeshStandardMaterial({ ...base, metalness: 0.85, roughness: 0.28 });
    case 'fabric':
      return new THREE.MeshStandardMaterial({ ...base, map: tex('fabric'), roughness: 1 });
    case 'dots':
      return new THREE.MeshStandardMaterial({ ...base, map: tex('dots'), roughness: 0.8 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        ...base, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false,
      });
    default:
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.85 });
  }
}

// パーツデータ → メッシュ
// d = { type, color, finish, pos:[x,y,z], rot:[x,y,z], scale:[x,y,z] }
export function createPart(d) {
  const m = new THREE.Mesh(getGeometry(d.type), makeMaterial(d.color, d.finish));
  m.userData.part = { type: d.type, color: d.color, finish: d.finish };
  if (d.pos) m.position.fromArray(d.pos);
  if (d.rot) m.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
  if (d.scale) m.scale.fromArray(d.scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
export function partData(m) {
  const u = m.userData.part;
  return {
    type: u.type,
    color: u.color,
    finish: u.finish,
    pos: m.position.toArray().map(r3),
    rot: [m.rotation.x, m.rotation.y, m.rotation.z].map((v) => Math.round(v * 10000) / 10000),
    scale: m.scale.toArray().map(r3),
  };
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.isMesh && o.material) o.material.dispose();
  });
}
