// すべてのテクスチャは canvas で手続き的に生成（外部画像アセットは使わない）
import * as THREE from 'three';

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function canvasTexture(w, h, draw, { repeat = 1, wrap = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

// 木目（白ベース → マテリアルの色で着色される）
export function woodTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = r() * h;
      const amp = 2 + r() * 7;
      const k1 = 1 + Math.floor(r() * 3);
      const k2 = 3 + Math.floor(r() * 4);
      const ph = r() * Math.PI * 2;
      const tone = 150 + Math.floor(r() * 60);
      g.strokeStyle = `rgba(${tone},${tone - 25},${tone - 55},${0.12 + r() * 0.22})`;
      g.lineWidth = 0.6 + r() * 2.4;
      g.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const a = (x / w) * Math.PI * 2;
        const yy = y + Math.sin(a * k1 + ph) * amp + Math.sin(a * k2 + ph * 2) * amp * 0.35;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    // ふし
    for (let i = 0; i < 3; i++) {
      const cx = r() * w, cy = r() * h;
      for (let k = 6; k > 0; k--) {
        g.strokeStyle = `rgba(150,110,70,${0.08 + k * 0.02})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(cx, cy, k * 5, k * 2, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
}

// チェック柄（布）
export function plaidTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const band = (pos, size, alpha) => {
      g.fillStyle = `rgba(60,40,50,${alpha})`;
      g.fillRect(pos, 0, size, h);
      g.fillRect(0, pos, w, size);
    };
    band(0, 64, 0.16);
    band(128, 64, 0.16);
    band(100, 6, 0.3);
    band(228, 6, 0.3);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(30, 0, 3, h);
    g.fillRect(0, 30, w, 3);
    g.fillRect(158, 0, 3, h);
    g.fillRect(0, 158, w, 3);
  }, { repeat: 2 });
}

// ドット柄
export function dotTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,1)';
    const dot = (x, y) => {
      g.fillStyle = 'rgba(70,40,50,0.28)';
      g.beginPath();
      g.arc(x, y, 18, 0, Math.PI * 2);
      g.fill();
    };
    for (let y = 0; y <= h; y += 128) {
      for (let x = 0; x <= w; x += 128) {
        dot(x, y);
        dot(x + 64, y + 64);
      }
    }
  }, { repeat: 2 });
}

// カッティングマット（作業台）12×12 ユニット
export function matTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#4f9c7e';
    g.fillRect(0, 0, w, h);
    const unit = w / 12;
    for (let i = 0; i <= 48; i++) {
      const p = (i * unit) / 4;
      const major = i % 4 === 0;
      g.strokeStyle = major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(p, 0); g.lineTo(p, h);
      g.moveTo(0, p); g.lineTo(w, p);
      g.stroke();
    }
    // 中心の十字と円
    g.strokeStyle = 'rgba(255,240,150,0.7)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w / 2, 0); g.lineTo(w / 2, h);
    g.moveTo(0, h / 2); g.lineTo(w, h / 2);
    g.stroke();
    g.beginPath();
    g.arc(w / 2, h / 2, unit * 2, 0, Math.PI * 2);
    g.stroke();
    // 角度ガイド
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1.5;
    for (const a of [45, 135]) {
      const rad = (a * Math.PI) / 180;
      g.beginPath();
      g.moveTo(w / 2 - Math.cos(rad) * w, h / 2 - Math.sin(rad) * w);
      g.lineTo(w / 2 + Math.cos(rad) * w, h / 2 + Math.sin(rad) * w);
      g.stroke();
    }
    // 目盛り数字
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'center';
    for (let i = 1; i < 12; i++) {
      g.fillText(String(i * 10), i * unit, 22);
      g.fillText(String(i * 10), 16, i * unit + 6);
    }
  }, { wrap: false });
}

// 床
export function floorTexture(style, color) {
  const base = new THREE.Color(color);
  const css = (c) => `#${c.getHexString()}`;
  const shade = (k) => css(base.clone().multiplyScalar(k));
  if (style === 'tile') {
    return canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = shade(1);
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w / 2, h / 2);
      g.fillRect(w / 2, h / 2, w / 2, h / 2);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, w / 2, h / 2);
      g.strokeRect(w / 2, h / 2, w / 2, h / 2);
    }, { repeat: 4 });
  }
  if (style === 'carpet') {
    return canvasTexture(256, 256, (g, w, h) => {
      const r = rng(5);
      g.fillStyle = shade(1);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.06)`;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
    }, { repeat: 3 });
  }
  // wood planks
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(3);
    const rows = 8;
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < w) {
        const len = 180 + r() * 200;
        g.fillStyle = shade(0.86 + r() * 0.2);
        g.fillRect(x, i * ph, len, ph);
        g.strokeStyle = 'rgba(80,50,30,0.12)';
        g.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          const yy = i * ph + 6 + r() * (ph - 12);
          g.beginPath();
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len * 0.3, yy + 3, x + len * 0.6, yy - 3, x + len, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(60,35,20,0.35)';
        g.fillRect(x, i * ph, 2, ph);
        x += len;
      }
      g.fillStyle = 'rgba(60,35,20,0.35)';
      g.fillRect(0, i * ph, w, 2);
    }
  }, { repeat: 2 });
}

// 壁紙
export function wallTexture(pattern, color) {
  const base = `#${new THREE.Color(color).getHexString()}`;
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    if (pattern === 'stripe') {
      g.fillStyle = 'rgba(255,255,255,0.45)';
      for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 24, h);
    } else if (pattern === 'dot') {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let y = 0; y <= h; y += 64) {
        for (let x = 0; x <= w; x += 64) {
          g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(x + 32, y + 32, 7, 0, Math.PI * 2); g.fill();
        }
      }
    } else if (pattern === 'heart') {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      const heart = (x, y, s) => {
        g.beginPath();
        g.moveTo(x, y + s * 0.3);
        g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
        g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
        g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
        g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
        g.fill();
      };
      for (let y = 0; y < h; y += 64) {
        for (let x = 0; x < w; x += 64) {
          heart(x + 16, y + 8, 18);
          heart(x + 48, y + 40, 18);
        }
      }
    }
  }, { repeat: 3 });
}
