// Fractional sample windows preserve timing across AudioWorklet/ScriptProcessor chunks.
export function createPcm16Resampler(inputRate, outputRate = 16000) {
  if (!(inputRate > 0 && outputRate > 0)) throw new Error('Invalid audio sample rate')
  const width = inputRate / outputRate
  let weight = 0, sum = 0
  return samples => {
    const output = []
    for (const sample of samples) {
      let left = 1
      while (left > 1e-9) {
        const take = Math.min(left, width - weight)
        sum += sample * take; weight += take; left -= take
        if (weight >= width - 1e-9) {
          const value = Math.max(-1, Math.min(1, sum / width))
          output.push(Math.round(value * (value < 0 ? 32768 : 32767)))
          weight = 0; sum = 0
        }
      }
    }
    const buffer = new ArrayBuffer(output.length * 2), view = new DataView(buffer)
    output.forEach((value, index) => view.setInt16(index * 2, value, true))
    return buffer
  }
}

export function encodePcmWav(chunks, sampleRate = 16000) {
  const bytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const buffer = new ArrayBuffer(44 + bytes), view = new DataView(buffer)
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes, true)
  let offset = 44
  for (const chunk of chunks) { new Uint8Array(buffer, offset, chunk.byteLength).set(new Uint8Array(chunk)); offset += chunk.byteLength }
  return buffer
}

export function webAsrCaptureSupported(environment = globalThis) {
  return !!(environment.navigator?.mediaDevices?.getUserMedia && (environment.AudioContext || environment.webkitAudioContext))
}

export function createWebAsrCapture({ onFrame, onEnded = () => {}, environment = globalThis }) {
  let context, stream, source, processor, silent, resample, disposed = false, flushDone
  const alive = () => !disposed
  function receive(samples) {
    if (!alive()) return
    const frame = resample(samples)
    if (frame.byteLength) onFrame(frame)
  }
  function release() {
    disposed = true
    if (processor?.port) processor.port.onmessage = null
    if (processor) processor.onaudioprocess = null
    for (const node of [source, processor, silent]) { try { node?.disconnect() } catch (_) {} }
    stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    void context?.close().catch(() => {})
    flushDone?.()
  }
  return {
    async start() {
      if (!webAsrCaptureSupported(environment)) throw new Error('当前浏览器不支持实时录音，请使用 HTTPS 或更新浏览器')
      const Context = environment.AudioContext || environment.webkitAudioContext
      context = new Context()
      // Resume while still handling the user gesture, including on iOS Safari.
      const resumed = context.resume().catch(error => error)
      try {
        stream = await environment.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        if (!alive()) { release(); return false }
        let resumeTimer
        const result = await Promise.race([resumed, new Promise((_, reject) => {
          resumeTimer = setTimeout(() => reject(new Error('请再次点击录音按钮启动麦克风')), 3000)
        })]).finally(() => clearTimeout(resumeTimer))
        if (!alive()) { release(); return false }
        if (result instanceof Error || context.state !== 'running') throw result instanceof Error ? result : new Error('录音设备未就绪')
        resample = createPcm16Resampler(context.sampleRate)
        source = context.createMediaStreamSource(stream)
        if (context.audioWorklet?.addModule && environment.AudioWorkletNode) {
          try {
            await context.audioWorklet.addModule(new URL('../static/audio/asr-pcm-worklet.js', import.meta.url).href)
            if (!alive()) return false
            processor = new environment.AudioWorkletNode(context, 'ftx-asr-capture')
            processor.port.onmessage = event => {
              if (event.data?.type === 'flushed') flushDone?.()
              else if (event.data instanceof Float32Array) receive(event.data)
            }
          } catch (_) { /* Older WebViews can still capture through ScriptProcessor. */ }
        }
        if (!alive()) return false
        if (!processor) {
          if (!context.createScriptProcessor) throw new Error('当前浏览器不支持音频采集')
          processor = context.createScriptProcessor(2048, 1, 1)
          processor.onaudioprocess = event => receive(event.inputBuffer.getChannelData(0))
        }
        silent = context.createGain(); silent.gain.value = 0
        source.connect(processor); processor.connect(silent); silent.connect(context.destination)
        stream.getAudioTracks().forEach(track => { track.onended = () => { if (alive()) onEnded() } })
        return true
      } catch (error) { release(); throw error }
    },
    getAudioTrack() { return stream?.getAudioTracks()[0] || null },
    async stop() {
      if (!disposed && processor?.port) {
        let timer
        await new Promise(resolve => {
          flushDone = resolve
          timer = setTimeout(resolve, 200)
          try { processor.port.postMessage({ type: 'flush' }) } catch (_) { resolve() }
        }).finally(() => { clearTimeout(timer); flushDone = null })
      }
      release()
    },
    dispose: release
  }
}
