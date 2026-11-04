import * as chatApi from '@/pages-nonTheme/api/chat.js'

export const messageSendMethods = {
    sendCreatedMessage(message, onProgress) {
        if (this.isGroupChat && this.groupSendBlockReason) return Promise.reject(new Error(this.groupSendBlockReason))
        const { clientMessageId, refId } = message
        const options = { ...(clientMessageId ? { clientMessageId } : {}), ...(refId ? { refId } : {}) }
        if (this.isGroupChat) {
            switch (message.type) {
                case 'text': return chatApi.sendGroupTextMessage(this.groupId, message.content, refId, clientMessageId)
                case 'image': return chatApi.sendGroupImageMessage(this.groupId, message.content, refId, clientMessageId)
                case 'voice': return chatApi.sendGroupVoiceMessage(this.groupId, message.content, message.duration, refId, clientMessageId)
                case 'video': return chatApi.sendGroupVideoMessage(this.groupId, message.content, message.thumbnail, message.duration, refId, onProgress, clientMessageId)
                case 'file': return chatApi.sendGroupFileMessage(this.groupId, message.content, message.fileName, message.fileSize, refId, onProgress, clientMessageId)
                case 'location': return chatApi.sendGroupLocationMessage(this.groupId, { ...options,
                    locationName: message.locationName, locationAddress: message.locationAddress,
                    latitude: message.latitude, longitude: message.longitude })
            }
        } else {
            switch (message.type) {
                case 'text': return chatApi.sendTextMessage({ chatId: this.chatId, targetUserId: this.otherUserId, content: message.content, ...options })
                case 'image': return chatApi.sendImageMessage(this.chatId, this.otherUserId, message.content, options)
                case 'voice': return chatApi.sendVoiceMessage(this.chatId, this.otherUserId, message.content, message.duration, options)
                case 'video': return chatApi.sendVideoMessage(this.chatId, this.otherUserId, message.content, message.thumbnail, message.duration, onProgress, options)
                case 'file': return chatApi.sendFileMessage(this.chatId, this.otherUserId, message.content, message.fileName, message.fileSize, onProgress, options)
                case 'location': return chatApi.sendLocationMessage(this.chatId, this.otherUserId, message.locationName, message.locationAddress, message.latitude, message.longitude, options)
            }
        }
        return Promise.reject(new Error('Unsupported message type'))
    }
}
