import * as chatApi from '@/pages-nonTheme/api/chat.js'
import { baseUrl } from '@/api/settings.js'
// #ifndef H5
import { cacheChatOriginalImage, removeCachedChatOriginalImage } from '@/pages-nonTheme/utils/chat-media-cache.js'
// #endif

export const imageSourceMethods = {
    getImageDisplaySrc(msg) {
            if (!msg) return ''
            const shouldUseOriginalFallback = Boolean(this.thumbnailFallbackIds[msg.id])
            const baseImageUrl = this.loadedOriginalImages[msg.id] || (
                shouldUseOriginalFallback ? msg.content : (msg.thumbnail || this.getThumbnail(msg.content))
            )
            const nonce = this.imageRetryNonces[msg.id]
            if (!nonce || typeof baseImageUrl !== 'string' || !/^https?:\/\//i.test(baseImageUrl)) {
                return baseImageUrl
            }
            const hashIndex = baseImageUrl.indexOf('#')
            const urlWithoutHash = hashIndex >= 0 ? baseImageUrl.slice(0, hashIndex) : baseImageUrl
            const hash = hashIndex >= 0 ? baseImageUrl.slice(hashIndex) : ''
            const separator = urlWithoutHash.includes('?') ? '&' : '?'
            return `${urlWithoutHash}${separator}__chat_retry=${encodeURIComponent(String(nonce))}${hash}`
        },
    setLoadedOriginalImage(messageId, sourceUrl) {
            if (messageId === undefined || messageId === null || !sourceUrl) return
            this.originalImageTokenSeed += 1
            this.$set(this.loadedOriginalImageTokens, messageId, `${Date.now()}_${this.originalImageTokenSeed}`)
            this.$set(this.loadedOriginalImages, messageId, sourceUrl)
        },
    clearLoadedOriginalImage(messageId) {
            if (messageId === undefined || messageId === null) return
            delete this.loadedOriginalImages[messageId]
            delete this.loadedOriginalImageTokens[messageId]
        },
    getCurrentImageMessage(messageId, sourceUrl) {
            return this.messages.find((message) => (
                String(message?.id) === String(messageId) &&
                message?.type === 'image' &&
                message.content === sourceUrl
            )) || null
        },
// 生成并缓存缩略图 URL（通过后端接口 /api/chat/imageReview?path=...），优先用于列表展示以节省流量
// 注意：msg.content 可能是完整路径或服务器存储路径，caller 需要传入后端可识别的 path
    getThumbnail(originalPath) {
            if (!originalPath) return ''

            // 本地 blob URL 或 data URL 直接返回，不走后端缩略图
            if (originalPath.startsWith('blob:') || originalPath.startsWith('data:')) {
                return originalPath
            }

            // 检查缓存
            if (this.thumbnailCache[originalPath]) {
                return this.thumbnailCache[originalPath]
            }

            // 构造后端缩略图 URL（前端直接构造，不发请求，后端会返回图片流）
            const url = this.buildReviewUrl(originalPath)
            // 缓存起来避免重复构造/请求
            this.thumbnailCache[originalPath] = url
            return url
        },
// 构造后端缩略图接口 URL
    buildReviewUrl(path) {
            try {
                // 如果 path 是完整 URL(例如 baseUrl/files/download/...),尝试提取后端存储的相对路径
                let relPath = path

                try {
                    const urlObj = new URL(path)
                    // 如果 URL 包含 /files/download/, 提取后面的部分作为相对path
                    const downloadIndex = urlObj.pathname.indexOf('/files/download/')
                    if (downloadIndex !== -1) {
                        relPath = urlObj.pathname.substring(downloadIndex + '/files/download'.length)
                    } else {
                        // 否则使用 pathname 本身
                        relPath = urlObj.pathname
                    }
                } catch (err) {
                    // path 可能并不是完整 URL，直接保留原始 path
                    relPath = path
                }

                // 确保 relPath 以 / 开头
                if (!relPath.startsWith('/')) relPath = '/' + relPath

                const encoded = encodeURIComponent(relPath)
                
                // 获取 token 并作为查询参数传递以通过认证
                const token = uni.getStorageSync('token')
                let url = `${baseUrl}/api/chat/imageReview?path=${encoded}`
                if (token) {
                    url += `&token=${token}`
                }
                return url
            } catch (e) {
                console.error('构造缩略图 URL 失败', e)
                return path
            }
        }
}

export const imagePreviewMethods = {
    previewImage(msg) {
            // 构建所有图片消息列表（过滤出图片消息）
            this.previewImageList = this.messages.filter(m => m.type === 'image')
            
            // 找到当前点击的图片在列表中的索引
            const index = this.previewImageList.findIndex(m => m.id === msg.id)
            this.previewCurrentIndex = index >= 0 ? index : 0
            
            // 打开预览面板
            this.showImagePreview = true
            
            // 如果是小于1M的图片，自动加载并缓存原图以直接显示高清
            if (!this.isLargeImage(msg) && !this.loadedOriginalImages[msg.id] && msg.content) {
                this.loadOriginalImage(msg)
            }
        },
// 关闭图片预览
    closeImagePreview() {
            this.showImagePreview = false
            this.previewImageList = []
            this.previewCurrentIndex = 0
        },
// 切换到下一张图片
    nextPreviewImage() {
            if (this.previewImageList.length > 0) {
                this.previewCurrentIndex = (this.previewCurrentIndex + 1) % this.previewImageList.length
                
                // 获取新的当前图片
                const currentMsg = this.currentPreviewMessage
                if (currentMsg) {
                    // 如果已经加载过原图，确保 UI 能读取到（强制响应式更新）
                    if (this.loadedOriginalImages[currentMsg.id]) {
                        this.$forceUpdate()
                    } else if (!this.isLargeImage(currentMsg) && currentMsg.content) {
                        // 如果是小图且未加载，自动加载原图
                        this.loadOriginalImage(currentMsg)
                    }
                }
            }
        },
// 切换到上一张图片
    prevPreviewImage() {
            if (this.previewImageList.length > 0) {
                this.previewCurrentIndex = (this.previewCurrentIndex - 1 + this.previewImageList.length) % this.previewImageList.length
                
                // 获取新的当前图片
                const currentMsg = this.currentPreviewMessage
                if (currentMsg) {
                    // 如果已经加载过原图，确保 UI 能读取到（强制响应式更新）
                    if (this.loadedOriginalImages[currentMsg.id]) {
                        this.$forceUpdate()
                    } else if (!this.isLargeImage(currentMsg) && currentMsg.content) {
                        // 如果是小图且未加载，自动加载原图
                        this.loadOriginalImage(currentMsg)
                    }
                }
            }
        },
// 判断是否是大图（超过1M）
    isLargeImage(msg) {
            if (!msg || msg.type !== 'image') return false
            // fileSize 字段保存的是字节数
            const fileSizeBytes = msg.fileSize || 0
            return fileSizeBytes > 1024 * 1024 // 1M = 1024*1024 字节
        }
}

export const imageLoadingMethods = {
    loadOriginalImage(msg) {
            if (!msg || !msg.content) return
            const currentMessage = this.getCurrentImageMessage(msg.id, msg.content)
            if (!currentMessage) return
            msg = currentMessage

            // 已加载或请求尚未结束时均不重复发起下载。
            if (this.loadedOriginalImages[msg.id] || this.originalImageLoadingIds[msg.id]) {
                return
            }

            this.$set(this.originalImageLoadingIds, msg.id, true)

            // #ifdef H5
            // H5 继续交给浏览器图片缓存处理，不额外写入媒体文件。
            this.preloadOriginalImageFromNetwork(msg)
            return
            // #endif

            // #ifndef H5
            // 小程序 / APP 用同一次 downloadFile 结果直接保存为持久文件，避免先 getImageInfo
            // 再 downloadFile 造成原图双下载；保存失败时才退回原有在线预加载。
            this.loadAndPersistOriginalImage(msg)
            // #endif
        },
// 在线预加载兜底：H5 的唯一加载路径；非 H5 仅在持久缓存失败时使用。
    preloadOriginalImageFromNetwork(msg) {
            const sourceUrl = msg?.content
            if (!sourceUrl) {
                this.finishOriginalImageLoading(msg?.id)
                return
            }
            uni.getImageInfo({
                src: sourceUrl,
                success: (image) => {
                    // 等待期间同一消息的图片已被服务器替换时，不把旧请求结果回写回来。
                    const currentMessage = this.getCurrentImageMessage(msg.id, sourceUrl)
                    if (!currentMessage) {
                        this.finishOriginalImageLoading(msg.id)
                        return
                    }
                    // 先立即使用在线原图，持久化下载失败也不影响预览。
                    currentMessage.originalLoaded = true
                    this.setLoadedOriginalImage(currentMessage.id, currentMessage.content)
                    // 使退出并重新进入聊天后，仍按原图策略渲染。
                    this.saveMessagesToStorage()
                    
                    this.finishOriginalImageLoading(msg.id)
                    
                    console.log('原图加载成功:', msg.id)
                },
                fail: (err) => {
                    this.finishOriginalImageLoading(msg.id)
                    if (!this.getCurrentImageMessage(msg.id, sourceUrl)) return
                    console.error('原图加载失败:', err)
                    
                    uni.showToast({
                        title: '原图加载失败',
                        icon: 'none'
                    })
                }
            })
        },
// #ifndef H5
// 小程序 / APP 在用户实际查看原图后才下载并保存，不会预取整段聊天中的所有图片。
    async loadAndPersistOriginalImage(msg) {
            const sourceUrl = msg?.content
            if (!sourceUrl) return
            try {
                const localPath = await cacheChatOriginalImage({
                    userId: this.getCurrentUserId() || 'unknown',
                    conversationId: this.chatId,
                    messageId: msg.id,
                    sourceUrl,
                    expectedSize: msg.fileSize || 0
                })
                // 下载期间消息可能已被服务器更新，不能把旧图覆盖到新消息上。
                const currentMessage = this.getCurrentImageMessage(msg.id, sourceUrl)
                if (localPath && currentMessage) {
                    currentMessage.originalLoaded = true
                    this.setLoadedOriginalImage(currentMessage.id, localPath)
                    this.saveMessagesToStorage()
                    this.finishOriginalImageLoading(currentMessage.id)
                    console.log('原图已保存到本地缓存:', currentMessage.id)
                    return
                }
                if (!currentMessage) {
                    this.finishOriginalImageLoading(msg.id)
                    return
                }
            } catch (error) {
                // 工具内部通常会吞掉下载/保存失败；这里额外兜底，确保图片预览不会被异常打断。
                console.warn('保存聊天原图到本地失败，改用在线原图。', error)
            }
            // 文件下载或保存失败时仍保留原有预览逻辑，不影响用户查看图片。
            const currentMessage = this.getCurrentImageMessage(msg.id, sourceUrl)
            if (currentMessage) this.preloadOriginalImageFromNetwork(currentMessage)
            else this.finishOriginalImageLoading(msg.id)
        },
// #endif
    finishOriginalImageLoading(messageId) {
            if (messageId === undefined || messageId === null) return
            delete this.originalImageLoadingIds[messageId]
        }
}

export const imageErrorMethods = {
    async onImageError(msg, event) {
            if (!msg) return
            const eventMessageId = event?.currentTarget?.dataset?.messageId
            if (eventMessageId !== undefined && eventMessageId !== null &&
                String(eventMessageId) !== String(msg.id)) {
                return
            }
            const expectedRetryNonce = this.imageRetryNonces[msg.id]
            const failedRetryNonce = event?.currentTarget?.dataset?.retryNonce
            if (this.imageRetryLoadingIds[msg.id] && expectedRetryNonce &&
                failedRetryNonce !== undefined && failedRetryNonce !== null &&
                String(failedRetryNonce) !== String(expectedRetryNonce)) {
                return
            }
            if (this.imageRetryLoadingIds[msg.id]) {
                delete this.imageRetryLoadingIds[msg.id]
            }
            console.error('图片加载失败:', msg.content)

            const displayedOriginal = this.loadedOriginalImages[msg.id]
            const expectedToken = this.loadedOriginalImageTokens[msg.id]
            const failedToken = event?.currentTarget?.dataset?.originalToken
            // image 换源后可能收到旧节点的 error；token 不一致时不影响当前的新图。
            if (displayedOriginal && expectedToken && failedToken !== undefined && failedToken !== null &&
                String(failedToken) !== String(expectedToken)) {
                return
            }

            // 无论线上原图还是 saveFile 本地原图，只要当前原图渲染失败都回到缩略图。
            if (displayedOriginal) {
                const isPersistentLocalOriginal = displayedOriginal !== msg.content
                this.clearLoadedOriginalImage(msg.id)
                msg.originalLoaded = false
                this.finishOriginalImageLoading(msg.id)
                this.saveMessagesToStorage()
                // #ifndef H5
                if (isPersistentLocalOriginal) {
                    removeCachedChatOriginalImage({
                        userId: this.getCurrentUserId() || 'unknown',
                        conversationId: this.chatId,
                        messageId: msg.id,
                        sourceUrl: msg.content
                    }).catch((error) => {
                        console.warn('清理失效聊天原图缓存失败，后续会由 LRU 再次尝试。', error)
                    })
                }
                // #endif
                // 让列表和预览重新使用缩略图，不保留“图片加载失败”的遮罩。
                delete this.mediaLoadErrors[msg.id]
                return
            }

            // 缩略图依赖本地缓存，服务重启后可能短暂 404；原图下载接口会从对象存储回源。
            if (
                !this.thumbnailFallbackIds[msg.id] &&
                msg.type === 'image' &&
                msg.thumbnail &&
                msg.content &&
                msg.thumbnail !== msg.content
            ) {
                this.$set(this.thumbnailFallbackIds, msg.id, true)
                delete this.mediaLoadErrors[msg.id]
                return
            }
            
            // 标记加载失败
            this.$set(this.mediaLoadErrors, msg.id, { type: 'image', error: true, retryCount: 0 })

            const previewUrl = this.buildReviewUrl(msg.content)
            if (msg.type === 'image' && previewUrl && msg.thumbnail !== previewUrl) {
                msg.thumbnail = previewUrl
                delete this.mediaLoadErrors[msg.id]
                this.saveMessagesToStorage()
                return
            }
            
            // 如果是 blob URL 失效,尝试从服务器重新加载
            if (msg.content && msg.content.startsWith('blob:')) {
                console.log('检测到 blob URL 失效,尝试从服务器重新加载...')
                
                // 清除失效的缓存
                if (this.localFileCache[msg.id]) {
                    delete this.localFileCache[msg.id]
                    this.saveLocalFileCache()
                }
                
                // 从服务器加载这条消息
                try {
                    const res = await chatApi.getChatHistory({
                        chatId: this.chatId,
                        messageId: msg.id
                    })
                    
                    if (res.data && res.data.length > 0) {
                        const serverMsg = this.formatServerMessage(res.data[0])
                        // 更新消息的 content 为服务器 URL
                        const msgIndex = this.messages.findIndex(m => m.id === msg.id)
                        if (msgIndex !== -1) {
                            this.messages[msgIndex].content = serverMsg.content
                            // 清除错误标记
                            delete this.mediaLoadErrors[msg.id]
                            this.saveMessagesToStorage()
                        }
                    }
                } catch (e) {
                    console.error('从服务器重新加载图片失败:', e)
                    uni.showToast({ title: '图片加载失败', icon: 'none' })
                }
            } else {
                uni.showToast({ title: '图片加载失败', icon: 'none' })
            }
        }
}

export const imageRetryMethods = {
    onImageLoad(msg, event) {
            if (!msg) return
            const eventMessageId = event?.currentTarget?.dataset?.messageId
            if (eventMessageId !== undefined && eventMessageId !== null &&
                String(eventMessageId) !== String(msg.id)) {
                return
            }
            const expectedRetryNonce = this.imageRetryNonces[msg.id]
            const loadedRetryNonce = event?.currentTarget?.dataset?.retryNonce
            if (this.imageRetryLoadingIds[msg.id]) {
                if (expectedRetryNonce && loadedRetryNonce !== undefined && loadedRetryNonce !== null &&
                    String(loadedRetryNonce) !== String(expectedRetryNonce)) {
                    return
                }
                delete this.imageRetryLoadingIds[msg.id]
                // 成功后才重置独立计数，连续失败不会因为错误遮罩清理而归零。
                delete this.imageRetryCounts[msg.id]
            }
            // 清除错误标记
            if (this.mediaLoadErrors[msg.id]) {
                delete this.mediaLoadErrors[msg.id]
            }
        },
// 统一的媒体重试方法
    async retryLoadMedia(msg, type) {
            if (type === 'image' && this.imageRetryLoadingIds[msg.id]) return
            // 图片使用独立计数，避免删除 mediaLoadErrors 后每次都从 0 开始。
            const currentRetry = type === 'image'
                ? (Number(this.imageRetryCounts[msg.id]) || 0)
                : (this.mediaLoadErrors[msg.id]?.retryCount || 0)
            if (currentRetry >= 3) {
                uni.showToast({
                    title: `${type === 'image' ? '图片' : type === 'voice' ? '语音' : type === 'video' ? '视频' : '文件'}重试次数过多，请稍后再试`,
                    icon: 'none',
                    duration: 2000
                })
                return
            }

            // 更新重试次数
            this.$set(this.mediaLoadErrors, msg.id, {
                type: type,
                error: true,
                retryCount: currentRetry + 1
            })
            if (type === 'image') {
                this.$set(this.imageRetryCounts, msg.id, currentRetry + 1)
                this.$set(this.imageRetryLoadingIds, msg.id, true)
            }

            // 清除错误标记,准备重试
            delete this.mediaLoadErrors[msg.id]

            // 根据类型调用对应的方法重试
            try {
                switch (type) {
                    case 'image':
                        // 图片重试:尝试从服务器重新获取
                        if (msg.content && msg.content.startsWith('blob:')) {
                            // blob URL失效,从服务器重新加载
                            const res = await chatApi.getChatHistory({ 
                                chatId: this.chatId, 
                                messageId: msg.id 
                            })
                            if (res.data && res.data.length > 0) {
                                const msgIndex = this.messages.findIndex(m => m.id === msg.id)
                                if (msgIndex !== -1) {
                                    const serverMsg = this.formatServerMessage(res.data[0])
                                    this.messages[msgIndex].content = serverMsg.content
                                    if (serverMsg.thumbnail) this.messages[msgIndex].thumbnail = serverMsg.thumbnail
                                    if (serverMsg.fileSize !== undefined && serverMsg.fileSize !== null) {
                                        this.messages[msgIndex].fileSize = serverMsg.fileSize
                                    }
                                    this.saveMessagesToStorage()
                                }
                            }
                        } else {
                            // 仅变更渲染地址的 nonce，保留消息 canonical URL，避免破坏媒体缓存 key / 服务端比对。
                            this.$set(this.imageRetryNonces, msg.id, Date.now())
                        }
                        break

                    case 'voice':
                        // 语音重试:清除当前播放状态并重新播放
                        this.playingVoiceId = null
                        if (this.innerAudioContext) {
                            this.innerAudioContext.stop()
                        }
                        await this.$nextTick()
                        this.playVoice(msg)
                        break

                    case 'video':
                        // 视频重试:清除缓存并重新下载
                        if (this.localFileCache[msg.id]) {
                            delete this.localFileCache[msg.id]
                            this.saveLocalFileCache()
                        }
                        await this.playVideo(msg.content, msg)
                        break

                    case 'file':
                        // 文件重试:清除缓存并重新下载
                        if (this.localFileCache[msg.id]) {
                            delete this.localFileCache[msg.id]
                            this.saveLocalFileCache()
                        }
                        await this.openFile(msg)
                        break

                    default:
                        console.warn('未知的媒体类型:', type)
                }
            } catch (error) {
                console.error(`${type}重试失败:`, error)
                if (type === 'image') delete this.imageRetryLoadingIds[msg.id]
                // 重试失败,恢复错误标记
                this.$set(this.mediaLoadErrors, msg.id, {
                    type: type,
                    error: true,
                    retryCount: currentRetry + 1
                })
            }
        }
}
