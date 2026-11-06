package ftx.biometric

import android.app.Activity
import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.hardware.fingerprint.FingerprintManager
import android.os.Build
import android.os.CancellationSignal
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

object BiometricLoginBridge {
    private var active: CancellationSignal? = null
    private fun store(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private fun alias(id: String): String {
        require(Regex("^[0-9a-fA-F-]{36}$").matches(id))
        return "ftx.biometric.$id"
    }
    @JvmStatic fun request(activity: Activity, options: String, callback: (String) -> Unit) {
        activity.runOnUiThread {
            fun reply(value: JSONObject) { callback(value.toString()) }
            fun error(code: String) { reply(JSONObject().put("error", code)) }
            try {
                val input = JSONObject(options)
                val operation = input.optString("operation")
                if (operation == "cancel") { active?.cancel(); reply(JSONObject()); return@runOnUiThread }
                if (Build.VERSION.SDK_INT < 28) { error("UNAVAILABLE"); return@runOnUiThread }
                if (operation == "capability") {
                    val fingerprint = activity.getSystemService(Context.FINGERPRINT_SERVICE) as? FingerprintManager
                    val hasFingerprint = fingerprint?.isHardwareDetected == true
                    val fingerprintEnrolled = fingerprint?.hasEnrolledFingerprints() == true
                    val status = if (Build.VERSION.SDK_INT >= 30) {
                        activity.getSystemService(BiometricManager::class.java)
                            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    } else if (fingerprintEnrolled) 0 else if (hasFingerprint) 11 else 12
                    val supported = status == 0 || status == 11 || hasFingerprint
                    val hasFace = Build.VERSION.SDK_INT >= 30 && activity.packageManager.hasSystemFeature("android.hardware.biometrics.face")
                    val label = if (hasFace && hasFingerprint) "指纹或面容登录" else if (hasFace) "面容登录" else if (hasFingerprint) "指纹登录" else "系统生物认证登录"
                    reply(JSONObject().put("supported", supported).put("enrolled", status == 0).put("label", label))
                    return@runOnUiThread
                }
                val name = alias(input.getString("keyId"))
                if (operation == "delete") { store().deleteEntry(name); reply(JSONObject()); return@runOnUiThread }
                if (operation == "create") {
                    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
                    val spec = KeyGenParameterSpec.Builder(name, KeyProperties.PURPOSE_SIGN)
                        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(true)
                        .setInvalidatedByBiometricEnrollment(true)
                    if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                    else spec.setUserAuthenticationValidityDurationSeconds(-1)
                    generator.initialize(spec.build())
                    val key = generator.generateKeyPair()
                    reply(JSONObject().put("publicKey", Base64.encodeToString(key.public.encoded, Base64.NO_WRAP)))
                    return@runOnUiThread
                }
                if (operation != "sign") { error("INVALID_REQUEST"); return@runOnUiThread }
                if (active != null) { error("BUSY"); return@runOnUiThread }
                val key = store().getKey(name, null) as? java.security.PrivateKey
                if (key == null) { error("KEY_INVALID"); return@runOnUiThread }
                val signature = Signature.getInstance("SHA256withECDSA").apply { initSign(key) }
                val payload = input.getString("payload")
                require(payload.startsWith("ftx-biometric:v1:") && payload.length < 256)
                val cancellation = CancellationSignal()
                active = cancellation
                var finished = false
                fun finish(result: JSONObject) {
                    if (finished) return
                    finished = true
                    if (active === cancellation) active = null
                    reply(result)
                }
                val builder = BiometricPrompt.Builder(activity)
                    .setTitle("验证身份以登录分投侠")
                    .setSubtitle("请使用此设备已录入的指纹或面容")
                    .setNegativeButton("使用其他方式", activity.mainExecutor) { _, _ ->
                        cancellation.cancel()
                        finish(JSONObject().put("error", "CANCELLED"))
                    }
                if (Build.VERSION.SDK_INT >= 30) builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                builder.build().authenticate(BiometricPrompt.CryptoObject(signature), cancellation, activity.mainExecutor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            try {
                                val signer = result.cryptoObject?.signature ?: throw IllegalStateException()
                                signer.update(payload.toByteArray(Charsets.UTF_8))
                                finish(JSONObject().put("signature", Base64.encodeToString(signer.sign(), Base64.NO_WRAP)))
                            } catch (_: Exception) { finish(JSONObject().put("error", "KEY_INVALID")) }
                        }
                        override fun onAuthenticationError(code: Int, message: CharSequence) {
                            val reason = when (code) {
                                5, 10, 13 -> "CANCELLED"
                                7, 9 -> "LOCKED"
                                11 -> "NOT_ENROLLED"
                                else -> "UNAVAILABLE"
                            }
                            finish(JSONObject().put("error", reason))
                        }
                        // Failed matches stay in the system dialog; do not start another request.
                    })
            } catch (_: android.security.keystore.KeyPermanentlyInvalidatedException) { active = null; error("KEY_INVALID") }
            catch (_: Exception) { active = null; error("UNAVAILABLE") }
        }
    }
}
