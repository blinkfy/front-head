export const messageSyncMethods = {
    async fetchConversationUpdates(pollingVersion) {
        const valid = () => this.canPollMessages() && pollingVersion === this.messagePollingVersion
        const ids = this.messages.map(message => String(message.id)).filter(id => /^\d+$/.test(id))
        const now = Date.now()
        const fullReconcile = this.lastSyncedMessageId == null || this.lastHistoryReconcileAt === 0
        const reconcile = fullReconcile || now - this.lastHistoryReconcileAt >= 60000
        const earliest = ids.reduce((value, id) => Math.min(value, Number(id)), Infinity)
        // Only pre-upgrade caches without a saved coverage cursor need the
        // one-time gap repair. Reopening/reconnecting must not replay history.
        let afterId = this.lastSyncedMessageId == null && Number.isFinite(earliest)
            ? Math.max(0, earliest - 1) : this.lastSyncedMessageId
        const messages = []
        let cursor = afterId
        let coveredCache = this.lastSyncedMessageId == null && Number.isFinite(earliest)
        while (valid()) {
            const params = { page: 1, pageSize: 100 }
            if (cursor != null) params.afterId = cursor
            const response = await this.getConversationHistory(params, { silent: true })
            if (!valid()) return []
            const rows = Array.isArray(response.data) ? response.data : response.data?.list || []
            if (!response.incremental) coveredCache = false
            messages.push(...rows)
            const maximum = rows.reduce((value, message) => Math.max(value, Number(message.id) || 0), Number(cursor) || 0)
            // New servers explicitly advertise incremental pagination; legacy servers
            // still return their original recent page and remain usable.
            if (!response.incremental || !response.hasMore || maximum <= Number(cursor || 0)) {
                if (response.hasMore && maximum <= Number(cursor || 0)) coveredCache = false
                cursor = maximum || cursor
                break
            }
            cursor = maximum
        }
        if (!valid()) return []
        if (reconcile) {
            // A completed initial range already covers the cached records; don't
            // read them twice. Normal minute checks only refresh the recent page.
            if (coveredCache) {
                const visible = new Set(messages.map(message => String(message.id)))
                this.messages = this.messages.filter(message => !/^\d+$/.test(String(message.id)) || visible.has(String(message.id)))
                this.saveMessagesToStorage()
            }
            const refreshIds = coveredCache ? [] : fullReconcile ? ids : ids.slice(-100)
            for (let offset = 0; offset < refreshIds.length && valid(); offset += 100) {
                const response = await this.getConversationHistory({ messageIds: refreshIds.slice(offset, offset + 100).join(','), pageSize: 100 }, { silent: true })
                if (!valid()) return []
                const rows = Array.isArray(response.data) ? response.data : response.data?.list || []
                messages.push(...rows)
                if (Array.isArray(response.missingIds)) {
                    const missing = new Set(response.missingIds.map(String))
                    this.messages = this.messages.filter(message => !missing.has(String(message.id)))
                    if (missing.size) this.saveMessagesToStorage()
                }
            }
            this.lastHistoryReconcileAt = now
        }
        this.lastSyncedMessageId = cursor
        return messages
    }
}
