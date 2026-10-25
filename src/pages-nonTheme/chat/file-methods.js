export const videoPlaybackMethods = {
    async playVideo(url, msg) {
            // 如果已经标记失败，点击重试
            if (this.mediaLoadErrors[msg.id]?.type === 'video') {
                this.retryLoadMedia(msg, 'video')
                return
            }
            
            // 首先尝试使用缓存的 URL
            const validUrl = await this.getValidFileUrl(msg)
            if (validUrl) {
                this.currentVideoUrl = validUrl
                this.showVideoPlayer = true
                return
            }
            
            // 如果当前 URL 是 blob 且有效,直接使用
            if (url.startsWith('blob:')) {
                const isValid = await this.checkBlobUrlValid(url)
                if (isValid) {
                    this.currentVideoUrl = url
                    this.showVideoPlayer = true
                    return
                }
            }
            
            // 如果是 file:// 协议,直接使用
            if (url.startsWith('file://')) {
                this.currentVideoUrl = url
                this.showVideoPlayer = true
                return
            }

            // 需要从服务器下载
            try {
                // 初始化下载进度
                this.downloadProgress[msg.id] = 0

                const downloadTask = uni.downloadFile({
                    url: url,
                    success: (res) => {
                        if (res.statusCode === 200) {
                            // 保存到本地缓存
                            this.localFileCache[msg.id] = res.tempFilePath
                            this.saveLocalFileCache()
                            this.currentVideoUrl = res.tempFilePath
                            this.showVideoPlayer = true
                            // 清除下载进度和错误标记
                            delete this.downloadProgress[msg.id]
                            if (this.mediaLoadErrors[msg.id]) {
                                delete this.mediaLoadErrors[msg.id]
                            }
                        } else {
                            // 非200状态码，按失败处理
                            console.error('视频下载失败，状态码:', res.statusCode)
                            this.$set(this.mediaLoadErrors, msg.id, { type: 'video', error: true, retryCount: 0 })
                            let errorMsg = '视频下载失败'
                            if (res.statusCode === 404) {
                                errorMsg = '视频不存在'
                            } else if (res.statusCode === 403) {
                                errorMsg = '无权限访问视频'
                            }
                            uni.showToast({
                                title: errorMsg,
                                icon: 'none'
                            })
                            delete this.downloadProgress[msg.id]
                        }
                    },
                    fail: (err) => {
                        console.error('视频下载失败', err)
                        this.$set(this.mediaLoadErrors, msg.id, { type: 'video', error: true, retryCount: 0 })
                        uni.showToast({
                            title: '视频下载失败',
                            icon: 'none'
                        })
                        delete this.downloadProgress[msg.id]
                    }
                })

                // 监听下载进度
                downloadTask.onProgressUpdate((res) => {
                    this.downloadProgress[msg.id] = res.progress
                })
            } catch (e) {
                console.error('播放视频失败', e)
                this.$set(this.mediaLoadErrors, msg.id, { type: 'video', error: true, retryCount: 0 })
                uni.showToast({
                    title: '播放失败',
                    icon: 'none'
                })
                delete this.downloadProgress[msg.id]
            }
        },
    closeVideoPlayer() {
            this.showVideoPlayer = false
            this.currentVideoUrl = ''
        }
}

export const fileAccessMethods = {
    async openFile(msg, preferOnlinePreview = true) {
            // 如果已经标记失败，点击重试
            if (this.mediaLoadErrors[msg.id]?.type === 'file') {
                this.retryLoadMedia(msg, 'file')
                return
            }

            // 在线文件直接复用文件管理器的预览能力；本地临时文件仍沿用原有系统打开流程。
            if (preferOnlinePreview && this.isFilePreviewable(msg)) {
                const previewUrl = this.getOnlineFilePreviewUrl(msg.content)
                if (previewUrl) {
                    this.openOnlineFilePreview(previewUrl, msg.fileName)
                    return
                }
            }
            
            const url = msg.content
            const fileName = msg.fileName

            // 首先尝试使用缓存的 URL
            const validUrl = await this.getValidFileUrl(msg)
            if (validUrl) {
                this.doOpenFile(validUrl, fileName)
                return
            }
            
            // 如果当前 URL 是 blob 且有效,直接使用
            if (url.startsWith('blob:')) {
                const isValid = await this.checkBlobUrlValid(url)
                if (isValid) {
                    this.doOpenFile(url, fileName)
                    return
                }
            }
            
            // 如果是 file:// 协议,直接使用
            if (url.startsWith('file://')) {
                this.doOpenFile(url, fileName)
                return
            }

            // 需要从服务器下载
            try {
                // 初始化下载进度
                this.downloadProgress[msg.id] = 0

                // #ifdef H5
                // H5 环境下,先检查文件是否存在
                try {
                    const checkRes = await fetch(url, { method: 'HEAD' })
                    if (checkRes.ok) {
                        // 文件存在,触发下载
                        this.downloadFileWithName(url, fileName)
                        delete this.downloadProgress[msg.id]
                        if (this.mediaLoadErrors[msg.id]) {
                            delete this.mediaLoadErrors[msg.id]
                        }
                    } else {
                        // 文件不存在
                        throw new Error('文件不存在: ' + checkRes.status)
                    }
                } catch (err) {
                    console.error('H5文件检查/下载失败', err)
                    this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                    let errorMsg = '文件下载失败'
                    if (err.message.includes('404') || err.message.includes('不存在')) {
                        errorMsg = '文件不存在'
                    }
                    uni.showToast({
                        title: errorMsg,
                        icon: 'none'
                    })
                    delete this.downloadProgress[msg.id]
                }
                // #endif

                // #ifndef H5
                // 非 H5 环境,使用 uni.downloadFile
                const downloadTask = uni.downloadFile({
                    url: url,
                    success: (res) => {
                        if (res.statusCode === 200) {
                            // 保存到本地缓存
                            this.localFileCache[msg.id] = res.tempFilePath
                            this.saveLocalFileCache()
                            this.doOpenFile(res.tempFilePath, fileName)
                            // 清除下载进度和错误标记
                            delete this.downloadProgress[msg.id]
                            if (this.mediaLoadErrors[msg.id]) {
                                delete this.mediaLoadErrors[msg.id]
                            }
                        } else {
                            // 非200状态码，按失败处理
                            console.error('文件下载失败，状态码:', res.statusCode)
                            this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                            let errorMsg = '文件下载失败'
                            if (res.statusCode === 404) {
                                errorMsg = '文件不存在'
                            } else if (res.statusCode === 403) {
                                errorMsg = '无权限访问文件'
                            }
                            uni.showToast({
                                title: errorMsg,
                                icon: 'none'
                            })
                            delete this.downloadProgress[msg.id]
                        }
                    },
                    fail: (err) => {
                        console.error('文件下载失败', err)
                        this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                        uni.showToast({
                            title: '文件下载失败',
                            icon: 'none'
                        })
                        delete this.downloadProgress[msg.id]
                    }
                })

                // 监听下载进度
                downloadTask.onProgressUpdate((res) => {
                    this.downloadProgress[msg.id] = res.progress
                })
                // #endif
            } catch (e) {
                console.error('打开文件失败', e)
                this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                uni.showToast({
                    title: '打开失败',
                    icon: 'none'
                })
                delete this.downloadProgress[msg.id]
            }
        },
// H5 环境下载文件并指定文件名
    downloadFileWithName(url, fileName) {
            // #ifdef H5
            if (typeof document === 'undefined') return
            const a = document.createElement('a')
            a.href = url
            a.download = fileName || 'download'
            a.style.display = 'none'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            // #endif
        },
    getFileExtension(fileName = '') {
            const normalized = String(fileName || '').split('?')[0].trim().toLowerCase()
            const dotIndex = normalized.lastIndexOf('.')
            return dotIndex > -1 ? normalized.slice(dotIndex + 1) : ''
        },
    isFilePreviewable(msg) {
            if (!msg || !msg.content) return false
            const previewableExtensions = new Set([
                'pdf', 'txt', 'md', 'json', 'csv', 'log',
                'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
                'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
                'mp3', 'wav', 'm4a', 'aac', 'mp4', 'mov', 'webm',
                'zip'
            ])
            return previewableExtensions.has(this.getFileExtension(msg.fileName || msg.content))
        },
    getOnlineFilePreviewUrl(fileUrl) {
            const url = String(fileUrl || '').trim()
            if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file://')) {
                return ''
            }
            const downloadPath = '/files/download/'
            return url.includes(downloadPath)
                ? url.replace(downloadPath, '/files/preview/')
                : ''
        },
    openOnlineFilePreview(previewUrl, fileName) {
            // #ifdef H5
            window.open(previewUrl, '_blank', 'noopener,noreferrer')
            // #endif

            // #ifndef H5
            uni.navigateTo({
                url: `/pages-nonTheme/webview?url=${encodeURIComponent(previewUrl)}&title=${encodeURIComponent(fileName || '文件预览')}`
            })
            // #endif
        },
// 检查 blob URL 是否有效(仅在 H5 环境)
    async checkBlobUrlValid(blobUrl) {
            if (!blobUrl.startsWith('blob:')) {
                return true // 非 blob URL,认为有效
            }
            
            // #ifdef H5
            try {
                // 使用 fetch GET 请求检测 blob URL 是否有效
                const response = await fetch(blobUrl)
                return response.ok
            } catch (e) {
                console.log('blob URL 已失效:', blobUrl)
                return false // blob URL 已失效
            }
            // #endif
            
            // #ifndef H5
            return true // 非 H5 环境,file:// 协议不会失效
            // #endif
        },
// 获取有效的文件 URL(如果 blob 失效则从服务器下载)
    async getValidFileUrl(msg) {
            const cachedUrl = this.localFileCache[msg.id]
            
            // 检查缓存的 URL 是否有效
            if (cachedUrl) {
                const isValid = await this.checkBlobUrlValid(cachedUrl)
                if (isValid) {
                    return cachedUrl // 缓存有效,直接返回
                } else {
                    // 缓存失效,清除缓存
                    delete this.localFileCache[msg.id]
                    this.saveLocalFileCache()
                }
            }
            
            // 没有缓存或缓存失效,返回 null(需要下载)
            return null
        },
    doOpenFile(filePath, fileName) {
            // #ifdef APP-PLUS
            plus.runtime.openFile(filePath)
            // #endif

            // #ifdef H5
            // H5 环境下触发下载
            if (filePath.startsWith('blob:')) {
                const a = document.createElement('a')
                a.href = filePath
                a.download = fileName || 'download'
                a.style.display = 'none'
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
            } else {
                window.open(filePath)
            }
            // #endif

            // #ifdef MP-WEIXIN
            wx.openDocument({
                filePath: filePath,
                showMenu: true
            })
            // #endif
        }
}

export const mediaFormattingMethods = {
    formatDuration(seconds) {
            const mins = Math.floor(seconds / 60)
            const secs = Math.floor(seconds % 60)
            return `${mins}:${secs.toString().padStart(2, '0')}`
        },
    formatFileSize(bytes) {
            if (!bytes) return '未知大小'
            if (bytes < 1024) return bytes + ' B'
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
        },
    getFileIcon(fileName) {
            if (!fileName) return 'file_document'

            const ext = fileName.split('.').pop().toLowerCase()
            if (['mp4', 'avi', 'mkv'].includes(ext)) return 'video'
            if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image_gallery'
            return 'file_document'
        }
}
