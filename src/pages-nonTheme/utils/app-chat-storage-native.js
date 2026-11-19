import { createAppChatStorage } from './app-chat-storage.js'
import { reclaimAppChatMediaSpace } from './chat-local-media.js'

let androidSQLitePackaged

function readAndroidSQLiteFeature() {
    let stream
    let scanner
    try {
        const activity = plus.android.runtimeMainActivity()
        const assets = plus.android.invoke(activity, 'getAssets')
        stream = plus.android.invoke(assets, 'open', 'data/dcloud_properties.xml')
        scanner = plus.android.newObject('java.util.Scanner', stream, 'UTF-8')
        plus.android.invoke(scanner, 'useDelimiter', '\\A')
        const properties = plus.android.invoke(scanner, 'next')
        // Old bases can expose plus.sqlite in JavaScript even when its native feature was omitted.
        if (typeof properties === 'string' && /<features\b/i.test(properties)) {
            return /<feature\s+[^>]*\bname\s*=\s*["']sqlite["']/i.test(properties)
        }
    } catch (_) {
        // If the native registry cannot be read, let the SQLite bridge report its own status.
    } finally {
        try { if (scanner || stream) plus.android.invoke(scanner || stream, 'close') } catch (_) {}
    }
}

function getSQLite() {
    if (typeof plus === 'undefined') return null
    if (plus.os?.name === 'Android') {
        androidSQLitePackaged ??= readAndroidSQLiteFeature()
        if (androidSQLitePackaged === false) return null
    }
    return plus.sqlite
}

export const appChatStorage = createAppChatStorage({
    platform: getSQLite,
    storage: {
        getStorageSync: key => uni.getStorageSync(key),
        keys: () => uni.getStorageInfoSync().keys,
        setStorageSync: (key, value) => uni.setStorageSync(key, value),
        removeStorageSync: key => uni.removeStorageSync(key)
    },
    reclaimSpace: reclaimAppChatMediaSpace
})
