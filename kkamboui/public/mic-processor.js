const TARGET_RATE = 24000;
const CHUNK_SAMPLES = 4096; // native rate 기준 버퍼 크기

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;

    for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);

    while (this._buf.length >= CHUNK_SAMPLES) {
      const chunk = new Float32Array(this._buf.splice(0, CHUNK_SAMPLES));

      // 선형 보간 다운샘플링 (native → 16kHz)
      const ratio = sampleRate / TARGET_RATE;
      const outLen = Math.floor(CHUNK_SAMPLES / ratio);
      const out = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const src = i * ratio;
        const lo = Math.floor(src);
        const hi = Math.min(lo + 1, CHUNK_SAMPLES - 1);
        const f = src - lo;
        out[i] = chunk[lo] * (1 - f) + chunk[hi] * f;
      }

      this.port.postMessage(out, [out.buffer]);
    }

    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
