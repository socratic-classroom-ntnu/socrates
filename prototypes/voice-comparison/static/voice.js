/* Voice：三方案（Google 串接／OpenAI Realtime／Gemini Live）共用同一套麥克風、球體與量測。
 * 首字延遲一律用同一把尺：你停止說話（本機偵測）或按送出 → 輸出端第一次出現聲音。 */
(() => {
  const $ = s => document.querySelector(s);
  const LABEL = { Listening: '聆聽中', Thinking: '思考中', Speaking: '說話中' };
  const VAD = { on: 34, off: 20, bargeIn: 62, hangMs: 650, preRollMs: 300 };
  const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  const ui = { plan: store.get('voice.plan', 'cascade'), models: {}, status: null, busy: false, gate: store.get('voice.gemini.gate', '0') === '1' };
  const sphere = new LiveSphere.View($('#sphere'));
  sphere.onState = s => { $('#state-label').textContent = session ? LABEL[s] : '待機'; demoStatus(); };

  // ---------- 小工具 ----------
  async function api(path, body) {
    const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const d = data.detail || {}; const e = new Error(explain(d)); e.data = d; throw e; }
    return data;
  }
  function explain(d) {
    if (typeof d === 'string') return d;
    if (d.reason === 'CREDENTIAL_MISSING') return '這個方案的金鑰還沒輸入：' + d.missing.map(n => ({ openai: 'OpenAI', gemini: 'Gemini', google: 'Google Cloud 語音' })[n]).join('、') + '（全螢幕 dev 的金鑰列）';
    if (d.reason === 'BUDGET_EXHAUSTED') return `已用完 US$${ui.status?.budget_usd ?? 20} 預算，停止開新對話。`;
    if (d.reason) return `${d.reason}${d.status ? ' · HTTP ' + d.status : ''}${d.detail ? ' · ' + String(d.detail).slice(0, 160) : ''}`;
    return '請求失敗';
  }
  const notice = t => { $('#notice').textContent = t || ''; const dn = $('#demo-notice'); if (dn) dn.textContent = t || ''; };
  const money = v => '$' + (v || 0).toFixed(v >= 1 ? 2 : 4);
  const secs = ms => ms == null ? '—' : (ms / 1000).toFixed(2) + ' 秒';
  const events = [];
  function trace(kind, data) { events.push({ t: Math.round(performance.now()), kind, data }); if (events.length > 300) events.shift(); }
  function log(who, text, meta) {
    const li = document.createElement('li'); li.dataset.who = who; li.textContent = text;
    if (meta) { const s = document.createElement('small'); s.textContent = meta; li.append(s); }
    $('#log').append(li); li.scrollIntoView({ block: 'end' }); return li;
  }
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(str) { const s = atob(str), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

  // ---------- 方案卡（右上角） ----------
  async function refresh() {
    try { ui.status = await api('/api/status'); } catch (e) { notice('讀不到狀態：' + e.message); return; }
    const s = ui.status, over = s.spent_usd >= s.budget_usd;
    $('#budget').textContent = `已用 ${money(s.spent_usd)} / $${s.budget_usd}（本機估算）`; $('#budget').dataset.over = String(over);
    renderPlans(); renderKeys();
  }
  function renderPlans() {
    const box = $('#plans'), s = ui.status; if (!s) return;
    const meta = { cascade: ['Google 串接', 'STT → Gemini → TTS'], openai: ['OpenAI Realtime', '語音進語音出'], gemini: ['Gemini Live', '語音進語音出'] };
    box.replaceChildren();
    for (const plan of ['cascade', 'openai', 'gemini']) {
      const p = s.plans[plan], model = ui.models[plan] || store.get('voice.model.' + plan, p.models[0]);
      ui.models[plan] = p.models.includes(model) ? model : p.models[0];
      const card = document.createElement('div'); card.className = 'plan'; card.setAttribute('role', 'radio'); card.tabIndex = 0;
      card.setAttribute('aria-checked', String(ui.plan === plan));
      card.innerHTML = `<b></b><small></small><span class="chip"></span><select aria-label="模型"></select>
        <div class="nums"><span>已用<strong data-k="spent"></strong></span><span>平均首字<strong data-k="lat"></strong></span></div>`;
      card.querySelector('b').textContent = meta[plan][0]; card.querySelector('small').textContent = meta[plan][1];
      const chip = card.querySelector('.chip'); chip.dataset.ready = String(p.ready); chip.textContent = p.ready ? '金鑰已設定' : '缺金鑰';
      const sel = card.querySelector('select');
      for (const m of p.models) { const o = document.createElement('option'); o.value = o.textContent = m; sel.append(o); }
      sel.value = ui.models[plan]; sel.disabled = !!session;
      sel.onchange = () => { ui.models[plan] = sel.value; store.set('voice.model.' + plan, sel.value); };
      sel.onclick = e => e.stopPropagation();
      if (plan === 'gemini') {
        // 先檢查再開口：學生說完先跑鐵則檢查（Cloud STT＋screen_input），抓到就附提醒，檢查完才讓模型回答。
        const mode = document.createElement('select'); mode.setAttribute('aria-label', 'Gemini 回答方式');
        for (const [v, t] of [['0', '自動回答'], ['1', '先檢查再開口']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; mode.append(o); }
        mode.value = ui.gate ? '1' : '0'; mode.disabled = !!session;
        mode.onchange = () => { ui.gate = mode.value === '1'; store.set('voice.gemini.gate', mode.value); };
        mode.onclick = e => e.stopPropagation(); sel.after(mode);
      }
      card.querySelector('[data-k=spent]').textContent = money(p.spent_usd);
      card.querySelector('[data-k=lat]').textContent = p.avg_latency_ms == null ? '—' : (p.avg_latency_ms / 1000).toFixed(2) + 's';
      card.title = `${p.turns} 次量測`;
      const choose = () => { if (session) { notice('先結束目前的語音對話，再切換方案。'); return; } ui.plan = plan; store.set('voice.plan', plan); renderPlans(); };
      card.onclick = choose; card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
      box.append(card);
    }
    $('#tm-plan').textContent = `Voice · ${meta[ui.plan][0]} · ${ui.models[ui.plan]}`;
  }

  // ---------- 音訊：麥克風、輸出、VAD ----------
  const audio = { ctx: null, stream: null, worklet: null, outAnalyser: null, outGain: null, queueEnd: 0, sources: [] };
  let session = null, speaking = false, quietSince = 0, preRoll = [], awaiting = null, outQuietSince = 0, lastOutLoud = false;

  function level(samples) { let sum = 0; for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]; const db = 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-9); return Math.max(0, Math.min(100, (db + 58) / 40 * 100)); }
  function to16k(f32, rate) {
    const ratio = rate / 16000, n = Math.floor(f32.length / ratio), out = new Int16Array(n);
    for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.min(f32.length, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b; j++) s += f32[j]; const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a))); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
    return out;
  }
  function unlockAudio() {
    // 必須在使用者點擊的同一個同步階段建立／resume，否則 Chrome 會把 AudioContext 留在 suspended：收不到麥克風、也放不出聲音。
    if (!audio.ctx) audio.ctx = new AudioContext();
    if (audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
  }
  async function ensureAudio() {
    unlockAudio();
    if (audio.stream) { if (audio.ctx.state !== 'running') await audio.ctx.resume(); return; }
    try {
      audio.stream = await openMic();
    } catch (e) {
      // 沒有麥克風權限時改用打字模式：給 WebRTC 一條靜音音軌，其他流程照常。
      audio.stream = audio.ctx.createMediaStreamDestination().stream; audio.textOnly = true;
      notice('麥克風無法使用（' + e.message + '），改用打字模式；網址列左邊可重新允許麥克風。'); trace('mic-error', e.message);
    }
    const ctx = audio.ctx; if (ctx.state !== 'running') await ctx.resume();
    await ctx.audioWorklet.addModule('/static/pcm-worklet.js');
    audio.src = ctx.createMediaStreamSource(audio.stream);
    audio.worklet = new AudioWorkletNode(ctx, 'pcm-capture'); audio.src.connect(audio.worklet);
    // 接一條 0 音量的線到輸出，確保各家 Chromium 都會實際跑 worklet。
    const sink = ctx.createGain(); sink.gain.value = 0; audio.worklet.connect(sink); sink.connect(ctx.destination);
    audio.worklet.port.onmessage = e => onMic(e.data);
    audio.outAnalyser = ctx.createAnalyser(); audio.outAnalyser.fftSize = 1024;
    audio.outGain = ctx.createGain(); audio.outGain.connect(audio.outAnalyser); audio.outAnalyser.connect(ctx.destination);
    setInterval(watchOutput, 30);
  }
  // ---------- 麥克風裝置：選擇、靜音偵測、切換 ----------
  function micConstraints() { const id = store.get('voice.mic', ''); return { audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }; }
  async function openMic() {
    let st;
    try { st = await navigator.mediaDevices.getUserMedia(micConstraints()); }
    catch (e) { if (e.name !== 'OverconstrainedError' && e.name !== 'NotFoundError') throw e; store.set('voice.mic', ''); st = await navigator.mediaDevices.getUserMedia(micConstraints()); }
    watchTrack(st.getAudioTracks()[0]); listMics(st).catch(() => {}); return st;
  }
  async function listMics(st) {
    const sel = $('#mic-device'); if (!sel) return;
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const cur = (st || audio.stream)?.getAudioTracks()[0]?.getSettings().deviceId || store.get('voice.mic', '');
    sel.replaceChildren(...devs.map((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `麥克風 ${i + 1}`; return o; }));
    if (cur && devs.some(d => d.deviceId === cur)) sel.value = cur;
  }
  let silentTimer = 0, micPeak = 0;
  function watchTrack(track) {
    trace('mic-track', { label: track.label, muted: track.muted, state: track.readyState, settings: track.getSettings() });
    track.onmute = () => { trace('mic-mute', track.label); notice(`麥克風「${track.label}」被系統靜音了（muted），換一個輸入裝置或解除靜音。`); };
    track.onunmute = () => notice('');
    micPeak = 0; clearTimeout(silentTimer);
    silentTimer = setTimeout(() => {
      trace('mic-peak-4s', Math.round(micPeak));
      if (micPeak < 12) notice(`已拿到麥克風「${track.label || '未知裝置'}」，但 4 秒內收到的都是靜音。請在球體下方換輸入裝置；若每個都一樣，到 Windows 設定 → 隱私權與安全性 → 麥克風，打開「讓桌面應用程式存取您的麥克風」，並確認這顆麥克風在 Windows 音效設定裡沒有被靜音、音量不是 0。`);
    }, 4000);
  }
  async function switchMic(id) {
    store.set('voice.mic', id);
    if (!audio.stream || audio.textOnly || !audio.ctx) return;
    const old = audio.stream; old.getTracks().forEach(t => t.stop());
    audio.stream = await openMic();
    audio.src?.disconnect(); audio.src = audio.ctx.createMediaStreamSource(audio.stream); audio.src.connect(audio.worklet);
    const track = audio.stream.getAudioTracks()[0];
    const sender = session?.pc?.getSenders().find(x => x.track?.kind === 'audio' || x.track === null);
    if (sender) await sender.replaceTrack(track);
    notice(''); trace('mic-switch', track.label);
  }

  function onMic(f32) {
    if (!session) { const lv0 = level(f32); showMic(lv0); sphere.setMicLevel(lv0 * .5); return; }
    const lv = level(f32), pcm = to16k(f32, audio.ctx.sampleRate), now = performance.now(); showMic(lv);
    sphere.setMicLevel(session.muted ? 0 : lv);
    const threshold = lastOutLoud ? VAD.bargeIn : VAD.on;
    if (!speaking && lv >= threshold) { speaking = true; quietSince = 0; onSpeechStart(); }
    if (speaking) { if (lv < VAD.off) { quietSince ||= now; if (now - quietSince > VAD.hangMs) { speaking = false; onSpeechEnd(); } } else quietSince = 0; }
    session.onPcm?.(pcm, speaking);
    preRoll.push(pcm); while (preRoll.length > VAD.preRollMs / 40) preRoll.shift();
  }
  let micShown = 0;
  function showMic(lv) { micPeak = Math.max(micPeak, lv); if (lv >= 20 && $('#notice').textContent.includes('靜音')) notice(''); const now = performance.now(); if (now - micShown < 120) return; micShown = now; const bars = Math.round(lv / 10); $('#mic-meter').textContent = '麥克風 ' + '▮'.repeat(bars) + '▯'.repeat(10 - bars); }
  function onSpeechStart() {
    if (lastOutLoud) session.bargeIn?.();
    awaiting = null; sphere.setState('Listening'); session.onSpeechStart?.(preRoll.slice());
  }
  function onSpeechEnd() { markAwaiting('voice'); session.onSpeechEnd?.(); }
  function markAwaiting(kind) { awaiting = { at: performance.now(), kind }; sphere.setState('Thinking'); }
  function watchOutput() {
    if (!audio.outAnalyser) return;
    const buf = new Float32Array(audio.outAnalyser.fftSize); audio.outAnalyser.getFloatTimeDomainData(buf);
    let lv = level(buf); if (session?.remoteAnalyser) { const b2 = new Float32Array(session.remoteAnalyser.fftSize); session.remoteAnalyser.getFloatTimeDomainData(b2); lv = Math.max(lv, level(b2)); }
    const loud = lv > 12, now = performance.now();
    sphere.setSpeakerLevel(lv);
    if (loud) {
      outQuietSince = 0; lastOutLoud = true;
      if (awaiting && session) { const ms = now - awaiting.at; awaiting = null; session.firstAudio?.(ms); $('#turn-latency').textContent = '本回合首字延遲 ' + secs(ms); }
      if (session) sphere.setState('Speaking');
    } else if (lastOutLoud) {
      outQuietSince ||= now;
      if (now - outQuietSince > 600 && audio.ctx.currentTime >= audio.queueEnd - .05) { lastOutLoud = false; if (session && !awaiting) sphere.setState('Listening'); }
    }
  }
  function playPcm16(bytes, rate) {
    const ctx = audio.ctx, n = bytes.length >> 1, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), buf = ctx.createBuffer(1, n, rate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 0x8000;
    schedule(buf);
  }
  function schedule(buf) {
    const ctx = audio.ctx, src = ctx.createBufferSource(); src.buffer = buf; src.connect(audio.outGain);
    const at = Math.max(ctx.currentTime + .02, audio.queueEnd); src.start(at); audio.queueEnd = at + buf.duration;
    audio.sources.push(src); src.onended = () => { audio.sources = audio.sources.filter(s => s !== src); };
  }
  function flushPlayback() { for (const s of audio.sources) { try { s.stop(); } catch {} } audio.sources = []; audio.queueEnd = 0; }

  // ---------- 方案一：Google 串接 ----------
  function cascadeSession(model) {
    const s = { plan: 'cascade', model, history: [], chunks: [], inflight: 0 };
    s.onSpeechStart = pre => { s.chunks = pre; };
    s.onPcm = (pcm, active) => { if (active) s.chunks.push(pcm); };
    s.onSpeechEnd = () => {
      const total = s.chunks.reduce((n, c) => n + c.length, 0); if (total < 16000 * .35) { s.chunks = []; return; }
      const all = new Int16Array(total); let o = 0; for (const c of s.chunks) { all.set(c, o); o += c.length; } s.chunks = [];
      turn({ audio_b64: b64(new Uint8Array(all.buffer)) });
    };
    async function turn(body) {
      const started = awaiting?.at ?? performance.now(), id = ++s.inflight;
      try {
        const r = await api('/api/cascade/turn', { model, history: s.history, ...body });
        if (id !== s.inflight || session !== s) return;
        if (!r.transcript) { log('system', '沒有聽到內容'); awaiting = null; sphere.setState('Listening'); return; }
        if (body.audio_b64) log('user', r.transcript);
        s.history.push({ role: 'user', text: r.transcript }, { role: 'model', text: r.reply });
        s.pending = { timings: r.timings, started };
        log('ai', r.reply, `STT ${r.timings.stt_ms ?? '—'} ms · LLM ${r.timings.llm_ms} ms · TTS ${r.timings.tts_ms} ms · ${money(r.cost_usd)}`);
        if (r.audio_b64) schedule(await audio.ctx.decodeAudioData(unb64(r.audio_b64).buffer));
        refresh();
      } catch (e) { notice(e.message); awaiting = null; sphere.setState('Listening'); }
    }
    s.sendText = text => { log('user', text); markAwaiting('text'); turn({ text }); };
    s.firstAudio = ms => { api('/api/cascade/latency', { model, latency_ms: ms, timings: s.pending?.timings || {} }).then(refresh).catch(() => {}); };
    s.bargeIn = flushPlayback;
    s.stop = () => { s.inflight++; flushPlayback(); };
    return s;
  }

  // ---------- 方案二：OpenAI Realtime（WebRTC） ----------
  async function openaiSession(model) {
    const { value } = await api('/api/openai/session', { model });
    const s = { plan: 'openai', model, latency: null };
    const pc = s.pc = new RTCPeerConnection(), el = s.el = new Audio(); el.autoplay = true;
    pc.ontrack = e => { el.srcObject = e.streams[0]; const src = audio.ctx.createMediaStreamSource(e.streams[0]); s.remoteAnalyser = audio.ctx.createAnalyser(); s.remoteAnalyser.fftSize = 1024; src.connect(s.remoteAnalyser); };
    pc.addTrack(audio.stream.getAudioTracks()[0], audio.stream);
    const dc = s.dc = pc.createDataChannel('oai-events');
    const opened = new Promise((ok, fail) => { dc.onopen = ok; setTimeout(() => fail(new Error('OpenAI 資料通道 10 秒內沒有開啟')), 10000); });
    dc.onmessage = e => { let ev; try { ev = JSON.parse(e.data); } catch { return; } trace('openai', ev.type === 'response.done' ? ev : ev.type); onEvent(ev); };
    pc.onconnectionstatechange = () => { trace('openai-pc', pc.connectionState); if (pc.connectionState === 'failed' && session === s) { notice('OpenAI 連線中斷'); stopSession(); } };
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    const res = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { Authorization: 'Bearer ' + value, 'Content-Type': 'application/sdp' } });
    if (!res.ok) { pc.close(); throw new Error('OpenAI WebRTC 連線失敗 · HTTP ' + res.status + ' · ' + (await res.text()).slice(0, 160)); }
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    await opened; el.play?.().catch(() => {});
    function onEvent(ev) {
      const t = ev.type || '';
      if (t === 'response.done') {
        const u = ev.response?.usage || {}, i = u.input_token_details || {}, o = u.output_token_details || {};
        const usage = { text_in: (i.text_tokens || 0) - ((i.cached_tokens_details || {}).text_tokens || 0), audio_in: (i.audio_tokens || 0) - ((i.cached_tokens_details || {}).audio_tokens || 0), cached_in: i.cached_tokens || 0, text_out: o.text_tokens || 0, audio_out: o.audio_tokens || 0 };
        api('/api/usage', { plan: 'openai', model, usage, latency_ms: s.latency }).then(refresh).catch(e => notice(e.message)); s.latency = null;
      } else if (t.endsWith('audio_transcript.done')) log('ai', ev.transcript || '');
      else if (t === 'conversation.item.input_audio_transcription.completed') log('user', ev.transcript || '');
      else if (t === 'error') notice('OpenAI：' + (ev.error?.message || JSON.stringify(ev.error)));
    }
    s.sendText = text => { log('user', text); dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })); dc.send(JSON.stringify({ type: 'response.create' })); markAwaiting('text'); };
    s.firstAudio = ms => { s.latency = ms; };
    s.stop = () => { try { dc.close(); } catch {} pc.close(); el.srcObject = null; };
    return s;
  }

  // ---------- 方案三：Gemini Live（WebSocket） ----------
  async function geminiSession(model) {
    const { token, instructions } = await api('/api/gemini/token', { model });
    const gate = ui.gate;
    const s = { plan: 'gemini', model, gate, ready: false, latency: null, lastUsage: null, utter: null, checking: false, later: null };
    const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(token);
    const ws = s.ws = new WebSocket(url);
    const setup = { model: 'models/' + model, generationConfig: { responseModalities: ['AUDIO'] }, systemInstruction: { parts: [{ text: instructions }] }, inputAudioTranscription: {}, outputAudioTranscription: {} };
    // 先檢查再開口：關掉 Gemini 的自動輪替，由我們決定學生何時說完（activityStart／activityEnd）。
    if (gate) setup.realtimeInputConfig = { automaticActivityDetection: { disabled: true } };
    await new Promise((ok, fail) => {
      ws.onopen = () => ws.send(JSON.stringify({ setup }));
      ws.onerror = () => fail(new Error('Gemini Live 連線失敗'));
      ws.onclose = e => { if (!s.ready) fail(new Error('Gemini Live 關閉連線 · ' + e.code + ' ' + (e.reason || ''))); else if (session === s) { notice('Gemini Live 連線結束 · ' + e.code + ' ' + (e.reason || '')); stopSession(); } };
      ws.onmessage = async e => {
        const raw = typeof e.data === 'string' ? e.data : await (e.data.text ? e.data.text() : new Response(e.data).text());
        let m; try { m = JSON.parse(raw); } catch { return; } trace('gemini', Object.keys(m).concat(m.serverContent ? Object.keys(m.serverContent) : []).join(','));
        if (m.setupComplete) { s.ready = true; ok(); }
        handle(m);
      };
    });
    let aiText = '', userText = '';
    function handle(m) {
      const c = m.serverContent;
      if (m.usageMetadata) s.lastUsage = m.usageMetadata;
      if (!c) return;
      if (c.interrupted) flushPlayback();
      for (const part of c.modelTurn?.parts || []) if (part.inlineData?.data) { const rate = Number((/rate=(\d+)/.exec(part.inlineData.mimeType || '') || [])[1] || 24000); playPcm16(unb64(part.inlineData.data), rate); }
      if (c.inputTranscription?.text) userText += c.inputTranscription.text;
      if (c.outputTranscription?.text) aiText += c.outputTranscription.text;
      if (c.turnComplete) {
        if (userText.trim()) log('user', userText.trim()); if (aiText.trim()) log('ai', aiText.trim()); userText = aiText = '';
        const u = s.lastUsage || {}, by = (list, mod) => (list || []).filter(d => d.modality === mod).reduce((n, d) => n + (d.tokenCount || 0), 0);
        const usage = { text_in: by(u.promptTokensDetails, 'TEXT'), audio_in: by(u.promptTokensDetails, 'AUDIO'), text_out: by(u.responseTokensDetails, 'TEXT') + (u.thoughtsTokenCount || 0), audio_out: by(u.responseTokensDetails, 'AUDIO') };
        if (!usage.text_in && !usage.audio_in && u.promptTokenCount) usage.audio_in = u.promptTokenCount;
        if (!usage.text_out && !usage.audio_out && u.responseTokenCount) usage.audio_out = u.responseTokenCount;
        s.lastUsage = null;
        api('/api/usage', { plan: 'gemini', model, usage, latency_ms: s.latency, variant: gate ? 'gate' : 'auto' }).then(refresh).catch(e => notice(e.message)); s.latency = null;
      }
    }
    const send = obj => { if (s.ready && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
    const sendAudio = pcm => send({ realtimeInput: { audio: { data: b64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } });
    // 一句話開始：送 activityStart（模型正在說話時這會打斷它），補上說話前 300 ms 的錄音。
    function begin(pre) { send({ realtimeInput: { activityStart: {} } }); s.utter = []; for (const p of pre) { sendAudio(p); s.utter.push(p); } }
    s.onSpeechStart = pre => { if (!gate) return; if (s.checking) { s.later = pre; return; } begin(pre); };
    s.onPcm = pcm => {
      if (!gate) { sendAudio(pcm); return; }
      if (s.utter) { sendAudio(pcm); s.utter.push(pcm); } else if (s.later) s.later.push(pcm);
    };
    // 一句話結束：先檢查再放行。檢查失敗不擋學生，直接放行並在畫面註記。
    s.onSpeechEnd = async () => {
      if (!gate || !s.utter) return;
      const chunks = s.utter; s.utter = null; s.checking = true;
      const n = chunks.reduce((a, c) => a + c.length, 0), all = new Int16Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
      try {
        const r = await api('/api/gemini/screen', { audio_b64: b64(new Uint8Array(all.buffer)) });
        trace('gate', { hit: r.hit, stt_ms: r.stt_ms });
        if (r.hit) { send({ realtimeInput: { text: r.reminder } }); log('system', `鐵則檢查：「${r.transcript}」要求換角色、忽略規則或索取設定，已附提醒（轉寫 ${secs(r.stt_ms)}）`); }
      } catch (e) { notice('鐵則檢查失敗，直接放行：' + e.message); }
      send({ realtimeInput: { activityEnd: {} } }); s.checking = false;
      if (s.later) { const pre = s.later; s.later = null; begin(pre); }
    };
    s.sendText = async text => {
      log('user', text); const parts = [{ text }];
      if (gate) { try { const r = await api('/api/gemini/screen', { text }); if (r.hit) { parts.push({ text: r.reminder }); log('system', '鐵則檢查：抓到要求換角色、忽略規則或索取設定，已附提醒'); } } catch (e) { notice('鐵則檢查失敗，直接放行：' + e.message); } }
      send({ clientContent: { turns: [{ role: 'user', parts }], turnComplete: true } }); markAwaiting('text');
    };
    s.firstAudio = ms => { s.latency = ms; };
    s.bargeIn = flushPlayback;
    s.stop = () => { s.ready = false; try { ws.close(); } catch {} flushPlayback(); };
    return s;
  }

  // ---------- 開始／結束 ----------
  async function startSession() {
    if (session || ui.busy) return;
    const plan = ui.status?.plans?.[ui.plan];
    if (plan && !plan.ready) { notice(explain({ reason: 'CREDENTIAL_MISSING', missing: Object.keys(plan.credentials).filter(k => !plan.credentials[k]) })); return; }
    ui.busy = true; notice(''); $('#voice').disabled = true;
    try {
      await ensureAudio();
      const model = ui.models[ui.plan];
      session = ui.plan === 'openai' ? await openaiSession(model) : ui.plan === 'gemini' ? await geminiSession(model) : cascadeSession(model);
      log('system', `開始 · ${({ cascade: 'Google 串接', openai: 'OpenAI Realtime', gemini: 'Gemini Live' })[ui.plan]} · ${model}${session.plan === 'gemini' ? (session.gate ? ' · 先檢查再開口' : ' · 自動回答') : ''}`);
      sphere.setState('Listening'); $('#state-label').textContent = LABEL.Listening; demoStatus();
      $('#voice').setAttribute('aria-pressed', 'true'); $('#voice').setAttribute('aria-label', '結束語音對話');
    } catch (e) { session = null; notice(e.message); }
    finally { ui.busy = false; $('#voice').disabled = false; renderPlans(); }
  }
  function stopSession() {
    if (!session) return; const s = session; session = null; awaiting = null; speaking = false;
    try { s.stop(); } catch {}
    log('system', '結束'); sphere.setState('Listening'); $('#state-label').textContent = '待機'; demoStatus();
    $('#voice').setAttribute('aria-pressed', 'false'); $('#voice').setAttribute('aria-label', '開始語音對話'); renderPlans(); refresh();
  }
  $('#voice').onclick = () => { unlockAudio(); session ? stopSession() : startSession(); };
  const box = $('#answer');
  box.oninput = () => { $('#send').disabled = !box.value.trim(); };
  box.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#send').click(); } };
  $('#send').onclick = async () => {
    const text = box.value.trim(); if (!text) return; unlockAudio();
    if (!session) await startSession(); if (!session) return;
    box.value = ''; $('#send').disabled = true;
    try { session.sendText(text); } catch (e) { notice('送出失敗：' + e.message); trace('send-error', String(e)); }
  };

  $('#mic-device').onchange = e => switchMic(e.target.value).catch(err => notice('換麥克風失敗：' + err.message));
  navigator.mediaDevices?.addEventListener?.('devicechange', () => listMics().catch(() => {}));
  listMics().catch(() => {});
  // ---------- dev：三個金鑰輸入處（只寫入；狀態只顯示已設定／未設定） ----------
  const KEY_OF = { openai: ['openai', 'openai'], gemini: ['gemini', 'gemini'], google: ['cascade', 'google'] };
  function renderKeys() {
    const s = ui.status; if (!s) return;
    for (const form of document.querySelectorAll('.key')) {
      const [plan, key] = KEY_OF[form.dataset.name], ok = !!s.plans[plan]?.credentials?.[key], chip = form.querySelector('.chip');
      chip.dataset.ready = String(ok); chip.textContent = ok ? '已設定' : '未設定';
    }
  }
  for (const form of document.querySelectorAll('.key')) {
    form.onsubmit = async e => {
      e.preventDefault();
      const field = form.querySelector('input, textarea'), value = field.value.trim(), btn = form.querySelector('button');
      if (!value) { notice('先貼上金鑰再儲存。'); return; }
      btn.disabled = true;
      try {
        const res = await fetch('/api/keys/' + form.dataset.name, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '儲存失敗 · HTTP ' + res.status);
        field.value = ''; notice(({ openai: 'OpenAI', gemini: 'Gemini', google: 'Google Cloud' })[form.dataset.name] + ' 金鑰已儲存。'); await refresh();
      } catch (err) { notice(err.message); }
      finally { btn.disabled = false; }
    };
  }

  // ---------- 版面：文字模式（浮動視窗）／全螢幕 dev／全螢幕 demo ----------
  const DEMO_PALETTE = { main: '#5FA596', light: '#4F9384', node: '#3E8072', dark: '#2E6B5E', glow: '#A9D8CB' };
  const DEMO_TEXT = { Listening: '正在聆聽…', Thinking: '蘇格拉底正在思考…', Speaking: '蘇格拉底正在說話…' };
  const view = { name: store.get('voice.view', 'text'), mode: store.get('voice.mode', 'dev'), theme: store.get('voice.theme', 'light') };
  function place(sel, slot) { const el = $(sel), to = $(slot); if (el && to && el.parentNode !== to) to.append(el); }
  function demoStatus() { const el = $('#demo-status'); if (el) el.textContent = session ? (DEMO_TEXT[sphere.state] || '') : '點一下球體開始對話'; }
  function applyView() {
    const full = view.name === 'full', demo = full && view.mode === 'demo';
    document.body.dataset.view = view.name; document.body.dataset.mode = view.mode; document.body.dataset.theme = view.theme;
    $('#mode-toggle').checked = view.mode === 'demo'; $('#theme-toggle').checked = view.theme === 'dark';
    place('#sphere', !full ? '#slot-float' : demo ? '#slot-demo' : '#slot-dev');
    place('#logwrap', full ? '#slot-log-dev' : '#slot-log-text');
    place('#composer', full ? '#slot-composer-dev' : '#slot-composer-text');
    // 淺色 demo 在白底上用加深的綠；深色 demo 用球體原色（Figma 的 Dark 底），一樣保留 demo 外環的最低亮度。
    sphere.setPalette(!demo ? null : view.theme === 'dark' ? { ...SphereGeometry.COLORS } : DEMO_PALETTE);
    requestAnimationFrame(() => sphere.resize());
    demoStatus();
  }
  function setView(name) { view.name = name; store.set('voice.view', name); applyView(); }
  $('#float').onclick = () => setView('full');
  $('#exit-full').onclick = () => setView('text');
  $('#mode-toggle').onchange = e => { view.mode = e.target.checked ? 'demo' : 'dev'; store.set('voice.mode', view.mode); applyView(); };
  $('#theme-toggle').onchange = e => { view.theme = e.target.checked ? 'dark' : 'light'; store.set('voice.theme', view.theme); applyView(); };
  $('#sphere').addEventListener('click', () => { if (view.name === 'full' && view.mode === 'demo') { unlockAudio(); session ? stopSession() : startSession(); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && view.name === 'full') setView('text'); });
  applyView();

  refresh(); setInterval(refresh, 15000);
  window.voiceDebug = { sphere, ui, events, audio, get session() { return session; } };
})();
