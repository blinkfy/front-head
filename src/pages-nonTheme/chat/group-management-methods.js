import { showAppModal } from '@/utils/app-confirm-dialog.js'
import * as chatApi from '@/pages-nonTheme/api/chat.js'

export const groupManagementMethods = {
    manageGroupMember(member) {
        if (this.removingGroupMemberId || !this.canRemoveGroupMember(member)) return
        if (!this.isGroupOwner) {
            uni.showActionSheet({ itemList: ['移除群聊', member.mute ? '解除禁言' : '禁言'],
                success: ({ tapIndex }) => tapIndex === 0 ? this.confirmRemoveGroupMember(member) : this.toggleGroupMemberMute(member) })
            return
        }
        uni.showActionSheet({
            itemList: [member.role === 'admin' ? '撤销管理员' : '设为管理员', '转让群主', '移除群聊', member.mute ? '解除禁言' : '禁言'],
            success: async ({ tapIndex }) => {
                if (tapIndex === 2) { this.confirmRemoveGroupMember(member); return }
                if (tapIndex === 3) { this.toggleGroupMemberMute(member); return }
                const transfer = tapIndex === 1
                const result = await new Promise(resolve => showAppModal(this, {
                    title: transfer ? '转让群主' : '设置管理员',
                    content: transfer ? `确定将群主转让给“${this.getGroupMemberName(member)}”吗？转让后你将成为管理员。` : `确定${member.role === 'admin' ? '撤销' : '设置'}“${this.getGroupMemberName(member)}”的管理员权限吗？`,
                    success: resolve, fail: () => resolve({ confirm: false })
                }))
                if (!result.confirm) return
                try {
                    if (transfer) await chatApi.transferGroupOwnership(this.groupId, member.userId)
                    else await chatApi.updateGroupMemberRole(this.groupId, member.userId, member.role === 'admin' ? 'member' : 'admin')
                    await this.loadGroupDetail()
                    uni.showToast({ title: '已更新', icon: 'success' })
                } catch (_) { uni.showToast({ title: '操作失败，请重试', icon: 'none' }) }
            }
        })
    },
    editGroupAlias() {
        if (!this.isGroupChat || this.groupSettingsBusy) return
        showAppModal(this, { title: '我在本群的昵称', editable: true, content: this.groupInfo?.currentMember?.alias || '', placeholderText: '最多40个字，留空恢复账号昵称',
            success: async result => {
                if (!result.confirm || this.groupSettingsBusy) return
                const alias = String(result.content || '').trim()
                if (Array.from(alias).length > 40) { uni.showToast({ title: '群昵称最多40个字', icon: 'none' }); return }
                this.groupSettingsBusy = true
                try {
                    await chatApi.updateGroupSettings(this.groupId, { alias })
                    if (this.groupInfo?.currentMember) this.groupInfo.currentMember.alias = alias || null
                    const own = this.groupInfo?.Members?.find(member => String(member.userId) === String(this.getCurrentUserId()))
                    if (own) own.alias = alias || null
                    uni.showToast({ title: alias ? '群昵称已更新' : '已恢复账号昵称', icon: 'success' })
                } catch (_) { uni.showToast({ title: '保存失败，请重试', icon: 'none' }) }
                finally { this.groupSettingsBusy = false }
            }
        })
    },
    async toggleGroupMuteAll(event) {
        if (!this.canManageGroup || this.groupSettingsBusy || !this.groupInfo) return
        const previous = !!this.groupInfo.muteAll
        const muteAll = !!event.detail.value
        this.groupSettingsBusy = true
        this.groupInfo.muteAll = muteAll
        try {
            await chatApi.updateGroupModeration(this.groupId, muteAll)
            uni.showToast({ title: muteAll ? '已开启全员禁言' : '已解除全员禁言', icon: 'success' })
        } catch (_) { this.groupInfo.muteAll = previous; uni.showToast({ title: '更新失败，请重试', icon: 'none' }) }
        finally { this.groupSettingsBusy = false }
    },
    async toggleGroupMemberMute(member) {
        if (this.removingGroupMemberId || !this.canRemoveGroupMember(member)) return
        const mute = !member.mute
        this.removingGroupMemberId = String(member.userId)
        try {
            const result = await new Promise(resolve => showAppModal(this, { title: mute ? '禁言成员' : '解除禁言',
                content: `确定${mute ? '禁止' : '恢复'}“${this.getGroupMemberName(member)}”在本群发言吗？`, success: resolve, fail: () => resolve({ confirm: false }) }))
            if (!result.confirm) return
            await chatApi.updateGroupMemberMute(this.groupId, member.userId, mute)
            member.mute = mute
            uni.showToast({ title: mute ? '已禁言' : '已解除禁言', icon: 'success' })
        } catch (_) { uni.showToast({ title: '操作失败，请重试', icon: 'none' }) }
        finally { this.removingGroupMemberId = '' }
    },
    showGroupAnnouncement() {
        if (this.canManageGroup) {
            this.announcementDraft = this.groupInfo?.announcement || ''
            this.editingAnnouncement = true
        } else showAppModal(this, { title: '群公告', content: this.groupInfo?.announcement || '群主暂未发布公告', showCancel: false })
    },
    async saveGroupAnnouncement() {
        if (this.savingAnnouncement || !this.canManageGroup) return
        this.savingAnnouncement = true
        try {
            const response = await chatApi.updateGroup(this.groupId, { announcement: this.announcementDraft.trim() })
            this.applyGroupInfo(response.data)
            this.editingAnnouncement = false
            uni.showToast({ title: '群公告已更新', icon: 'success' })
        } catch (_) { uni.showToast({ title: '保存失败，请重试', icon: 'none' }) }
        finally { this.savingAnnouncement = false }
    },
    async inviteGroupMembers() {
        if (!this.canManageGroup) return
        try {
            const result = await chatApi.getFriends()
            const existing = new Set((this.groupInfo?.Members || []).map(member => String(member.userId)))
            this.selectionItems = (result.data?.list || []).filter(friend => !existing.has(String(friend.id))).map(friend => ({
                id: String(friend.id), label: friend.note || friend.nickname || friend.username,
                subtitle: friend.username || String(friend.id)
            }))
            this.selectionMode = 'invite'
        } catch (_) { uni.showToast({ title: '加载联系人失败', icon: 'none' }) }
    },
    async confirmChatSelection(ids) {
        if (this.selectionBusy) return
        this.selectionBusy = true
        try {
            if (this.selectionMode === 'invite') {
                await chatApi.addGroupMembers(this.groupId, ids)
                await this.loadGroupDetail()
                uni.showToast({ title: '已邀请成员', icon: 'success' })
            } else if (this.selectionMode === 'forward') {
                await this.forwardSelectedMessages(ids[0])
            }
            this.selectionMode = ''
        } catch (_) { uni.showToast({ title: '操作失败，请重试', icon: 'none' }) }
        finally { this.selectionBusy = false }
    },
    confirmDissolveGroup() {
        if (!this.isGroupOwner) return
        showAppModal(this, { title: '解散群聊', content: '解散后所有成员都将退出，该群的消息记录将被清除。此操作无法恢复，确定解散吗？', confirmColor: '#ef4444',
            success: async result => {
                if (!result.confirm) return
                try { this.leavingGroup = true; await chatApi.dissolveGroup(this.groupId); uni.navigateBack() }
                catch (_) { this.leavingGroup = false; uni.showToast({ title: '解散失败，请重试', icon: 'none' }) }
            }
        })
    }
}
