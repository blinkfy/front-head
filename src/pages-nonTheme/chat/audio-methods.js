import { ensureFeaturePermission } from '@/utils/feature-permission.js'
import * as chatApi from '@/pages-nonTheme/api/chat.js'
import { baseUrl } from '@/api/settings.js'

export const audioInitializationMethods = {
    initRecorder() {
            // #ifndef H5
            // H5端不支持录音功能，跳过初始化
            this.recorderManager = uni.getRecorderManager()

            this.recorderManager.onStart(() => {
                if (!this.recordHeld || this.isChatPageDestroyed || !this.isChatPageActive) {
                    this.isCancelVoice = true; this.recorderManager.stop(); return
                }
                this.isRecording = true
                this.recordingDuration = 0
                this.recordingTimer = setInterval(() => {
                    this.recordingDuration++
                    if (this.recordingDuration >= 60) {
                        this.stopRecord()
                    }
                }, 1000)
            })

            this.recorderManager.onStop((res) => {
                console.log('录音结束', res)
                this.isRecording = false
                clearInterval(this.recordingTimer)

                if (!this.isChatPageDestroyed && this.isChatPageActive && !this.isCancelVoice && this.recordingDuration >= 1) {
                    this.sendVoiceMessage(res.tempFilePath, this.recordingDuration)
                } else if (this.isChatPageActive && !this.isCancelVoice && this.recordingDuration < 1) {
                    uni.showToast({ title: '录音时间太短', icon: 'none' })
                }

                this.isCancelVoice = false
                this.recordingDuration = 0
            })

            this.recorderManager.onError((err) => {
                console.error('录音错误', err)
                this.isRecording = false
                clearInterval(this.recordingTimer)
                uni.showToast({ title: '录音失败', icon: 'none' })
            })
            // #endif
            
            // #ifdef H5
            console.log('H5端不支持录音功能')
            // #endif
        },
    initAudioPlayer() {
            // #ifdef H5
            const audio = new Audio()
            let attempt = 0
            let starting = false
            this.innerAudioContext = {
                set src(value) { audio.src = value },
                async play() {
                    const current = ++attempt
                    starting = true
                    try { await audio.play() }
                    finally { if (attempt === current) starting = false }
                },
                stop: () => { audio.pause(); audio.currentTime = 0 },
                destroy: () => { audio.removeAttribute('src'); audio.load() },
                onEnded: handler => audio.addEventListener('ended', handler),
                // While starting, the play promise already reports decoding errors.
                onError: handler => audio.addEventListener('error', event => { if (!starting) handler(event) })
            }
            // #endif
            // #ifndef H5
            this.innerAudioContext = uni.createInnerAudioContext()
            // #endif

            this.innerAudioContext.onEnded(() => {
                this.playingVoiceId = null
                this.currentPlayingMsg = null
                this.currentVoiceCache = null
            })

            const onPlaybackError = err => {
                if (this.isChatPageDestroyed || !this.currentPlayingMsg || err?.name === 'AbortError') return
                const current = this.currentVoiceCache
                if (!current || current.owner !== this.getCurrentUserId()) return
                console.error('播放错误', err)
                if (err?.name === 'NotAllowedError') {
                    this.voiceGestureRetry = { ...current, messageId: this.currentPlayingMsg.id }
                    this.playingVoiceId = null
                    this.currentPlayingMsg = null
                    uni.showToast({ title: '请再点一次语音开始播放', icon: 'none' })
                    return
                }
                if (current.path !== current.source) {
                    const { source, path } = current
                    this.currentVoiceCache = { ...current, path: source }
                    void this.invalidateChatMediaSource('attachment', source, path)
                    if (/^https?:\/\//i.test(source)) {
                        this.innerAudioContext.src = source
                        const revision = this.voicePlaybackRevision
                        this.innerAudioContext.play()?.catch?.(error => {
                            if (revision === this.voicePlaybackRevision) onPlaybackError(error)
                        })
                        return
                    }
                }
                this.playingVoiceId = null
                
                // 设置错误标记(如果有当前播放的语音消息)
                if (this.currentPlayingMsg) {
                    this.$set(this.mediaLoadErrors, this.currentPlayingMsg.id, { 
                        type: 'voice', 
                        error: true, 
                        retryCount: 0 
                    })
                }
                this.currentPlayingMsg = null
                
                // 解析错误信息
                let errorMsg = '语音播放失败'
                if (err && typeof err === 'object') {
                    if (err.errMsg) {
                        if (err.errMsg.includes('permission denied')) {
                            errorMsg = '没有读取文件权限'
                        } else if (err.errMsg.includes('404') || err.errMsg.includes('not found')) {
                            errorMsg = '语音文件不存在'
                        } else if (err.errMsg.includes('network')) {
                            errorMsg = '网络错误'
                        } else if (err.errMsg.includes('format')) {
                            errorMsg = '音频格式不支持'
                        }
                    }
                }
                
                uni.showToast({ title: errorMsg, icon: 'none' })
            }
            this.innerAudioContext.onError(onPlaybackError)
            this.handleVoicePlaybackError = onPlaybackError
        }
}

export const voiceRecordingMethods = {
    async startRecord(e) {
            // #ifdef H5
            uni.showToast({ title: 'H5端暂不支持录音功能', icon: 'none' })
            return
            // #endif
            // #ifndef H5
            if (this.recordPermissionPending || this.isRecording) return
            this.startY = e.touches[0].clientY
            this.isCancelVoice = false
            const attempt = (this.recordAttempt || 0) + 1
            this.recordAttempt = attempt
            this.recordHeld = true
            this.recordPermissionPending = true
            const owner = uni.getStorageSync('token') || ''
            const current = () => this.recordHeld && this.recordAttempt === attempt && !this.isChatPageDestroyed &&
                this.isChatPageActive && owner === (uni.getStorageSync('token') || '')
            try {
                if (!await ensureFeaturePermission('microphone', { isCurrent: current }) || !current()) return
                this.recorderManager.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' })
            } catch (_) {
                if (current()) uni.showToast({ title: '录音未能启动，请重试', icon: 'none' })
            } finally { this.recordPermissionPending = false }
            // #endif
        },
    onRecordMove(e) {
            if (!this.isRecording) return

            const moveY = e.touches[0].clientY
            const diff = this.startY - moveY

            this.isCancelVoice = diff > 50
        },
    stopRecord() {
            this.recordHeld = false
            this.recordAttempt = (this.recordAttempt || 0) + 1
            // #ifndef H5
            if (this.isRecording) {
                this.recorderManager.stop()
            }
            // #endif
        },
    cancelRecord() {
            // #ifndef H5
            this.isCancelVoice = true
            this.stopRecord()
            // #endif
        }
}

export const voicePlaybackMethods = {
    async playVoice(msg) {
            // 如果已经标记失败，点击重试
            if (this.mediaLoadErrors[msg.id]?.type === 'voice') {
                this.retryLoadMedia(msg, 'voice')
                return
            }
            
            const revision = ++this.voicePlaybackRevision
            const owner = this.getCurrentUserId()
            if (this.playingVoiceId === msg.id) {
                this.currentPlayingMsg = null
                this.currentVoiceCache = null
                this.innerAudioContext.stop()
                this.playingVoiceId = null
                return
            }

            if (this.playingVoiceId) {
                this.innerAudioContext.stop()
            }
            this.currentPlayingMsg = null
            this.currentVoiceCache = null

            this.playingVoiceId = msg.id
            
            // 小程序中,如果语音路径是相对路径或JSON对象,需要特殊处理
            let audioSrc = msg.content
            
            // 如果content是对象(JSON解析后),提取path
            if (audioSrc && typeof audioSrc === 'object' && audioSrc.path) {
                audioSrc = `${baseUrl}/files/download/${audioSrc.path}`
            }
            
            // 确保是完整的URL
            if (typeof audioSrc === 'string' && 
                !audioSrc.startsWith('http://') && 
                !audioSrc.startsWith('https://') &&
                !audioSrc.startsWith('wxfile://') &&
                !audioSrc.startsWith('file://') &&
                !audioSrc.startsWith('blob:') &&
                !audioSrc.startsWith('_doc/')) {
                audioSrc = `${baseUrl}/files/download/${audioSrc}`
            }
            
            const retry = this.voiceGestureRetry
            this.voiceGestureRetry = null
            const retryPath = retry?.owner === owner && retry.messageId === msg.id && retry.source === audioSrc ? retry.path : ''
            const cached = retryPath || this.getHeldChatMediaSource('attachment', audioSrc)
                || await this.getChatMediaSource('attachment', audioSrc, { download: true, size: msg.fileSize })
            if (revision !== this.voicePlaybackRevision || this.isChatPageDestroyed || owner !== this.getCurrentUserId()) return
            this.currentPlayingMsg = msg
            this.currentVoiceCache = { owner, source: audioSrc, path: cached || audioSrc }
            
            try {
                this.innerAudioContext.src = cached || audioSrc
                this.innerAudioContext.play()?.catch?.(error => {
                    if (revision === this.voicePlaybackRevision && error.name !== 'AbortError') this.handleVoicePlaybackError(error)
                })
            } catch (err) {
                console.error('播放语音失败:', err)
                this.$set(this.mediaLoadErrors, msg.id, { type: 'voice', error: true, retryCount: 0 })
                this.playingVoiceId = null
                this.currentPlayingMsg = null
                uni.showToast({ title: '语音播放失败', icon: 'none' })
            }
        }
}

export const voiceTranscriptionMethods = {
    async transcribeVoiceMessage(msg) {
            if (!msg || msg.type !== 'voice' || !msg.id || this.transcribingVoiceIds[msg.id]) return
            this.$set(this.transcribingVoiceIds, msg.id, true)
            try {
                const res = await chatApi.transcribeVoiceMessage(msg.id)
                const toText = String(res?.data?.toText || '').trim()
                const target = this.messages.find(item => item.id === msg.id)
                if (target) {
                    target.voiceText = toText
                    this.saveMessagesToStorage()
                }
                uni.showToast({
                    title: toText ? '转文字完成' : '未识别到文字',
                    icon: 'none'
                })
            } catch (e) {
                console.error('转写语音消息失败:', e)
                uni.showToast({ title: '转文字失败', icon: 'none' })
            } finally {
                delete this.transcribingVoiceIds[msg.id]
            }
        }
}
