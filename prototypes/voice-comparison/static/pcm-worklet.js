// 麥克風取樣：每 ~40ms 把單聲道 Float32 片段交回主執行緒（主執行緒再降到 16 kHz Int16）。
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.size = 0; this.target = Math.round(sampleRate * 0.04); }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(new Float32Array(ch)); this.size += ch.length;
      if (this.size >= this.target) {
        const out = new Float32Array(this.size); let o = 0;
        for (const b of this.buf) { out.set(b, o); o += b.length; }
        this.port.postMessage(out, [out.buffer]); this.buf = []; this.size = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', Capture);
