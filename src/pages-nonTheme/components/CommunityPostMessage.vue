<template>
  <view v-if="card" class="community-post-message" @click.stop="$emit('open')">
    <ManifestIcon id="community_home" size="54rpx" />
    <view class="community-post-message-copy">
      <text class="community-post-message-title">{{ card.title }}</text>
      <text class="community-post-message-author">{{ card.author.name }}</text>
      <text class="community-post-message-note">社区帖子{{ card.tag ? ` · ${card.tag}` : '' }}</text>
    </view>
  </view>
  <text v-else class="community-post-message-unknown">[暂不支持的消息]</text>
</template>
<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
export default { components: { ManifestIcon }, props: { card: Object }, emits: ['open'] }
</script>
<style scoped>
.community-post-message { display: flex; align-items: flex-start; gap: 20rpx; width: 450rpx; max-width: 100%; box-sizing: border-box; padding: 24rpx; background: var(--bg-secondary); color: var(--text-primary); }
.community-post-message-copy { flex: 1; min-width: 0; }
.community-post-message-title, .community-post-message-author, .community-post-message-note { display: block; }
.community-post-message-title { font-size: 29rpx; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.community-post-message-author { margin-top: 14rpx; font-size: 25rpx; overflow-wrap: anywhere; }
.community-post-message-note { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid var(--border-color, #e6ebe8); font-size: 23rpx; color: var(--text-secondary); }
.community-post-message-unknown { padding: 20rpx; font-size: 26rpx; }
</style>
