<template>
    <view class="history-search-mask" @click="$emit('close')">
        <view class="history-search-panel" @click.stop>
            <view class="history-search-heading"><view class="history-search-title"><ManifestIcon id="chat_history_search" size="36rpx" /><text>查找聊天记录</text></view><button @click="$emit('close')">关闭</button></view>
            <view class="history-search-input-row"><input v-model="keyword" class="history-search-input" placeholder="搜索消息或文件名" confirm-type="search" @confirm="search" /><button @click="search">搜索</button></view>
            <scroll-view scroll-x class="history-search-types"><view class="history-search-type-row"><text v-for="item in types" :key="item.value" class="history-search-type" :class="{ active: type === item.value }" @click="type = item.value; search()">{{ item.label }}</text></view></scroll-view>
            <scroll-view scroll-y class="history-search-results" @scrolltolower="loadMore">
                <view v-for="message in messages" :key="message.id" class="history-search-result" @click="$emit('select', message.id)">
                    <text class="history-search-preview">{{ preview(message) }}</text>
                    <text class="history-search-time">{{ formatTime(message.sendTime) }} · 点击定位</text>
                </view>
                <text v-if="error" class="history-search-status" @click="loadMore">{{ error }}，点击重试</text>
                <text v-else-if="loading" class="history-search-status">加载中…</text>
                <text v-else-if="!messages.length" class="history-search-status">没有匹配的聊天记录</text>
                <text v-else-if="hasMore" class="history-search-status" @click="loadMore">加载更多</text>
            </scroll-view>
        </view>
    </view>
</template>

<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getChatHistory, getGroupHistory } from '@/pages-nonTheme/api/chat.js'
export default {
    components: { ManifestIcon },
    props: { groupId: String, chatId: String }, emits: ['close', 'select'],
    data() { return { keyword: '', type: '', messages: [], loading: false, hasMore: true, error: '', version: 0,
        types: [{ value: '', label: '全部' }, { value: 'text', label: '文字' }, { value: 'image', label: '图片' }, { value: 'video', label: '视频' }, { value: 'file', label: '文件' }, { value: 'voice', label: '语音' }, { value: 'location', label: '位置' }] } },
    mounted() { this.search() },
    beforeUnmount() { this.version++ },
    methods: {
        search() { this.version++; this.messages = []; this.hasMore = true; this.loading = false; this.loadMore() },
        async loadMore() {
            if (this.loading || !this.hasMore) return
            const version = this.version
            this.loading = true
            this.error = ''
            try {
                const params = { page: 1, pageSize: 30, keyword: this.keyword.trim(), type: this.type }
                if (this.messages.length) {
                    const id = this.messages[this.messages.length - 1].id
                    if (this.groupId) params.beforeId = id
                    else params.lastMessageId = id
                }
                const response = this.groupId ? await getGroupHistory(this.groupId, params) : await getChatHistory({ chatId: this.chatId, ...params })
                if (version !== this.version) return
                const rows = Array.isArray(response.data) ? response.data : response.data?.list || []
                rows.sort((a,b) => Number(b.id) - Number(a.id))
                const ids = new Set(this.messages.map(message => String(message.id)))
                this.messages.push(...rows.filter(message => !ids.has(String(message.id))))
                this.hasMore = response.hasMore ?? rows.length === 30
            } catch (_) { if (version === this.version) this.error = '加载失败' }
            finally { if (version === this.version) this.loading = false }
        },
        preview(message) {
            if (message.isWithdraw) return '[消息已撤回]'
            if (message.type === 'text' || message.type === 'ai') return String(message.content || '')
            let metadata = {}
            try { metadata = JSON.parse(message.content) } catch (_) {}
            return ({ image: '[图片]', video: '[视频]', voice: '[语音]', file: `[文件] ${metadata.fileName || metadata.name || ''}`, location: `[位置] ${metadata.locationName || ''}` })[message.type] || '[消息]'
        },
        formatTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString() }
    }
}
</script>

<style scoped>
.history-search-title { display: flex; align-items: center; gap: 12rpx; }
.history-search-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 10000; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 24rpx; }
.history-search-panel { width: 100%; max-width: 780rpx; padding: 28rpx; box-sizing: border-box; background: #fff; color: #25342e; border-radius: 24rpx; }
.history-search-heading { display: flex; align-items: center; justify-content: space-between; font-size: 32rpx; font-weight: 600; margin-bottom: 22rpx; }
.history-search-heading button { margin: 0; font-size: 24rpx; line-height: 56rpx; }
.history-search-input-row { display: flex; align-items: center; gap: 16rpx; }
.history-search-input { flex: 1; min-width: 0; height: 64rpx; box-sizing: border-box; padding: 0 14rpx; border-radius: 10rpx; background: #f3f5f4; font-size: 26rpx; }
.history-search-input-row button { flex: none; height: 64rpx; margin: 0; font-size: 26rpx; line-height: 64rpx; }
.history-search-types { margin: 20rpx 0; white-space: nowrap; }
.history-search-type-row { display: inline-flex; gap: 16rpx; }
.history-search-type { padding: 10rpx 18rpx; border-radius: 10rpx; font-size: 25rpx; background: #f3f5f4; }
.history-search-type.active { color: #07865f; background: #e5f7ef; }
.history-search-results { height: 55vh; }
.history-search-result { padding: 24rpx 4rpx; border-bottom: 1rpx solid #edf0ee; }
.history-search-preview { display: block; font-size: 27rpx; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160rpx; overflow: hidden; }
.history-search-time { display: block; margin-top: 10rpx; font-size: 22rpx; color: #819088; }
.history-search-status { display: block; padding: 40rpx 0; text-align: center; font-size: 25rpx; color: #819088; }
</style>
