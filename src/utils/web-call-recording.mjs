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
      const nodes = [], sides = []
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
        const sourceRemoteTrack = remote.getAudioTracks()[0]
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
        // Keep a universally playable mix. Independent mono encoders also work
        // on browsers that silently downmix a stereo MediaRecorder input.
        try {
          for (const [index, speaker] of ['self', 'peer'].entries()) {
            const output = context.createMediaStreamDestination()
            const side = { speaker, output }
            sides.push(side)
            // Some WebViews fix the destination's channel count. It still
            // carries only this participant, even when encoded as stereo.
            try { output.channelCount = 1 } catch (_) {}
            nodes[index * 2].connect(output)
            side.encoder = new environment.MediaRecorder(output.stream, { mimeType: encoder.mimeType, audioBitsPerSecond: 32000 })
          }
        } catch (_) {
          sides.splice(0).forEach(side => side.output.stream.getTracks().forEach(track => track.stop()))
        }
        const startedAt = now(), id = `rec_${startedAt}_${Math.random().toString(36).slice(2, 12)}`
        const row = { ...metadata, id, createdAt: startedAt, name: `${metadata.peerName || '联系人'}的通话录音`,
          mimeType: encoder.mimeType || mimeType || 'audio/webm', size: 0, durationMs: 0, status: 'recording' }
        delete row.admin; delete row.auto
        await storage.create(row)
        if (!canStart()) { await storage.remove(id, metadata.owner, true); return }
        let resolveDone
        run = { id, startedAt, encoder, context, destination, nodes, remoteTrack: sourceRemoteTrack, bytes: 0, count: 0, writes: Promise.resolve(),
          done: new Promise(resolve => { resolveDone = resolve }), resolveDone, stopping: false, failed: false,
          pending: 0, timer: null, stoppedAt: 0, stopNotice: '', committedBytes: 0, committedCount: 0, committedDuration: 0 }
        Object.assign(run, { sides, trackOffsets: {}, splitOK: sides.length === 2, committedMix: 0,
          committedSides: { self: 0, peer: 0 }, awaiting: new Set() })
        active = run
        const append = (event, speaker) => {
          if (!event.data?.size || run.failed || (speaker && !run.splitOK)) return
          if (!isCurrent() && !run.stopping) void stop()
          if (run.bytes + event.data.size > maxBytes || run.pending >= 8 * (1 + sides.length)) {
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
            await storage.append(id, index, event.data, metadata.owner, speaker)
            run.committedBytes += event.data.size
            run.committedCount++
            if (speaker) run.committedSides[speaker]++
            else run.committedMix++
            run.committedDuration = chunkDuration
          }).catch(() => {
            run.failed = true; run.writeFailed = true; report(false, { recordingError: '本地空间不足或保存失败，录音已停止' }); void stop()
          }).finally(() => { run.pending-- })
        }
        encoder.onerror = () => { run.failed = true; report(false, { recordingError: '录制中断，正在保存已有声音' }); void stop() }
        const begin = (recorder, speaker) => {
          recorder.ondataavailable = event => append(event, speaker)
          recorder.onstop = () => {
            run.awaiting.delete(recorder)
            if (!run.stopping) {
              if (speaker) run.splitOK = false
              else { run.failed = true; void stop() }
            }
            if (!run.awaiting.size) void finish(run)
          }
          recorder.start(1000)
          run.awaiting.add(recorder)
        }
        const origin = now()
        begin(encoder)
        for (const side of sides) {
          try {
            run.trackOffsets[side.speaker] = now() - origin
            side.encoder.onerror = () => { run.splitOK = false }
            begin(side.encoder, side.speaker)
          } catch (_) { run.splitOK = false }
        }
        trackReady()
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
          sides.forEach(side => side.output.stream.getTracks().forEach(track => track.stop()))
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
      const splitTracks = run.splitOK && !run.failed && !!run.committedSides.self && !!run.committedSides.peer
      if (run.committedMix) await storage.finish(run.id, { size: run.committedBytes, splitTracks, trackOffsets: run.trackOffsets,
        durationMs: run.failed ? run.committedDuration : (run.stoppedAt || now()) - run.startedAt,
        status: run.failed ? 'interrupted' : 'saved' }, metadata.owner)
      else await storage.remove(run.id, metadata.owner, true)
      report(false, { saved: run.committedMix > 0, recordingError: run.failed ? '录制中断，已保留部分声音' :
        run.stopNotice || (splitTracks ? '' : '已保存混音，当前环境未能完整保存双方音轨') })
    } catch (_) { report(false, { recordingError: '录音保存失败，请检查本地存储空间' }) }
    finally { cleanup(run); if (active === run) active = null; run.resolveDone() }
  }
  function cleanup(run) {
    clearTimeout(run.timer)
    run.encoder.ondataavailable = run.encoder.onstop = run.encoder.onerror = null
    for (const side of run.sides) {
      side.encoder.ondataavailable = side.encoder.onstop = side.encoder.onerror = null
      side.output.stream.getTracks().forEach(track => track.stop())
    }
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
      for (const recorder of [...run.awaiting]) {
        try { if (recorder.state !== 'inactive') recorder.stop() }
        catch (_) { run.failed = true; run.awaiting.delete(recorder) }
      }
      if (!run.awaiting.size) void finish(run)
    }
    return run.done
  }
  function trackReady() {
    const track = remote.getAudioTracks()[0]
    if (active && !active.stopping && track && active.remoteTrack !== track) {
      try {
        const source = active.context.createMediaStreamSource(new environment.MediaStream([track]))
        active.nodes[2].disconnect(); source.connect(active.nodes[3])
        if (active.sides[1]) source.connect(active.sides[1].output)
        active.nodes[2] = source; active.remoteTrack = track
      } catch (_) { active.stopNotice = '通话设备切换后录音已保存'; void stop() }
    }
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
