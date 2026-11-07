// The call owns the capture tracks. Recording owns only its mix, encoder and storage.
export function webRecordingSupported(environment = globalThis) {
  return !!(environment.MediaRecorder && (environment.AudioContext || environment.webkitAudioContext) && environment.indexedDB)
}
export function createWebCallRecording({ local, remote, metadata, storage, changed = () => {}, isCurrent = () => true,
  environment = globalThis, initialContext = null, now = Date.now, maxBytes = 64 * 1024 * 1024, maxDuration = 3600000 }) {
  let active = null, starting = null, closed = false, connected = false, revision = 0, automaticPending = false
  const supported = metadata.admin === true && webRecordingSupported(environment)
  const report = (recording, extra = {}) => changed({ type: 'recording', recordingSupported: supported, recording,
    recordingStartedAt: recording ? active?.startedAt || 0 : 0, recordingError: '', ...extra })
  report(false)
  async function start() {
    if (!supported || closed || !isCurrent() || !connected) return
    if (starting) return starting
    if (active) return
    const intent = ++revision
    const canStart = () => !closed && isCurrent() && connected && intent === revision
    starting = (async () => {
      const AudioContext = environment.AudioContext || environment.webkitAudioContext
      const nodes = []
      let run = null, context, destination, resumeTimer
      try {
        context = initialContext || new AudioContext()
        initialContext = null
        // Do not leave an unresolved resume() promise holding the call controls.
        await Promise.race([context.resume(), new Promise((_, reject) => {
          resumeTimer = setTimeout(() => reject(new Error('请点击录音按钮启动录制')), 2500)
        })])
        clearTimeout(resumeTimer)
        if (context.state !== 'running') throw new Error('请点击录音按钮启动录制')
        if (!canStart()) return
        destination = context.createMediaStreamDestination()
        for (const stream of [local, remote]) {
          // An empty remote stream can receive its first audio track after setup.
          if (!stream.getAudioTracks().length) throw new Error('通话声音尚未就绪，请稍后重试')
          const audioOnly = new environment.MediaStream(stream.getAudioTracks())
          const source = context.createMediaStreamSource(audioOnly), gain = context.createGain()
          gain.gain.value = 0.5; source.connect(gain); gain.connect(destination); nodes.push(source, gain)
        }
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
          .find(type => environment.MediaRecorder.isTypeSupported?.(type))
        const encoder = new environment.MediaRecorder(destination.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 })
        const startedAt = now(), id = `rec_${startedAt}_${Math.random().toString(36).slice(2, 12)}`
        const row = { ...metadata, id, createdAt: startedAt, name: `${metadata.peerName || '联系人'}的通话录音`,
          mimeType: encoder.mimeType || mimeType || 'audio/webm', size: 0, durationMs: 0, status: 'recording' }
        delete row.admin; delete row.auto
        await storage.create(row)
        if (!canStart()) { await storage.remove(id, metadata.owner, true); return }
        let resolveDone
        run = { id, startedAt, encoder, context, destination, nodes, bytes: 0, count: 0, writes: Promise.resolve(),
          done: new Promise(resolve => { resolveDone = resolve }), resolveDone, stopping: false, failed: false,
          pending: 0, timer: null, stoppedAt: 0, stopNotice: '', committedBytes: 0, committedCount: 0, committedDuration: 0 }
        active = run
        encoder.ondataavailable = event => {
          if (!event.data?.size || run.failed) return
          if (!isCurrent() && !run.stopping) void stop()
          if (run.bytes + event.data.size > maxBytes || run.pending >= 8) {
            run.failed = true
            report(false, { recordingError: '录音超过大小或存储上限，已停止' })
            void stop()
            return
          }
          run.bytes += event.data.size
          run.pending++
          const index = run.count++, chunkDuration = now() - startedAt
          run.writes = run.writes.then(async () => {
            if (run.writeFailed) return
            await storage.append(id, index, event.data, metadata.owner)
            run.committedBytes += event.data.size
            run.committedCount++
            run.committedDuration = chunkDuration
          }).catch(() => {
            run.failed = true; run.writeFailed = true; report(false, { recordingError: '本地空间不足或保存失败，录音已停止' }); void stop()
          }).finally(() => { run.pending-- })
        }
        encoder.onerror = () => { run.failed = true; report(false, { recordingError: '录制中断，正在保存已有声音' }); void stop() }
        encoder.onstop = () => finish(run)
        encoder.start(1000)
        run.timer = setTimeout(() => { run.stopNotice = '录音达到一小时上限，已保存'; void stop() }, maxDuration)
        report(true)
      } catch (error) {
        if (run) { active = null; cleanup(run); await storage.remove(run.id, metadata.owner, true).catch(() => {}) }
        if (canStart()) report(false, { recordingError: error.message || '当前环境无法录音' })
      } finally {
        clearTimeout(resumeTimer)
        if (!run) {
          nodes.forEach(node => { try { node.disconnect() } catch (_) {} })
          destination?.stream.getTracks().forEach(track => track.stop())
          void context?.close().catch(() => {})
        }
      }
    })().finally(() => { starting = null })
    return starting
  }
  async function finish(run) {
    if (run.finalizing) return run.done
    run.finalizing = true
    await run.writes
    try {
      if (run.committedCount) await storage.finish(run.id, { size: run.committedBytes,
        durationMs: run.failed ? run.committedDuration : (run.stoppedAt || now()) - run.startedAt,
        status: run.failed ? 'interrupted' : 'saved' }, metadata.owner)
      else await storage.remove(run.id, metadata.owner, true)
      report(false, { saved: run.committedCount > 0, recordingError: run.failed ? '录制中断，已保留部分声音' : run.stopNotice })
    } catch (_) { report(false, { recordingError: '录音保存失败，请检查本地存储空间' }) }
    finally { cleanup(run); if (active === run) active = null; run.resolveDone() }
  }
  function cleanup(run) {
    clearTimeout(run.timer)
    run.encoder.ondataavailable = run.encoder.onstop = run.encoder.onerror = null
    run.nodes.forEach(node => { try { node.disconnect() } catch (_) {} })
    run.destination.stream.getTracks().forEach(track => track.stop())
    void run.context.close().catch(() => {})
  }
  async function stop() {
    automaticPending = false
    revision++
    const run = active
    if (!run) return starting
    if (!run.stopping) {
      run.stopping = true; clearTimeout(run.timer)
      run.stoppedAt = now()
      try {
        if (run.encoder.state !== 'inactive') run.encoder.stop()
      } catch (_) {
        run.failed = true
        void finish(run)
      }
    }
    return run.done
  }
  function trackReady() {
    if (!automaticPending || !remote.getAudioTracks().length) return
    automaticPending = false
    void start()
  }
  return {
    control(value) {
      if (value.connected && !connected) {
        connected = true
        automaticPending = supported && metadata.auto === true
        trackReady()
      }
      if (typeof value.recordingEnabled === 'boolean') {
        automaticPending = false
        if (value.recordingEnabled) void start(); else void stop()
      }
    },
    trackReady,
    close() {
      closed = true; connected = false
      if (initialContext) { void initialContext.close().catch(() => {}); initialContext = null }
      return stop()
    },
    start, stop
  }
}
