import { fetchAiAction, updateAiAction, confirmAiAction, createBookingDraft, newActionRequestId } from '@/api/ai-actions.js'

const errorText = error => error?.msg || error?.message || '网络暂不可用，请重试以核实同一预约草稿'
const expired = draft => !Number.isFinite(Date.parse(draft?.expiresAt)) || Date.parse(draft.expiresAt) <= Date.now()

export const bookingDraftMethods = {
  async loadBookingDraft(response) {
    this.draftLoading = true
    this.draftError = ''
    try {
      const draft = (response || await fetchAiAction(this.draftId))?.data
      if (!draft || draft.type !== 'booking' || draft.id !== this.draftId) throw new Error('预约草稿不存在或类型不匹配')
      this.draft = draft
      this.draftReceipt = draft.status === 'completed' ? draft.result?.booking : null
      if (draft.status === 'completed' && !this.draftReceipt) throw new Error('预约回执暂不可用，请重试核实')
      this.draftExpired = !this.draftReceipt && (expired(draft) || draft.status === 'cancelled')
      if (this.draftReceipt || this.draftExpired) return
      if (draft.status !== 'pending') throw new Error('预约草稿已关闭，请返回聊天重新准备')
      const payload = draft.payload || {}
      this.remark = payload.notes || ''
      if (payload.address) this.address = payload.address
      if (payload.contactPhone) this.contactPhone = payload.contactPhone
      this.selectedTypes = (payload.items || []).map(item => Number(item.typeId))
      this.itemWeights = Object.fromEntries((payload.items || []).map(item => [item.typeId, item.weight]))
      this.selectedDate = 'today'
      if (payload.appointmentDate) {
        if (payload.appointmentDate === this.dateValues.tomorrow) this.selectedDate = 'tomorrow'
        else if (payload.appointmentDate !== this.dateValues.today) {
          this.dateValues.custom = payload.appointmentDate
          this.selectedDate = 'custom'
        }
      }
      await this.loadTimeSlots()
      if (this.timeSlots.some(slot => slot.available && slot.time === payload.appointmentTimeSlot)) this.selectedTimeSlot = payload.appointmentTimeSlot
    } catch (error) { this.draftError = errorText(error) }
    finally { this.draftLoading = false }
  },
  getBookingPayload() {
    return { items: this.selectedTypes.map(typeId => ({ typeId, weight: Number(this.itemWeights[typeId] ?? 1) })),
      appointmentDate: this.timeSlotsDate, appointmentTimeSlot: this.selectedTimeSlot,
      address: this.address, contactPhone: this.contactPhone.trim(), notes: this.remark }
  },
  async submitDraftBooking() {
    if (this.submitting || this.draftLoading || this.draftExpired || this.draftReceipt || this.draftError || !this.draft) return
    this.submitting = true
    try {
      const response = await fetchAiAction(this.draftId)
      const current = response?.data
      if (!current || current.type !== 'booking' || current.id !== this.draftId) throw new Error('预约草稿不可用，请重新加载')
      if (current.status === 'completed') {
        await this.loadBookingDraft(response)
        return
      }
      if (current.status !== 'pending' || expired(current) || !Number.isInteger(current.version) || current.version !== this.draft.version) {
        await this.loadBookingDraft(response)
        uni.showToast({ title: '草稿状态已变化，请核对后再次确认', icon: 'none' })
        return
      }
      if (!this.validateBookingForm()) return
      const saved = await updateAiAction(this.draftId, { version: current.version, payload: this.getBookingPayload() })
      if (!saved?.data || !Number.isInteger(saved.data.version)) throw new Error('草稿保存结果不明确，请重试核实')
      this.draft = saved.data
      const confirmed = await confirmAiAction(this.draftId, { version: this.draft.version })
      if (!confirmed?.data?.booking?.id) throw new Error('预约结果不明确，请重试核实')
      this.draftReceipt = confirmed.data.booking
      this.draft = { ...this.draft, status: 'completed', result: confirmed.data }
      this.syncProfileAfterBooking()
      uni.showToast({ title: '预约已提交', icon: 'success' })
    } catch (error) {
      // Retain this draft ID. A lost response can only be recovered, never create a fresh order.
      if (Number(error?.statusCode || error?.status || error?.code) === 409) await this.loadBookingDraft()
      uni.showModal({ title: '请核实预约信息', content: errorText(error), showCancel: false })
    } finally { this.submitting = false }
  },
  async recreateBookingDraft() {
    if (!this.draftExpired || this.submitting || this.draftLoading) return
    this.submitting = true
    try {
      this.replacementRequestId ||= newActionRequestId()
      const response = await createBookingDraft({ requestId: this.replacementRequestId, notes: this.draft?.payload?.notes || '', sessionId: this.draft?.sessionId || '' })
      if (!response?.data?.id) throw new Error('草稿创建结果不明确，请重试')
      this.draftId = response.data.id
      this.replacementRequestId = ''
      await this.loadBookingDraft(response)
      uni.redirectTo({ url: `/pages-nonTheme/booking?draftId=${encodeURIComponent(this.draftId)}` })
    } catch (error) { uni.showModal({ title: '暂时无法创建草稿', content: errorText(error), showCancel: false }) }
    finally { this.submitting = false }
  }
}
