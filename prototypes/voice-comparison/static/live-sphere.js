/* LiveSphere：把 preview.html 的 Structural Sphere 接到真實音量。
 * Listening：麥克風音量控制內縮／外擴；Speaking：輸出音量控制大小（同 preview 的 SphereVolume.scaleFor）；
 * Thinking：旋轉＋呼吸，當作 L→S 之間的銜接。狀態切換用 smoothstep 在半徑、連桿與轉速上插值。 */
const LiveSphere = (() => {
  const G = SphereGeometry, M = SphereMotion, V = SphereVolume, P = SpherePrototype, C = G.COLORS, TAU = Math.PI * 2;
  const smooth = u => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
  const DURATION = { Thinking: 1, Speaking: 1.2, Listening: 1 };
  // 動作幅度：Listening 也慢轉、Thinking 轉快並明顯呼吸、Speaking 峰值可以超出原尺寸。
  const SPIN = { Listening: [24, -30, 36], Thinking: [5.5, -7.5, 10], Speaking: [8, -11, 16] };
  const rate = (state, layer) => 1 / SPIN[state][layer];
  const THINK = { amplitude: .09, breathSeconds: 2.2 }, LISTEN_MAX = 1.22, SPEAK_BOOST = .08;

  class View {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.engine = new M.Engine(); this.graph = this.engine.graphs.Listening; this.models = this.engine.models;
      this.out = M.createSample(this.graph); this.base = new Float64Array(this.graph.positions.length);
      this.contracted = G.listeningPose(false);
      this.mic = new V.Controller(0); this.speaker = new V.Controller(0);
      this.state = 'Listening'; this.snapshot = null; this.switchedAt = 0; this.angles = [0, 0, 0]; this.last = null;
      this.clock = new M.Clock(); this.onState = () => {};
      this.tick = this.tick.bind(this); this.resize(); addEventListener('resize', () => this.resize());
      requestAnimationFrame(this.tick);
    }
    resize() { const r = this.canvas.getBoundingClientRect(), d = devicePixelRatio || 1, s = Math.max(1, Math.round(r.width * d)); if (this.canvas.width !== s) { this.canvas.width = s; this.canvas.height = s; } }
    setPalette(p) { this.palette = p || null; }
    setMicLevel(level) { this.mic.setSpeakingVolume(level); }
    setSpeakerLevel(level) { this.speaker.setSpeakingVolume(level); }
    setState(state) {
      if (state === this.state) return;
      this.snapshot = this.current || this.target(this.state, this.clock.seconds());
      this.from = this.state; this.state = state; this.switchedAt = this.clock.seconds(); this.onState(state);
    }
    // 某個狀態在時間 t 的外形（半徑、內半徑、外圈、亮度、節點縮放）。
    target(state, t) {
      const m = this.models[state];
      if (state === 'Listening') {
        // 安靜時內縮，說話越大聲越外擴；保留一點緩慢呼吸，不讓球體停死。
        // 安靜時縮到內縮姿態並緩慢呼吸；聲音越大越往外撐，最大到原尺寸的 1.22 倍。
        const idle = 12 + 10 * Math.sin(TAU * t / 3), level = Math.max(idle, this.mic.value);
        const e = Math.min(1, level / 55), c = this.contracted, cfg = {};
        for (const k of ['glow', 'node', 'energy']) cfg[k] = c.cfg[k] + (m.cfg[k] - c.cfg[k]) * Math.min(1, e * 1.3);
        const R = c.R + (m.R * LISTEN_MAX - c.R) * e, r = c.r + (m.r * LISTEN_MAX - c.r) * e;
        return { R, r, rings: [R + 9, R + 19], cfg, pin: 1 + .15 * e };
      }
      if (state === 'Speaking') { const lv = this.speaker.value, s = V.scaleFor(lv) * (1 + SPEAK_BOOST * lv / 100), R = m.R * s; return { R, r: m.r * s, rings: [Math.max(m.R, R) + 9, Math.max(m.R, R) + 19], cfg: m.cfg, pin: s }; }
      const s = 1 + THINK.amplitude * Math.sin(TAU * t / THINK.breathSeconds);
      return { R: m.R * s, r: m.r * s, rings: [m.R + 9, m.R + 19], cfg: m.cfg, pin: s };
    }
    frame(t, dt) {
      this.mic.advance(dt); this.speaker.advance(dt);
      const goal = this.target(this.state, t), u = this.snapshot ? (t - this.switchedAt) / DURATION[this.state] : 1, mix = smooth(u);
      if (u >= 1) this.snapshot = null;
      const a = this.snapshot || goal, lerp = (x, y) => x + (y - x) * mix, cfg = {};
      for (const k of ['glow', 'node', 'energy']) cfg[k] = lerp(a.cfg[k], goal.cfg[k]);
      const cur = { R: lerp(a.R, goal.R), r: lerp(a.r, goal.r), rings: [lerp(a.rings[0], goal.rings[0]), lerp(a.rings[1], goal.rings[1])], cfg, pin: lerp(a.pin, goal.pin) };
      this.current = cur;
      for (let layer = 0; layer < 3; layer++) {
        const from = this.snapshot ? rate(this.from, layer) : rate(this.state, layer), to = rate(this.state, layer);
        this.angles[layer] += (layer === 1 ? -1 : 1) * TAU * dt * (from + (to - from) * mix);
      }
      const rho = (cur.R + cur.r) / 2, d = TAU / G.CELLS, link = Math.sqrt(cur.R * cur.R + cur.r * cur.r - 2 * cur.R * cur.r * Math.cos(d));
      const model = G.generateScissorGeometry({ rho, linkLength: link, cfg });
      for (let i = 0; i < model.joints.length; i++) { const p = model.joints[i].p, k = i * 3; this.base[k] = p.x - G.CENTER; this.base[k + 1] = p.y - G.CENTER; this.base[k + 2] = p.z; }
      const out = this.out; out.angles.set(this.angles); M.transformGraph(this.graph, out.angles, 1, out, this.base);
      out.radius = cur.R; out.innerRadius = cur.r; out.cfg = cfg; out.outerRadii[0] = cur.rings[0]; out.outerRadii[1] = cur.rings[1]; out.structureScale = cur.pin;
      return out;
    }
    draw(sample) {
      const c = this.ctx, k = this.canvas.width / 360, PAL = this.palette || C;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height); c.setTransform(k, 0, 0, k, 0, 0);
      for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(180, 180, sample.outerRadii[i], 0, TAU); c.strokeStyle = PAL.main; c.lineWidth = .9; c.globalAlpha = (this.palette ? Math.max(.45, sample.cfg.energy) : sample.cfg.energy) / (i + 1); c.stroke(); }
      for (const group of P.buckets(sample, this.graph)) {
        c.beginPath();
        for (const shape of group.items) {
          if (group.kind === 'circle') { c.moveTo(shape.x + shape.r, shape.y); c.arc(shape.x, shape.y, shape.r, 0, TAU); }
          else { shape.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); if (group.kind === 'poly') c.closePath(); }
        }
        c.globalAlpha = group.alpha; c.lineCap = 'round'; c.lineJoin = 'round';
        if (group.kind === 'circle') { c.fillStyle = PAL[group.color]; c.fill(); } else { c.strokeStyle = PAL[group.color]; c.lineWidth = group.weight; c.stroke(); }
      }
      c.globalAlpha = 1;
    }
    tick() {
      if (this.canvas.width !== Math.round(this.canvas.getBoundingClientRect().width * (devicePixelRatio || 1))) this.resize();
      const t = this.clock.seconds(), dt = this.last === null ? 0 : Math.min(.1, Math.max(0, t - this.last)); this.last = t;
      this.draw(this.frame(t, dt)); requestAnimationFrame(this.tick);
    }
  }
  return { View };
})();
