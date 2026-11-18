class FtxAsrCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Float32Array(2048)
    this.offset = 0
    this.port.onmessage = event => {
      if (event.data?.type === 'flush') { this.flush(); this.port.postMessage({ type: 'flushed' }) }
    }
  }
  flush() {
    if (!this.offset) return
    const samples = this.samples.slice(0, this.offset)
    this.port.postMessage(samples, [samples.buffer])
    this.offset = 0
  }
  process(inputs) {
    const channels = inputs[0]
    if (channels?.length) {
      for (let index = 0; index < channels[0].length; index++) {
        let sample = 0
        for (const channel of channels) sample += channel[index] / channels.length
        this.samples[this.offset++] = sample
        if (this.offset === this.samples.length) this.flush()
      }
    }
    return true
  }
}
registerProcessor('ftx-asr-capture', FtxAsrCapture)
