// Pooled additive particle system. Particles are drawn as pre-rendered glow
// sprites, so thousands per frame are fine on a 2D canvas.
import { glowSprite, lerp } from './utils.js';

export class Particles {
  constructor(max = 5000) {
    this.max = max; this.n = 0;
    const F = () => new Float32Array(max);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.ax = F(); this.ay = F();
    this.life = F(); this.age = F(); this.size = F(); this.sizeEnd = F(); this.drag = F(); this.alpha = F();
    this.sprite = new Uint8Array(max);
    this.sprites = {
      orange: glowSprite(255, 140, 30), gold: glowSprite(255, 205, 90), white: glowSprite(220, 235, 255, 64, 0.3),
      blue: glowSprite(90, 170, 255), cyan: glowSprite(120, 230, 255), red: glowSprite(255, 60, 60),
      purple: glowSprite(170, 80, 255), green: glowSprite(80, 230, 120), ash: glowSprite(120, 105, 95, 64, 0.1),
    };
    this.names = Object.keys(this.sprites);
    this.index = Object.fromEntries(this.names.map((k, i) => [k, i]));
    this.list = this.names.map((k) => this.sprites[k]);
  }

  emit(o) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0; // pool full → recycle a random one
    this.x[i] = o.x; this.y[i] = o.y;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
    this.ax[i] = o.ax || 0; this.ay[i] = o.ay || 0;
    this.life[i] = o.life || 0.6; this.age[i] = 0;
    this.size[i] = o.size || 3; this.sizeEnd[i] = o.sizeEnd === undefined ? 0 : o.sizeEnd;
    this.drag[i] = o.drag || 0; this.alpha[i] = o.alpha === undefined ? 1 : o.alpha;
    this.sprite[i] = this.index[o.sprite || 'orange'] || 0;
  }

  clear() { this.n = 0; }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._swapRemove(i); continue; }
      this.vx[i] += this.ax[i] * dt; this.vy[i] += this.ay[i] * dt;
      const d = 1 - this.drag[i] * dt;
      this.vx[i] *= d; this.vy[i] *= d;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  _swapRemove(i) {
    const j = --this.n;
    if (i === j) return;
    for (const k of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'life', 'age', 'size', 'sizeEnd', 'drag', 'alpha', 'sprite']) this[k][i] = this[k][j];
  }

  draw(ctx) {
    if (!this.n) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i] / this.life[i];
      const a = this.alpha[i] * (1 - t) * (1 - t * 0.4);
      if (a <= 0.01) continue;
      const s = lerp(this.size[i], this.sizeEnd[i], t);
      if (s < 0.3) continue;
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.drawImage(this.list[this.sprite[i]], this.x[i] - s, this.y[i] - s, s * 2, s * 2);
    }
    ctx.restore();
  }
}
