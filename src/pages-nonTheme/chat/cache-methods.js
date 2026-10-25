import { loadChatHistoryCache, saveChatHistoryCache } from '@/utils/chat-history-cache.js'
// #ifndef H5
import { restoreCachedChatOriginalImages } from '@/pages-nonTheme/utils/chat-media-cache.js'
// #endif

export const historyCacheMethods = {
    async initializeMessages() {
            await this.loadMessagesFromStorage()
            if (this.isChatPageDestroyed) return
            this.messageCacheReady = true
            this.positionInitialChatAtBottom()
            if (this.canPollMessages()) {
                this.startMessagePolling()
            }
        },
    async loadMessagesFromStorage() {
            // #ifdef H5
            try {
                let cachedMessages = await loadChatHistoryCache(this.storageKey)
                // 迁移旧版 localStorage 缓存，迁移后释放会导致 QuotaExceededError 的旧存储空间。
                if (!Array.isArray(cachedMessages)) {
                    const legacyCache = uni.getStorageSync(this.storageKey)
                    if (legacyCache) {
                        const parsedMessages = JSON.parse(legacyCache)
                        if (Array.isArray(parsedMessages)) {
                            cachedMessages = parsedMessages
                            this.messages = cachedMessages
                            await saveChatHistoryCache(this.storageKey, cachedMessages)
                        }
                    }
                }
                if (Array.isArray(cachedMessages)) {
                    this.messages = cachedMessages
                    await this.restoreCachedOriginalImages()
                    uni.removeStorageSync(this.storageKey)
                }
            } catch (e) {
                console.warn('读取 IndexedDB 聊天缓存失败，将从服务器恢复消息。', e)
            }
            return
            // #endif
            try {
                const stored = uni.getStorageSync(this.storageKey)
                if (stored) {
                    this.messages = JSON.parse(stored)
                    await this.restoreCachedOriginalImages()
                }
                // 同时从服务器加载最新消息(服务器数据会覆盖本地的临时数据)
                this.loadMessagesFromServer()
            } catch (e) {
                console.error('读取聊天记录失败', e)
                this.messages = []
                this.loadMessagesFromServer()
            }
        },
// 已查看过的原图在 H5 复用浏览器缓存；小程序 / APP 则优先恢复 saveFile 的持久文件。
    async restoreCachedOriginalImages() {
            const originalMessages = this.messages.filter((message) => (
                message?.type === 'image' && message.originalLoaded && message.content
            ))
            if (originalMessages.length === 0) return

            // #ifdef H5
            originalMessages.forEach((message) => {
                this.setLoadedOriginalImage(message.id, message.content)
            })
            return
            // #endif

            // #ifndef H5
            const cachedPaths = await restoreCachedChatOriginalImages({
                userId: this.getCurrentUserId() || 'unknown',
                conversationId: this.chatId,
                images: originalMessages.map((message) => ({
                    id: message.id,
                    sourceUrl: message.content
                }))
            })
            let resetOriginalLoaded = false
            originalMessages.forEach((message) => {
                const localPath = cachedPaths[message.id]
                if (localPath) {
                    this.setLoadedOriginalImage(message.id, localPath)
                    return
                }
                // LRU 或系统清理了文件时回到缩略图，避免进入聊天就重新请求所有原图。
                message.originalLoaded = false
                resetOriginalLoaded = true
            })
            if (resetOriginalLoaded) this.saveMessagesToStorage()
            // #endif
        },
    saveMessagesToStorage() {
            // #ifdef H5
            saveChatHistoryCache(this.storageKey, this.messages).catch(e => {
                console.warn('保存 IndexedDB 聊天缓存失败，当前聊天不受影响。', e)
            })
            return
            // #endif
            try {
                // 清理消息中的大文件 blob URL,避免超出 localStorage 限制
                const messagesToSave = this.messages.map(msg => {
                    // 对于文件和视频消息,如果是 blob URL,不保存到 localStorage
                    if ((msg.type === 'file' || msg.type === 'video') && msg.content && msg.content.startsWith('blob:')) {
                        return {
                            ...msg,
                            content: null, // 清空 blob URL
                            _isLocalBlob: true // 标记这是本地 blob
                        }
                    }
                    // 视频缩略图也可能是 blob
                    if (msg.type === 'video' && msg.thumbnail && msg.thumbnail.startsWith('blob:')) {
                        return {
                            ...msg,
                            thumbnail: null
                        }
                    }
                    return msg
                })
                
                uni.setStorageSync(this.storageKey, JSON.stringify(messagesToSave))
            } catch (e) {
                console.error('保存聊天记录失败', e)
                // 如果还是失败,尝试只保存最近的消息
                try {
                    const recentMessages = this.messages.slice(-50).map(msg => {
                        if ((msg.type === 'file' || msg.type === 'video') && msg.content && msg.content.startsWith('blob:')) {
                            return {
                                ...msg,
                                content: null,
                                _isLocalBlob: true
                            }
                        }
                        if (msg.type === 'video' && msg.thumbnail && msg.thumbnail.startsWith('blob:')) {
                            return {
                                ...msg,
                                thumbnail: null
                            }
                        }
                        return msg
                    })
                    uni.setStorageSync(this.storageKey, JSON.stringify(recentMessages))
                } catch (e2) {
                    console.error('保存最近聊天记录也失败', e2)
                }
            }
        }
}

export const localFileCacheMethods = {
    loadLocalFileCache() {
            try {
                const userInfo = uni.getStorageSync('userInfo')
                const userId = userInfo?.id || userInfo?.userId || 'unknown'
                const cacheKey = `file_cache_${userId}_${this.chatId}`
                const cached = uni.getStorageSync(cacheKey)
                if (cached) {
                    this.localFileCache = JSON.parse(cached)
                }
            } catch (e) {
                console.error('读取文件缓存失败', e)
                this.localFileCache = {}
            }
        },
    saveLocalFileCache() {
            try {
                const userInfo = uni.getStorageSync('userInfo')
                const userId = userInfo?.id || userInfo?.userId || 'unknown'
                const cacheKey = `file_cache_${userId}_${this.chatId}`
                uni.setStorageSync(cacheKey, JSON.stringify(this.localFileCache))
            } catch (e) {
                console.error('保存文件缓存失败', e)
            }
        }
}
