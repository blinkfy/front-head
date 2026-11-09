package ftx.voice

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.Executors
import java.lang.ref.WeakReference

// All peer/factory operations are serialized off the WebRTC signaling and UI threads.
object VoiceCallBridge {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var initialized = false
    private var screenSequence = 0
    @Volatile private var current: Session? = null
    private class Session(val id: String, val context: Context, val callback: (String) -> Unit,
                          val video: Boolean, val entryMode: String, activity: Activity? = null) {
        val activity = activity?.let { WeakReference(it) }
        var factory: PeerConnectionFactory? = null
        var peer: PeerConnection? = null
        var source: AudioSource? = null
        var track: AudioTrack? = null
        var remoteSet = false
        @Volatile var closed = false
        var egl: EglBase? = null
        var videoSource: VideoSource? = null
        var videoTrack: VideoTrack? = null
        var videoSender: RtpSender? = null
        var remoteVideo: VideoTrack? = null
        var capturer: CameraVideoCapturer? = null
        var texture: SurfaceTextureHelper? = null
        var videoView: VideoCallView? = null
        var videoHost: WeakReference<Activity>? = null
        var canSwitchCamera = false
        val cameraIntentRevision = java.util.concurrent.atomic.AtomicInteger(0)
        var cameraEnabled = true
        var cameraGeneration = 0
        var cameraFallbackTried = false
        var cameraName: String? = null
        var cameraNameLegacy = false
        var remoteCameraEnabled = true
        var frontFacing = true
        var screenShareSupported = false
        var remoteScreenSharing = false
        var screenSharing = false
        @Volatile var screenRequest: Int? = null
        var screenConsent: Intent? = null
        var screenCapture: CallScreenCapture? = null
        var screenDeadline: Runnable? = null
        val supportsPlaybackCapture = Build.VERSION.SDK_INT >= 29 && video && entryMode == "video"
        @Volatile var screenAudioRate = 0
        @Volatile var screenAudio: CallScreenAudio? = null
        var audioModule: JavaAudioDeviceModule? = null
        @Volatile var muted = false
        var speaker = video
        var connected = false
        var recording: CallAudioRecording? = null
        var peerName = "联系人"
        var peerAvatar = ""
        val ice = mutableListOf<IceCandidate>()
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val oldMode = audio.mode
        @Suppress("DEPRECATION") val oldSpeaker = audio.isSpeakerphoneOn
        var focus: AudioFocusRequest? = null
        var focusListener: AudioManager.OnAudioFocusChangeListener? = null
        var audioChanged = false
    }
    private fun emit(s: Session, type: String, data: JSONObject = JSONObject()) {
        if (RealtimeBridge.callEvent(s.id, type, data)) return
        val json = data.put("type", type).put("callId", s.id).toString()
        main.post { s.callback(json) }
    }
    private fun valid(s: Session) = current === s && !s.closed
    private fun fail(s: Session, reason: String) {
        if (!valid(s)) return
        emit(s, "error", JSONObject().put("reason", reason)); release(s)
    }
    @Suppress("DEPRECATION")
    private fun requestAudioFocus(s: Session): Boolean {
        lateinit var listener: AudioManager.OnAudioFocusChangeListener
        listener = AudioManager.OnAudioFocusChangeListener { change ->
            // Notification ducking does not interrupt the call.
            if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
                worker.execute { if (s.focusListener === listener) fail(s, "interrupted") }
        }
        s.focusListener = listener
        val result = try {
            if (Build.VERSION.SDK_INT >= 26) {
                val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(listener, main).build()
                s.focus = request
                s.audio.requestAudioFocus(request)
            } else s.audio.requestAudioFocus(listener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        } catch (_: Exception) { AudioManager.AUDIOFOCUS_REQUEST_FAILED }
        if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return true
        releaseAudioFocus(s)
        return false
    }
    @Suppress("DEPRECATION")
    private fun releaseAudioFocus(s: Session) {
        val listener = s.focusListener ?: return
        val request = s.focus
        s.focusListener = null
        s.focus = null
        runCatching {
            if (Build.VERSION.SDK_INT >= 26) request?.let { s.audio.abandonAudioFocusRequest(it) }
            else s.audio.abandonAudioFocus(listener)
        }
    }
    private fun observer(s: Session, created: ((SessionDescription) -> Unit)? = null, done: (() -> Unit)? = null) = object : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription) { worker.execute { if (valid(s)) created?.invoke(description) } }
        override fun onSetSuccess() { worker.execute { if (valid(s)) done?.invoke() } }
        override fun onCreateFailure(error: String) { worker.execute { fail(s, "connect_failed") } }
        override fun onSetFailure(error: String) { worker.execute { fail(s, "connect_failed") } }
    }
    private fun localDescription(s: Session, description: SessionDescription) {
        s.peer?.setLocalDescription(observer(s, done = {
            emit(s, description.type.canonicalForm(), JSONObject().put("sdp", description.description))
        }), description)
    }
    @JvmStatic fun open(context: Context, options: String, callback: (String) -> Unit) {
        worker.execute {
            val input = try { JSONObject(options) } catch (_: Exception) { return@execute }
            val id = input.optString("callId")
            val nativeAnswer = input.optBoolean("nativeAnswer")
            if (nativeAnswer && !RealtimeBridge.isNativeCall(id)) return@execute
            // Video renderer release runs on main, then disposes EGL on worker.
            // Queue a new open behind that barrier instead of overlapping sessions.
            if (current?.closed == true) { main.post { open(context, options, callback) }; return@execute }
            if (current != null) { main.post { callback(JSONObject().put("type", "error").put("callId", id).put("reason", "busy").toString()) }; return@execute }
            val video = input.optString("mode") == "video"
            val previewReleased = !video || OutgoingVideoPreview.releaseBeforePeer()
            val s = Session(id, context.applicationContext, callback, video, input.optString("entryMode", if (video) "video" else "audio"), context as? Activity); current = s
            try {
                if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { fail(s, "permission_denied"); return@execute }
                s.speaker = input.optBoolean("speaker", video)
                s.screenShareSupported = video && s.entryMode == "video" && input.optBoolean("screenShareSupported")
                s.remoteCameraEnabled = input.optBoolean("remoteCameraEnabled", input.optBoolean("cameraRequested", true))
                s.cameraEnabled = previewReleased && input.optBoolean("cameraEnabled", true) &&
                    context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                RealtimeBridge.attachCall(context, id, video, s.cameraEnabled && video)
                val urls = input.optJSONArray("stunUrls")
                val servers = mutableListOf<PeerConnection.IceServer>()
                if (urls != null) for (index in 0 until minOf(urls.length(), 3)) {
                    val url = urls.optString(index)
                    if (url.startsWith("stun:") || url.startsWith("stuns:")) servers.add(PeerConnection.IceServer.builder(url).createIceServer())
                }
                if (!requestAudioFocus(s)) { fail(s, "interrupted"); return@execute }
                s.audioChanged = true
                s.audio.mode = AudioManager.MODE_IN_COMMUNICATION
                route(s, s.speaker)
                if (!initialized) {
                    PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
                    initialized = true
                }
                s.peerName = input.optString("peerName", "联系人").take(80)
                s.peerAvatar = input.optString("peerAvatar")
                val recording = CallRecordingFiles.forSession(s.context, s.peerName, s.entryMode,
                    input.optString("recordingOwner"), s.id) { state ->
                    worker.execute {
                        if (valid(s)) updateVideo(s)
                        if (valid(s) || state.optBoolean("saved")) emit(s, "recording", state)
                    }
                }
                s.recording = recording
                val audioBuilder = JavaAudioDeviceModule.builder(context.applicationContext)
                if (recording.allowed) {
                    if (!s.supportsPlaybackCapture) audioBuilder.setSamplesReadyCallback { recording.capture(it) }
                    audioBuilder.setPlaybackSamplesReadyCallback { recording.playback(it) }
                }
                if (s.supportsPlaybackCapture) audioBuilder.setAudioBufferCallback { buffer, format, channels, rate, bytes, timestamp ->
                    if (s.screenAudioRate != rate) s.screenAudioRate = rate
                    if (recording.allowed) recording.capture(buffer, format, channels, rate, bytes)
                    s.screenAudio?.mix(buffer, format, channels, rate, bytes, s.muted)
                    timestamp
                }
                val module = audioBuilder.createAudioDeviceModule()
                if (s.supportsPlaybackCapture) {
                    s.audioModule = module
                    module.setMicrophoneMute(s.muted)
                }
                val factory = try {
                    val builder = PeerConnectionFactory.builder().setAudioDeviceModule(module)
                    if (video) {
                        val egl = FtxEglBaseFactory.create(); s.egl = egl
                        builder.setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
                        builder.setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
                    }
                    builder.createPeerConnectionFactory()
                } finally { module.release() }
                s.factory = factory
                val config = PeerConnection.RTCConfiguration(servers)
                config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
                val listener = object : PeerConnection.Observer {
                    override fun onSignalingChange(state: PeerConnection.SignalingState) {}
                    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
                    // JNI calls these methods directly. Explicit overrides avoid missing
                    // Java interface defaults after Android cloud-build desugaring.
                    override fun onStandardizedIceConnectionChange(state: PeerConnection.IceConnectionState) {}
                    override fun onIceCandidateError(event: IceCandidateErrorEvent) {}
                    override fun onSelectedCandidatePairChanged(event: CandidatePairChangeEvent) {}
                    override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {}
                    override fun onRemoveTrack(receiver: RtpReceiver) {}
                    override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
                    override fun onIceCandidate(candidate: IceCandidate) {
                        worker.execute { if (valid(s) && !candidate.sdp.contains(" typ relay ")) emit(s, "ice", JSONObject().put("candidate", JSONObject()
                            .put("candidate", candidate.sdp).put("sdpMid", candidate.sdpMid ?: "0").put("sdpMLineIndex", candidate.sdpMLineIndex))) }
                    }
                    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
                    override fun onAddStream(stream: MediaStream) {}
                    override fun onRemoveStream(stream: MediaStream) {}
                    override fun onDataChannel(channel: DataChannel) { channel.close() }
                    override fun onRenegotiationNeeded() {}
                    override fun onTrack(transceiver: RtpTransceiver) {
                        worker.execute {
                            if (!valid(s) || !s.video) return@execute
                            val track = transceiver.receiver.track() as? VideoTrack ?: return@execute
                            s.remoteVideo = track
                            main.post { if (valid(s)) s.videoView?.setRemoteTrack(track) }
                        }
                    }
                    override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
                        worker.execute {
                            if (!valid(s)) return@execute
                            if (state == PeerConnection.PeerConnectionState.FAILED) fail(s, "connect_failed")
                            else emit(s, "state", JSONObject().put("state", state.toString().lowercase()))
                        }
                    }
                }
                s.peer = factory.createPeerConnection(config, listener) ?: throw IllegalStateException("Peer unavailable")
                s.source = factory.createAudioSource(MediaConstraints())
                s.track = factory.createAudioTrack("ftx-audio", s.source)
                s.peer!!.addTrack(s.track, listOf("ftx-voice"))
                if (video) {
                    createCamera(s, factory)
                    if (!s.cameraEnabled && input.optBoolean("cameraRequested", true)) {
                        emit(s, "camera", JSONObject().put("cameraEnabled", false))
                        emit(s, "control_error", JSONObject().put("cameraEnabled", false).put("reason", "camera_unavailable"))
                    }
                    val track = s.videoTrack!!
                    val sender = s.peer!!.addTrack(track, listOf("ftx-voice"))
                    s.videoSender = sender
                    setVideoEncoding(s, false)
                    main.post {
                        if (!valid(s) || (nativeAnswer && !RealtimeBridge.isNativeCall(id))) return@post
                        try {
                            val origin = s.activity?.get()
                            if (origin == null || origin.isFinishing || origin.isDestroyed) { worker.execute { cameraUnavailable(s) }; return@post }
                            VideoCallActivity.markLaunching()
                            origin.startActivity(Intent(origin, VideoCallActivity::class.java)
                                .putExtra("callId", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                        } catch (_: Throwable) { VideoCallActivity.cancelLaunching(); worker.execute { cameraUnavailable(s) } }
                    }
                }
                if (nativeAnswer && !RealtimeBridge.isNativeCall(id)) { release(s); return@execute }
                emit(s, "ready")
                if (recording.allowed) emit(s, "recording", recording.snapshot())
                if (input.optBoolean("offerer")) s.peer!!.createOffer(observer(s, created = { localDescription(s, it) }), MediaConstraints())
            } catch (error: Throwable) {
                android.util.Log.w("ftx-call", "peer initialization: ${error.javaClass.simpleName}", error)
                fail(s, "failed")
            }
        }
    }
    private fun createCamera(s: Session, factory: PeerConnectionFactory) {
        // Keep a video sender even without a camera, so audio/remote video can connect
        // and a later camera retry does not require renegotiating the whole call.
        s.videoSource = factory.createVideoSource(false)
        s.videoTrack = factory.createVideoTrack("ftx-video", s.videoSource)
        if (!s.cameraEnabled) { s.videoTrack?.setEnabled(false); return }
        try { startCamera(s) } catch (_: Throwable) {
            try { startCamera(s, true) } catch (_: Throwable) { cameraUnavailable(s) }
        }
    }
    private fun stopCamera(s: Session) {
        s.cameraGeneration++
        try { s.capturer?.stopCapture() } catch (_: Exception) {}
        try { s.capturer?.dispose() } catch (_: Exception) {}
        s.capturer = null
    }
    private fun cameraUnavailable(s: Session) {
        if (!valid(s)) return
        stopCamera(s); s.cameraEnabled = false; s.videoTrack?.setEnabled(false)
        RealtimeBridge.cancelCameraServiceAction(s.id)
        updateVideo(s)
        emit(s, "camera", JSONObject().put("cameraEnabled", false))
        emit(s, "control_error", JSONObject().put("cameraEnabled", false).put("reason", "camera_unavailable"))
    }
    @JvmStatic fun cameraServiceUnavailable(id: String) {
        worker.execute { current?.takeIf { it.id == id }?.let(::cameraUnavailable) }
    }
    private fun startCamera(s: Session, legacy: Boolean = false) {
        stopCamera(s)
        val generation = s.cameraGeneration
        val useLegacy = legacy || !Camera2Enumerator.isSupported(s.context)
        s.cameraFallbackTried = useLegacy
        val enumerator: CameraEnumerator = if (useLegacy) Camera1Enumerator(true) else Camera2Enumerator(s.context)
        val names = enumerator.deviceNames
        s.canSwitchCamera = names.size > 1
        val name = names.firstOrNull { s.cameraNameLegacy == useLegacy && it == s.cameraName }
            ?: names.firstOrNull { enumerator.isFrontFacing(it) == s.frontFacing }
            ?: names.firstOrNull() ?: throw IllegalStateException("Camera unavailable")
        s.frontFacing = enumerator.isFrontFacing(name)
        val errors = object : CameraVideoCapturer.CameraEventsHandler {
            private fun lost() { worker.execute {
                if (!valid(s) || generation != s.cameraGeneration || !s.cameraEnabled) return@execute
                if (!s.cameraFallbackTried) {
                    try { startCamera(s, true); return@execute } catch (_: Throwable) {}
                }
                cameraUnavailable(s)
            } }
            override fun onCameraError(error: String) { lost() }
            override fun onCameraDisconnected() { lost() }
            override fun onCameraFreezed(error: String) { lost() }
            override fun onCameraOpening(name: String) { worker.execute {
                if (valid(s) && generation == s.cameraGeneration) { s.cameraName = name; s.cameraNameLegacy = useLegacy }
            } }
            override fun onFirstFrameAvailable() {}
            override fun onCameraClosed() {}
        }
        s.capturer = enumerator.createCapturer(name, errors) ?: throw IllegalStateException("Camera unavailable")
        s.cameraName = name; s.cameraNameLegacy = useLegacy
        if (s.texture == null) s.texture = SurfaceTextureHelper.create("ftx-camera", s.egl!!.eglBaseContext) ?: throw IllegalStateException("Camera texture unavailable")
        s.capturer!!.initialize(s.texture, s.context, s.videoSource!!.capturerObserver)
        s.capturer!!.startCapture(640, 480, 24)
        s.cameraEnabled = true; s.videoTrack?.setEnabled(true)
        emit(s, "camera", JSONObject().put("cameraEnabled", true).put("frontFacing", s.frontFacing).put("canSwitchCamera", s.canSwitchCamera))
    }
    private fun setVideoEncoding(s: Session, sharing: Boolean) {
        val sender = s.videoSender ?: return
        try {
            val parameters = sender.parameters
            for (encoding in parameters.encodings) {
                encoding.maxBitrateBps = if (sharing) 1500000 else 700000
                encoding.maxFramerate = if (sharing) 15 else 24
            }
            sender.setParameters(parameters)
        } catch (_: Exception) { /* Continue with the negotiated encoder settings. */ }
    }

    private fun beginScreenShare(s: Session) {
        if (!s.video || !s.connected || !s.screenShareSupported || s.screenRequest != null) return
        val request = ++screenSequence
        s.screenRequest = request
        updateVideo(s)
        emit(s, "screen_pending", JSONObject().put("screenSharingPending", true))
        main.post {
            if (!expectsScreenShare(s.id, request)) return@post
            val host = s.videoHost?.get() as? VideoCallActivity
            if (host?.requestScreenPermission(s.id, request) != true) screenServiceStopped(s.id, request, true)
        }
    }

    internal fun expectsScreenShare(id: String, request: Int): Boolean =
        current?.let { valid(it) && it.id == id && it.screenRequest == request } == true

    internal fun screenPermissionResult(id: String, request: Int, consent: Intent?) { worker.execute {
        val s = current ?: return@execute
        if (!expectsScreenShare(id, request)) return@execute
        if (consent == null) stopScreenShare(s, "screen_cancelled")
        else {
            s.screenConsent = consent
            main.post { if (expectsScreenShare(id, request)) ScreenShareService.start(s.context, id, request) }
        }
    } }

    internal fun screenServiceReady(id: String, request: Int) { worker.execute {
        val s = current ?: return@execute
        if (!expectsScreenShare(id, request)) return@execute
        val consent = s.screenConsent ?: return@execute
        s.screenConsent = null // A system authorization may be consumed only once.
        try {
            val capture = CallScreenCapture(s.context, s.factory!!, s.egl!!.eglBaseContext, { width, height ->
                worker.execute {
                    if (!expectsScreenShare(id, request)) return@execute
                    try { s.screenCapture?.changeSize(width, height) } catch (_: Exception) { stopScreenShare(s, "screen_unavailable") }
                }
            }, { worker.execute { if (expectsScreenShare(id, request)) installScreenTrack(s) } }, { screenServiceStopped(id, request, false) })
            s.screenCapture = capture
            val deadline = Runnable { worker.execute {
                if (expectsScreenShare(id, request) && !s.screenSharing) stopScreenShare(s, "screen_unavailable")
            } }
            s.screenDeadline = deadline; main.postDelayed(deadline, 8000)
            capture.start(consent)
        } catch (_: Exception) { stopScreenShare(s, "screen_unavailable") }
    } }

    private fun installScreenTrack(s: Session) {
        s.screenDeadline?.let(main::removeCallbacks); s.screenDeadline = null
        try {
            val track = s.screenCapture?.track ?: error("Screen track unavailable")
            if (s.videoSender?.setTrack(track, false) != true) error("Screen track unavailable")
            s.screenSharing = true
            stopCamera(s)
            s.videoTrack?.setEnabled(false)
            setVideoEncoding(s, true)
            startScreenAudio(s)
            updateVideo(s)
            emit(s, "screen", JSONObject().put("screenSharing", true))
            emit(s, "screen_pending", JSONObject().put("screenSharingPending", false))
        } catch (_: Exception) { stopScreenShare(s, "screen_unavailable") }
    }

    private fun startScreenAudio(s: Session) {
        if (!s.supportsPlaybackCapture) return
        val projection = s.screenCapture?.projection ?: return
        val capture = CallScreenAudio.start(projection, s.screenAudioRate) { failed ->
            worker.execute {
                if (valid(s) && s.screenAudio === failed) {
                    stopScreenAudio(s)
                    updateVideo(s)
                }
            }
        } ?: return
        s.screenAudio = capture
        if (runCatching { updateAudioMute(s) }.isFailure) {
            stopScreenAudio(s)
            return
        }
        // Let the app being shared take media focus while voice chat continues.
        releaseAudioFocus(s)
    }

    private fun stopScreenAudio(s: Session) {
        val capture = s.screenAudio ?: return
        s.screenAudio = null
        runCatching { updateAudioMute(s) }
        capture.close()
    }

    private fun updateAudioMute(s: Session) {
        // Keep ADM mute in sync before sharing starts, so no buffered mic frame escapes a muted call.
        s.audioModule?.setMicrophoneMute(s.muted)
        s.track?.setEnabled(!s.muted || s.screenAudio != null)
    }

    internal fun screenServiceStopped(id: String, request: Int, failed: Boolean) { worker.execute {
        val s = current ?: return@execute
        if (expectsScreenShare(id, request)) stopScreenShare(s, if (failed) "screen_unavailable" else null)
    } }

    private fun stopScreenShare(s: Session, error: String? = null, ending: Boolean = false) {
        val request = s.screenRequest ?: return
        val sharing = s.screenSharing
        s.screenRequest = null
        s.screenConsent = null
        s.screenDeadline?.let(main::removeCallbacks); s.screenDeadline = null
        s.screenSharing = false
        stopScreenAudio(s)
        if (!ending && sharing && s.focusListener == null) requestAudioFocus(s)
        var reason = error
        val restored = !sharing || runCatching { s.videoSender?.setTrack(if (ending) null else s.videoTrack, false) == true }.getOrDefault(false)
        if (sharing && !restored && !ending) runCatching { s.videoSender?.setTrack(null, false) }
        s.screenCapture?.close(); s.screenCapture = null
        main.post { ScreenShareService.stop(s.id, request) }
        if (ending) return
        if (sharing) {
            if (restored) {
                setVideoEncoding(s, false)
                if (s.cameraEnabled) {
                    try { startCamera(s, s.cameraNameLegacy) } catch (_: Exception) {
                        try { startCamera(s, true) } catch (_: Exception) { cameraUnavailable(s) }
                    }
                }
            } else {
                cameraUnavailable(s)
                reason = "screen_unavailable"
            }
        }
        updateVideo(s)
        if (sharing) emit(s, "screen", JSONObject().put("screenSharing", false))
        emit(s, "screen_pending", JSONObject().put("screenSharingPending", false))
        if (reason != null) {
            val message = if (reason == "screen_cancelled") "未开始屏幕共享" else "暂时无法共享屏幕，通话继续"
            main.post { if (valid(s)) s.videoHost?.get()?.let { android.widget.Toast.makeText(it, message, android.widget.Toast.LENGTH_SHORT).show() } }
            emit(s, "screen_error", JSONObject().put("reason", reason))
        }
    }

    private fun updateVideo(s: Session) {
        main.post { if (valid(s)) s.videoView?.let { updateVideoView(s, it) } }
    }
    private fun updateVideoView(s: Session, view: VideoCallView) = view.update(s.muted, s.speaker, s.cameraEnabled, s.remoteCameraEnabled,
        s.frontFacing, s.connected, s.canSwitchCamera, s.recording?.snapshot(), s.screenShareSupported,
        s.screenSharing, s.remoteScreenSharing, s.screenRequest != null && !s.screenSharing, s.screenAudio != null)
    @JvmStatic fun attachVideo(activity: VideoCallActivity, id: String): Boolean {
        val s = current ?: return false
        if (s.id != id || !valid(s) || !s.video || s.egl == null || s.videoTrack == null) return false
        if (s.videoHost?.get() === activity && s.videoView != null) return true
        s.videoView?.release()
        s.videoHost = WeakReference(activity)
        val view = VideoCallView(activity, s.egl!!.eglBaseContext, s.videoTrack!!, s.peerName, s.peerAvatar,
            { value ->
                val dispatch = { if (valid(s)) emit(s, "control", value) }
                if (value.optBoolean("cameraEnabled")) activity.withCameraPermission(id, dispatch) else dispatch()
            },
            { worker.execute { if (valid(s)) { emit(s, "hangup"); release(s) } } })
        s.videoView = view; view.show(); view.setRemoteTrack(s.remoteVideo)
        updateVideoView(s, view)
        return true
    }
    @JvmStatic fun detachVideo(activity: Activity, id: String) {
        val s = current ?: return
        if (s.id != id || s.videoHost?.get() !== activity) return
        s.videoView?.release(); s.videoView = null; s.videoHost = null
    }
    @JvmStatic fun pipChanged(id: String, value: Boolean) { current?.let { if (it.id == id && valid(it)) it.videoView?.setPip(value) } }
    @JvmStatic fun canPip(id: String): Boolean = current?.let { it.id == id && valid(it) && it.connected && it.video } == true
    @JvmStatic fun recordingState(id: String): JSONObject? = current?.takeIf { it.id == id && valid(it) }?.recording?.snapshot()
    @JvmStatic fun showVideo(activity: Activity, id: String) {
        val s = current ?: return
        if (s.id == id && valid(s) && s.video && !VideoCallActivity.visible) {
            VideoCallActivity.markLaunching()
            try { activity.startActivity(Intent(activity, VideoCallActivity::class.java).putExtra("callId", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)) }
            catch (_: Exception) { VideoCallActivity.cancelLaunching() }
        }
    }
    @JvmStatic fun videoClosed(id: String) { current?.let { s -> if (s.id == id && valid(s) && s.video) { emit(s, "hangup"); close(s.id) } } }
    @JvmStatic fun resumeState() { current?.let { s -> if (valid(s)) {
        emit(s, "control", JSONObject().put("muted", s.muted).put("speaker", s.speaker))
        if (s.video) emit(s, "camera", JSONObject().put("cameraEnabled", s.cameraEnabled).put("frontFacing", s.frontFacing).put("canSwitchCamera", s.canSwitchCamera))
    } } }
    @JvmStatic fun signal(id: String, json: String) {
        worker.execute {
            val s = current ?: return@execute
            if (s.id != id || !valid(s)) return@execute
            try {
                val input = JSONObject(json)
                when (input.optString("type")) {
                    "offer", "answer" -> {
                        val type = SessionDescription.Type.fromCanonicalForm(input.getString("type"))
                        val description = SessionDescription(type, input.getString("sdp"))
                        s.peer!!.setRemoteDescription(observer(s, done = {
                            s.remoteSet = true
                            for (ice in s.ice) s.peer?.addIceCandidate(ice)
                            s.ice.clear()
                            if (type == SessionDescription.Type.OFFER) s.peer!!.createAnswer(observer(s, created = { localDescription(s, it) }), MediaConstraints())
                        }), description)
                    }
                    "ice" -> {
                        val inputIce = input.getJSONObject("candidate")
                        val candidate = inputIce.getString("candidate")
                        if (candidate.contains(" typ relay ")) return@execute
                        val ice = IceCandidate(inputIce.optString("sdpMid", "0"), inputIce.optInt("sdpMLineIndex", 0), candidate)
                        if (s.remoteSet) s.peer?.addIceCandidate(ice) else if (s.ice.size < 64) s.ice.add(ice)
                    }
                }
            } catch (_: Exception) { fail(s, "connect_failed") }
        }
    }
    @Suppress("DEPRECATION") private fun route(s: Session, speaker: Boolean) {
        if (Build.VERSION.SDK_INT >= 31) {
            val types = if (speaker) listOf(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) else listOf(AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE)
            val devices = s.audio.availableCommunicationDevices
            val device = types.firstNotNullOfOrNull { type -> devices.firstOrNull { it.type == type } }
            if (device != null) s.audio.setCommunicationDevice(device) else s.audio.clearCommunicationDevice()
        } else s.audio.isSpeakerphoneOn = speaker
    }
    @JvmStatic fun control(id: String, options: String) {
        val session = current
        if (session == null || session.id != id || !valid(session)) return
        val input = runCatching { JSONObject(options) }.getOrNull() ?: return
        val revision = if (input.has("cameraEnabled")) session.cameraIntentRevision.incrementAndGet() else null
        if (input.optBoolean("cameraEnabled")) {
            RealtimeBridge.withCameraService(id) { controlMedia(id, options, revision) }
        } else {
            if (revision != null) RealtimeBridge.cancelCameraServiceAction(id)
            controlMedia(id, options, revision)
        }
    }
    private fun controlMedia(id: String, options: String, cameraRevision: Int?) {
        worker.execute {
            val s = current ?: return@execute
            if (s.id != id || !valid(s) || (cameraRevision != null && cameraRevision != s.cameraIntentRevision.get())) return@execute
            try {
                val input = JSONObject(options)
                if (input.optBoolean("connected") && !s.connected) {
                    s.connected = true
                    if (s.recording?.automatic == true) s.recording?.start()
                }
                if (input.has("muted")) {
                    s.muted = input.getBoolean("muted")
                    s.recording?.setMuted(s.muted)
                    updateAudioMute(s)
                    RealtimeBridge.updateMuted(id, s.muted)
                }
                if (s.connected && input.has("recordingEnabled")) {
                    if (input.optBoolean("recordingEnabled")) s.recording?.start() else s.recording?.stop()
                }
                if (input.has("speaker")) { s.speaker = input.getBoolean("speaker"); route(s, s.speaker) }
                if (s.video) {
                    if (input.has("screenShareSupported")) s.screenShareSupported = s.entryMode == "video" && input.optBoolean("screenShareSupported")
                    if (input.has("remoteScreenSharing")) s.remoteScreenSharing = input.optBoolean("remoteScreenSharing")
                    if (!s.screenShareSupported || (input.has("screenSharing") && !input.optBoolean("screenSharing"))) stopScreenShare(s)
                    if (input.optBoolean("screenSharing")) beginScreenShare(s)
                    if (s.screenRequest == null && input.has("cameraEnabled") && s.cameraEnabled != input.getBoolean("cameraEnabled")) {
                        if (input.getBoolean("cameraEnabled")) {
                            try { startCamera(s) } catch (_: Throwable) {
                                try { startCamera(s, true) } catch (_: Throwable) { cameraUnavailable(s) }
                            }
                        } else { stopCamera(s); s.cameraEnabled = false; s.videoTrack?.setEnabled(false) }
                    }
                    if (input.has("remoteCameraEnabled")) s.remoteCameraEnabled = input.getBoolean("remoteCameraEnabled")
                    val generation = s.cameraGeneration
                    if (s.screenRequest == null && input.optBoolean("switchCamera") && s.cameraEnabled && s.canSwitchCamera) s.capturer?.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
                        override fun onCameraSwitchDone(front: Boolean) { worker.execute {
                            if (valid(s) && s.cameraGeneration == generation) { s.frontFacing = front; updateVideo(s); emit(s, "camera", JSONObject().put("frontFacing", front)) }
                        } }
                        override fun onCameraSwitchError(error: String) { worker.execute {
                            if (valid(s) && s.cameraGeneration == generation) emit(s, "control_error", JSONObject().put("cameraEnabled", s.cameraEnabled))
                        } }
                    })
                    updateVideo(s)
                }
            } catch (_: Exception) { fail(s, "unavailable") }
        }
    }
    @Suppress("DEPRECATION") private fun release(s: Session) {
        if (s.closed) return
        s.closed = true
        s.recording?.close()
        stopScreenShare(s, ending = true)
        RealtimeBridge.detachCall(s.id)
        try { s.capturer?.stopCapture() } catch (_: Exception) {}
        if (s.video) {
            main.post {
                try { s.videoView?.release() } finally {
                    s.videoView = null; s.videoHost = null; VideoCallActivity.finishCall(s.id)
                    worker.execute { dispose(s) }
                }
            }
        } else dispose(s)
    }
    @Suppress("DEPRECATION") private fun dispose(s: Session) {
        try { s.peer?.close() } catch (_: Exception) {}
        try { s.peer?.dispose() } catch (_: Exception) {}
        try { s.capturer?.dispose() } catch (_: Exception) {}
        try { s.texture?.dispose() } catch (_: Exception) {}
        try { s.videoTrack?.dispose() } catch (_: Exception) {}
        try { s.videoSource?.dispose() } catch (_: Exception) {}
        try { s.track?.dispose() } catch (_: Exception) {}
        try { s.source?.dispose() } catch (_: Exception) {}
        try { s.factory?.dispose() } catch (_: Exception) {}
        try { s.egl?.release() } catch (_: Exception) {}
        s.ice.clear()
        try {
            if (s.audioChanged) {
                if (Build.VERSION.SDK_INT >= 31) s.audio.clearCommunicationDevice() else s.audio.isSpeakerphoneOn = s.oldSpeaker
                s.audio.mode = s.oldMode
            }
        } catch (_: Exception) {}
        releaseAudioFocus(s)
        if (current === s) current = null
    }
    @JvmStatic fun close(id: String) { worker.execute { current?.let { if (it.id == id) release(it) } } }
}
