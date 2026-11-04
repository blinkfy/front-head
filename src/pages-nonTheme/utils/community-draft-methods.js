import { fetchAiAction, updateAiAction, confirmAiAction, createCommunityPostDraft, newActionRequestId } from '@/api/ai-actions.js'

const errorText = error => error?.msg || error?.message || '网络暂不可用，请重试核实同一草稿'
const expired = draft => !Number.isFinite(Date.parse(draft?.expiresAt)) || Date.parse(draft.expiresAt) <= Date.now()
const matches = (draft, id) => draft?.id === id && draft.type === 'community_post' && Number.isInteger(draft.version)

export const communityDraftMethods = {
  async loadCommunityDraft(response) {
    const version = ++this.draftLoadVersion
    this.draftLoading = true
    this.draftError = ''
    try {
      const result = response || await fetchAiAction(this.draftId)
      if (this.pageClosed || version !== this.draftLoadVersion) return
      const draft = result?.data
      if (result?.code !== 0 || !matches(draft, this.draftId)) throw new Error('帖子草稿不存在或类型不匹配')
      this.draft = draft
      this.draftReceipt = draft.status === 'completed' ? draft.result?.post : null
      if (draft.status === 'completed' && !this.draftReceipt?.id) throw new Error('发布回执暂不可用，请重新读取')
      this.draftExpired = !this.draftReceipt && (expired(draft) || draft.status === 'cancelled')
      if (this.draftReceipt || this.draftExpired) return
      if (draft.status !== 'pending') throw new Error('帖子草稿暂不可编辑')
      this.communityId = Number(draft.payload?.communityId) || 0
      this.content = draft.payload?.content || ''
      this.uploadedImages = Array.isArray(draft.payload?.images) ? [...draft.payload.images] : []
      this.selectedTag = draft.payload?.tag || '心得'
      this.visibilityScope = draft.payload?.visibilityScope || 'community'
    } catch (error) {
      if (!this.pageClosed && version === this.draftLoadVersion) this.draftError = errorText(error)
    } finally {
      if (!this.pageClosed && version === this.draftLoadVersion) this.draftLoading = false
    }
  },
  async saveCommunityDraft(publish = false) {
    if (this.pageClosed || this.submitting || this.draftLoading || this.draftError || this.draftExpired || this.draftReceipt || !this.draft) return
    if (publish && !this.content.trim()) {
      uni.showToast({ title: '请输入帖子内容', icon: 'none' })
      return
    }
    this.submitting = true
    try {
      const response = await fetchAiAction(this.draftId)
      if (this.pageClosed) return
      const current = response?.data
      if (response?.code !== 0 || !matches(current, this.draftId)) throw new Error('草稿不可用，请重新读取')
      if (current.status === 'completed') return await this.loadCommunityDraft(response)
      if (current.status !== 'pending' || expired(current) || current.version !== this.draft.version) {
        await this.loadCommunityDraft(response)
        if (!this.pageClosed) uni.showToast({ title: '草稿已变化，请核对后再次确认', icon: 'none' })
        return
      }
      const images = await this.getPersistentImages()
      if (this.pageClosed) return
      const saved = await updateAiAction(this.draftId, { version: current.version, payload: {
        communityId: this.communityId, content: this.content.trim(), images, tag: this.selectedTag,
        visibilityScope: this.isAdmin ? this.visibilityScope : 'community'
      } })
      if (this.pageClosed) return
      if (saved?.code !== 0 || !matches(saved?.data, this.draftId)) throw new Error('草稿保存结果不明确，请重试核实')
      this.draft = saved.data
      this.uploadedImages = images
      if (!publish) {
        uni.showToast({ title: '草稿已保存，尚未发布', icon: 'none' })
        return
      }
      const confirmed = await confirmAiAction(this.draftId, { version: this.draft.version })
      if (this.pageClosed) return
      if (confirmed?.code !== 0 || !confirmed?.data?.post?.id) throw new Error('发布结果不明确，请重新读取同一草稿')
      this.draftReceipt = confirmed.data.post
      this.draft = { ...this.draft, status: 'completed', result: confirmed.data }
      uni.showToast({ title: '帖子已发布', icon: 'success' })
    } catch (error) {
      if (this.pageClosed) return
      if (Number(error?.statusCode || error?.status || error?.code) === 409) await this.loadCommunityDraft()
      if (!this.pageClosed) uni.showModal({ title: '请核实帖子草稿', content: errorText(error), showCancel: false })
    } finally { if (!this.pageClosed) this.submitting = false }
  },
  async recreateCommunityDraft() {
    if (this.pageClosed || !this.draftExpired || this.submitting || this.draftLoading) return
    this.submitting = true
    try {
      this.replacementRequestId ||= newActionRequestId()
      const response = await createCommunityPostDraft({ requestId: this.replacementRequestId, payload: this.draft.payload, sessionId: this.draft.sessionId || '' })
      if (this.pageClosed) return
      if (response?.code !== 0 || !response?.data?.id) throw new Error('创建结果不明确，请重试')
      this.draftId = response.data.id
      this.replacementRequestId = ''
      await this.loadCommunityDraft(response)
      if (!this.pageClosed) uni.redirectTo({ url: `/pages-nonTheme/community-publish?draftId=${encodeURIComponent(this.draftId)}` })
    } catch (error) {
      if (!this.pageClosed) uni.showModal({ title: '无法重新创建草稿', content: errorText(error), showCancel: false })
    } finally { if (!this.pageClosed) this.submitting = false }
  }
}
