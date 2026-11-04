<template>
    <view v-if="open" class="chat-select-mask" @click="!busy && $emit('close')">
        <view class="chat-select-panel" @click.stop>
            <text class="chat-select-title">{{ title }}</text>
            <input v-model="keyword" class="chat-select-search" placeholder="搜索名称或账号" />
            <scroll-view scroll-y class="chat-select-list" @scrolltolower="!loading && $emit('load-more')">
                <view v-for="item in filteredItems" :key="item.id" class="chat-select-row" @click="toggle(item.id)">
                    <text class="chat-select-check">{{ selected.includes(String(item.id)) ? '●' : '○' }}</text>
                    <view class="chat-select-copy"><text>{{ item.label }}</text><text v-if="item.subtitle" class="chat-select-subtitle">{{ item.subtitle }}</text></view>
                </view>
                <view v-if="hasMore || loading" class="chat-select-empty" @click="!loading && $emit('load-more')">{{ loading ? '加载中…' : '加载更多会话' }}</view>
                <text v-if="!filteredItems.length && !loading" class="chat-select-empty">暂无可选项</text>
            </scroll-view>
            <view class="chat-select-actions">
                <button :disabled="busy" @click="$emit('close')">取消</button>
                <button class="chat-select-confirm" :disabled="busy || !selected.length" @click="$emit('confirm', selected.slice())">{{ busy ? '处理中…' : `确定${multiple ? ` (${selected.length})` : ''}` }}</button>
            </view>
        </view>
    </view>
</template>

<script>
export default {
    props: { open: Boolean, title: String, items: { type: Array, default: () => [] }, multiple: Boolean, busy: Boolean, remoteSearch: Boolean, hasMore: Boolean, loading: Boolean },
    emits: ['close', 'confirm', 'search', 'load-more'],
    data() { return { keyword: '', selected: [] } },
    watch: { open(value) { if (value) { this.keyword = ''; this.selected = [] } }, keyword(value) { if (this.remoteSearch) { this.selected = []; this.$emit('search', value) } } },
    computed: {
        filteredItems() {
            if (this.remoteSearch) return this.items
            const keyword = this.keyword.trim().toLowerCase()
            return this.items.filter(item => `${item.label} ${item.subtitle || ''}`.toLowerCase().includes(keyword))
        }
    },
    methods: {
        toggle(id) {
            if (this.busy) return
            const key = String(id)
            if (this.multiple && !this.selected.includes(key) && this.selected.length >= 100) {
                uni.showToast({ title: '一次最多选择100位成员', icon: 'none' })
                return
            }
            this.selected = this.selected.includes(key) ? this.selected.filter(value => value !== key) : this.multiple ? [...this.selected, key] : [key]
        }
    }
}
</script>

<style scoped>
.chat-select-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 10001; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 32rpx; }
.chat-select-panel { width: 100%; max-width: 600rpx; padding: 32rpx; border-radius: 24rpx; background: #fff; color: #25342e; box-sizing: border-box; }
.chat-select-title { display: block; font-size: 32rpx; font-weight: 600; margin-bottom: 24rpx; }
.chat-select-search { height: 72rpx; padding: 0 20rpx; border-radius: 12rpx; background: #f3f5f4; font-size: 28rpx; }
.chat-select-list { height: 48vh; margin: 16rpx 0; }
.chat-select-row { display: flex; align-items: center; padding: 22rpx 0; border-bottom: 1rpx solid #edf0ee; }
.chat-select-check { flex-shrink: 0; width: 56rpx; font-size: 32rpx; color: #07a96a; }
.chat-select-copy { display: flex; min-width: 0; flex-direction: column; font-size: 28rpx; overflow-wrap: anywhere; }
.chat-select-subtitle { margin-top: 6rpx; font-size: 23rpx; color: #819088; }
.chat-select-empty { display: block; padding: 48rpx 0; text-align: center; color: #819088; }
.chat-select-actions { display: flex; gap: 20rpx; }
.chat-select-actions button { flex: 1; margin: 0; font-size: 28rpx; }
.chat-select-confirm { color: #fff; background: #16845b; }
</style>
