import * as chatApi from '@/pages-nonTheme/api/chat.js'

export const mediaSendMethods = {
    async sendVoiceMessage(filePath, duration) {
            const msg = this.createMessage('voice', filePath, { duration, voiceText: '' })
            this.addMessage(msg)

            // 上传到服务器
            try {
                const res = this.isGroupChat
                    ? await chatApi.sendGroupVoiceMessage(this.groupId, filePath, duration, this.refMessageId)
                    : await chatApi.sendVoiceMessage(
                        this.chatId,
                        this.otherUserId,
                        filePath,
                        duration
                    )

                if (res.data) {
                    const newId = this.getServerMessageId(res.data)
                    if (res.data.url) {
                        const targetMsg = this.messages.find(m => m.id === msg.id)
                        if (targetMsg) targetMsg.content = res.data.url
                    }
                    this.updateMessageStatus(msg.id, 'sent', newId)
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                }
            } catch (e) {
                console.error('发送语音消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
            }
        },
    async sendImageMessage(filePath) {
            const msg = this.createMessage('image', filePath)
            this.addMessage(msg)
            
            // 保存本地 blob URL 到缓存(发送端使用)
            if (filePath.startsWith('blob:')) {
                this.localFileCache[msg.id] = filePath
                this.saveLocalFileCache()
            }

            // 上传到服务器
            try {
                const res = this.isGroupChat
                    ? await chatApi.sendGroupImageMessage(this.groupId, filePath, this.refMessageId)
                    : await chatApi.sendImageMessage(
                        this.chatId,
                        this.otherUserId,
                        filePath
                    )
                
                if (res.data) {
                    const newId = this.getServerMessageId(res.data)
                    // 注意: 不更新content,保留本地blob URL用于显示
                    // 服务器URL会在formatServerMessage中处理(用于对方接收时显示)
                    this.updateMessageStatus(msg.id, 'sent', newId)
                    
                    // 更新缓存中的key为新ID
                    if (this.localFileCache[msg.id]) {
                        this.localFileCache[newId] = this.localFileCache[msg.id]
                        delete this.localFileCache[msg.id]
                        this.saveLocalFileCache()
                    }
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                }
            } catch (e) {
                console.error('发送图片消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
            }
        },
    async sendVideoMessage(filePath, thumbnail, duration) {
            const msg = this.createMessage('video', filePath, { thumbnail, duration })
            this.addMessage(msg)
            
            // 保存本地 blob URL 到缓存(发送端使用)
            if (filePath.startsWith('blob:')) {
                this.localFileCache[msg.id] = filePath
                this.saveLocalFileCache()
            }
            
            // 初始化进度为0 (Vue 3 直接赋值即可)
            this.uploadProgress[msg.id] = 0

            // 上传到服务器
            try {
                const onProgress = (progress) => {
                    this.uploadProgress[msg.id] = progress
                }
                const res = this.isGroupChat
                    ? await chatApi.sendGroupVideoMessage(this.groupId, filePath, thumbnail, duration, this.refMessageId, onProgress)
                    : await chatApi.sendVideoMessage(
                        this.chatId,
                        this.otherUserId,
                        filePath,
                        thumbnail,
                        duration,
                        onProgress
                    )

                if (res.data) {
                    const newId = this.getServerMessageId(res.data)
                    // 注意: 不更新content和thumbnail,保留本地blob URL用于显示
                    this.updateMessageStatus(msg.id, 'sent', newId)
                    
                    // 更新缓存中的key为新ID
                    if (this.localFileCache[msg.id]) {
                        this.localFileCache[newId] = this.localFileCache[msg.id]
                        delete this.localFileCache[msg.id]
                        this.saveLocalFileCache()
                    }
                    
                    // 清除进度 (Vue 3 使用 delete 操作符)
                    delete this.uploadProgress[msg.id]
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                    delete this.uploadProgress[msg.id]
                }
            } catch (e) {
                console.error('发送视频消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
                delete this.uploadProgress[msg.id]
            }
        },
    async sendFileMessage(filePath, fileName, fileSize) {
            const msg = this.createMessage('file', filePath, { fileName, fileSize })
            this.addMessage(msg)
            
            // 保存本地 blob URL 到缓存(发送端使用)
            if (filePath.startsWith('blob:')) {
                this.localFileCache[msg.id] = filePath
                this.saveLocalFileCache()
            }
            
            // 初始化进度为0 (Vue 3 直接赋值即可)
            this.uploadProgress[msg.id] = 0

            // 上传到服务器
            try {
                const onProgress = (progress) => {
                    this.uploadProgress[msg.id] = progress
                }
                const res = this.isGroupChat
                    ? await chatApi.sendGroupFileMessage(this.groupId, filePath, fileName, fileSize, this.refMessageId, onProgress)
                    : await chatApi.sendFileMessage(
                        this.chatId,
                        this.otherUserId,
                        filePath,
                        fileName,
                        fileSize,
                        onProgress
                    )

                if (res.data) {
                    const newId = this.getServerMessageId(res.data)
                    // 注意: 不更新content,保留本地文件信息
                    this.updateMessageStatus(msg.id, 'sent', newId)
                    
                    // 更新缓存中的key为新ID
                    if (this.localFileCache[msg.id]) {
                        this.localFileCache[newId] = this.localFileCache[msg.id]
                        delete this.localFileCache[msg.id]
                        this.saveLocalFileCache()
                    }
                    
                    // 清除进度 (Vue 3 使用 delete 操作符)
                    delete this.uploadProgress[msg.id]
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                    delete this.uploadProgress[msg.id]
                }
            } catch (e) {
                console.error('发送文件消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
                delete this.uploadProgress[msg.id]
            }
        }
}

export const mediaPickerMethods = {
    chooseImage() {
            uni.chooseImage({
                count: 9,
                sizeType: ['compressed'],
                sourceType: ['album'],
                success: (res) => {
                    res.tempFilePaths.forEach(path => {
                        this.sendImageMessage(path)
                    })
                }
            })
            this.showMorePanel = false
        },
    shootPhoto() {
            uni.chooseImage({
                count: 1,
                sizeType: ['compressed'],
                sourceType: ['camera'],
                success: (res) => {
                    this.sendImageMessage(res.tempFilePaths[0])
                }
            })
            this.showMorePanel = false
        },
    chooseVideo() {
            uni.chooseVideo({
                sourceType: ['album'],
                compressed: true,
                success: (res) => {
                    this.sendVideoMessage(res.tempFilePath, res.thumbTempFilePath, res.duration)
                }
            })
            this.showMorePanel = false
        },
    recordVideo() {
            uni.chooseVideo({
                sourceType: ['camera'],
                compressed: true,
                maxDuration: 60,
                success: (res) => {
                    this.sendVideoMessage(res.tempFilePath, res.thumbTempFilePath, res.duration)
                }
            })
            this.showMorePanel = false
        },
    chooseFile() {
            // #ifdef APP-PLUS
            plus.io.chooseFile({
                success: (res) => {
                    const file = res.files[0]
                    this.sendFileMessage(file.path, file.name, file.size)
                },
                fail: () => {
                    uni.showToast({ title: '选择文件失败', icon: 'none' })
                }
            })
            // #endif

            // #ifdef H5
            const input = document.createElement('input')
            input.type = 'file'
            input.onchange = (e) => {
                const file = e.target.files[0]
                if (file) {
                    const reader = new FileReader()
                    reader.onload = () => {
                        this.sendFileMessage(reader.result, file.name, file.size)
                    }
                    reader.readAsDataURL(file)
                }
            }
            input.click()
            // #endif

            // #ifdef MP-WEIXIN
            wx.chooseMessageFile({
                count: 1,
                type: 'file',
                success: (res) => {
                    const file = res.tempFiles[0]
                    this.sendFileMessage(file.path, file.name, file.size)
                }
            })
            // #endif

            this.showMorePanel = false
        }
}

export const attachmentIngressMethods = {
    onDragOver(e) {
            e.preventDefault()
            this.isDragOver = true
        },
    onDragLeave(e) {
            this.isDragOver = false
        },
    onDrop(e) {
            if (e.preventDefault) {
                e.preventDefault()
            }
            if (e.stopPropagation) {
                e.stopPropagation()
            }
            
            this.isDragOver = false
            
            // 获取拖拽的文件 - 支持多种方式
            let files = null
            
            // 方式 1：标准的 dataTransfer.files
            if (e.dataTransfer && e.dataTransfer.files) {
                files = e.dataTransfer.files
                console.log('方式1: 使用 dataTransfer.files', files)
            }
            
            // 方式 2：dataTransfer.items (更现代)
            if ((!files || files.length === 0) && e.dataTransfer && e.dataTransfer.items) {
                const items = e.dataTransfer.items
                files = []
                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                        const file = items[i].getAsFile()
                        if (file) {
                            files.push(file)
                        }
                    }
                }
                console.log('方式2: 使用 dataTransfer.items', files)
            }
            
            // // 检查是否获取到文件
            // if (!files || files.length === 0) {
            //     console.warn('未检测到文件', {
            //         dataTransfer: e.dataTransfer,
            //         files: files,
            //         eventType: e.type
            //     })
            //     uni.showToast({
            //         title: '未检测到文件，请尝试直接拖拽或粘贴',
            //         icon: 'none'
            //     })
            //     return
            // }

            if (!files || files.length === 0) return
            
            // 处理拖拽的文件
            this.processDroppedFiles(Array.from(files))
        },
// 处理原生粘贴事件（拥有完整的 clipboardData）
    onPasteNative(e) {
            console.log('onPasteNative 触发', e)
            const clipboardData = e.clipboardData
            if (!clipboardData) {
                console.warn('无法获取 clipboardData')
                return
            }

            console.log('clipboardData.items:', clipboardData.items)
            console.log('clipboardData.files:', clipboardData.files)

            // 优先使用 items （更现代的方式）
            const items = clipboardData.items
            const files = clipboardData.files
            let processed = false

            if (items && items.length > 0) {
                console.log('使用 items 方式处理粘贴')
                // 遍历粘贴的项目
                for (let i = 0; i < items.length; i++) {
                    const item = items[i]
                    console.log(`项目 ${i}:`, { kind: item.kind, type: item.type })
                    
                    // 检查是否是文件
                    if (item.kind === 'file') {
                        const file = item.getAsFile()
                        if (file) {
                            console.log('获取到文件:', file.name, file.type, file.size)
                            this.processPastedFile(file)
                            processed = true
                        }
                    }
                }
            } else if (!processed && files && files.length > 0) {
                console.log('使用 files 方式处理粘贴')
                // 备选方式：使用 files (仅当 items 未处理任何文件时)
                for (let i = 0; i < files.length; i++) {
                    const file = files[i]
                    console.log('获取到文件:', file.name, file.type, file.size)
                    this.processPastedFile(file)
                }
            } else {
                console.warn('粘贴内容中未找到文件')
            }
        },
// Vue 模板粘贴事件处理（备用，以防 uni-app 能访问 clipboardData）
    onPaste(e) {
            // #ifndef H5
            return
            // #endif

            // #ifdef H5
            console.log('Vue @paste 触发', e)
            
            // 获取粘贴的内容
            const clipboardData = e?.clipboardData || (typeof window !== 'undefined' ? window.clipboardData : null)
            if (!clipboardData) {
                console.warn('Vue @paste 无法获取 clipboardData，将使用原生事件处理')
                return
            }

            console.log('clipboardData.items:', clipboardData.items)
            console.log('clipboardData.files:', clipboardData.files)

            // 优先使用 items （更现代的方式）
            const items = clipboardData.items
            const files = clipboardData.files
            let processed = false

            if (items && items.length > 0) {
                console.log('使用 items 方式处理粘贴')
                // 遍历粘贴的项目
                for (let i = 0; i < items.length; i++) {
                    const item = items[i]
                    console.log(`项目 ${i}:`, { kind: item.kind, type: item.type })
                    
                    // 检查是否是文件
                    if (item.kind === 'file') {
                        const file = item.getAsFile()
                        if (file) {
                            console.log('获取到文件:', file.name, file.type, file.size)
                            this.processPastedFile(file)
                            processed = true
                        }
                    }
                }
            } else if (!processed && files && files.length > 0) {
                console.log('使用 files 方式处理粘贴')
                // 备选方式：使用 files (仅当 items 未处理任何文件时)
                for (let i = 0; i < files.length; i++) {
                    const file = files[i]
                    console.log('获取到文件:', file.name, file.type, file.size)
                    this.processPastedFile(file)
                }
            } else {
                console.warn('粘贴内容中未找到文件')
            }
            // #endif
        },
    processDroppedFiles(files) {
            console.log(`处理 ${files.length} 个拖拽的文件`)
            files.forEach((file, index) => {
                console.log(`处理文件 ${index + 1}/${files.length}:`, file.name, file.type, file.size)
                this.handleFileUpload(file)
            })
        },
    processPastedFile(file) {
            console.log('处理粘贴的文件:', file.name, file.type, file.size)
            this.handleFileUpload(file)
        },
    handleFileUpload(file) {
            // 检查文件类型
            const fileType = file.type
            const fileName = file.name || '未命名文件'
            
            console.log('检查文件类型:', fileType)
            
            if (fileType.startsWith('image/')) {
                // 处理图片
                console.log('识别为图片，开始处理')
                this.handlePastedImage(file, fileName)
            } else if (fileType.startsWith('video/')) {
                // 处理视频
                console.log('识别为视频，开始处理')
                this.handlePastedVideo(file, fileName)
            } else {
                // 处理其他文件
                console.log('识别为其他文件，开始处理')
                this.handlePastedFile(file, fileName)
            }
        },
    handlePastedImage(file, fileName) {
            console.log('开始读取图片:', fileName)
            uni.showToast({ title: '正在处理图片...', icon: 'loading' })
            
            // 创建 FileReader 读取文件
            const reader = new FileReader()
            reader.onload = (e) => {
                const data = e.target?.result
                console.log('图片读取成功，数据长度:', data?.length)
                if (data) {
                    console.log('发送图片消息')
                    this.sendImageMessage(data)
                }
            }
            reader.onerror = (error) => {
                console.error('读取图片失败:', error)
                uni.showToast({
                    title: '读取图片失败：' + error.name,
                    icon: 'none'
                })
            }
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100)
                    console.log('读取进度:', percentComplete + '%')
                }
            }
            reader.readAsDataURL(file)
        },
    handlePastedVideo(file, fileName) {
            console.log('开始读取视频:', fileName)
            uni.showToast({ title: '正在处理视频...', icon: 'loading' })
            
            // 创建 FileReader 读取文件
            const reader = new FileReader()
            reader.onload = (e) => {
                const data = e.target?.result
                console.log('视频读取成功，数据长度:', data?.length)
                if (data) {
                    console.log('发送视频消息')
                    this.sendVideoMessage(data, fileName)
                }
            }
            reader.onerror = (error) => {
                console.error('读取视频失败:', error)
                uni.showToast({
                    title: '读取视频失败：' + error.name,
                    icon: 'none'
                })
            }
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100)
                    console.log('读取进度:', percentComplete + '%')
                }
            }
            reader.readAsDataURL(file)
        },
    handlePastedFile(file, fileName) {
            console.log('开始读取文件:', fileName)
            uni.showToast({ title: '正在处理文件...', icon: 'loading' })
            
            // 创建 FileReader 读取文件
            const reader = new FileReader()
            reader.onload = (e) => {
                const data = e.target?.result
                console.log('文件读取成功，数据长度:', data?.length)
                if (data) {
                    console.log('发送文件消息')
                    this.sendFileMessage(data, fileName, file.size)
                }
            }
            reader.onerror = (error) => {
                console.error('读取文件失败:', error)
                uni.showToast({
                    title: '读取文件失败：' + error.name,
                    icon: 'none'
                })
            }
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100)
                    console.log('读取进度:', percentComplete + '%')
                }
            }
            reader.readAsDataURL(file)
        }
}
