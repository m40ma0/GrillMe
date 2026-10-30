// AudioWorklet: downsamples the mic to 16 kHz mono PCM16 and posts 250 ms chunks, plus an RMS level for the meter.
class Pcm16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.buffer = new Int16Array(4000);
    this.filled = 0;
    this.sumSq = 0;
    this.count = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const v = input[i];
      this.sumSq += v * v;
      this.count++;
    }
    while (this.pos < input.length) {
      const v = Math.max(-1, Math.min(1, input[Math.floor(this.pos)]));
      this.buffer[this.filled++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.filled === this.buffer.length) {
        this.port.postMessage({ pcm: this.buffer.buffer, level: Math.sqrt(this.sumSq / Math.max(1, this.count)) }, [this.buffer.buffer]);
        this.buffer = new Int16Array(4000);
        this.filled = 0;
        this.sumSq = 0;
        this.count = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= input.length;
    return true;
  }
}
registerProcessor("pcm16", Pcm16Processor);
