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
    @Volatile private var current: Session? = null
    private class Session(val id: String, val context: Context, val callback: (String) -> Unit,
                          val video: Boolean = false, activity: Activity? = null) {
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
        var remoteVideo: VideoTrack? = null
        var capturer: CameraVideoCapturer? = null
        var texture: SurfaceTextureHelper? = null
        var videoView: VideoCallView? = null
        var cameraEnabled = true
        var remoteCameraEnabled = true
        var frontFacing = true
        var muted = false
        var speaker = video
        var connected = false
        var peerName = "联系人"
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
            val s = Session(id, context.applicationContext, callback, video, context as? Activity); current = s
            try {
                if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { fail(s, "permission_denied"); return@execute }
                if (video && context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) { fail(s, "permission_denied"); return@execute }
                if (video && s.activity?.get() == null) { fail(s, "unavailable"); return@execute }
                RealtimeBridge.attachCall(context, id, video)
                val urls = input.optJSONArray("stunUrls")
                val servers = mutableListOf<PeerConnection.IceServer>()
                if (urls != null) for (index in 0 until minOf(urls.length(), 3)) {
                    val url = urls.optString(index)
                    if (url.startsWith("stun:") || url.startsWith("stuns:")) servers.add(PeerConnection.IceServer.builder(url).createIceServer())
                }
                val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
                    // A short notification duck request must not hang up speech.
                    if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) worker.execute { fail(s, "interrupted") }
                }
                s.focusListener = focusListener
                @Suppress("DEPRECATION")
                val focusResult = if (Build.VERSION.SDK_INT >= 26) {
                    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
                    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener, main).build()
                    s.focus = request; s.audio.requestAudioFocus(request)
                } else s.audio.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                if (focusResult != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { fail(s, "interrupted"); return@execute }
                s.audioChanged = true
                s.audio.mode = AudioManager.MODE_IN_COMMUNICATION
                route(s, s.speaker)
                if (!initialized) {
                    PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
                    initialized = true
                }
                val module = JavaAudioDeviceModule.builder(context.applicationContext).createAudioDeviceModule()
                val factory = try {
                    val builder = PeerConnectionFactory.builder().setAudioDeviceModule(module)
                    if (video) {
                        val egl = EglBase.create(); s.egl = egl
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
                    val track = s.videoTrack!!
                    val sender = s.peer!!.addTrack(track, listOf("ftx-voice"))
                    val parameters = sender.parameters
                    for (encoding in parameters.encodings) { encoding.maxBitrateBps = 700000; encoding.maxFramerate = 24 }
                    sender.setParameters(parameters)
                    s.peerName = input.optString("peerName", "联系人").take(80)
                    main.post {
                        if (!valid(s) || (nativeAnswer && !RealtimeBridge.isNativeCall(id))) return@post
                        try {
                            val origin = s.activity?.get()
                            if (origin == null || origin.isFinishing || origin.isDestroyed) { worker.execute { fail(s, "camera_unavailable") }; return@post }
                            VideoCallActivity.markLaunching()
                            origin.startActivity(Intent(origin, VideoCallActivity::class.java)
                                .putExtra("callId", id).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
                        } catch (_: Throwable) { VideoCallActivity.cancelLaunching(); worker.execute { fail(s, "camera_unavailable") } }
                    }
                }
                if (nativeAnswer && !RealtimeBridge.isNativeCall(id)) { release(s); return@execute }
                emit(s, "ready")
                if (input.optBoolean("offerer")) s.peer!!.createOffer(observer(s, created = { localDescription(s, it) }), MediaConstraints())
            } catch (_: Throwable) { fail(s, if (video) "camera_unavailable" else "unavailable") }
        }
    }
    private fun createCamera(s: Session, factory: PeerConnectionFactory) {
        val enumerator: CameraEnumerator = if (Camera2Enumerator.isSupported(s.context)) Camera2Enumerator(s.context) else Camera1Enumerator(false)
        val names = enumerator.deviceNames
        val name = names.firstOrNull { enumerator.isFrontFacing(it) } ?: names.firstOrNull() ?: throw IllegalStateException("Camera unavailable")
        s.frontFacing = enumerator.isFrontFacing(name)
        val errors = object : CameraVideoCapturer.CameraEventsHandler {
            private fun lost() { worker.execute { if (valid(s) && s.cameraEnabled) fail(s, "camera_unavailable") } }
            override fun onCameraError(error: String) { lost() }
            override fun onCameraDisconnected() { lost() }
            override fun onCameraFreezed(error: String) { lost() }
            override fun onCameraOpening(name: String) {}
            override fun onFirstFrameAvailable() {}
            override fun onCameraClosed() {}
        }
        s.capturer = enumerator.createCapturer(name, errors) ?: throw IllegalStateException("Camera unavailable")
        s.texture = SurfaceTextureHelper.create("ftx-camera", s.egl!!.eglBaseContext) ?: throw IllegalStateException("Camera texture unavailable")
        s.videoSource = factory.createVideoSource(false)
        s.videoTrack = factory.createVideoTrack("ftx-video", s.videoSource)
        s.capturer!!.initialize(s.texture, s.context, s.videoSource!!.capturerObserver)
        s.capturer!!.startCapture(640, 480, 24)
    }
    private fun updateVideo(s: Session) {
        main.post { if (valid(s)) s.videoView?.update(s.muted, s.speaker, s.cameraEnabled, s.remoteCameraEnabled, s.frontFacing, s.connected) }
    }
    @JvmStatic fun attachVideo(activity: VideoCallActivity, id: String): Boolean {
        val s = current ?: return false
        if (s.id != id || !valid(s) || !s.video || s.egl == null || s.videoTrack == null) return false
        s.videoView?.release()
        val view = VideoCallView(activity, s.egl!!.eglBaseContext, s.videoTrack!!, s.peerName,
            { value -> if (valid(s)) emit(s, "control", value) },
            { worker.execute { if (valid(s)) { emit(s, "hangup"); release(s) } } })
        s.videoView = view; view.show(); view.setRemoteTrack(s.remoteVideo)
        view.update(s.muted, s.speaker, s.cameraEnabled, s.remoteCameraEnabled, s.frontFacing, s.connected)
        return true
    }
    @JvmStatic fun pipChanged(id: String, value: Boolean) { current?.let { if (it.id == id && valid(it)) it.videoView?.setPip(value) } }
    @JvmStatic fun canPip(id: String): Boolean = current?.let { it.id == id && valid(it) && it.connected && it.video } == true
    @JvmStatic fun showVideo(activity: Activity, id: String) {
        val s = current ?: return
        if (s.id == id && valid(s) && s.video && !VideoCallActivity.visible) {
            VideoCallActivity.markLaunching()
            try { activity.startActivity(Intent(activity, VideoCallActivity::class.java).putExtra("callId", id).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)) }
            catch (_: Exception) { VideoCallActivity.cancelLaunching() }
        }
    }
    @JvmStatic fun videoClosed(id: String) { current?.let { s -> if (s.id == id && valid(s) && s.video) { emit(s, "hangup"); close(s.id) } } }
    @JvmStatic fun resumeState() { current?.let { s -> if (valid(s)) {
        emit(s, "control", JSONObject().put("muted", s.muted).put("speaker", s.speaker))
        if (s.video) emit(s, "camera", JSONObject().put("cameraEnabled", s.cameraEnabled).put("frontFacing", s.frontFacing))
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
        worker.execute {
            val s = current ?: return@execute
            if (s.id != id || !valid(s)) return@execute
            try {
                val input = JSONObject(options)
                if (input.optBoolean("connected")) s.connected = true
                if (input.has("muted")) { s.muted = input.getBoolean("muted"); s.track?.setEnabled(!s.muted); RealtimeBridge.updateMuted(id, s.muted) }
                if (input.has("speaker")) { s.speaker = input.getBoolean("speaker"); route(s, s.speaker) }
                if (s.video) {
                    if (input.has("cameraEnabled") && s.cameraEnabled != input.getBoolean("cameraEnabled")) {
                        s.cameraEnabled = input.getBoolean("cameraEnabled")
                        s.videoTrack?.setEnabled(s.cameraEnabled)
                        if (s.cameraEnabled) s.capturer?.startCapture(640, 480, 24) else s.capturer?.stopCapture()
                    }
                    if (input.has("remoteCameraEnabled")) s.remoteCameraEnabled = input.getBoolean("remoteCameraEnabled")
                    if (input.optBoolean("switchCamera") && s.cameraEnabled) s.capturer?.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
                        override fun onCameraSwitchDone(front: Boolean) { worker.execute {
                            if (valid(s)) { s.frontFacing = front; updateVideo(s); emit(s, "camera", JSONObject().put("frontFacing", front)) }
                        } }
                        override fun onCameraSwitchError(error: String) { worker.execute {
                            if (valid(s)) emit(s, "control_error", JSONObject().put("cameraEnabled", s.cameraEnabled))
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
        RealtimeBridge.detachCall(s.id)
        try { s.capturer?.stopCapture() } catch (_: Exception) {}
        if (s.video) {
            main.post {
                try { s.videoView?.release() } finally {
                    s.videoView = null; VideoCallActivity.finishCall(s.id)
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
            if (Build.VERSION.SDK_INT >= 26) s.focus?.let { s.audio.abandonAudioFocusRequest(it) }
            else s.focusListener?.let { s.audio.abandonAudioFocus(it) }
        } catch (_: Exception) {}
        if (current === s) current = null
    }
    @JvmStatic fun close(id: String) { worker.execute { current?.let { if (it.id == id) release(it) } } }
}
