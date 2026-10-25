import * as chatApi from '@/pages-nonTheme/api/chat.js'
import { baseUrl } from '@/api/settings.js'

export const audioInitializationMethods = {
    initRecorder() {
            // #ifndef H5
            // H5端不支持录音功能，跳过初始化
            this.recorderManager = uni.getRecorderManager()

            this.recorderManager.onStart(() => {
                console.log('录音开始')
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

                if (!this.isCancelVoice && this.recordingDuration >= 1) {
                    this.sendVoiceMessage(res.tempFilePath, this.recordingDuration)
                } else if (this.recordingDuration < 1) {
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
            this.innerAudioContext = uni.createInnerAudioContext()

            this.innerAudioContext.onEnded(() => {
                this.playingVoiceId = null
            })

            this.innerAudioContext.onError((err) => {
                console.error('播放错误', err)
                this.playingVoiceId = null
                
                // 设置错误标记(如果有当前播放的语音消息)
                if (this.currentPlayingMsg) {
                    this.$set(this.mediaLoadErrors, this.currentPlayingMsg.id, { 
                        type: 'voice', 
                        error: true, 
                        retryCount: 0 
                    })
                }
                
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
            })
        }
}

export const voiceRecordingMethods = {
    startRecord(e) {
            // #ifdef H5
            uni.showToast({ title: 'H5端暂不支持录音功能', icon: 'none' })
            return
            // #endif

            // #ifndef H5
            this.startY = e.touches[0].clientY
            this.isCancelVoice = false

            // 在 APP-PLUS 环境下, uni.authorize 可能不可靠,优先尝试直接启动录音
            // #ifdef APP-PLUS
            try {
                if (!this.recorderManager) {
                    this.recorderManager = uni.getRecorderManager()
                }
                this.recorderManager.start({
                    duration: 60000,
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    encodeBitRate: 48000,
                    format: 'mp3'
                })
            } catch (err) {
                console.warn('APP-PLUS 直接启动录音失败,尝试权限请求', err)
                // 回退到权限请求流程
                uni.authorize({
                    scope: 'scope.record',
                    success: () => {
                        this.recorderManager.start({
                            duration: 60000,
                            sampleRate: 16000,
                            numberOfChannels: 1,
                            encodeBitRate: 48000,
                            format: 'mp3'
                        })
                    },
                    fail: () => {
                        uni.showModal({
                            title: '提示',
                            content: '需要录音权限才能发送语音消息',
                            confirmText: '去设置',
                            success: (res) => {
                                if (res.confirm) {
                                    uni.openSetting()
                                }
                            }
                        })
                    }
                })
            }
            // #endif

            // 其余平台(微信小程序等)使用原有授权流程
            // #ifndef APP-PLUS
            // 检查录音权限
            uni.authorize({
                scope: 'scope.record',
                success: () => {
                    this.recorderManager.start({
                        duration: 60000,
                        sampleRate: 16000,
                        numberOfChannels: 1,
                        encodeBitRate: 48000,
                        format: 'mp3'
                    })
                },
                fail: () => {
                    uni.showModal({
                        title: '提示',
                        content: '需要录音权限才能发送语音消息',
                        confirmText: '去设置',
                        success: (res) => {
                            if (res.confirm) {
                                uni.openSetting()
                            }
                        }
                    })
                }
            })
            // #endif
            // #endif
        },
    onRecordMove(e) {
            if (!this.isRecording) return

            const moveY = e.touches[0].clientY
            const diff = this.startY - moveY

            this.isCancelVoice = diff > 50
        },
    stopRecord() {
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
    playVoice(msg) {
            // 如果已经标记失败，点击重试
            if (this.mediaLoadErrors[msg.id]?.type === 'voice') {
                this.retryLoadMedia(msg, 'voice')
                return
            }
            
            if (this.playingVoiceId === msg.id) {
                this.innerAudioContext.stop()
                this.playingVoiceId = null
                return
            }

            if (this.playingVoiceId) {
                this.innerAudioContext.stop()
            }

            this.playingVoiceId = msg.id
            
            // 小程序中,如果语音路径是相对路径或JSON对象,需要特殊处理
            let audioSrc = msg.content
            
            // 如果content是对象(JSON解析后),提取path
            if (typeof audioSrc === 'object' && audioSrc.path) {
                audioSrc = `${baseUrl}/files/download/${audioSrc.path}`
            }
            
            // 确保是完整的URL
            if (typeof audioSrc === 'string' && 
                !audioSrc.startsWith('http://') && 
                !audioSrc.startsWith('https://') &&
                !audioSrc.startsWith('wxfile://') &&
                !audioSrc.startsWith('file://')) {
                audioSrc = `${baseUrl}/files/download/${audioSrc}`
            }
            
            console.log('准备播放语音:', audioSrc)
            
            // 保存当前播放的消息对象,用于错误处理
            this.currentPlayingMsg = msg
            
            try {
                this.innerAudioContext.src = audioSrc
                this.innerAudioContext.play()
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
