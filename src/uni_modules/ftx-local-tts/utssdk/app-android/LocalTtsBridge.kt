package ftx.speech

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener

object LocalTtsBridge {
    private val main = Handler(Looper.getMainLooper())
    private var engine: TextToSpeech? = null
    private var ready = false
    private var generation = 0
    private data class Speech(val id: String, val callback: (Boolean) -> Unit)
    private var active: Speech? = null

    private fun voiceForChinese(tts: TextToSpeech) = runCatching {
        val voices = tts.voices.orEmpty().filter {
            it.locale.language == "zh" && !it.isNetworkConnectionRequired &&
                TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features.orEmpty()
        }
        voices.firstOrNull { it.locale.country == "CN" } ?: voices.firstOrNull()
    }.getOrNull()

    fun probe(context: Context, callback: (Boolean) -> Unit) {
        main.post {
            val existing = engine
            if (existing != null) {
                callback(ready && voiceForChinese(existing) != null)
                return@post
            }
            val attempt = ++generation
            fun finish(success: Boolean) {
                if (attempt != generation || ready) return
                val initialized = engine
                if (!success || initialized == null) {
                    generation++
                    runCatching { initialized?.shutdown() }
                    engine = null
                    callback(false)
                    return
                }
                ready = true
                initialized.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String) = Unit
                    override fun onDone(id: String) { main.post { complete(id, true) } }
                    @Deprecated("Required by UtteranceProgressListener")
                    override fun onError(id: String) { main.post { complete(id, false) } }
                    override fun onStop(id: String, interrupted: Boolean) { main.post { complete(id, false) } }
                })
                callback(voiceForChinese(initialized) != null)
            }
            try {
                engine = TextToSpeech(context.applicationContext) { status ->
                    main.post { finish(status == TextToSpeech.SUCCESS) }
                }
                main.postDelayed({ finish(false) }, 3500L)
            } catch (_: Exception) {
                finish(false)
            }
        }
    }

    fun speak(text: String, id: String, callback: (Boolean) -> Unit) {
        main.post {
            val tts = engine
            val voice = if (ready && tts != null) voiceForChinese(tts) else null
            if (tts == null || voice == null) {
                callback(false)
                return@post
            }
            cancelActive()
            active = Speech(id, callback)
            val accepted = runCatching {
                tts.setVoice(voice) == TextToSpeech.SUCCESS &&
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.SUCCESS
            }.getOrDefault(false)
            if (!accepted) complete(id, false)
        }
    }

    fun stop(id: String) { main.post { if (active?.id == id) cancelActive() } }

    private fun cancelActive() {
        val speech = active ?: return
        active = null
        runCatching { engine?.stop() }
        speech.callback(false)
    }

    private fun complete(id: String, success: Boolean) {
        val speech = active?.takeIf { it.id == id } ?: return
        active = null
        speech.callback(success)
    }
}
