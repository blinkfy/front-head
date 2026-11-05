<template>
  <rich-text class="community-post-body" :nodes="html" />
</template>

<script setup>
import { computed } from 'vue'
import { renderCommunityPost } from '../utils/community-markdown.mjs'

const props = defineProps({ content: { type: String, default: '' } })
const html = computed(() => renderCommunityPost(props.content))
</script>

<style scoped>
.community-post-body { display: block; font-size: 28rpx; line-height: 1.8; overflow-wrap: anywhere; overflow-x: auto; }
</style>
