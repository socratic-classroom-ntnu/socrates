import { AudioLane, validatePack, timeline, weightsAt, safeLocalUrl, cameraPreset, placeCamera } from './runtimePack.mjs';

/**
 * GLB-native presenter for the shared tutor avatar (Socratic and CE).
 * - 上半身取景：鏡頭對準頭頸到胸口，身體保持不動。
 * - 動作只在脖子以上：頭與脖子的小幅轉動、眨眼、表情（mood）、嘴型（viseme）。
 * - 嘴型來源：音訊（play）或文字估算的時間軸（speakTimeline，配瀏覽器內建語音）。
 * 模型自帶的 clip（跑步、走路等全身動作）不播放；只有名稱含 idle／breath 的才播。
 */
export class PackPresenter {
  constructor(container) {
    this.container = container;
    this.audio = new AudioLane();
    this.frame = 0;
    this.epoch = 0;
    this.renderer = null;
    this.pack = null;
    this.morphs = [];
    this.lastWeights = {};
    this.ready = false;
    this.alive = true;
    this.speechWeights = {};
    this.mood = 'idle';
    this.speech = null;
    this.bones = {};
  }

  async load(pack) {
    validatePack(pack);
    if (!this.alive) throw Error('ACTIVE_PRESENTER_REQUIRED');
    const epoch = ++this.epoch;
    this.clearModel();
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const response = await fetch(safeLocalUrl(pack.model_url), { credentials: 'same-origin' });
    if (!response.ok) throw Error('MODEL_HTTP_' + response.status);
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((x) => x.toString(16).padStart(2, '0')).join('');
    if (digest !== pack.model_sha256) throw Error('MODEL_DIGEST_BINDING_REQUIRED');
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(bytes, new URL(pack.model_url, location.origin).href.replace(/[^/]*$/, ''));
    if (!this.alive || epoch !== this.epoch) { this.release(gltf.scene); return; }

    this.pack = pack;
    this.THREE = THREE;
    this.model = gltf.scene;
    this.scene = new THREE.Scene();
    this.scene.add(this.model);
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    this.model.position.sub(center);
    this.model.updateMatrixWorld(true);
    this.originalScale = this.model.scale.clone();

    this.bones = this.findBones(pack);
    this.lowerArms();
    this.model.updateMatrixWorld(true);

    this.camera = new THREE.PerspectiveCamera(24, 1, 0.01, 1000);
    this.frameUpperBody();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x554d70, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(2, 4, 3);
    this.scene.add(light);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.append(this.renderer.domElement);

    this.morphs = [];
    const real = new Set();
    this.model.traverse((o) => {
      if (o.morphTargetDictionary && o.morphTargetInfluences) {
        this.morphs.push(o);
        Object.keys(o.morphTargetDictionary).forEach((k) => real.add(k));
      }
    });
    for (const [v, map] of Object.entries(pack.viseme_map || {}))
      for (const key of Object.keys(map)) if (!real.has(key)) throw Error('MORPH_BINDING_REQUIRED:' + v + ':' + key);

    this.clips = gltf.animations;
    this.mixer = new THREE.AnimationMixer(this.model);
    const idle = gltf.animations.find((a) => /idle|breath/i.test(a.name));
    if (idle) this.mixer.clipAction(idle).play();
    this.clock = new THREE.Clock();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this.container);
    this.fit();
    this.ready = true;
    const render = () => {
      if (epoch !== this.epoch) return;
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.mixer?.update(dt);
      this.moveHead(this.clock.elapsedTime);
      this.apply(this.faceWeights());
      this.renderer?.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(render);
    };
    render();
    this.container.dataset.packId = pack.id;
    this.container.dataset.modelSha = digest;
    this.container.dataset.talkMode = pack.talk_mode;
  }

  findBones(pack) {
    const found = {};
    const want = { head: pack.head_bone, neck: pack.neck_bone };
    this.model.traverse((o) => {
      const name = o.name || '';
      if (want.head && name === want.head) found.head = o;
      if (want.neck && name === want.neck) found.neck = o;
      if (!found.head && /^(mixamorig:)?head$/i.test(name)) found.head = o;
      if (!found.neck && /^(mixamorig:)?neck$/i.test(name)) found.neck = o;
    });
    for (const key of ['head', 'neck']) if (found[key]) found[key + 'Rest'] = found[key].quaternion.clone();
    return found;
  }

  /** T-pose 的上臂轉成往下垂，上半身取景時肩膀才自然。只動上臂，不動其他骨頭。 */
  lowerArms() {
    const THREE = this.THREE;
    const arms = [];
    this.model.traverse((o) => {
      if (!o.isBone) return;
      const name = o.name || '';
      if (/(left|right|_l\b|_r\b|\.l\b|\.r\b).*(arm|upperarm)|(arm|upperarm).*(left|right|_l\b|_r\b)/i.test(name)
        && !/fore|lower|hand|twist/i.test(name) && o.children.some((c) => c.isBone)) arms.push(o);
    });
    let lowered = 0;
    for (const bone of arms) {
      bone.updateWorldMatrix(true, true);
      const from = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
      // 用最遠的子骨頭（手肘）定方向；扭轉骨常常和上臂起點重疊，拿它算方向會轉錯邊。
      const elbow = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const child = bone.children.filter((c) => c.isBone)
        .sort((a, b) => elbow(b).distanceTo(from) - elbow(a).distanceTo(from))[0];
      const to = elbow(child);
      if (to.distanceTo(from) < 1e-4) continue;
      const before = bone.quaternion.clone();
      const dir = to.sub(from).normalize();
      if (dir.y < -0.6) continue; // 已經是下垂姿勢
      const side = Math.sign(dir.x) || 1;
      const target = new THREE.Vector3(side * 0.22, -1, 0.05).normalize();
      const delta = new THREE.Quaternion().setFromUnitVectors(dir, target);
      const world = new THREE.Quaternion();
      bone.getWorldQuaternion(world);
      const parentWorld = new THREE.Quaternion();
      bone.parent?.getWorldQuaternion(parentWorld);
      bone.quaternion.copy(parentWorld.invert().multiply(delta.multiply(world)));
      bone.updateWorldMatrix(false, true);
      // 轉完要真的往下；骨架軸向特殊導致沒往下時還原，寧可維持原姿勢。
      const after = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld)
        .sub(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld)).normalize();
      if (after.y > -0.5) { bone.quaternion.copy(before); bone.updateWorldMatrix(false, true); continue; }
      lowered += 1;
    }
    this.container.dataset.armsLowered = String(lowered);
  }

  /** 鏡頭框住頭頂到胸口（頭長的約 2.6 倍）。 */
  frameUpperBody() {
    const THREE = this.THREE;
    const box = new THREE.Box3().setFromObject(this.model);
    const top = box.max.y;
    const head = this.bones.head;
    const headPos = head ? new THREE.Vector3().setFromMatrixPosition(head.matrixWorld) : new THREE.Vector3(0, top - (box.max.y - box.min.y) * 0.12, 0);
    const headLen = Math.max(top - headPos.y, (box.max.y - box.min.y) * 0.08);
    const bottom = headPos.y - headLen * 1.15;
    const height = top - bottom;
    const centerY = (top + bottom) / 2;
    const halfView = height * 0.62; // 上下各留約 12% 邊
    const distance = halfView / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // glTF 角色面向 +Z；鏡頭放在正前方，再套 pack 的 camera_preset。
    const preset = cameraPreset(this.pack);
    const { position, target } = placeCamera(
      { x: headPos.x, y: centerY + headLen * 0.1, z: headPos.z + distance },
      { x: headPos.x, y: centerY, z: headPos.z }, preset, halfView);
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.lookAt(target.x, target.y, target.z);
    this.container.dataset.framing = preset.framing;
    this.container.dataset.cameraZoom = String(preset.zoom);
  }

  /** 只有頭與脖子會動：緩慢的轉頭與點頭，說話時幅度稍大。 */
  moveHead(t) {
    const THREE = this.THREE;
    const { head, neck, headRest, neckRest } = this.bones;
    if (!head) return;
    const talking = this.speech ? 1.6 : 1;
    const thinking = this.mood === 'thinking' ? 1 : 0;
    const yaw = (0.06 * Math.sin(t * 0.55) + 0.02 * Math.sin(t * 1.7)) * talking;
    const pitch = (0.03 * Math.sin(t * 0.8 + 1) + (this.speech ? 0.02 * Math.sin(t * 6) : 0)) - 0.05 * thinking;
    const roll = 0.02 * Math.sin(t * 0.4 + 2) + 0.04 * thinking;
    const e = new THREE.Euler(pitch, yaw, roll);
    const q = new THREE.Quaternion().setFromEuler(e);
    head.quaternion.copy(headRest).multiply(q);
    if (neck && neckRest) {
      const half = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.4, yaw * 0.4, roll * 0.3));
      neck.quaternion.copy(neckRest).multiply(half);
    }
  }

  faceWeights() {
    const now = performance.now();
    const blinkAt = (now / 1000) % 4.1;
    const blink = blinkAt < 0.18 ? Math.sin((blinkAt / 0.18) * Math.PI) : 0;
    const face = {};
    const add = (map, scale) => { for (const [k, v] of Object.entries(map || {})) face[k] = Math.min(1, (face[k] || 0) + v * scale); };
    add(this.pack?.mood_map?.[this.mood], 1);
    for (const map of Object.values(this.pack?.expression_map || {})) add(map, blink);
    if (this.speech) {
      const elapsed = now - this.speech.start;
      if (elapsed >= this.speech.duration) this.speech = null;
      else add(weightsAt(this.pack, this.speech.frames, elapsed), 1);
    }
    add(this.speechWeights, 1);
    return face;
  }

  setMood(mood) { this.mood = mood || 'idle'; if (this.container) this.container.dataset.mood = this.mood; }

  /** 以文字估算的時間軸驅動嘴型（瀏覽器內建語音沒有音訊可分析）。startAt＝performance.now() 基準。 */
  speakTimeline(events, durationMs, startAt = performance.now()) {
    if (!this.pack) return;
    this.speech = { frames: timeline(events, durationMs), duration: durationMs, start: startAt };
  }

  /** 語音播到某個位置時重新對齊（boundary 事件）。 */
  alignSpeech(atMs) {
    if (this.speech) this.speech.start = performance.now() - atMs;
  }

  stopSpeech() { this.speech = null; }

  fit() {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  apply(weights) {
    const keys = new Set([...Object.keys(this.lastWeights), ...Object.keys(weights)]);
    for (const m of this.morphs)
      for (const key of keys) {
        const index = m.morphTargetDictionary[key];
        if (index !== undefined) m.morphTargetInfluences[index] = weights[key] || 0;
      }
    this.lastWeights = weights;
  }

  async play(buffer, events) {
    const pack = this.pack;
    let frames;
    try { frames = timeline(events, buffer.duration * 1000); this.container.dataset.timingState = 'SOURCE_TIMELINE_BOUND'; }
    catch { frames = timeline([], buffer.duration * 1000); this.container.dataset.timingState = 'AUDIO_ONLY_TIMING_RECONCILIATION'; }
    return this.audio.play(buffer, (ms, ended) => {
      if (pack?.talk_mode === 'viseme') this.speechWeights = ended ? {} : weightsAt(pack, frames, ms);
      if (pack?.talk_mode === 'audio-reactive' && this.model) {
        const index = Math.floor((ms / 1000) * buffer.sampleRate), samples = buffer.getChannelData(0);
        let sum = 0, n = 0;
        for (let i = index; i < Math.min(samples.length, index + 512); i++) { sum += samples[i] * samples[i]; n++; }
        const level = ended ? 0 : Math.min(0.08, Math.sqrt(sum / Math.max(1, n)) * 0.3);
        this.model.scale.copy(this.originalScale).multiplyScalar(1 + level);
      }
    });
  }

  playClip(name) {
    const clip = this.clips?.find((a) => a.name === name);
    if (!clip) throw Error('AUTHORED_CLIP_REQUIRED');
    this.mixer.stopAllAction();
    this.mixer.clipAction(clip).reset().play();
  }

  stop() { this.audio.stop(); this.speech = null; this.speechWeights = {}; this.apply({}); }

  release(root) {
    root?.traverse((o) => {
      o.geometry?.dispose();
      for (const material of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (material) {
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
          material.dispose();
        }
      }
    });
  }

  clearModel() {
    this.ready = false;
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.mixer?.stopAllAction();
    this.release(this.model);
    this.model = null;
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.morphs = [];
    this.lastWeights = {};
    this.speech = null;
  }

  async dispose() { this.alive = false; this.epoch++; this.clearModel(); await this.audio.dispose(); }
}
