import * as chatApi from '@/pages-nonTheme/api/chat.js'
import { getDisplayName } from '@/utils/display-name.js'

const requestKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`

export const messageActionsMethods = {
    onMessageLongPressV2(message) {
        if (this.selectingMessages) return
        const actions = []
        if (message.type === 'text' || message.type === 'location' || (message.type === 'voice' && message.voiceText)) actions.push({ key: 'copy', label: '复制' })
        actions.push({ key: 'delete', label: '删除' })
        if (message.status === 'sent' && !message.isWithdraw) {
            actions.push({ key: 'quote', label: '引用' }, { key: 'forward', label: '转发' }, { key: 'select', label: '多选' })
            if (!this.isGroupChat && message.type === 'voice') actions.push({ key: 'transcribe', label: message.voiceText ? '重新转文字' : '转文字' })
            if (message.isSelf) actions.push({ key: 'recall', label: '撤回' })
        } else if (message.status === 'failed') actions.push({ key: 'retry', label: '重新发送' })
        this.messageMenu = { message, actions }
    },
    async executeMessageAction(action) {
        const message = this.messageMenu?.message
        this.messageMenu = null
        if (!message) return
        if (action === 'copy') {
            const data = message.type === 'text' ? message.content : message.type === 'voice' ? message.voiceText : `位置 ${message.locationName}\n${message.locationAddress}`
            uni.setClipboardData({ data })
        } else if (action === 'quote') {
            this.refMessageId = message.id
            this.showRefSuggestion = true
        } else if (action === 'retry') this.resendMessage(message)
        else if (action === 'transcribe') this.transcribeVoiceMessage(message)
        else if (action === 'select') {
            uni.hideKeyboard()
            this.selectingMessages = true
            this.selectedMessageIds = [String(message.id)]
            this.showEmojiPanel = false
            this.showMorePanel = false
        } else if (action === 'forward') {
            this.selectedMessageIds = [String(message.id)]
            this.chooseForwardConversation()
        } else if (action === 'delete') {
            const result = await new Promise(resolve => uni.showModal({ title: '删除消息', content: '仅删除你自己的记录，对方或其他群成员的记录将保留。', success: resolve, fail: () => resolve({ confirm: false }) }))
            if (!result.confirm) return
            try {
                if (message.status === 'sent') await this.deleteMessageIds([String(message.id)])
                this.messages = this.messages.filter(item => String(item.id) !== String(message.id))
                this.saveMessagesToStorage()
            } catch (_) { uni.showToast({ title: '删除失败，请重试', icon: 'none' }) }
        } else if (action === 'recall') {
            try {
                if (this.isGroupChat) await chatApi.recallGroupMessage(this.groupId, message.id)
                else await chatApi.recallMessage(message.id)
                message.isWithdraw = true
                this.saveMessagesToStorage()
            } catch (_) { uni.showToast({ title: '撤回失败，请重试', icon: 'none' }) }
        }
    },
    toggleMessageSelection(message) {
        if (message.status !== 'sent' || message.isWithdraw || this.messageActionBusy) return
        const id = String(message.id)
        if (this.selectedMessageIds.includes(id)) this.selectedMessageIds = this.selectedMessageIds.filter(value => value !== id)
        else if (this.selectedMessageIds.length < 100) this.selectedMessageIds.push(id)
        else uni.showToast({ title: '一次最多选择100条消息', icon: 'none' })
    },
    cancelMessageSelection() { this.selectingMessages = false; this.selectedMessageIds = [] },
    deleteMessageIds(ids) { return this.isGroupChat ? chatApi.deleteGroupMessages(this.groupId, ids) : chatApi.deleteChatMessages(ids) },
    async deleteSelectedMessages() {
        if (!this.selectedMessageIds.length || this.messageActionBusy) return
        const result = await new Promise(resolve => uni.showModal({ title: '删除消息', content: `确定删除自己的这 ${this.selectedMessageIds.length} 条消息记录吗？`, success: resolve, fail: () => resolve({ confirm: false }) }))
        if (!result.confirm) return
        this.messageActionBusy = true
        try {
            const ids = this.selectedMessageIds.slice()
            await this.deleteMessageIds(ids)
            this.messages = this.messages.filter(message => !ids.includes(String(message.id)))
            this.saveMessagesToStorage()
            this.cancelMessageSelection()
        } catch (_) { uni.showToast({ title: '删除失败，请重试', icon: 'none' }) }
        finally { this.messageActionBusy = false }
    },
    async chooseForwardConversation() {
        if (!this.selectedMessageIds.length || this.messageActionBusy) return
        try {
            const [friends, groups] = await Promise.all([chatApi.getFriends(), chatApi.getGroups()])
            this.selectionItems = [
                ...(friends.data?.list || []).map(friend => ({ id: String(friend.id), label: friend.note || getDisplayName(friend), subtitle: friend.username })),
                ...(groups.data?.list || []).map(group => ({ id: `group:${group.id}`, label: group.name, subtitle: '群聊' }))
            ]
            this.forwardAttempt = null
            this.selectionMode = 'forward'
        } catch (_) { uni.showToast({ title: '加载会话失败', icon: 'none' }) }
    },
    async forwardSelectedMessages(conversationId) {
        if (!this.forwardAttempt || this.forwardAttempt.conversationId !== conversationId) this.forwardAttempt = { conversationId, key: requestKey() }
        await chatApi.forwardChatMessages({ messageIds: this.selectedMessageIds.slice(),
            ...(this.isGroupChat ? { sourceGroupId: this.groupId } : {}), conversationId, clientMessageId: this.forwardAttempt.key })
        this.cancelMessageSelection()
        uni.showToast({ title: '已转发', icon: 'success' })
    },
    restoreChatDraft() {
        this.draftIdentity = String(this.getCurrentUserId() || '')
        this.draftStorageKey = `draft_${this.storageKey}`
        try {
            const draft = uni.getStorageSync(this.draftStorageKey)
            if (draft && typeof draft === 'object') {
                this.inputText = draft.text || ''
                this.refMessageId = draft.refId || null
                this.showRefSuggestion = !!draft.refId
            }
        } catch (_) {}
    },
    queueChatDraftSave() {
        if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer)
        this.draftSaveTimer = setTimeout(() => this.saveChatDraft(), 300)
    },
    saveChatDraft() {
        if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer)
        this.draftSaveTimer = null
        if (!this.draftIdentity || !uni.getStorageSync('token') || this.draftIdentity !== String(this.getCurrentUserId() || '') || !this.draftStorageKey) return
        try {
            if (this.inputText || this.refMessageId) uni.setStorageSync(this.draftStorageKey, { text: this.inputText, refId: this.refMessageId })
            else uni.removeStorageSync(this.draftStorageKey)
        } catch (_) {}
    }
}
