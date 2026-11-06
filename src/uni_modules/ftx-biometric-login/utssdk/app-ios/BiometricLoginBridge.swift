import Foundation
import LocalAuthentication
import Security

public class BiometricLoginBridge: NSObject {
    private static var active: LAContext?
    private static func tag(_ id: String) -> Data { Data("ftx.biometric.\(id)".utf8) }
    public static func request(_ options: String, _ callback: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            func reply(_ result: [String: Any]) {
                let data = (try? JSONSerialization.data(withJSONObject: result)) ?? Data("{}".utf8)
                callback(String(data: data, encoding: .utf8) ?? "{}")
            }
            guard let data = options.data(using: .utf8), let input = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let operation = input["operation"] as? String else { reply(["error": "INVALID_REQUEST"]); return }
            if operation == "cancel" { active?.invalidate(); reply([:]); return }
            let context = LAContext()
            context.localizedCancelTitle = "使用其他方式"
            context.localizedFallbackTitle = ""
            var policyError: NSError?
            let enrolled = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &policyError)
            if operation == "capability" {
                reply(["supported": context.biometryType != .none, "enrolled": enrolled,
                       "label": context.biometryType == .faceID ? "面容登录" : "指纹登录"])
                return
            }
            guard let id = input["keyId"] as? String, UUID(uuidString: id) != nil else { reply(["error": "INVALID_REQUEST"]); return }
            let keyTag = tag(id)
            let query: [String: Any] = [kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: keyTag,
                                        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom]
            if operation == "delete" { SecItemDelete(query as CFDictionary); reply([:]); return }
            guard enrolled else { reply(["error": "NOT_ENROLLED"]); return }
            if operation == "create" {
                var accessError: Unmanaged<CFError>?
                guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                    [.privateKeyUsage, .biometryCurrentSet], &accessError) else { reply(["error": "UNAVAILABLE"]); return }
                let attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
                    kSecAttrKeySizeInBits as String: 256, kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
                    kSecPrivateKeyAttrs as String: [kSecAttrIsPermanent as String: true,
                        kSecAttrApplicationTag as String: keyTag, kSecAttrAccessControl as String: access]]
                var keyError: Unmanaged<CFError>?
                guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &keyError),
                      let publicKey = SecKeyCopyPublicKey(key),
                      let exported = SecKeyCopyExternalRepresentation(publicKey, &keyError) else { reply(["error": "UNAVAILABLE"]); return }
                reply(["publicKey": (exported as Data).base64EncodedString()]); return
            }
            guard operation == "sign", let payload = input["payload"] as? String,
                  payload.hasPrefix("ftx-biometric:v1:"), payload.utf8.count < 256 else { reply(["error": "INVALID_REQUEST"]); return }
            guard active == nil else { reply(["error": "BUSY"]); return }
            active = context
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "验证身份以登录分投侠") { success, error in
                var result: [String: Any] = ["error": "UNAVAILABLE"]
                if success {
                    var readQuery = query
                    readQuery[kSecReturnRef as String] = true
                    readQuery[kSecUseAuthenticationContext as String] = context
                    var item: CFTypeRef?
                    if SecItemCopyMatching(readQuery as CFDictionary, &item) == errSecSuccess, let item = item {
                        let key = item as! SecKey
                        var signError: Unmanaged<CFError>?
                        if let signature = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, Data(payload.utf8) as CFData, &signError) {
                            result = ["signature": (signature as Data).base64EncodedString()]
                        } else { result = ["error": "KEY_INVALID"] }
                    } else { result = ["error": "KEY_INVALID"] }
                } else if let error = error as? LAError {
                    switch error.code {
                    case .userCancel, .appCancel, .systemCancel, .userFallback: result = ["error": "CANCELLED"]
                    case .biometryLockout: result = ["error": "LOCKED"]
                    default: result = ["error": "UNAVAILABLE"]
                    }
                }
                DispatchQueue.main.async {
                    if active === context { active = nil }
                    reply(result)
                }
            }
        }
    }
}
