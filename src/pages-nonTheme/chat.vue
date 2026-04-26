<template>
    <view class="chat-container" :class="{ 'dark-theme': isDarkTheme }" @drop="onDrop" @dragover.prevent="onDragOver" @dragleave="onDragLeave"
        :style="{ 'background': isDragOver ? 'rgba(7, 193, 96, 0.1)' : 'transparent', 'transition': 'background 0.3s ease' }">
        <!-- 拖拽提示 -->
        <view v-if="isDragOver" class="drag-overlay">
            <view class="drag-hint">
                <text class="drag-icon">📁</text>
                <text class="drag-text">释放即可发送文件</text>
            </view>
        </view>
        <!-- 顶部导航栏 -->
        <view class="chat-header">
            <view class="header-left" @click="goBack">
                <text class="back-icon">‹</text>
            </view>
            <view class="header-center">
                <text class="chat-title">{{ chatTitle }}</text>
            </view>
            <view class="header-right" @click="showMoreOptions">
                <text class="more-icon">⋯</text>
            </view>
        </view>

        <!-- 消息列表区域 -->
        <scroll-view class="message-list" scroll-y :scroll-top="scrollTop" :scroll-into-view="scrollToMessage"
            @scrolltoupper="loadMoreMessages">
            <!-- 加载更多提示 -->
            <view class="load-more" v-if="hasMoreMessages">
                <text class="load-more-text" @click="loadMoreMessages">{{ isLoadingMore ? '加载中...' : '点击加载更多' }}</text>
            </view>

            <!-- 空消息提示 -->
            <view v-if="messages.length === 0" class="empty-tip">
                <text class="empty-text">暂无消息，开始聊天吧</text>
            </view>

            <!-- 消息项 -->
            <view v-for="(msg, index) in visibleMessages" :key="msg.id" :id="'msg-' + msg.id" class="message-item"
                :class="{ 'message-self': msg.isSelf, 'message-other': !msg.isSelf, 'message-system': msg.type === 'system' }">
                <!-- 时间分隔 -->
                <view v-if="shouldShowTime(index)" class="time-divider">
                    <text class="time-text">{{ formatTime(msg.timestamp) }}</text>
                </view>

                <!-- 系统消息(撤回提示等) -->
                <view v-if="msg.type === 'system'" class="system-message">
                    <text class="system-text">{{ msg.content }}</text>
                </view>

                <!-- 消息内容 -->
                <view v-else :id="`message-${msg.id}`" class="message-content" :class="{ 'message-highlighted': highlightMessageId === msg.id }">
                    <!-- 对方头像 -->
                    <image v-if="!msg.isSelf" class="avatar" :src="otherAvatarUrl"
                        mode="aspectFill" />

                    <!-- 消息气泡 -->
                    <view class="bubble-wrapper">
                        <!-- 管理员模式下,显示撤回标识 -->
                        <view v-if="mode === 'admin' && msg.isWithdraw" class="withdraw-badge">
                            <text class="withdraw-text">已撤回</text>
                        </view>
                        
                        <view class="message-bubble" :class="[getBubbleClass(msg), { 'withdraw-message': mode === 'admin' && msg.isWithdraw }]" @longpress="onMessageLongPressV2(msg)">
                            <!-- 引用消息 -->
                            <view v-if="msg.refId" class="ref-message-container" @click.stop="jumpToRefMessage(msg.refId)">
                                <view class="ref-message-item" :class="[getRefMessageType(msg.refId)]">
                                    <text class="ref-label">{{ getRefMessageSenderName(msg.refId) }}:</text>
                                    <text class="ref-content">{{ getRefMessagePreview(msg.refId) }}</text>
                                </view>
                            </view>

                            <!-- 文本消息 -->
                            <text v-if="msg.type === 'text'" class="text-content">{{ msg.content }}</text>

                            <!-- 图片消息 -->
                            <view v-else-if="msg.type === 'image'" class="image-content" @click="previewImage(msg)">
                                <!-- 列表中优先使用 msg.thumbnail 或通过后端缩略图接口获取的小图以节省流量 -->
                                <image :src="msg.thumbnail || getThumbnail(msg.content)" mode="widthFix" class="msg-image" 
                                    :class="{ 'image-error': mediaLoadErrors[msg.id]?.type === 'image' }"
                                    @error="onImageError(msg)" @load="onImageLoad(msg)" />
                                <!-- 加载失败遮罩 -->
                                <view v-if="mediaLoadErrors[msg.id]?.type === 'image'" class="media-error-mask" @click.stop="retryLoadMedia(msg, 'image')">
                                    <view class="error-content">
                                        <text class="error-text">图片加载失败</text>
                                        <text class="retry-btn">点击重试</text>
                                    </view>
                                </view>
                            </view>

                            <!-- 语音消息 -->
                            <view v-else-if="msg.type === 'voice'" class="voice-content"
                                :class="{ 'playing': playingVoiceId === msg.id, 'voice-error': mediaLoadErrors[msg.id]?.type === 'voice' }" 
                                @click="playVoice(msg)">
                                <view  class="voice-icon">
                                    <view class="voice-wave" v-for="i in 3" :key="i"></view>
                                </view>

                                <text class="voice-duration">{{ mediaLoadErrors[msg.id]?.type === 'voice' ? '加载失败' : msg.duration + '"' }}</text>
                                <view v-if="transcribingVoiceIds[msg.id] || msg.voiceText" class="voice-transcript">
                                    <text class="voice-transcript-label">{{ transcribingVoiceIds[msg.id] ? '转写中...' : '转文字' }}</text>
                                    <text v-if="msg.voiceText" class="voice-transcript-text">{{ msg.voiceText }}</text>
                                </view>
                            </view>

                            <!-- 视频消息 -->
                            <view v-else-if="msg.type === 'video'" class="video-content"
                                @click="playVideo(msg.content, msg)">
                                <image :src="msg.thumbnail || msg.content" mode="aspectFill" class="video-thumbnail"
                                    :class="{ 'media-error': mediaLoadErrors[msg.id]?.type === 'video' }" />
                                <!-- 播放按钮或错误提示 -->
                                <view v-if="!mediaLoadErrors[msg.id]?.type" class="play-btn">
                                    <text class="play-icon">▶</text>
                                </view>
                                <view v-else class="media-error-overlay" @click.stop="retryLoadMedia(msg, 'video')">
                                    <text class="error-text">视频加载失败</text>
                                    <text class="retry-btn-small">重试</text>
                                </view>
                                <text class="video-duration" v-if="msg.duration">{{ formatDuration(msg.duration) }}</text>
                                <!-- 上传进度 -->
                                <view v-if="msg.status === 'sending' && uploadProgress[msg.id] !== undefined" class="upload-progress">
                                    <view class="progress-bar">
                                        <view class="progress-fill" :style="{ width: uploadProgress[msg.id] + '%' }"></view>
                                    </view>
                                    <text class="progress-text">上传 {{ uploadProgress[msg.id] }}%</text>
                                </view>
                                <!-- 下载进度 -->
                                <view v-if="downloadProgress[msg.id] !== undefined" class="upload-progress">
                                    <view class="progress-bar">
                                        <view class="progress-fill" :style="{ width: downloadProgress[msg.id] + '%' }"></view>
                                    </view>
                                    <text class="progress-text">下载 {{ downloadProgress[msg.id] }}%</text>
                                </view>
                            </view>

                            <!-- 文件消息 -->
                            <view v-else-if="msg.type === 'file'" class="file-content" 
                                :class="{ 'file-error': mediaLoadErrors[msg.id]?.type === 'file' }"
                                @click="openFile(msg)">
                                <view class="file-icon">
                                    <text>{{ mediaLoadErrors[msg.id]?.type === 'file' ? '❌' : getFileIcon(msg.fileName) }}</text>
                                </view>
                                <view class="file-info">
                                    <text class="file-name">{{ msg.fileName }}</text>
                                    <text class="file-size" v-if="!mediaLoadErrors[msg.id]?.type">{{ formatFileSize(msg.fileSize) }}</text>
                                    <text class="file-error-text" v-else>下载失败，点击重试</text>
                                    <!-- 上传进度 -->
                                    <view v-if="msg.status === 'sending' && uploadProgress[msg.id] !== undefined" class="upload-progress-inline">
                                        <view class="progress-bar-small">
                                            <view class="progress-fill" :style="{ width: uploadProgress[msg.id] + '%' }"></view>
                                        </view>
                                        <text class="progress-text-small">上传 {{ uploadProgress[msg.id] }}%</text>
                                    </view>
                                    <!-- 下载进度 -->
                                    <view v-if="downloadProgress[msg.id] !== undefined" class="upload-progress-inline">
                                        <view class="progress-bar-small">
                                            <view class="progress-fill" :style="{ width: downloadProgress[msg.id] + '%' }"></view>
                                        </view>
                                        <text class="progress-text-small">下载 {{ downloadProgress[msg.id] }}%</text>
                                    </view>
                                </view>
                            </view>

                            <!-- 位置消息 -->
                            <view v-else-if="msg.type === 'location'" class="location-content" @click="openLocation(msg)">
                                <view class="location-icon">📍</view>
                                <view class="location-info">
                                    <text class="location-name">{{ msg.locationName || '位置分享' }}</text>
                                    <text class="location-address">{{ msg.locationAddress || '' }}</text>
                                </view>
                            </view>
                        </view>

                        <!-- 发送状态 -->
                        <view v-if="msg.isSelf" class="send-status">
                            <text v-if="msg.status === 'sending'" class="status-sending">发送中</text>
                            <text v-else-if="msg.status === 'failed'" class="status-failed"
                                @click="resendMessage(msg)">重发</text>
                        </view>
                    </view>

                    <!-- 自己的头像 -->
                    <image v-if="msg.isSelf" class="avatar" :src="userAvatarUrl"
                        mode="aspectFill" @error="onUserAvatarError" />
                </view>
            </view>

            <!-- 底部占位 -->
            <view class="bottom-placeholder"></view>
        </scroll-view>

        <!-- 底部输入区域 -->
        <view class="input-area" :class="{ 'input-area-expanded': showMorePanel }">
            <!-- 引用消息提示 -->
            <view v-if="showRefSuggestion && refMessageId" class="ref-tip-container">
                <view class="ref-tip">
                    <view class="ref-tip-content">
                        <text class="ref-tip-label">引用:</text>
                        <text class="ref-tip-text">{{ getRefMessagePreview(refMessageId) }}</text>
                    </view>
                    <text class="ref-tip-close" @click="clearRefMessage">✕</text>
                </view>
            </view>
            
            <!-- 主输入栏 -->
            <view class="input-bar">
                <!-- 语音/键盘切换 -->
                <view class="input-btn" @click="toggleVoiceMode">
                    <text class="btn-icon">{{ isVoiceMode ? '⌨️' : '🎤' }}</text>
                </view>

                <!-- 文本输入框 -->
                <view v-if="!isVoiceMode" class="input-wrapper">
                    <textarea class="text-input" v-model="inputText" :placeholder="inputPlaceholder" :maxlength="2000"
                        :auto-height="true" :show-confirm-bar="false" @focus="onInputFocus" @blur="onInputBlur"
                        @confirm="sendTextMessage" @paste="onPaste" />
                </view>

                <!-- 语音录制按钮 -->
                <view v-else class="voice-btn" :class="{ 'recording': isRecording, 'cancel': isCancelVoice }"
                    @touchstart="startRecord" @touchmove="onRecordMove" @touchend="stopRecord"
                    @touchcancel="cancelRecord">
                    <text class="voice-btn-text">{{ voiceBtnText }}</text>
                </view>

                <!-- 表情按钮 -->
                <view class="input-btn" @click="toggleEmoji">
                    <text class="btn-icon">😊</text>
                </view>

                <!-- 更多/发送按钮 -->
                <view v-if="inputText.trim()" class="send-btn" @click="sendTextMessage">
                    <text class="send-text">发送</text>
                </view>
                <view v-else class="input-btn" @click="toggleMorePanel">
                    <text class="btn-icon">➕</text>
                </view>
            </view>

            <!-- 表情面板 -->
            <view v-if="showEmojiPanel" class="emoji-panel">
                <scroll-view scroll-y class="emoji-scroll">
                    <view class="emoji-grid">
                        <view v-for="(emoji, index) in emojiList" :key="index" class="emoji-item"
                            @click="insertEmoji(emoji)">
                            <text>{{ emoji }}</text>
                        </view>
                    </view>
                </scroll-view>
                <!-- 退格按钮 - 悬浮在右侧 -->
                <view class="emoji-delete-btn" @click="deleteLastChar">
                    <text class="delete-icon">⌫</text>
                </view>
            </view>

            <!-- 更多功能面板 -->
            <view v-if="showMorePanel" class="more-panel">
                <view class="more-grid">
                    <view class="more-item" @click="chooseImage">
                        <view class="more-icon-wrapper" style="background: linear-gradient(135deg, #43cea2, #185a9d);">
                            <text class="more-icon">🖼️</text>
                        </view>
                        <text class="more-text">图片</text>
                    </view>
                    <view class="more-item" @click="shootPhoto">
                        <view class="more-icon-wrapper" style="background: linear-gradient(135deg, #667eea, #764ba2);">
                            <text class="more-icon">📷</text>
                        </view>
                        <text class="more-text">拍照</text>
                    </view>
                    <view class="more-item" @click="chooseVideo">
                        <view class="more-icon-wrapper" style="background: linear-gradient(135deg, #f093fb, #f5576c);">
                            <text class="more-icon">🎬</text>
                        </view>
                        <text class="more-text">视频</text>
                    </view>
                    <view class="more-item" @click="recordVideo">
                        <view class="more-icon-wrapper" style="background: linear-gradient(135deg, #4facfe, #00f2fe);">
                            <text class="more-icon">📹</text>
                        </view>
                        <text class="more-text">录像</text>
                    </view>
                    <view class="more-item" @click="chooseFile">
                        <view class="more-icon-wrapper" style="background: linear-gradient(135deg, #fa709a, #fee140);">
                            <text class="more-icon">📁</text>
                        </view>
                        <text class="more-text">文件</text>
                    </view>
                    <view class="more-item" @click="sendLocation">
                        <view class="more-icon-wrapper" style="background: linear-gradient(135deg, #a8edea, #fed6e3);">
                            <text class="more-icon">📍</text>
                        </view>
                        <text class="more-text">位置</text>
                    </view>
                </view>
            </view>
        </view>

        <!-- 语音录制浮层 -->
        <view v-if="isRecording" class="voice-recording-overlay">
            <view class="recording-panel" :class="{ 'cancel-mode': isCancelVoice }">
                <view class="recording-animation">
                    <view class="wave-circle" v-for="i in 3" :key="i"></view>
                    <view class="mic-icon">🎤</view>
                </view>
                <text class="recording-tip">{{ isCancelVoice ? '松开取消发送' : '松开发送，上滑取消' }}</text>
                <text class="recording-duration">{{ recordingDuration }}"</text>
            </view>
        </view>

        <!-- 视频播放弹窗 -->
        <view v-if="showVideoPlayer" class="video-player-modal" @click="closeVideoPlayer">
            <video :src="currentVideoUrl" class="video-player" autoplay controls @click.stop />
        </view>

        <!-- 设置面板 -->
        <view v-if="showSettingsModal" class="settings-modal" @click="closeSettingsModal">
            <view class="settings-content" @click.stop>
                <!-- 头部 -->
                <view class="settings-header">
                    <text class="settings-title">聊天设置</text>
                    <text class="close-btn" @click="closeSettingsModal">×</text>
                </view>

                <!-- 用户信息 -->
                <view class="user-info-section">
                    <image class="user-avatar-large" :src="otherAvatarUrl" mode="aspectFill" />
                    <view class="user-details">
                        <text class="user-name-large">{{ chatTitle }}</text>
                        <text class="user-id-text">ID: {{ otherUserId }}</text>
                    </view>
                </view>

                <!-- 设置项列表 -->
                <view class="settings-list">
                    <!-- 备注名 -->
                    <view class="setting-item" @click="startEditNote">
                        <view class="setting-left">
                            <text class="setting-icon">✏️</text>
                            <text class="setting-label">备注名</text>
                        </view>
                        <view class="setting-right">
                            <text class="setting-value">{{ contactSettings.note || '未设置' }}</text>
                            <text class="arrow-icon">›</text>
                        </view>
                    </view>

                    <!-- 关系 -->
                    <view class="setting-item" @click="selectRelationship">
                        <view class="setting-left">
                            <text class="setting-icon">👥</text>
                            <text class="setting-label">关系</text>
                        </view>
                        <view class="setting-right">
                            <text class="setting-value">{{ getRelationshipLabel(contactSettings.relationship) }}</text>
                            <text class="arrow-icon">›</text>
                        </view>
                    </view>

                    <!-- 免打扰 -->
                    <view class="setting-item">
                        <view class="setting-left">
                            <text class="setting-icon">🔕</text>
                            <text class="setting-label">消息免打扰</text>
                        </view>
                        <switch :checked="contactSettings.mute" @change="toggleMute" color="#07c160" />
                    </view>

                    <!-- 置顶 -->
                    <view class="setting-item">
                        <view class="setting-left">
                            <text class="setting-icon">📌</text>
                            <text class="setting-label">置顶聊天</text>
                        </view>
                        <switch :checked="contactSettings.top" @change="toggleTop" color="#07c160" />
                    </view>

                    <!-- 清空聊天记录 -->
                    <view class="setting-item" @click="confirmClearChat">
                        <view class="setting-left">
                            <text class="setting-icon">🗑️</text>
                            <text class="setting-label">清空聊天记录</text>
                        </view>
                        <text class="arrow-icon">›</text>
                    </view>

                    <!-- 删除联系人 -->
                    <view class="setting-item danger" @click="confirmDeleteContact">
                        <view class="setting-left">
                            <text class="setting-icon">❌</text>
                            <text class="setting-label danger-text">删除联系人</text>
                        </view>
                        <text class="arrow-icon">›</text>
                    </view>
                </view>
            </view>
        </view>

        <!-- 编辑备注弹窗 -->
        <view v-if="editingNote" class="edit-note-modal" @click="cancelEditNote">
            <view class="edit-note-content" @click.stop>
                <text class="edit-note-title">设置备注名</text>
                <input class="edit-note-input" v-model="tempNote" placeholder="请输入备注名" maxlength="20" />
                <view class="edit-note-buttons">
                    <button class="cancel-btn" @click="cancelEditNote">取消</button>
                    <button class="confirm-btn" @click="saveNote">确定</button>
                </view>
            </view>
        </view>

        <!-- 图片预览面板 -->
        <view v-if="showImagePreview && currentPreviewMessage" class="image-preview-modal" @touchmove.stop.prevent @click="closeImagePreview">
            <!-- 背景层 -->
            <view class="preview-bg-layer"></view>
            
            <!-- 预览主容器 -->
            <view class="preview-container">
                <!-- 顶部 -->
                <view class="preview-header">
                    <view class="preview-close-box">
                        <text class="close-icon">✕</text>
                    </view>
                    <text class="count-tag" v-if="previewImageList.length > 1">{{ previewCurrentIndex + 1 }} / {{ previewImageList.length }}</text>
                    <view class="header-placeholder"></view>
                </view>
                
                <!-- 图片主体 -->
                <view class="preview-content-box">
                    <image :src="loadedOriginalImages[currentPreviewMessage.id] || currentPreviewMessage.thumbnail || getThumbnail(currentPreviewMessage.content)" 
                        mode="aspectFit" class="preview-img-main"/>
                    
                    <!-- 加载中遮罩 -->
                    <view v-if="previewImageLoading" class="loading-overlay">
                        <view class="loading-spinner"></view>
                        <text class="loading-text">正在加载高清原图...</text>
                    </view>
                </view>
                
                <!-- 左右导航 -->
                <template v-if="previewImageList.length > 1">
                    <view class="preview-nav preview-prev" @click.stop="prevPreviewImage">
                        <text class="nav-symbol">‹</text>
                    </view>
                    <view class="preview-nav preview-next" @click.stop="nextPreviewImage">
                        <text class="nav-symbol">›</text>
                    </view>
                </template>
                
                <!-- 底部交互层 -->
                <view class="preview-bottom-bar">
                    <view class="bar-inner">
                        <view v-if="isLargeImage(currentPreviewMessage) && !loadedOriginalImages[currentPreviewMessage.id]" 
                            class="action-btn-primary" @click.stop="loadOriginalImage(currentPreviewMessage)">
                            <text class="btn-inner-text">查看原图 ({{ formatFileSize(currentPreviewMessage.fileSize) }})</text>
                        </view>
                        <text v-else-if="isLargeImage(currentPreviewMessage) && loadedOriginalImages[currentPreviewMessage.id]" class="status-badge">已加载原图</text>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
import * as chatApi from '@/api/chat.js'
import { baseUrl } from '@/api/settings.js'
import { getAvatarUrl } from '@/utils/avatar-handler.js'
import { triggerMessageNotification } from '@/utils/message-event-bus.js'

// 本地存储 key 前缀
const CHAT_STORAGE_PREFIX = 'chat_messages_'

// 关系标签映射
const chatRelationshipLabels = {
    'friend': '好友',
    'customer_s': '客服',
    'customer_c': '客户',
    'stranger': '陌生人'
}

export default {
    data() {
        return {
            chatId: '', // 聊天会话ID
            chatTitle: '聊天',
            userAvatar: '',
            otherAvatar: '', // 对方头像
            otherUserId: '', // 对方用户ID
            mode: 'customer', // 聊天模式: 'customer' 普通模式, 'admin' 管理员模式
            isDarkTheme: false, // 主题状态
            statusBarHeight: 20, // 状态栏高度
            safeAreaBottom: 0, // 底部安全区域高度

            // 消息相关
            messages: [],
            scrollTop: 0,
            scrollToMessage: '',
            hasMoreMessages: true,
            isLoadingMore: false,
            currentPage: 1,
            pageSize: 20, // 每页加载数量

            // 输入相关
            inputText: '',
            inputPlaceholder: '输入消息...',
            isVoiceMode: false,
            showEmojiPanel: false,
            showMorePanel: false,

            // 语音录制
            isRecording: false,
            isCancelVoice: false,
            recordingDuration: 0,
            recordingTimer: null,
            recorderManager: null,
            startY: 0,

            // 语音播放
            playingVoiceId: null,
            innerAudioContext: null,
            currentPlayingMsg: null, // 当前播放的语音消息对象

            // 视频播放
            showVideoPlayer: false,
            currentVideoUrl: '',

            // 表情列表
            emojiList: [
                '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
                '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
                '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
                '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐',
                '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
                '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
                '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵',
                '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕',
                '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺',
                '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
                '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤',
                '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩',
                '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙',
                '👋', '🖐️', '✋', '🖖', '👏', '🙌', '👐', '🤲',
                '🤝', '🙏', '💪', '🦾', '❤️', '🧡', '💛', '💚',
                '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕'
            ],
            
            // 消息轮询
            messagePollingTimer: null,
            pollingInterval: 5000, // 5秒轮询一次
            
            // 位置发送防重复 - 使用唯一标识
            lastLocationDataHash: '',
            
            // 上传进度 - 存储每个消息的上传进度
            uploadProgress: {}, // { messageId: progress }
            
            // 下载进度 - 存储每个消息的下载进度
            downloadProgress: {}, // { messageId: progress }
            
            // 本地文件缓存 - 存储已下载文件的本地路径
            localFileCache: {}, // { messageId: localPath }
            
            // 媒体加载错误状态 - 记录加载失败的消息
            mediaLoadErrors: {}, // { messageId: { type: 'image'|'video'|'voice'|'file', error: true, retryCount: 0 } }
            transcribingVoiceIds: {},
            
            // 拖拽和粘贴相关
            isDragOver: false, // 是否正在拖拽
            // 缩略图缓存: { originalPath: thumbnailUrl }
            thumbnailCache: {},
            
            // 已加载原图的消息: { messageId: originalImageUrl } - 用于缓存大图的原始URL
            loadedOriginalImages: {},
            
            // 图片预览面板
            showImagePreview: false, // 是否显示图片预览
            previewImageList: [], // 预览图片列表（按时间排序的所有图片消息）
            previewCurrentIndex: 0, // 当前预览的图片索引
            previewImageLoading: false, // 原图加载中
            
            // 消息引用相关
            refMessageId: null, // 当前要引用的消息ID
            showRefSuggestion: false, // 是否显示引用建议
            highlightMessageId: null, // 高亮显示的消息ID（用于跳转后的视觉反馈）
            
            // 设置面板
            showSettingsModal: false,
            editingNote: false,
            tempNote: '',
            contactSettings: {
                note: '', // 备注名
                relationship: '', // 关系
                mute: false, // 免打扰
                top: false // 置顶
            }
        }
    },

    computed: {
        // 处理撤回消息的显示
        visibleMessages() {
            return this.messages.map(msg => {
                // 管理员模式下,撤回的消息仍显示原始内容
                if (msg.isWithdraw && this.mode !== 'admin') {
                    // 撤回的消息显示为系统提示
                    return {
                        ...msg,
                        type: 'system',
                        content: msg.isSelf ? '你撤回了一条消息' : '对方撤回了一条消息',
                        isWithdrawNotice: true  // 标记为撤回提示
                    }
                }
                return msg
            })
        },

        // 当前预览的消息
        currentPreviewMessage() {
            if (this.previewImageList.length === 0) return null
            return this.previewImageList[this.previewCurrentIndex] || null
        },
        
        voiceBtnText() {
            if (this.isRecording) {
                return this.isCancelVoice ? '松开取消' : '松开发送'
            }
            return '按住说话'
        },

        // 存储 key
        storageKey() {
            const userInfo = uni.getStorageSync('userInfo')
            const userId = userInfo?.id || userInfo?.userId || 'unknown'
            return CHAT_STORAGE_PREFIX + userId + '_' + this.chatId
        },

        // 当前用户头像 (计算属性，避免重复调用)
        userAvatarUrl() {
            const userInfo = uni.getStorageSync('userInfo')
            const username = userInfo?.username || userInfo?.nickname || '用户'
            
            // 检查是否有有效的真实头像
            if (this.userAvatar && 
                typeof this.userAvatar === 'string' &&
                this.userAvatar.trim() !== '' && 
                this.userAvatar !== 'null' &&
                this.userAvatar !== 'undefined' &&
                !this.userAvatar.includes('default-avatar')) {
                const avatarUrl = getAvatarUrl(this.userAvatar, baseUrl)
                return avatarUrl
            }
            
            // 生成基于用户名的头像
            return this.generateAvatarFromName(username, false)
        },

        // 对方头像 (计算属性，避免重复调用)
        otherAvatarUrl() {
            // 检查是否有有效的真实头像
            if (this.otherAvatar && 
                typeof this.otherAvatar === 'string' &&
                this.otherAvatar.trim() !== '' && 
                this.otherAvatar !== 'null' &&
                this.otherAvatar !== 'undefined' &&
                !this.otherAvatar.includes('default-avatar')) {
                const avatarUrl = getAvatarUrl(this.otherAvatar, baseUrl)
                return avatarUrl
            }
            // 生成基于聊天标题的头像
            return this.generateAvatarFromName(this.chatTitle, true)
        }
    },

    onLoad(options) {
        console.log('=== chat页面 onLoad 触发 ===', 'chatId:', options.chatId)
        
        // 检测主题
        this.checkTheme()
        
        // 初始化系统信息
        this.initSystemInfo()
        
        // 初始化(需要先初始化,loadUserInfo会设置mode)
        this.initRecorder()
        this.initAudioPlayer()
        this.loadUserInfo() // 会读取userInfo.isAdmin并设置mode

        if (options.chatId) {
            this.chatId = options.chatId
        }

        if (options.title) {
            this.chatTitle = decodeURIComponent(options.title)
        }

        if (options.avatar) {
            this.otherAvatar = decodeURIComponent(options.avatar)
        }

        if (options.userId) {
            this.otherUserId = options.userId
        }

        // 已有参数，直接加载消息
        if (!this.chatId) {
            this.chatId = 'chat_' + this.otherUserId + '_' + Date.now()
        }
        this.loadMessagesFromStorage()
        
        // 加载本地文件缓存
        this.loadLocalFileCache()
        
        // 加载联系人设置
        if (this.otherUserId) {
            this.loadContactSettings()
        }
        
        // 启动消息轮询
        this.startMessagePolling()
        
        // 初始化拖拽事件（H5环境）
        this.$nextTick(() => {
            this.initDragDropEvent()
        })
        
        // 注意:不再使用 uni.$on 监听位置选择事件,改为在 onShow 中从 storage 读取
    },

    onShow() {
        // 每次显示页面时重新加载用户信息（确保头像更新）
        this.loadUserInfo()
        
        // 每次显示页面时从服务器刷新消息
        this.loadMessagesFromServer()
        
        // 重新启动轮询
        this.startMessagePolling()
        
        // 从存储中读取选择的位置（H5、APP、小程序都支持）
        const locationData = uni.getStorageSync('selectedLocation')
        if (locationData) {
            this.handleLocationSelected(locationData)
            // 立即清除存储的数据,防止重复处理
            uni.removeStorageSync('selectedLocation')
        }
    },
    
    onHide() {
        // 页面隐藏时停止轮询，节省资源
        this.stopMessagePolling()
    },

    onUnload() {
        // 停止消息轮询
        this.stopMessagePolling()
        
        // 清理资源
        if (this.recorderManager) {
            this.recorderManager.stop()
        }
        if (this.innerAudioContext) {
            this.innerAudioContext.stop()
            this.innerAudioContext.destroy()
        }
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer)
        }
        
        // 注意:不再需要移除 locationSelected 事件监听
    },
    
    beforeDestroy() {
        // 确保组件销毁时停止轮询
        this.stopMessagePolling()
    },

    methods: {
        // ==================== 主题相关 ====================
        // 检测主题
        checkTheme() {
            const theme = uni.getStorageSync('app_theme')
            this.isDarkTheme = theme === 'dark'
        },

        // 初始化系统信息
        initSystemInfo() {
            const systemInfo = uni.getSystemInfoSync()
            this.statusBarHeight = systemInfo.statusBarHeight || 20
            this.safeAreaBottom = systemInfo.safeAreaInsets?.bottom || 0
            
            // 设置 CSS 变量，供样式使用（仅在 H5 环境有效）
            // #ifdef H5
            if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.style.setProperty('--status-bar-height', this.statusBarHeight + 'px')
            }
            // #endif
        },

        // ==================== 初始化 ====================
        initRecorder() {
            // #ifndef H5
            // H5端不支持录音功能，跳过初始化
            this.recorderManager = uni.getRecorderManager()

            this.recorderManager.onStart(() => {
                console.log('录音开始')
                this.isRecording = true
                this.recordingDuration = 0
                this.recordingTimer = setInterval(() => {
                    this.recordingDuration++
                    if (this.recordingDuration >= 60) {
                        this.stopRecord()
                    }
                }, 1000)
            })

            this.recorderManager.onStop((res) => {
                console.log('录音结束', res)
                this.isRecording = false
                clearInterval(this.recordingTimer)

                if (!this.isCancelVoice && this.recordingDuration >= 1) {
                    this.sendVoiceMessage(res.tempFilePath, this.recordingDuration)
                } else if (this.recordingDuration < 1) {
                    uni.showToast({ title: '录音时间太短', icon: 'none' })
                }

                this.isCancelVoice = false
                this.recordingDuration = 0
            })

            this.recorderManager.onError((err) => {
                console.error('录音错误', err)
                this.isRecording = false
                clearInterval(this.recordingTimer)
                uni.showToast({ title: '录音失败', icon: 'none' })
            })
            // #endif
            
            // #ifdef H5
            console.log('H5端不支持录音功能')
            // #endif
        },

        initAudioPlayer() {
            this.innerAudioContext = uni.createInnerAudioContext()

            this.innerAudioContext.onEnded(() => {
                this.playingVoiceId = null
            })

            this.innerAudioContext.onError((err) => {
                console.error('播放错误', err)
                this.playingVoiceId = null
                
                // 设置错误标记(如果有当前播放的语音消息)
                if (this.currentPlayingMsg) {
                    this.$set(this.mediaLoadErrors, this.currentPlayingMsg.id, { 
                        type: 'voice', 
                        error: true, 
                        retryCount: 0 
                    })
                }
                
                // 解析错误信息
                let errorMsg = '语音播放失败'
                if (err && typeof err === 'object') {
                    if (err.errMsg) {
                        if (err.errMsg.includes('permission denied')) {
                            errorMsg = '没有读取文件权限'
                        } else if (err.errMsg.includes('404') || err.errMsg.includes('not found')) {
                            errorMsg = '语音文件不存在'
                        } else if (err.errMsg.includes('network')) {
                            errorMsg = '网络错误'
                        } else if (err.errMsg.includes('format')) {
                            errorMsg = '音频格式不支持'
                        }
                    }
                }
                
                uni.showToast({ title: errorMsg, icon: 'none' })
            })
        },

        loadUserInfo() { 
            try {
                const userInfo = uni.getStorageSync('userInfo')
                if (userInfo) {
                    if (userInfo.avatar) {
                        this.userAvatar = userInfo.avatar
                    }
                    // 读取管理员标识
                    if (userInfo.isAdmin) {
                        this.mode = 'admin'
                    }
                }
            } catch (e) {
                console.error('获取用户信息失败', e)
            }
        },

        // 初始化拖拽事件（H5环境）
        initDragDropEvent() {
            // #ifdef H5
            const container = document.querySelector('.chat-container')
            if (!container) {
                console.warn('未找到 chat-container 元素')
                return
            }

            console.log('初始化拖拽事件监听器')

            // 防止浏览器默认行为
            container.addEventListener('dragover', (e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('dragover 事件触发')
                this.isDragOver = true
            }, false)

            container.addEventListener('dragleave', (e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('dragleave 事件触发')
                // 只在完全离开容器时隐藏
                if (e.target === container) {
                    this.isDragOver = false
                }
            }, false)

            container.addEventListener('drop', (e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('drop 事件触发')
                this.isDragOver = false
                this.onDrop(e)
            }, false)

            // 由于 uni-app @paste 事件无法访问 clipboardData，需要原生监听器
            // 但要避免与 template 中的 @paste 重复触发，所以只监听 document
            const pasteHandler = (e) => {
                console.log('原生粘贴事件触发')
                e.preventDefault()
                e.stopPropagation()
                this.onPasteNative(e)
            }
            document.addEventListener('paste', pasteHandler, false)
            // 保存处理函数引用以便后续移除
            this._pasteHandler = pasteHandler

            // 阻止默认行为
            document.addEventListener('dragover', (e) => {
                e.preventDefault()
            }, false)

            document.addEventListener('drop', (e) => {
                e.preventDefault()
            }, false)
            // #endif
        },

        // 生成并缓存缩略图 URL（通过后端接口 /api/chat/imageReview?path=...），优先用于列表展示以节省流量
        // 注意：msg.content 可能是完整路径或服务器存储路径，caller 需要传入后端可识别的 path
        getThumbnail(originalPath) {
            if (!originalPath) return ''

            // 本地 blob URL 或 data URL 直接返回，不走后端缩略图
            if (originalPath.startsWith('blob:') || originalPath.startsWith('data:')) {
                return originalPath
            }

            // 检查缓存
            if (this.thumbnailCache[originalPath]) {
                return this.thumbnailCache[originalPath]
            }

            // 构造后端缩略图 URL（前端直接构造，不发请求，后端会返回图片流）
            const url = this.buildReviewUrl(originalPath)
            // 缓存起来避免重复构造/请求
            this.thumbnailCache[originalPath] = url
            return url
        },

        // 构造后端缩略图接口 URL
        buildReviewUrl(path) {
            try {
                // 如果 path 是完整 URL(例如 baseUrl/files/download/...),尝试提取后端存储的相对路径
                let relPath = path

                try {
                    const urlObj = new URL(path)
                    // 如果 URL 包含 /files/download/, 提取后面的部分作为相对path
                    const downloadIndex = urlObj.pathname.indexOf('/files/download/')
                    if (downloadIndex !== -1) {
                        relPath = urlObj.pathname.substring(downloadIndex + '/files/download'.length)
                    } else {
                        // 否则使用 pathname 本身
                        relPath = urlObj.pathname
                    }
                } catch (err) {
                    // path 可能并不是完整 URL，直接保留原始 path
                    relPath = path
                }

                // 确保 relPath 以 / 开头
                if (!relPath.startsWith('/')) relPath = '/' + relPath

                const encoded = encodeURIComponent(relPath)
                
                // 获取 token 并作为查询参数传递以通过认证
                const token = uni.getStorageSync('token')
                let url = `${baseUrl}/api/chat/imageReview?path=${encoded}`
                if (token) {
                    url += `&token=${token}`
                }
                return url
            } catch (e) {
                console.error('构造缩略图 URL 失败', e)
                return path
            }
        },

        // ==================== 本地存储 ====================
        loadMessagesFromStorage() {
            try {
                const stored = uni.getStorageSync(this.storageKey)
                if (stored) {
                    this.messages = JSON.parse(stored)
                }
                // 同时从服务器加载最新消息(服务器数据会覆盖本地的临时数据)
                this.loadMessagesFromServer()
            } catch (e) {
                console.error('读取聊天记录失败', e)
                this.messages = []
                this.loadMessagesFromServer()
            }
        },

        saveMessagesToStorage() {
            try {
                // 清理消息中的大文件 blob URL,避免超出 localStorage 限制
                const messagesToSave = this.messages.map(msg => {
                    // 对于文件和视频消息,如果是 blob URL,不保存到 localStorage
                    if ((msg.type === 'file' || msg.type === 'video') && msg.content && msg.content.startsWith('blob:')) {
                        return {
                            ...msg,
                            content: null, // 清空 blob URL
                            _isLocalBlob: true // 标记这是本地 blob
                        }
                    }
                    // 视频缩略图也可能是 blob
                    if (msg.type === 'video' && msg.thumbnail && msg.thumbnail.startsWith('blob:')) {
                        return {
                            ...msg,
                            thumbnail: null
                        }
                    }
                    return msg
                })
                
                uni.setStorageSync(this.storageKey, JSON.stringify(messagesToSave))
            } catch (e) {
                console.error('保存聊天记录失败', e)
                // 如果还是失败,尝试只保存最近的消息
                try {
                    const recentMessages = this.messages.slice(-50).map(msg => {
                        if ((msg.type === 'file' || msg.type === 'video') && msg.content && msg.content.startsWith('blob:')) {
                            return {
                                ...msg,
                                content: null,
                                _isLocalBlob: true
                            }
                        }
                        if (msg.type === 'video' && msg.thumbnail && msg.thumbnail.startsWith('blob:')) {
                            return {
                                ...msg,
                                thumbnail: null
                            }
                        }
                        return msg
                    })
                    uni.setStorageSync(this.storageKey, JSON.stringify(recentMessages))
                } catch (e2) {
                    console.error('保存最近聊天记录也失败', e2)
                }
            }
        },

        // ==================== 本地文件缓存 ====================
        loadLocalFileCache() {
            try {
                const userInfo = uni.getStorageSync('userInfo')
                const userId = userInfo?.id || userInfo?.userId || 'unknown'
                const cacheKey = `file_cache_${userId}_${this.chatId}`
                const cached = uni.getStorageSync(cacheKey)
                if (cached) {
                    this.localFileCache = JSON.parse(cached)
                }
            } catch (e) {
                console.error('读取文件缓存失败', e)
                this.localFileCache = {}
            }
        },

        saveLocalFileCache() {
            try {
                const userInfo = uni.getStorageSync('userInfo')
                const userId = userInfo?.id || userInfo?.userId || 'unknown'
                const cacheKey = `file_cache_${userId}_${this.chatId}`
                uni.setStorageSync(cacheKey, JSON.stringify(this.localFileCache))
            } catch (e) {
                console.error('保存文件缓存失败', e)
            }
        },

        // ==================== 消息轮询 ====================
        startMessagePolling() {
            // 清除现有的轮询
            this.stopMessagePolling()
            
            // 立即执行一次
            this.pollMessages()
            
            // 启动定时轮询
            this.messagePollingTimer = setInterval(() => {
                this.pollMessages()
            }, this.pollingInterval)
        },
        
        stopMessagePolling() {
            if (this.messagePollingTimer) {
                clearInterval(this.messagePollingTimer)
                this.messagePollingTimer = null
            }
        },
        
        async pollMessages() {
            try {
                // 静默获取最新消息（不显示加载提示）
                const res = await chatApi.getChatHistory({
                    chatId: this.chatId,
                    page: 1,
                    pageSize: this.pageSize
                })

                // 后端返回的data可能直接是数组，也可能是 { list: [], total: 0 }
                let messageList = []
                if (Array.isArray(res.data)) {
                    messageList = res.data
                } else if (res.data && Array.isArray(res.data.list)) {
                    messageList = res.data.list
                }

                if (messageList.length > 0) {
                    const serverMessages = messageList.map(m => this.formatServerMessage(m))
                    
                    // 检查是否有新消息
                    const existingIds = new Set(this.messages.map(m => m.id))
                    const newMessages = serverMessages.filter(m => !existingIds.has(m.id))
                    
                    if (newMessages.length > 0) {
                        console.log(`轮询发现 ${newMessages.length} 条新消息`)
                        this.mergeMessages(serverMessages)
                        
                        // 如果在底部，自动滚动
                        this.$nextTick(() => {
                            const scrollView = document.querySelector('.message-list')
                            if (scrollView) {
                                const isAtBottom = scrollView.scrollHeight - scrollView.scrollTop - scrollView.clientHeight < 100
                                if (isAtBottom) {
                                    this.scrollToBottom()
                                }
                            }
                        })
                    } else {
                        // 即使没有新消息，也要更新现有消息（可能状态变化）
                        this.mergeMessages(serverMessages)
                    }
                }
            } catch (e) {
                console.error('轮询消息失败:', e)
                // 轮询失败不影响用户使用，静默处理
            }
        },

        // ==================== 从服务器加载消息 ====================
        async loadMessagesFromServer() {
            try {
                const res = await chatApi.getChatHistory({
                    chatId: this.chatId,
                    page: 1,
                    pageSize: this.pageSize
                })

                // 后端返回的data可能直接是数组，也可能是 { list: [], total: 0 }
                let messageList = []
                if (Array.isArray(res.data)) {
                    messageList = res.data
                } else if (res.data && Array.isArray(res.data.list)) {
                    messageList = res.data.list
                }

                if (messageList.length > 0) {
                    // 格式化服务器消息
                    const serverMessages = messageList.map(m => this.formatServerMessage(m))
                    
                    // 清除本地消息中的临时ID消息(以"数字_字符串"格式的ID)
                    this.messages = this.messages.filter(localMsg => {
                        // 如果是临时ID格式(包含下划线),检查是否有对应的服务器消息
                        if (typeof localMsg.id === 'string' && localMsg.id.includes('_')) {
                            // 检查是否可以被服务器消息替代
                            const hasDuplicate = serverMessages.some(serverMsg => {
                                return Math.abs(serverMsg.timestamp - localMsg.timestamp) < 5000 &&
                                       serverMsg.content === localMsg.content &&
                                       serverMsg.type === localMsg.type
                            })
                            return !hasDuplicate // 有重复则过滤掉
                        }
                        return true // 保留非临时ID消息
                    })
                    
                    // 合并服务器消息和清理后的本地消息
                    this.mergeMessages(serverMessages)
                    this.hasMoreMessages = messageList.length >= this.pageSize
                }

                this.$nextTick(() => {
                    this.scrollToBottom()
                })
            } catch (e) {
                console.error('从服务器加载消息失败', e)
                this.$nextTick(() => {
                    this.scrollToBottom()
                })
            }
        },

        // 格式化服务器返回的消息
        formatServerMessage(serverMsg) {
            const currentUserId = this.getCurrentUserId()
            const isSelf = String(serverMsg.senderId) === String(currentUserId)
            
            let content = serverMsg.content || serverMsg.url
            let parsedContent = null
            
            // 解析 JSON 字符串类型的 content
            if (typeof content === 'string' && content.startsWith('{')) {
                try {
                    const contentObj = JSON.parse(content)
                    parsedContent = contentObj
                    
                    // 位置消息
                    if (serverMsg.type === 'location') {
                        content = contentObj
                    }
                    // 图片/视频/文件/语音消息 - 提取path并拼接完整URL
                    else if ((serverMsg.type === 'image' || serverMsg.type === 'video' || serverMsg.type === 'file' || serverMsg.type === 'voice') && contentObj.path) {
                        const normalizedPath = String(contentObj.path).replace(/\\/g, '/')
                        content = `${baseUrl}/files/download/${normalizedPath}`
                    }
                } catch (e) {
                    console.error('解析消息content JSON失败:', e, content)
                }
            }
            
            // 处理非JSON格式的语音/图片/视频/文件相对路径
            // 如果content是字符串且不是以http开头,可能是相对路径,需要拼接完整URL
            if (typeof content === 'string' && 
                !content.startsWith('http://') && 
                !content.startsWith('https://') &&
                (serverMsg.type === 'voice' || serverMsg.type === 'image' || serverMsg.type === 'video' || serverMsg.type === 'file')) {
                content = `${baseUrl}/files/download/${String(content).replace(/\\/g, '/')}`
            }
            
            const message = {
                id: serverMsg.id || serverMsg.messageId,
                type: serverMsg.type || 'text',
                content: content,
                isSelf: isSelf,
                timestamp: new Date(serverMsg.sendTime || serverMsg.createTime || serverMsg.timestamp).getTime() || Date.now(),
                status: 'sent',
                duration: serverMsg.duration || parsedContent?.duration,
                voiceText: parsedContent?.toText || '',
                voicePath: parsedContent?.path || '',
                fileName: serverMsg.fileName || parsedContent?.fileName || parsedContent?.name,
                fileSize: serverMsg.fileSize || parsedContent?.fileSize || parsedContent?.size,
                thumbnail: serverMsg.thumbnail || (parsedContent?.thumbnail ? `${baseUrl}/files/download/${parsedContent.thumbnail}` : null),
                isWithdraw: serverMsg.isWithdraw || false,  // 是否已撤回
                refId: serverMsg.refId || null  // 引用消息ID
            }
            
            // 如果是位置消息,将content中的属性提升到顶层,保持与本地创建消息的结构一致
            if (serverMsg.type === 'location' && typeof content === 'object') {
                message.locationName = content.locationName
                message.locationAddress = content.locationAddress
                message.latitude = content.latitude
                message.longitude = content.longitude
            }
            
            return message
        },

        // 获取当前用户ID
        getCurrentUserId() {
            try {
                const userInfo = uni.getStorageSync('userInfo')
                const userId = userInfo?.id || userInfo?.userId || ''
                return userId
            } catch (e) {
                console.error('获取用户ID失败:', e)
                return ''
            }
        },

        // 合并消息（去重并更新）
        mergeMessages(serverMessages) {
            // 创建服务器消息的Map,便于查找
            const serverMessageMap = new Map(serverMessages.map(m => [m.id, m]))
            
            // 清除已有服务器版本的临时ID消息
            this.messages = this.messages.filter(localMsg => {
                // 如果是临时ID
                if (typeof localMsg.id === 'string' && localMsg.id.includes('_')) {
                    // 检查是否有相同内容、类型和相近时间的服务器消息
                    const duplicate = serverMessages.find(serverMsg => {
                        const timeDiff = Math.abs(serverMsg.timestamp - localMsg.timestamp)
                        const timeMatch = timeDiff < 10000 // 10秒内
                        const typeMatch = serverMsg.type === localMsg.type
                        const isSelfMatch = serverMsg.isSelf === localMsg.isSelf
                        
                        // 根据消息类型选择不同的匹配策略
                        let contentMatch = false
                        if (localMsg.type === 'location') {
                            // 位置消息:比较经纬度
                            contentMatch = serverMsg.latitude === localMsg.latitude &&
                                          serverMsg.longitude === localMsg.longitude
                        } else if (localMsg.type === 'image' || localMsg.type === 'video' || 
                                   localMsg.type === 'file' || localMsg.type === 'voice') {
                            // 媒体消息:本地content是文件路径,服务器content是URL,无法直接比较
                            // 只通过时间+类型+发送者来匹配(如果是自己发的且时间接近,大概率是同一条)
                            contentMatch = true
                        } else {
                            // 文本消息:直接比较content
                            contentMatch = serverMsg.content === localMsg.content
                        }
                        
                        const isDuplicate = timeMatch && typeMatch && contentMatch && isSelfMatch
                        
                        return isDuplicate
                    })
                    return !duplicate // 有重复则过滤掉
                }
                return true // 保留其他消息
            })
            
            // 标记是否有变更
            let hasChanges = false
            
            // 更新现有消息或保留本地消息
            let updatedMessages = this.messages.map(localMsg => {
                if (serverMessageMap.has(localMsg.id)) {
                    const serverMsg = serverMessageMap.get(localMsg.id)
                    
                    // 检测状态变化 (例如撤回状态)
                    if (localMsg.isWithdraw !== serverMsg.isWithdraw) {
                        hasChanges = true
                        console.log(`消息 ${localMsg.id} 状态更新: isWithdraw ${localMsg.isWithdraw} -> ${serverMsg.isWithdraw}`)
                    }
                    
                    // 如果是自己发送的媒体消息,保留本地的 content(blob URL)
                    if (serverMsg.isSelf && 
                        (serverMsg.type === 'image' || serverMsg.type === 'video' || serverMsg.type === 'file') &&
                        localMsg.content && localMsg.content.startsWith('blob:')) {
                        return {
                            ...serverMsg,
                            content: localMsg.content, // 保留本地 blob URL
                            thumbnail: serverMsg.type === 'video' && localMsg.thumbnail?.startsWith('blob:') 
                                ? localMsg.thumbnail 
                                : serverMsg.thumbnail
                        }
                    }
                    
                    // 其他情况使用服务器版本（更可靠）
                    return serverMsg
                }
                return localMsg
            })
            
            // 获取已存在的消息ID
            const existingIds = new Set(updatedMessages.map(m => m.id))
            
            // 添加本地没有的新消息
            const newMessages = serverMessages.filter(m => !existingIds.has(m.id))
            
            // 只要有新消息、长度变化或内容变更，就更新列表
            if (newMessages.length > 0 || updatedMessages.length !== this.messages.length || hasChanges) {
                this.messages = [...updatedMessages, ...newMessages]
                // 按时间排序
                this.messages.sort((a, b) => a.timestamp - b.timestamp)
                this.saveMessagesToStorage()
                
                // 调试:检查撤回消息是否正确合并
                const withdrawnCount = this.messages.filter(m => m.isWithdraw).length
                if (withdrawnCount > 0) {
                    console.log(`合并后messages中有 ${withdrawnCount} 条撤回消息:`, 
                        this.messages.filter(m => m.isWithdraw).map(m => ({
                            id: m.id,
                            type: m.type,
                            isWithdraw: m.isWithdraw
                        }))
                    )
                } else {
                    // 检查新消息中是否有撤回消息
                    const withdrawnInNew = newMessages.filter(m => m.isWithdraw).length
                    const withdrawnInUpdated = updatedMessages.filter(m => m.isWithdraw).length
                    console.log('合并调试:', {
                        newMessages总数: newMessages.length,
                        newMessages中撤回: withdrawnInNew,
                        updatedMessages总数: updatedMessages.length,
                        updatedMessages中撤回: withdrawnInUpdated,
                        最终messages总数: this.messages.length,
                        最终messages中撤回: withdrawnCount
                    })
                }
            }
        },

        // ==================== 消息加载 ====================
        async loadMoreMessages() {
            if (this.isLoadingMore || !this.hasMoreMessages) return

            this.isLoadingMore = true

            try {
                this.currentPage++
                const res = await chatApi.getChatHistory({
                    chatId: this.chatId,
                    page: this.currentPage,
                    pageSize: this.pageSize
                })

                // 后端返回的data可能直接是数组，也可能是 { list: [], total: 0 }
                let messageList = []
                if (Array.isArray(res.data)) {
                    messageList = res.data
                } else if (res.data && Array.isArray(res.data.list)) {
                    messageList = res.data.list
                }

                if (messageList.length > 0) {
                    const serverMessages = messageList.map(m => this.formatServerMessage(m))
                    // 插入到消息列表前面
                    const existingIds = new Set(this.messages.map(m => m.id))
                    const newMessages = serverMessages.filter(m => !existingIds.has(m.id))
                    this.messages = [...newMessages, ...this.messages]
                    this.messages.sort((a, b) => a.timestamp - b.timestamp)
                    this.saveMessagesToStorage()

                    this.hasMoreMessages = messageList.length >= this.pageSize
                } else {
                    this.hasMoreMessages = false
                }
            } catch (e) {
                console.error('加载更多消息失败', e)
                this.currentPage--
            } finally {
                this.isLoadingMore = false
            }
        },

        // ==================== 消息发送 ====================
        async sendTextMessage() {
            const text = this.inputText.trim()
            if (!text) return

            const msg = this.createMessage('text', text)
            // 如果有引用消息，添加到消息中
            if (this.refMessageId) {
                msg.refId = this.refMessageId
            }
            this.addMessage(msg)
            this.inputText = ''

            // 发送到服务器
            try {
                const res = await chatApi.sendTextMessage({
                    chatId: this.chatId,
                    targetUserId: this.otherUserId,
                    content: text,
                    refId: this.refMessageId  // 传送 refId 到后端
                })

                // 更新消息ID和状态
                const newId = res.data?.messageId
                if (newId) {
                    this.updateMessageStatus(msg.id, 'sent', newId)
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                }
                
                // 清除引用
                this.clearRefMessage()
            } catch (e) {
                console.error('发送文本消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
            }
        },

        async sendVoiceMessage(filePath, duration) {
            const msg = this.createMessage('voice', filePath, { duration, voiceText: '' })
            this.addMessage(msg)

            // 上传到服务器
            try {
                const res = await chatApi.sendVoiceMessage(
                    this.chatId,
                    this.otherUserId,
                    filePath,
                    duration
                )

                if (res.data) {
                    const newId = res.data.messageId
                    if (res.data.url) {
                        const targetMsg = this.messages.find(m => m.id === msg.id)
                        if (targetMsg) targetMsg.content = res.data.url
                    }
                    this.updateMessageStatus(msg.id, 'sent', newId)
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                }
            } catch (e) {
                console.error('发送语音消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
            }
        },

        async sendImageMessage(filePath) {
            const msg = this.createMessage('image', filePath)
            this.addMessage(msg)
            
            // 保存本地 blob URL 到缓存(发送端使用)
            if (filePath.startsWith('blob:')) {
                this.localFileCache[msg.id] = filePath
                this.saveLocalFileCache()
            }

            // 上传到服务器
            try {
                const res = await chatApi.sendImageMessage(
                    this.chatId,
                    this.otherUserId,
                    filePath
                )
                
                if (res.data) {
                    const newId = res.data.id || res.data.messageId
                    // 注意: 不更新content,保留本地blob URL用于显示
                    // 服务器URL会在formatServerMessage中处理(用于对方接收时显示)
                    this.updateMessageStatus(msg.id, 'sent', newId)
                    
                    // 更新缓存中的key为新ID
                    if (this.localFileCache[msg.id]) {
                        this.localFileCache[newId] = this.localFileCache[msg.id]
                        delete this.localFileCache[msg.id]
                        this.saveLocalFileCache()
                    }
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                }
            } catch (e) {
                console.error('发送图片消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
            }
        },

        async sendVideoMessage(filePath, thumbnail, duration) {
            const msg = this.createMessage('video', filePath, { thumbnail, duration })
            this.addMessage(msg)
            
            // 保存本地 blob URL 到缓存(发送端使用)
            if (filePath.startsWith('blob:')) {
                this.localFileCache[msg.id] = filePath
                this.saveLocalFileCache()
            }
            
            // 初始化进度为0 (Vue 3 直接赋值即可)
            this.uploadProgress[msg.id] = 0

            // 上传到服务器
            try {
                const res = await chatApi.sendVideoMessage(
                    this.chatId,
                    this.otherUserId,
                    filePath,
                    thumbnail,
                    duration,
                    (progress) => {
                        // 更新上传进度 (Vue 3 直接赋值即可)
                        this.uploadProgress[msg.id] = progress
                    }
                )

                if (res.data) {
                    const newId = res.data.messageId
                    // 注意: 不更新content和thumbnail,保留本地blob URL用于显示
                    this.updateMessageStatus(msg.id, 'sent', newId)
                    
                    // 更新缓存中的key为新ID
                    if (this.localFileCache[msg.id]) {
                        this.localFileCache[newId] = this.localFileCache[msg.id]
                        delete this.localFileCache[msg.id]
                        this.saveLocalFileCache()
                    }
                    
                    // 清除进度 (Vue 3 使用 delete 操作符)
                    delete this.uploadProgress[msg.id]
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                    delete this.uploadProgress[msg.id]
                }
            } catch (e) {
                console.error('发送视频消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
                delete this.uploadProgress[msg.id]
            }
        },

        async sendFileMessage(filePath, fileName, fileSize) {
            const msg = this.createMessage('file', filePath, { fileName, fileSize })
            this.addMessage(msg)
            
            // 保存本地 blob URL 到缓存(发送端使用)
            if (filePath.startsWith('blob:')) {
                this.localFileCache[msg.id] = filePath
                this.saveLocalFileCache()
            }
            
            // 初始化进度为0 (Vue 3 直接赋值即可)
            this.uploadProgress[msg.id] = 0

            // 上传到服务器
            try {
                const res = await chatApi.sendFileMessage(
                    this.chatId,
                    this.otherUserId,
                    filePath,
                    fileName,
                    fileSize,
                    (progress) => {
                        // 更新上传进度 (Vue 3 直接赋值即可)
                        this.uploadProgress[msg.id] = progress
                    }
                )

                if (res.data) {
                    const newId = res.data.messageId
                    // 注意: 不更新content,保留本地文件信息
                    this.updateMessageStatus(msg.id, 'sent', newId)
                    
                    // 更新缓存中的key为新ID
                    if (this.localFileCache[msg.id]) {
                        this.localFileCache[newId] = this.localFileCache[msg.id]
                        delete this.localFileCache[msg.id]
                        this.saveLocalFileCache()
                    }
                    
                    // 清除进度 (Vue 3 使用 delete 操作符)
                    delete this.uploadProgress[msg.id]
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                    delete this.uploadProgress[msg.id]
                }
            } catch (e) {
                console.error('发送文件消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
                delete this.uploadProgress[msg.id]
            }
        },

        createMessage(type, content, extra = {}) {
            return {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
                type,
                content,
                isSelf: true,
                timestamp: Date.now(),
                status: 'sending',
                refId: null,  // 引用消息ID
                ...extra
            }
        },

        addMessage(msg) {
            this.messages.push(msg)
            this.saveMessagesToStorage()
            this.$nextTick(() => {
                this.scrollToBottom()
            })
        },

        // 添加接收到的消息（供外部调用，如WebSocket接收消息）
        receiveMessage(msgData) {
            let content = msgData.content
            let voiceText = ''
            let duration = msgData.duration
            if (typeof content === 'string' && content.startsWith('{')) {
                try {
                    const parsed = JSON.parse(content)
                    if (msgData.type === 'voice' && parsed.path) {
                        content = `${baseUrl}/files/download/${String(parsed.path).replace(/\\/g, '/')}`
                        voiceText = parsed.toText || ''
                        duration = duration || parsed.duration
                    }
                } catch (e) {}
            }
            const msg = {
                id: msgData.id || Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
                type: msgData.type || 'text',
                content,
                isSelf: false,
                timestamp: msgData.timestamp || Date.now(),
                status: 'sent',
                voiceText,
                duration,
                ...msgData
            }
            this.messages.push(msg)
            this.saveMessagesToStorage()
            this.$nextTick(() => {
                this.scrollToBottom()
            })
            
            // 发送系统通知 
            // 获取发送者名称
            const senderName = this.otherNote || this.otherUsername || '用户'
            
            // 调用全局通知系统
            triggerMessageNotification({
                senderName: senderName,
                content: msgData.content,
                type: msgData.type || 'text',
                fileName: msgData.fileName
            }, {
                playSound: true,      // 播放声音
                vibrate: true,        // 振动反馈
                showNotification: true // 显示 toast
            }).catch(e => {
                console.warn('消息通知失败:', e)
            })
        },

        updateMessageStatus(msgId, status, newId = null) {
            const msg = this.messages.find(m => m.id === msgId)
            if (msg) {
                msg.status = status
                // 如果提供了新ID(服务器返回的真实ID),则更新消息ID
                if (newId && newId !== msgId) {
                    msg.id = newId
                }
                this.saveMessagesToStorage()
            }
        },

        async resendMessage(msg) {
            const originalId = msg.id
            msg.status = 'sending'
            this.saveMessagesToStorage()

            try {
                let res
                switch (msg.type) {
                    case 'text':
                        res = await chatApi.sendTextMessage({
                            chatId: this.chatId,
                            targetUserId: this.otherUserId,
                            content: msg.content
                        })
                        break
                    case 'image':
                        res = await chatApi.sendImageMessage(
                            this.chatId,
                            this.otherUserId,
                            msg.content
                        )
                        break
                    case 'voice':
                        res = await chatApi.sendVoiceMessage(
                            this.chatId,
                            this.otherUserId,
                            msg.content,
                            msg.duration
                        )
                        break
                    case 'video':
                        res = await chatApi.sendVideoMessage(
                            this.chatId,
                            this.otherUserId,
                            msg.content,// video file path
                            msg.thumbnail,// thumbnail path
                            msg.duration// duration in seconds
                        )
                        break
                    case 'file':
                        res = await chatApi.sendFileMessage(
                            this.chatId,
                            this.otherUserId,
                            msg.content,
                            msg.fileName,
                            msg.fileSize
                        )
                        break
                    case 'location':
                        res = await chatApi.sendLocationMessage(
                            this.chatId,
                            this.otherUserId,
                            msg.locationName,
                            msg.locationAddress,
                            msg.latitude,
                            msg.longitude
                        )
                        break
                }

                if (res && res.data) {
                    const newId = res.data.messageId
                    if (res.data.url) msg.content = res.data.url
                    this.updateMessageStatus(originalId, 'sent', newId)
                } else {
                    this.updateMessageStatus(originalId, 'sent')
                }
            } catch (e) {
                console.error('重发消息失败', e)
                this.updateMessageStatus(originalId, 'failed')
            }
        },

        // ==================== 媒体选择 ====================
        chooseImage() {
            uni.chooseImage({
                count: 9,
                sizeType: ['compressed'],
                sourceType: ['album'],
                success: (res) => {
                    res.tempFilePaths.forEach(path => {
                        this.sendImageMessage(path)
                    })
                }
            })
            this.showMorePanel = false
        },

        shootPhoto() {
            uni.chooseImage({
                count: 1,
                sizeType: ['compressed'],
                sourceType: ['camera'],
                success: (res) => {
                    this.sendImageMessage(res.tempFilePaths[0])
                }
            })
            this.showMorePanel = false
        },

        chooseVideo() {
            uni.chooseVideo({
                sourceType: ['album'],
                compressed: true,
                success: (res) => {
                    this.sendVideoMessage(res.tempFilePath, res.thumbTempFilePath, res.duration)
                }
            })
            this.showMorePanel = false
        },

        recordVideo() {
            uni.chooseVideo({
                sourceType: ['camera'],
                compressed: true,
                maxDuration: 60,
                success: (res) => {
                    this.sendVideoMessage(res.tempFilePath, res.thumbTempFilePath, res.duration)
                }
            })
            this.showMorePanel = false
        },

        chooseFile() {
            // #ifdef APP-PLUS
            plus.io.chooseFile({
                success: (res) => {
                    const file = res.files[0]
                    this.sendFileMessage(file.path, file.name, file.size)
                },
                fail: () => {
                    uni.showToast({ title: '选择文件失败', icon: 'none' })
                }
            })
            // #endif

            // #ifdef H5
            const input = document.createElement('input')
            input.type = 'file'
            input.onchange = (e) => {
                const file = e.target.files[0]
                if (file) {
                    const reader = new FileReader()
                    reader.onload = () => {
                        this.sendFileMessage(reader.result, file.name, file.size)
                    }
                    reader.readAsDataURL(file)
                }
            }
            input.click()
            // #endif

            // #ifdef MP-WEIXIN
            wx.chooseMessageFile({
                count: 1,
                type: 'file',
                success: (res) => {
                    const file = res.tempFiles[0]
                    this.sendFileMessage(file.path, file.name, file.size)
                }
            })
            // #endif

            this.showMorePanel = false
        },

        sendLocation() {
            // #ifdef H5
            // H5端跳转到自定义地图选择页面
            uni.navigateTo({
                url: '/pages/map/map?mode=select'
            })
            this.showMorePanel = false
            return
            // #endif
            
            // #ifdef APP-PLUS
            // APP端直接打开地图选择位置
            console.log('APP端打开地图')
            //根据主题色选择不同的地图样式:
            let pagen = ''
            if (this.theme === 'dark') {
                pagen='/pages-dark/map/map?mode=select'
            } else {
                pagen='/pages/map/map?mode=select'
            }
            uni.navigateTo({
                url: pagen,
                success: () => {
                    console.log('成功打开地图页面')
                },
                fail: (err) => {
                    console.error('打开地图失败:', err)
                    uni.showToast({
                        title: '打开地图失败',
                        icon: 'none'
                    })
                }
            })
            this.showMorePanel = false
            return
            // #endif
            
            // #ifdef MP-WEIXIN
            // 微信小程序：直接尝试调用选择位置，由系统自动处理权限
            uni.chooseLocation({
                success: (res) => {
                    // 选择成功，发送位置消息
                    const msg = this.createMessage('location', '', {
                        locationName: res.name || '位置分享',
                        locationAddress: res.address || '',
                        latitude: res.latitude,
                        longitude: res.longitude
                    })
                    this.addMessage(msg)
                    this.sendLocationMessage(msg)
                    uni.showToast({ title: '位置已发送', icon: 'success' })
                },
                fail: (err) => {
                    console.error('选择位置失败', err)
                    // 判断是否是用户取消
                    if (err.errMsg && err.errMsg.includes('cancel')) {
                        // 用户取消，不显示提示
                        return
                    }
                    // 权限被拒绝或其他错误
                    uni.showModal({
                        title: '提示',
                        content: '需要获取位置权限才能发送位置，请在设置中开启',
                        confirmText: '去设置',
                        showCancel: true,
                        success: (modalRes) => {
                            if (modalRes.confirm) {
                                uni.openSetting()
                            }
                        }
                    })
                }
            })
            this.showMorePanel = false
            // #endif
        },
        
        // 处理位置选择结果
        handleLocationSelected(data) {
            if (!data || !data.latitude || !data.longitude) {
                return
            }
            
            // 生成位置数据的唯一标识(经纬度+名称+地址)
            const dataHash = `${data.latitude}_${data.longitude}_${data.name || ''}_${data.address || ''}`
            
            // 防止重复发送:检查是否是同一个位置数据
            if (dataHash === this.lastLocationDataHash) {
                return
            }
            this.lastLocationDataHash = dataHash
            
            const msg = this.createMessage('location', '', {
                locationName: data.name || '位置分享',
                locationAddress: data.address || '',
                latitude: data.latitude,
                longitude: data.longitude
            })
            
            this.addMessage(msg)
            this.sendLocationMessage(msg)
            
            uni.showToast({ title: '位置已发送', icon: 'success' })
        },

        async sendLocationMessage(msg) {
            try {
                const res = await chatApi.sendLocationMessage(
                    this.chatId,
                    this.otherUserId,
                    msg.locationName,
                    msg.locationAddress,
                    msg.latitude,
                    msg.longitude
                )

                const newId = res.data?.messageId
                if (newId) {
                    this.updateMessageStatus(msg.id, 'sent', newId)
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                }
            } catch (e) {
                console.error('发送位置消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
            }
        },

        // ==================== 语音录制 ====================
        startRecord(e) {
            // #ifdef H5
            uni.showToast({ title: 'H5端暂不支持录音功能', icon: 'none' })
            return
            // #endif

            // #ifndef H5
            this.startY = e.touches[0].clientY
            this.isCancelVoice = false

            // 在 APP-PLUS 环境下, uni.authorize 可能不可靠,优先尝试直接启动录音
            // #ifdef APP-PLUS
            try {
                if (!this.recorderManager) {
                    this.recorderManager = uni.getRecorderManager()
                }
                this.recorderManager.start({
                    duration: 60000,
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    encodeBitRate: 48000,
                    format: 'mp3'
                })
            } catch (err) {
                console.warn('APP-PLUS 直接启动录音失败,尝试权限请求', err)
                // 回退到权限请求流程
                uni.authorize({
                    scope: 'scope.record',
                    success: () => {
                        this.recorderManager.start({
                            duration: 60000,
                            sampleRate: 16000,
                            numberOfChannels: 1,
                            encodeBitRate: 48000,
                            format: 'mp3'
                        })
                    },
                    fail: () => {
                        uni.showModal({
                            title: '提示',
                            content: '需要录音权限才能发送语音消息',
                            confirmText: '去设置',
                            success: (res) => {
                                if (res.confirm) {
                                    uni.openSetting()
                                }
                            }
                        })
                    }
                })
            }
            // #endif

            // 其余平台(微信小程序等)使用原有授权流程
            // #ifndef APP-PLUS
            // 检查录音权限
            uni.authorize({
                scope: 'scope.record',
                success: () => {
                    this.recorderManager.start({
                        duration: 60000,
                        sampleRate: 16000,
                        numberOfChannels: 1,
                        encodeBitRate: 48000,
                        format: 'mp3'
                    })
                },
                fail: () => {
                    uni.showModal({
                        title: '提示',
                        content: '需要录音权限才能发送语音消息',
                        confirmText: '去设置',
                        success: (res) => {
                            if (res.confirm) {
                                uni.openSetting()
                            }
                        }
                    })
                }
            })
            // #endif
            // #endif
        },

        onRecordMove(e) {
            if (!this.isRecording) return

            const moveY = e.touches[0].clientY
            const diff = this.startY - moveY

            this.isCancelVoice = diff > 50
        },

        stopRecord() {
            // #ifndef H5
            if (this.isRecording) {
                this.recorderManager.stop()
            }
            // #endif
        },

        cancelRecord() {
            // #ifndef H5
            this.isCancelVoice = true
            this.stopRecord()
            // #endif
        },

        // ==================== 语音播放 ====================
        playVoice(msg) {
            // 如果已经标记失败，点击重试
            if (this.mediaLoadErrors[msg.id]?.type === 'voice') {
                this.retryLoadMedia(msg, 'voice')
                return
            }
            
            if (this.playingVoiceId === msg.id) {
                this.innerAudioContext.stop()
                this.playingVoiceId = null
                return
            }

            if (this.playingVoiceId) {
                this.innerAudioContext.stop()
            }

            this.playingVoiceId = msg.id
            
            // 小程序中,如果语音路径是相对路径或JSON对象,需要特殊处理
            let audioSrc = msg.content
            
            // 如果content是对象(JSON解析后),提取path
            if (typeof audioSrc === 'object' && audioSrc.path) {
                audioSrc = `${baseUrl}/files/download/${audioSrc.path}`
            }
            
            // 确保是完整的URL
            if (typeof audioSrc === 'string' && 
                !audioSrc.startsWith('http://') && 
                !audioSrc.startsWith('https://') &&
                !audioSrc.startsWith('wxfile://') &&
                !audioSrc.startsWith('file://')) {
                audioSrc = `${baseUrl}/files/download/${audioSrc}`
            }
            
            console.log('准备播放语音:', audioSrc)
            
            // 保存当前播放的消息对象,用于错误处理
            this.currentPlayingMsg = msg
            
            try {
                this.innerAudioContext.src = audioSrc
                this.innerAudioContext.play()
            } catch (err) {
                console.error('播放语音失败:', err)
                this.$set(this.mediaLoadErrors, msg.id, { type: 'voice', error: true, retryCount: 0 })
                this.playingVoiceId = null
                this.currentPlayingMsg = null
                uni.showToast({ title: '语音播放失败', icon: 'none' })
            }
        },

        // ==================== 图片预览 ====================
        previewImage(msg) {
            // 构建所有图片消息列表（过滤出图片消息）
            this.previewImageList = this.messages.filter(m => m.type === 'image')
            
            // 找到当前点击的图片在列表中的索引
            const index = this.previewImageList.findIndex(m => m.id === msg.id)
            this.previewCurrentIndex = index >= 0 ? index : 0
            
            // 打开预览面板
            this.showImagePreview = true
            this.previewImageLoading = false
            
            // 如果是小于1M的图片，自动加载并缓存原图以直接显示高清
            if (!this.isLargeImage(msg) && !this.loadedOriginalImages[msg.id] && msg.content) {
                this.loadOriginalImage(msg)
            }
        },

        // 关闭图片预览
        closeImagePreview() {
            this.showImagePreview = false
            this.previewImageList = []
            this.previewCurrentIndex = 0
            this.previewImageLoading = false
        },

        // 切换到下一张图片
        nextPreviewImage() {
            if (this.previewImageList.length > 0) {
                this.previewCurrentIndex = (this.previewCurrentIndex + 1) % this.previewImageList.length
                this.previewImageLoading = false
                
                // 获取新的当前图片
                const currentMsg = this.currentPreviewMessage
                if (currentMsg) {
                    // 如果已经加载过原图，确保 UI 能读取到（强制响应式更新）
                    if (this.loadedOriginalImages[currentMsg.id]) {
                        this.$forceUpdate()
                    } else if (!this.isLargeImage(currentMsg) && currentMsg.content) {
                        // 如果是小图且未加载，自动加载原图
                        this.loadOriginalImage(currentMsg)
                    }
                }
            }
        },

        // 切换到上一张图片
        prevPreviewImage() {
            if (this.previewImageList.length > 0) {
                this.previewCurrentIndex = (this.previewCurrentIndex - 1 + this.previewImageList.length) % this.previewImageList.length
                this.previewImageLoading = false
                
                // 获取新的当前图片
                const currentMsg = this.currentPreviewMessage
                if (currentMsg) {
                    // 如果已经加载过原图，确保 UI 能读取到（强制响应式更新）
                    if (this.loadedOriginalImages[currentMsg.id]) {
                        this.$forceUpdate()
                    } else if (!this.isLargeImage(currentMsg) && currentMsg.content) {
                        // 如果是小图且未加载，自动加载原图
                        this.loadOriginalImage(currentMsg)
                    }
                }
            }
        },

        // 判断是否是大图（超过1M）
        isLargeImage(msg) {
            if (!msg || msg.type !== 'image') return false
            // fileSize 字段保存的是字节数
            const fileSizeBytes = msg.fileSize || 0
            return fileSizeBytes > 1024 * 1024 // 1M = 1024*1024 字节
        },

        // 加载原图并缓存
        loadOriginalImage(msg) {
            if (!msg || !msg.content) return

            // 如果已经加载过,直接跳过
            if (this.loadedOriginalImages[msg.id]) {
                return
            }

            // 只有大图才显示加载提示，小图快速加载无需提示
            const showLoadingTip = this.isLargeImage(msg)
            if (showLoadingTip) {
                this.previewImageLoading = true
            }

            // 预加载图片到本地缓存,这样 image 标签可以快速显示
            uni.getImageInfo({
                src: msg.content,
                success: (image) => {
                    // 设置已加载的原图 URL
                    this.$set(this.loadedOriginalImages, msg.id, msg.content)
                    
                    // 加载成功后隐藏提示
                    this.previewImageLoading = false
                    
                    console.log('原图加载成功:', msg.id)
                },
                fail: (err) => {
                    this.previewImageLoading = false
                    console.error('原图加载失败:', err)
                    
                    uni.showToast({
                        title: '原图加载失败',
                        icon: 'none'
                    })
                }
            })
        },

        // ==================== 视频播放 ====================
        async playVideo(url, msg) {
            // 如果已经标记失败，点击重试
            if (this.mediaLoadErrors[msg.id]?.type === 'video') {
                this.retryLoadMedia(msg, 'video')
                return
            }
            
            // 首先尝试使用缓存的 URL
            const validUrl = await this.getValidFileUrl(msg)
            if (validUrl) {
                this.currentVideoUrl = validUrl
                this.showVideoPlayer = true
                return
            }
            
            // 如果当前 URL 是 blob 且有效,直接使用
            if (url.startsWith('blob:')) {
                const isValid = await this.checkBlobUrlValid(url)
                if (isValid) {
                    this.currentVideoUrl = url
                    this.showVideoPlayer = true
                    return
                }
            }
            
            // 如果是 file:// 协议,直接使用
            if (url.startsWith('file://')) {
                this.currentVideoUrl = url
                this.showVideoPlayer = true
                return
            }

            // 需要从服务器下载
            try {
                // 初始化下载进度
                this.downloadProgress[msg.id] = 0

                const downloadTask = uni.downloadFile({
                    url: url,
                    success: (res) => {
                        if (res.statusCode === 200) {
                            // 保存到本地缓存
                            this.localFileCache[msg.id] = res.tempFilePath
                            this.saveLocalFileCache()
                            this.currentVideoUrl = res.tempFilePath
                            this.showVideoPlayer = true
                            // 清除下载进度和错误标记
                            delete this.downloadProgress[msg.id]
                            if (this.mediaLoadErrors[msg.id]) {
                                delete this.mediaLoadErrors[msg.id]
                            }
                        } else {
                            // 非200状态码，按失败处理
                            console.error('视频下载失败，状态码:', res.statusCode)
                            this.$set(this.mediaLoadErrors, msg.id, { type: 'video', error: true, retryCount: 0 })
                            let errorMsg = '视频下载失败'
                            if (res.statusCode === 404) {
                                errorMsg = '视频不存在'
                            } else if (res.statusCode === 403) {
                                errorMsg = '无权限访问视频'
                            }
                            uni.showToast({
                                title: errorMsg,
                                icon: 'none'
                            })
                            delete this.downloadProgress[msg.id]
                        }
                    },
                    fail: (err) => {
                        console.error('视频下载失败', err)
                        this.$set(this.mediaLoadErrors, msg.id, { type: 'video', error: true, retryCount: 0 })
                        uni.showToast({
                            title: '视频下载失败',
                            icon: 'none'
                        })
                        delete this.downloadProgress[msg.id]
                    }
                })

                // 监听下载进度
                downloadTask.onProgressUpdate((res) => {
                    this.downloadProgress[msg.id] = res.progress
                })
            } catch (e) {
                console.error('播放视频失败', e)
                this.$set(this.mediaLoadErrors, msg.id, { type: 'video', error: true, retryCount: 0 })
                uni.showToast({
                    title: '播放失败',
                    icon: 'none'
                })
                delete this.downloadProgress[msg.id]
            }
        },

        closeVideoPlayer() {
            this.showVideoPlayer = false
            this.currentVideoUrl = ''
        },

        // ==================== 文件操作 ====================
        async openFile(msg) {
            // 如果已经标记失败，点击重试
            if (this.mediaLoadErrors[msg.id]?.type === 'file') {
                this.retryLoadMedia(msg, 'file')
                return
            }
            
            const url = msg.content
            const fileName = msg.fileName

            // 首先尝试使用缓存的 URL
            const validUrl = await this.getValidFileUrl(msg)
            if (validUrl) {
                this.doOpenFile(validUrl, fileName)
                return
            }
            
            // 如果当前 URL 是 blob 且有效,直接使用
            if (url.startsWith('blob:')) {
                const isValid = await this.checkBlobUrlValid(url)
                if (isValid) {
                    this.doOpenFile(url, fileName)
                    return
                }
            }
            
            // 如果是 file:// 协议,直接使用
            if (url.startsWith('file://')) {
                this.doOpenFile(url, fileName)
                return
            }

            // 需要从服务器下载
            try {
                // 初始化下载进度
                this.downloadProgress[msg.id] = 0

                // #ifdef H5
                // H5 环境下,先检查文件是否存在
                try {
                    const checkRes = await fetch(url, { method: 'HEAD' })
                    if (checkRes.ok) {
                        // 文件存在,触发下载
                        this.downloadFileWithName(url, fileName)
                        delete this.downloadProgress[msg.id]
                        if (this.mediaLoadErrors[msg.id]) {
                            delete this.mediaLoadErrors[msg.id]
                        }
                    } else {
                        // 文件不存在
                        throw new Error('文件不存在: ' + checkRes.status)
                    }
                } catch (err) {
                    console.error('H5文件检查/下载失败', err)
                    this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                    let errorMsg = '文件下载失败'
                    if (err.message.includes('404') || err.message.includes('不存在')) {
                        errorMsg = '文件不存在'
                    }
                    uni.showToast({
                        title: errorMsg,
                        icon: 'none'
                    })
                    delete this.downloadProgress[msg.id]
                }
                // #endif

                // #ifndef H5
                // 非 H5 环境,使用 uni.downloadFile
                const downloadTask = uni.downloadFile({
                    url: url,
                    success: (res) => {
                        if (res.statusCode === 200) {
                            // 保存到本地缓存
                            this.localFileCache[msg.id] = res.tempFilePath
                            this.saveLocalFileCache()
                            this.doOpenFile(res.tempFilePath, fileName)
                            // 清除下载进度和错误标记
                            delete this.downloadProgress[msg.id]
                            if (this.mediaLoadErrors[msg.id]) {
                                delete this.mediaLoadErrors[msg.id]
                            }
                        } else {
                            // 非200状态码，按失败处理
                            console.error('文件下载失败，状态码:', res.statusCode)
                            this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                            let errorMsg = '文件下载失败'
                            if (res.statusCode === 404) {
                                errorMsg = '文件不存在'
                            } else if (res.statusCode === 403) {
                                errorMsg = '无权限访问文件'
                            }
                            uni.showToast({
                                title: errorMsg,
                                icon: 'none'
                            })
                            delete this.downloadProgress[msg.id]
                        }
                    },
                    fail: (err) => {
                        console.error('文件下载失败', err)
                        this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                        uni.showToast({
                            title: '文件下载失败',
                            icon: 'none'
                        })
                        delete this.downloadProgress[msg.id]
                    }
                })

                // 监听下载进度
                downloadTask.onProgressUpdate((res) => {
                    this.downloadProgress[msg.id] = res.progress
                })
                // #endif
            } catch (e) {
                console.error('打开文件失败', e)
                this.$set(this.mediaLoadErrors, msg.id, { type: 'file', error: true, retryCount: 0 })
                uni.showToast({
                    title: '打开失败',
                    icon: 'none'
                })
                delete this.downloadProgress[msg.id]
            }
        },

        // H5 环境下载文件并指定文件名
        downloadFileWithName(url, fileName) {
            const a = document.createElement('a')
            a.href = url
            a.download = fileName || 'download'
            a.style.display = 'none'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        },

        // 检查 blob URL 是否有效(仅在 H5 环境)
        async checkBlobUrlValid(blobUrl) {
            if (!blobUrl.startsWith('blob:')) {
                return true // 非 blob URL,认为有效
            }
            
            // #ifdef H5
            try {
                // 使用 fetch GET 请求检测 blob URL 是否有效
                const response = await fetch(blobUrl)
                return response.ok
            } catch (e) {
                console.log('blob URL 已失效:', blobUrl)
                return false // blob URL 已失效
            }
            // #endif
            
            // #ifndef H5
            return true // 非 H5 环境,file:// 协议不会失效
            // #endif
        },

        // 获取有效的文件 URL(如果 blob 失效则从服务器下载)
        async getValidFileUrl(msg) {
            const cachedUrl = this.localFileCache[msg.id]
            
            // 检查缓存的 URL 是否有效
            if (cachedUrl) {
                const isValid = await this.checkBlobUrlValid(cachedUrl)
                if (isValid) {
                    return cachedUrl // 缓存有效,直接返回
                } else {
                    // 缓存失效,清除缓存
                    delete this.localFileCache[msg.id]
                    this.saveLocalFileCache()
                }
            }
            
            // 没有缓存或缓存失效,返回 null(需要下载)
            return null
        },

        doOpenFile(filePath, fileName) {
            // #ifdef APP-PLUS
            plus.runtime.openFile(filePath)
            // #endif

            // #ifdef H5
            // H5 环境下触发下载
            if (filePath.startsWith('blob:')) {
                const a = document.createElement('a')
                a.href = filePath
                a.download = fileName || 'download'
                a.style.display = 'none'
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
            } else {
                window.open(filePath)
            }
            // #endif

            // #ifdef MP-WEIXIN
            wx.openDocument({
                filePath: filePath,
                showMenu: true
            })
            // #endif
        },

        // ==================== 表情 ====================
        insertEmoji(emoji) {
            this.inputText += emoji
        },

        // 删除输入框最后一个字符（正确处理 emoji 等多字节字符）
        deleteLastChar() {
            if (this.inputText.length > 0) {
                // 使用 Array.from 正确处理 emoji 等 Unicode 字符
                const chars = Array.from(this.inputText)
                chars.pop()
                this.inputText = chars.join('')
            }
        },

        // ==================== UI交互 ====================
        goBack() {
            const pages = getCurrentPages()
            if (pages.length > 1) {
                uni.navigateBack()
            } else {
                uni.reLaunch({
                    url: '/pages/profile/profile'
                })
            }
        },

        showMoreOptions() {
            this.showSettingsModal = true
        },

        closeSettingsModal() {
            this.showSettingsModal = false
        },

        // 开始编辑备注
        startEditNote() {
            this.tempNote = this.contactSettings.note || ''
            this.editingNote = true
            // 编辑备注时不关闭设置面板,因为编辑框的 z-index 更高
        },

        cancelEditNote() {
            this.editingNote = false
            this.tempNote = ''
        },

        async saveNote() {
            if (!this.tempNote.trim()) {
                uni.showToast({ title: '备注名不能为空', icon: 'none' })
                return
            }

            try {
                // 调用 API 保存备注
                await chatApi.updateContactNote({
                    userId: this.otherUserId,
                    note: this.tempNote
                })

                this.contactSettings.note = this.tempNote
                this.chatTitle = this.tempNote // 更新聊天标题
                this.editingNote = false
                uni.showToast({ title: '备注已更新', icon: 'success' })
            } catch (e) {
                console.error('保存备注失败:', e)
                uni.showToast({ title: '保存失败', icon: 'none' })
            }
        },

        // 选择关系
        selectRelationship() {
            // 临时关闭设置面板,避免遮挡 ActionSheet
            this.showSettingsModal = false
            
            const relationshipKeys = Object.keys(chatRelationshipLabels)
            const relationshipLabels = Object.values(chatRelationshipLabels)
            
            // 延迟一下再显示 ActionSheet,确保设置面板已关闭
            setTimeout(() => {
                uni.showActionSheet({
                    itemList: relationshipLabels,
                    success: async (res) => {
                        const selectedKey = relationshipKeys[res.tapIndex]
                        const selectedLabel = relationshipLabels[res.tapIndex]

                        try {
                            await chatApi.updateContactRelationship({
                                userId: this.otherUserId,
                                relationship: selectedKey
                            })

                            this.contactSettings.relationship = selectedKey
                            uni.showToast({ title: `已设置为${selectedLabel}`, icon: 'success' })
                        } catch (e) {
                            console.error('更新关系失败:', e)
                            uni.showToast({ title: '更新失败', icon: 'none' })
                        }
                        
                        // 操作完成后重新打开设置面板
                        setTimeout(() => {
                            this.showSettingsModal = true
                        }, 300)
                    },
                    fail: () => {
                        // 用户取消,重新打开设置面板
                        this.showSettingsModal = true
                    }
                })
            }, 100)
        },

        // 切换免打扰
        async toggleMute(e) {
            const mute = e.detail.value

            try {
                await chatApi.updateContactMute({
                    userId: this.otherUserId,
                    mute: mute
                })

                this.contactSettings.mute = mute
                uni.showToast({ 
                    title: mute ? '已开启免打扰' : '已关闭免打扰', 
                    icon: 'success' 
                })
            } catch (e) {
                console.error('更新免打扰失败:', e)
                uni.showToast({ title: '更新失败', icon: 'none' })
            }
        },

        // 切换置顶
        async toggleTop(e) {
            const top = e.detail.value

            try {
                await chatApi.updateContactTop({
                    userId: this.otherUserId,
                    top: top
                })

                this.contactSettings.top = top
                uni.showToast({ 
                    title: top ? '已置顶' : '已取消置顶', 
                    icon: 'success' 
                })
            } catch (e) {
                console.error('更新置顶失败:', e)
                uni.showToast({ title: '更新失败', icon: 'none' })
            }
        },

        // 确认清空聊天记录
        confirmClearChat() {
            uni.showModal({
                title: '提示',
                content: '确定要清空聊天记录吗？此操作不可恢复',
                success: async (res) => {
                    if (res.confirm) {
                        try {
                            await chatApi.clearChatHistory(this.chatId)
                            this.messages = []
                            this.saveMessagesToStorage()
                            uni.showToast({ title: '已清空', icon: 'success' })
                        } catch (e) {
                            console.error('清空聊天记录失败:', e)
                            uni.showToast({ title: '清空失败', icon: 'none' })
                        }
                    }
                }
            })
        },

        // 确认删除联系人
        confirmDeleteContact() {
            uni.showModal({
                title: '警告',
                content: '确定要删除该联系人吗？删除后将清空所有聊天记录',
                confirmColor: '#ff4444',
                success: async (res) => {
                    if (res.confirm) {
                        try {
                            await chatApi.deleteContact({
                                userId: this.otherUserId
                            })

                            uni.showToast({ title: '已删除', icon: 'success' })
                            setTimeout(() => {
                                uni.navigateBack()
                            }, 1500)
                        } catch (e) {
                            console.error('删除联系人失败:', e)
                            uni.showToast({ title: '删除失败', icon: 'none' })
                        }
                    }
                }
            })
        },

        // 加载联系人设置
        async loadContactSettings() {
            try {
                const res = await chatApi.getContactSettings({
                    userId: this.otherUserId
                })

                if (res.data) {
                    this.contactSettings = {
                        note: res.data.note || '',
                        relationship: res.data.relationship || '',
                        mute: res.data.mute || false,
                        top: res.data.top || false
                    }

                    // 如果有备注,更新聊天标题
                    if (res.data.note) {
                        this.chatTitle = res.data.note
                    }
                }
            } catch (e) {
                console.error('加载联系人设置失败:', e)
            }
        },

        // 旧的 showMoreOptions 改名为 showMoreOptions_old,用于向后兼容
        showMoreOptions_old() {
            uni.showActionSheet({
                itemList: ['清空聊天记录'],
                success: (res) => {
                    if (res.tapIndex === 0) {
                        uni.showModal({
                            title: '提示',
                            content: '确定要清空聊天记录吗？此操作不可恢复',
                            success: async (r) => {
                                if (r.confirm) {
                                    // 同步清空服务器记录
                                    try {
                                        await chatApi.clearChatHistory(this.chatId)
                                    } catch (e) {
                                        console.error('清空服务器聊天记录失败', e)
                                    }

                                    this.messages = []
                                    this.saveMessagesToStorage()
                                    uni.showToast({ title: '已清空', icon: 'success' })
                                }
                            }
                        })
                    }
                }
            })
        },

        toggleVoiceMode() {
            this.isVoiceMode = !this.isVoiceMode
            this.showEmojiPanel = false
            this.showMorePanel = false
        },

        toggleEmoji() {
            this.showEmojiPanel = !this.showEmojiPanel
            this.showMorePanel = false
        },

        toggleMorePanel() {
            this.showMorePanel = !this.showMorePanel
            this.showEmojiPanel = false
        },

        onInputFocus() {
            this.showEmojiPanel = false
            this.showMorePanel = false
        },

        onInputBlur() {
            // 延迟隐藏，避免点击表情或更多按钮时立即隐藏
        },

        // ==================== 拖拽和粘贴处理 ====================
        onDragOver(e) {
            e.preventDefault()
            this.isDragOver = true
        },

        onDragLeave(e) {
            this.isDragOver = false
        },

        onDrop(e) {
            if (e.preventDefault) {
                e.preventDefault()
            }
            if (e.stopPropagation) {
                e.stopPropagation()
            }
            
            this.isDragOver = false
            
            // 获取拖拽的文件 - 支持多种方式
            let files = null
            
            // 方式 1：标准的 dataTransfer.files
            if (e.dataTransfer && e.dataTransfer.files) {
                files = e.dataTransfer.files
                console.log('方式1: 使用 dataTransfer.files', files)
            }
            
            // 方式 2：dataTransfer.items (更现代)
            if (!files && e.dataTransfer && e.dataTransfer.items) {
                const items = e.dataTransfer.items
                files = []
                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                        const file = items[i].getAsFile()
                        if (file) {
                            files.push(file)
                        }
                    }
                }
                console.log('方式2: 使用 dataTransfer.items', files)
            }
            
            // // 检查是否获取到文件
            // if (!files || files.length === 0) {
            //     console.warn('未检测到文件', {
            //         dataTransfer: e.dataTransfer,
            //         files: files,
            //         eventType: e.type
            //     })
            //     uni.showToast({
            //         title: '未检测到文件，请尝试直接拖拽或粘贴',
            //         icon: 'none'
            //     })
            //     return
            // }

            console.log(`检测到 ${files.length} 个文件`)
            
            // 处理拖拽的文件
            this.processDroppedFiles(Array.from(files))
        },

        // 处理原生粘贴事件（拥有完整的 clipboardData）
        onPasteNative(e) {
            console.log('onPasteNative 触发', e)
            const clipboardData = e.clipboardData
            if (!clipboardData) {
                console.warn('无法获取 clipboardData')
                return
            }

            console.log('clipboardData.items:', clipboardData.items)
            console.log('clipboardData.files:', clipboardData.files)

            // 优先使用 items （更现代的方式）
            const items = clipboardData.items
            const files = clipboardData.files
            let processed = false

            if (items && items.length > 0) {
                console.log('使用 items 方式处理粘贴')
                // 遍历粘贴的项目
                for (let i = 0; i < items.length; i++) {
                    const item = items[i]
                    console.log(`项目 ${i}:`, { kind: item.kind, type: item.type })
                    
                    // 检查是否是文件
                    if (item.kind === 'file') {
                        const file = item.getAsFile()
                        if (file) {
                            console.log('获取到文件:', file.name, file.type, file.size)
                            this.processPastedFile(file)
                            processed = true
                        }
                    }
                }
            } else if (!processed && files && files.length > 0) {
                console.log('使用 files 方式处理粘贴')
                // 备选方式：使用 files (仅当 items 未处理任何文件时)
                for (let i = 0; i < files.length; i++) {
                    const file = files[i]
                    console.log('获取到文件:', file.name, file.type, file.size)
                    this.processPastedFile(file)
                }
            } else {
                console.warn('粘贴内容中未找到文件')
            }
        },

        // Vue 模板粘贴事件处理（备用，以防 uni-app 能访问 clipboardData）
        onPaste(e) {
            console.log('Vue @paste 触发', e)
            
            // 获取粘贴的内容
            const clipboardData = e.clipboardData || window.clipboardData
            if (!clipboardData) {
                console.warn('Vue @paste 无法获取 clipboardData，将使用原生事件处理')
                return
            }

            console.log('clipboardData.items:', clipboardData.items)
            console.log('clipboardData.files:', clipboardData.files)

            // 优先使用 items （更现代的方式）
            const items = clipboardData.items
            const files = clipboardData.files
            let processed = false

            if (items && items.length > 0) {
                console.log('使用 items 方式处理粘贴')
                // 遍历粘贴的项目
                for (let i = 0; i < items.length; i++) {
                    const item = items[i]
                    console.log(`项目 ${i}:`, { kind: item.kind, type: item.type })
                    
                    // 检查是否是文件
                    if (item.kind === 'file') {
                        const file = item.getAsFile()
                        if (file) {
                            console.log('获取到文件:', file.name, file.type, file.size)
                            this.processPastedFile(file)
                            processed = true
                        }
                    }
                }
            } else if (!processed && files && files.length > 0) {
                console.log('使用 files 方式处理粘贴')
                // 备选方式：使用 files (仅当 items 未处理任何文件时)
                for (let i = 0; i < files.length; i++) {
                    const file = files[i]
                    console.log('获取到文件:', file.name, file.type, file.size)
                    this.processPastedFile(file)
                }
            } else {
                console.warn('粘贴内容中未找到文件')
            }
        },

        processDroppedFiles(files) {
            console.log(`处理 ${files.length} 个拖拽的文件`)
            files.forEach((file, index) => {
                console.log(`处理文件 ${index + 1}/${files.length}:`, file.name, file.type, file.size)
                this.handleFileUpload(file)
            })
        },

        processPastedFile(file) {
            console.log('处理粘贴的文件:', file.name, file.type, file.size)
            this.handleFileUpload(file)
        },

        handleFileUpload(file) {
            // 检查文件类型
            const fileType = file.type
            const fileName = file.name || '未命名文件'
            
            console.log('检查文件类型:', fileType)
            
            if (fileType.startsWith('image/')) {
                // 处理图片
                console.log('识别为图片，开始处理')
                this.handlePastedImage(file, fileName)
            } else if (fileType.startsWith('video/')) {
                // 处理视频
                console.log('识别为视频，开始处理')
                this.handlePastedVideo(file, fileName)
            } else {
                // 处理其他文件
                console.log('识别为其他文件，开始处理')
                this.handlePastedFile(file, fileName)
            }
        },

        handlePastedImage(file, fileName) {
            console.log('开始读取图片:', fileName)
            uni.showToast({ title: '正在处理图片...', icon: 'loading' })
            
            // 创建 FileReader 读取文件
            const reader = new FileReader()
            reader.onload = (e) => {
                const data = e.target?.result
                console.log('图片读取成功，数据长度:', data?.length)
                if (data) {
                    console.log('发送图片消息')
                    this.sendImageMessage(data)
                }
            }
            reader.onerror = (error) => {
                console.error('读取图片失败:', error)
                uni.showToast({
                    title: '读取图片失败：' + error.name,
                    icon: 'none'
                })
            }
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100)
                    console.log('读取进度:', percentComplete + '%')
                }
            }
            reader.readAsDataURL(file)
        },

        handlePastedVideo(file, fileName) {
            console.log('开始读取视频:', fileName)
            uni.showToast({ title: '正在处理视频...', icon: 'loading' })
            
            // 创建 FileReader 读取文件
            const reader = new FileReader()
            reader.onload = (e) => {
                const data = e.target?.result
                console.log('视频读取成功，数据长度:', data?.length)
                if (data) {
                    console.log('发送视频消息')
                    this.sendVideoMessage(data, fileName)
                }
            }
            reader.onerror = (error) => {
                console.error('读取视频失败:', error)
                uni.showToast({
                    title: '读取视频失败：' + error.name,
                    icon: 'none'
                })
            }
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100)
                    console.log('读取进度:', percentComplete + '%')
                }
            }
            reader.readAsDataURL(file)
        },

        handlePastedFile(file, fileName) {
            console.log('开始读取文件:', fileName)
            uni.showToast({ title: '正在处理文件...', icon: 'loading' })
            
            // 创建 FileReader 读取文件
            const reader = new FileReader()
            reader.onload = (e) => {
                const data = e.target?.result
                console.log('文件读取成功，数据长度:', data?.length)
                if (data) {
                    console.log('发送文件消息')
                    this.sendFileMessage(data, fileName, file.size)
                }
            }
            reader.onerror = (error) => {
                console.error('读取文件失败:', error)
                uni.showToast({
                    title: '读取文件失败：' + error.name,
                    icon: 'none'
                })
            }
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100)
                    console.log('读取进度:', percentComplete + '%')
                }
            }
            reader.readAsDataURL(file)
        },

        onMessageLongPress(msg) {
            const items = ['复制', '删除', '引用']
            if (msg.isSelf && msg.status === 'sent') {
                items.push('撤回')
            }

            uni.showActionSheet({
                itemList: items,
                success: async (res) => {
                    if (res.tapIndex === 0) {
                        // 复制
                        if (msg.type === 'text') {
                            uni.setClipboardData({ data: msg.content })
                        } else if (msg.type === 'location') {
                            const locationText = `📍 ${msg.locationName}\n${msg.locationAddress}`
                            uni.setClipboardData({ data: locationText })
                        }
                    } else if (res.tapIndex === 1) {
                        // 删除（仅本地删除）
                        try {
                            await chatApi.deleteMessage(msg.id)
                        } catch (e) {
                            console.error('删除服务器消息失败', e)
                        }

                        const index = this.messages.findIndex(m => m.id === msg.id)
                        if (index > -1) {
                            this.messages.splice(index, 1)
                            this.saveMessagesToStorage()
                            uni.showToast({ title: '已删除', icon: 'none' })
                        }
                    } else if (res.tapIndex === 2) {
                        // 引用
                        this.refMessageId = msg.id
                        this.showRefSuggestion = true
                        uni.showToast({ title: '已选择引用消息', icon: 'success' })
                    } else if (res.tapIndex === 3) {
                        // 撤回（通知服务器）
                        try {
                            await chatApi.recallMessage(msg.id)

                            const index = this.messages.findIndex(m => m.id === msg.id)
                            if (index > -1) {
                                this.messages.splice(index, 1)
                                this.saveMessagesToStorage()
                                uni.showToast({ title: '已撤回', icon: 'none' })
                            }
                        } catch (e) {
                            console.error('撤回消息失败', e)
                            uni.showToast({ title: '撤回失败', icon: 'none' })
                        }
                    }
                }
            })
        },

        onMessageLongPressV2(msg) {
            const actions = [
                { key: 'copy', label: '复制' },
                { key: 'delete', label: '删除' },
                { key: 'quote', label: '引用' }
            ]
            if (msg.type === 'voice' && msg.status === 'sent') {
                actions.push({ key: 'transcribe', label: msg.voiceText ? '重新转文字' : '转文字' })
            }
            if (msg.isSelf && msg.status === 'sent') {
                actions.push({ key: 'recall', label: '撤回' })
            }

            uni.showActionSheet({
                itemList: actions.map(item => item.label),
                success: async (res) => {
                    const action = actions[res.tapIndex] && actions[res.tapIndex].key
                    if (action === 'copy') {
                        if (msg.type === 'text') {
                            uni.setClipboardData({ data: msg.content })
                        } else if (msg.type === 'location') {
                            const locationText = `位置 ${msg.locationName}\n${msg.locationAddress}`
                            uni.setClipboardData({ data: locationText })
                        } else if (msg.type === 'voice' && msg.voiceText) {
                            uni.setClipboardData({ data: msg.voiceText })
                        }
                    } else if (action === 'delete') {
                        try {
                            await chatApi.deleteMessage(msg.id)
                        } catch (e) {
                            console.error('删除消息失败:', e)
                        }

                        const index = this.messages.findIndex(m => m.id === msg.id)
                        if (index > -1) {
                            this.messages.splice(index, 1)
                            this.saveMessagesToStorage()
                            uni.showToast({ title: '已删除', icon: 'none' })
                        }
                    } else if (action === 'quote') {
                        this.refMessageId = msg.id
                        this.showRefSuggestion = true
                        uni.showToast({ title: '已选择引用消息', icon: 'success' })
                    } else if (action === 'transcribe') {
                        await this.transcribeVoiceMessage(msg)
                    } else if (action === 'recall') {
                        try {
                            await chatApi.recallMessage(msg.id)
                            const index = this.messages.findIndex(m => m.id === msg.id)
                            if (index > -1) {
                                this.messages.splice(index, 1)
                                this.saveMessagesToStorage()
                                uni.showToast({ title: '已撤回', icon: 'none' })
                            }
                        } catch (e) {
                            console.error('撤回消息失败', e)
                            uni.showToast({ title: '撤回失败', icon: 'none' })
                        }
                    }
                }
            })
        },

        async transcribeVoiceMessage(msg) {
            if (!msg || msg.type !== 'voice' || !msg.id || this.transcribingVoiceIds[msg.id]) return
            this.$set(this.transcribingVoiceIds, msg.id, true)
            try {
                const res = await chatApi.transcribeVoiceMessage(msg.id)
                const toText = String(res?.data?.toText || '').trim()
                const target = this.messages.find(item => item.id === msg.id)
                if (target) {
                    target.voiceText = toText
                    this.saveMessagesToStorage()
                }
                uni.showToast({
                    title: toText ? '转文字完成' : '未识别到文字',
                    icon: 'none'
                })
            } catch (e) {
                console.error('转写语音消息失败:', e)
                uni.showToast({ title: '转文字失败', icon: 'none' })
            } finally {
                delete this.transcribingVoiceIds[msg.id]
            }
        },

        scrollToBottom() {
            if (this.messages.length > 0) {
                this.scrollToMessage = 'msg-' + this.messages[this.messages.length - 1].id
            }
        },

        // 图片加载成功
        onImageLoad(msg) {
            // 图片加载成功
        },

        // 图片加载失败
        async onImageError(msg) {
            console.error('图片加载失败:', msg.content)
            
            // 标记加载失败
            this.$set(this.mediaLoadErrors, msg.id, { type: 'image', error: true, retryCount: 0 })
            
            // 如果是 blob URL 失效,尝试从服务器重新加载
            if (msg.content && msg.content.startsWith('blob:')) {
                console.log('检测到 blob URL 失效,尝试从服务器重新加载...')
                
                // 清除失效的缓存
                if (this.localFileCache[msg.id]) {
                    delete this.localFileCache[msg.id]
                    this.saveLocalFileCache()
                }
                
                // 从服务器加载这条消息
                try {
                    const res = await chatApi.getChatHistory({
                        chatId: this.chatId,
                        messageId: msg.id
                    })
                    
                    if (res.data && res.data.length > 0) {
                        const serverMsg = this.formatServerMessage(res.data[0])
                        // 更新消息的 content 为服务器 URL
                        const msgIndex = this.messages.findIndex(m => m.id === msg.id)
                        if (msgIndex !== -1) {
                            this.messages[msgIndex].content = serverMsg.content
                            // 清除错误标记
                            delete this.mediaLoadErrors[msg.id]
                            this.saveMessagesToStorage()
                        }
                    }
                } catch (e) {
                    console.error('从服务器重新加载图片失败:', e)
                    uni.showToast({ title: '图片加载失败', icon: 'none' })
                }
            } else {
                uni.showToast({ title: '图片加载失败', icon: 'none' })
            }
        },
        
        // 图片加载成功
        onImageLoad(msg) {
            // 清除错误标记
            if (this.mediaLoadErrors[msg.id]) {
                delete this.mediaLoadErrors[msg.id]
            }
        },

        // 统一的媒体重试方法
        async retryLoadMedia(msg, type) {
            // 检查重试次数
            const currentRetry = this.mediaLoadErrors[msg.id]?.retryCount || 0
            if (currentRetry >= 3) {
                uni.showToast({
                    title: `${type === 'image' ? '图片' : type === 'voice' ? '语音' : type === 'video' ? '视频' : '文件'}重试次数过多，请稍后再试`,
                    icon: 'none',
                    duration: 2000
                })
                return
            }

            // 更新重试次数
            this.$set(this.mediaLoadErrors, msg.id, {
                type: type,
                error: true,
                retryCount: currentRetry + 1
            })

            // 清除错误标记,准备重试
            delete this.mediaLoadErrors[msg.id]

            // 根据类型调用对应的方法重试
            try {
                switch (type) {
                    case 'image':
                        // 图片重试:尝试从服务器重新获取
                        if (msg.content && msg.content.startsWith('blob:')) {
                            // blob URL失效,从服务器重新加载
                            const res = await chatApi.getChatHistory({ 
                                chatId: this.chatId, 
                                messageId: msg.id 
                            })
                            if (res.data && res.data.length > 0) {
                                const msgIndex = this.messages.findIndex(m => m.id === msg.id)
                                if (msgIndex !== -1) {
                                    const serverMsg = res.data[0]
                                    this.messages[msgIndex].content = serverMsg.content
                                    this.saveMessagesToStorage()
                                }
                            }
                        } else {
                            // 触发图片重新加载(通过修改src)
                            const msgIndex = this.messages.findIndex(m => m.id === msg.id)
                            if (msgIndex !== -1) {
                                let originalUrl = this.messages[msgIndex].content
                                // 移除已存在的?retry=参数，防止参数堆积
                                originalUrl = originalUrl.split('?retry=')[0]
                                this.messages[msgIndex].content = ''
                                this.$nextTick(() => {
                                    this.messages[msgIndex].content = originalUrl + '?retry=' + Date.now()
                                })
                            }
                        }
                        break

                    case 'voice':
                        // 语音重试:清除当前播放状态并重新播放
                        this.playingVoiceId = null
                        if (this.innerAudioContext) {
                            this.innerAudioContext.stop()
                        }
                        await this.$nextTick()
                        this.playVoice(msg)
                        break

                    case 'video':
                        // 视频重试:清除缓存并重新下载
                        if (this.localFileCache[msg.id]) {
                            delete this.localFileCache[msg.id]
                            this.saveLocalFileCache()
                        }
                        await this.playVideo(msg.content, msg)
                        break

                    case 'file':
                        // 文件重试:清除缓存并重新下载
                        if (this.localFileCache[msg.id]) {
                            delete this.localFileCache[msg.id]
                            this.saveLocalFileCache()
                        }
                        await this.openFile(msg)
                        break

                    default:
                        console.warn('未知的媒体类型:', type)
                }
            } catch (error) {
                console.error(`${type}重试失败:`, error)
                // 重试失败,恢复错误标记
                this.$set(this.mediaLoadErrors, msg.id, {
                    type: type,
                    error: true,
                    retryCount: currentRetry + 1
                })
            }
        },

        // 用户头像加载失败,清除无效头像,强制生成新头像
        onUserAvatarError() {
            // 将头像设置为空,触发重新渲染,这次会生成头像
            this.userAvatar = ''
        },

        // ==================== 工具方法 ====================
        shouldShowTime(index) {
            if (index === 0) return true

            const current = this.visibleMessages[index]
            const prev = this.visibleMessages[index - 1]

            return current.timestamp - prev.timestamp > 300000 // 5分钟
        },

        formatTime(timestamp) {
            const date = new Date(timestamp)
            const now = new Date()
            const diff = now - date

            if (diff < 86400000 && date.getDate() === now.getDate()) {
                return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            } else if (diff < 172800000) {
                return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            } else {
                return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) +
                    ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            }
        },

        formatDuration(seconds) {
            const mins = Math.floor(seconds / 60)
            const secs = Math.floor(seconds % 60)
            return `${mins}:${secs.toString().padStart(2, '0')}`
        },

        formatFileSize(bytes) {
            if (!bytes) return '未知大小'
            if (bytes < 1024) return bytes + ' B'
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
        },

        getFileIcon(fileName) {
            if (!fileName) return '📄'

            const ext = fileName.split('.').pop().toLowerCase()
            const icons = {
                pdf: '📕',
                doc: '📘', docx: '📘',
                xls: '📗', xlsx: '📗',
                ppt: '📙', pptx: '📙',
                txt: '📝',
                zip: '📦', rar: '📦', '7z': '📦',
                mp3: '🎵', wav: '🎵', flac: '🎵',
                mp4: '🎬', avi: '🎬', mkv: '🎬',
                jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️'
            }

            return icons[ext] || '📄'
        },

        // ==================== 消息引用相关 ====================
        // 获取被引用消息的预览文本
        getRefMessagePreview(refId) {
            const refMsg = this.messages.find(m => m.id === refId)
            if (!refMsg) return '[消息已删除]'
            
            switch (refMsg.type) {
                case 'text':
                    return refMsg.content.substring(0, 50) + (refMsg.content.length > 50 ? '...' : '')
                case 'image':
                    return '[图片]'
                case 'video':
                    return '[视频]'
                case 'voice':
                    return `[语音 ${refMsg.duration}秒]`
                case 'file':
                    return `[文件 ${refMsg.fileName}]`
                case 'location':
                    return `[位置 ${refMsg.locationName}]`
                default:
                    return '[消息]'
            }
        },

        // 获取被引用消息的发送者名称
        getRefMessageSenderName(refId) {
            const refMsg = this.messages.find(m => m.id === refId)
            if (!refMsg) return '用户'
            return refMsg.isSelf ? '你' : (this.otherNote || this.otherUsername || '对方')
        },

        // 获取被引用消息的类型，用于样式判断
        getRefMessageType(refId) {
            const refMsg = this.messages.find(m => m.id === refId)
            if (!refMsg) return 'unknown'
            return refMsg.isSelf ? 'self' : 'other'
        },

        // 清除当前选择的引用消息
        clearRefMessage() {
            this.refMessageId = null
            this.showRefSuggestion = false
        },

        // 跳转到被引用的消息
        jumpToRefMessage(refId) {
            const refMsg = this.messages.find(m => m.id === refId)
            if (!refMsg) {
                uni.showToast({ title: '消息已删除', icon: 'none' })
                return
            }

            // 找到消息在列表中的索引
            const messageIndex = this.messages.findIndex(m => m.id === refId)
            if (messageIndex === -1) {
                uni.showToast({ title: '消息未找到', icon: 'none' })
                return
            }

            // 在下一帧检查消息位置并滚动
            this.$nextTick(() => {
                setTimeout(() => {
                    const query = uni.createSelectorQuery().in(this)
                    
                    // 同时获取目标消息和 scroll-view 的位置信息
                    query.select(`#message-${refId}`).boundingClientRect()
                    query.selectViewport().scrollOffset()
                    
                    query.exec((results) => {
                        if (results && results[0]) {
                            const messageRect = results[0]
                            const scrollOffset = results[1]
                            
                            // 获取 scroll-view 的高度（通常是视口高度减去输入框等高度）
                            const viewportQuery = uni.createSelectorQuery().in(this)
                            viewportQuery.select('.message-list').boundingClientRect()
                            viewportQuery.exec((viewportResults) => {
                                if (viewportResults && viewportResults[0]) {
                                    const scrollViewRect = viewportResults[0]
                                    const scrollViewHeight = scrollViewRect.height
                                    const scrollViewTop = scrollViewRect.top
                                    
                                    // 计算消息相对于 scroll-view 的位置
                                    const messageTop = messageRect.top - scrollViewTop
                                    const messageBottom = messageTop + messageRect.height
                                    
                                    // 判断消息是否在可见范围内（留出顶部和底部的缓冲区）
                                    const topBuffer = 100
                                    const bottomBuffer = 100
                                    
                                    const isInView = messageTop >= -topBuffer && messageBottom <= scrollViewHeight + bottomBuffer
                                    
                                    if (!isInView) {
                                        // 消息不在可见范围，需要滚动
                                        // 直接使用 :scroll-into-view 进行垂直锚点跳转
                                        this.scrollToMessage = '' // 先清空，确保能触发变更
                                        this.$nextTick(() => {
                                            this.scrollToMessage = `message-${refId}`
                                            
                                            // 1秒后清空锚点，防止影响正常的滚动交互
                                            setTimeout(() => {
                                                this.scrollToMessage = ''
                                            }, 1000)
                                        })
                                    }
                                }
                            })
                        }
                    })

                    // 高亮该消息（闪烁效果）
                    this.highlightMessageId = refId
                    setTimeout(() => {
                        this.highlightMessageId = null
                    }, 2000) // 2秒后取消高亮
                }, 50)
            })
        },

        // 生成基于用户名的头像 URL (使用第三方服务)
        generateAvatarFromName(name, isOther = false) {
            if (!name) {
                return 'https://ui-avatars.com/api/?name=U&background=999999&color=fff&size=100'
            }
            
            // 获取用户名首字符
            const firstChar = name.charAt(0).toUpperCase()
            
            // 根据用户名生成颜色 (简单哈希)
            const colors = [
                'FF6B6B', '4ECDC4', '45B7D1', 'FFA07A', 
                '98D8C8', '6C5CE7', 'A29BFE', 'FD79A8',
                'FDCB6E', '00B894', '00CEC9', '0984E3'
            ]
            let hash = 0
            for (let i = 0; i < name.length; i++) {
                hash = name.charCodeAt(i) + ((hash << 5) - hash)
            }
            const colorIndex = Math.abs(hash) % colors.length
            const bgColor = colors[colorIndex]
            
            // 使用在线头像生成服务
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(firstChar)}&background=${bgColor}&color=fff&size=100&font-size=0.4&bold=true`
            
            return avatarUrl
        },

        // 获取用户头像 (如果没有则生成)
        // 已改为 computed 属性 userAvatarUrl，此方法已废弃（保留为向后兼容）
        getUserAvatar() {
            return this.userAvatarUrl
        },

        // 获取对方头像 (如果没有则生成)
        // 已改为 computed 属性 otherAvatarUrl，此方法已废弃（保留为向后兼容）
        getOtherAvatar() {
            return this.otherAvatarUrl
        },

        // ==================== 已移至 computed 的方法（用于向后兼容） ====================
        
        // 原始的用户头像生成逻辑（已移至 computed.userAvatarUrl）
        _getUserAvatarOld() {
            // 获取用户信息
            const userInfo = uni.getStorageSync('userInfo')
            const username = userInfo?.username || userInfo?.nickname || '用户'
            
            // 检查是否有有效的真实头像
            if (this.userAvatar && 
                typeof this.userAvatar === 'string' &&
                this.userAvatar.trim() !== '' && 
                this.userAvatar !== 'null' &&
                this.userAvatar !== 'undefined' &&
                !this.userAvatar.includes('default-avatar')) {
                // 使用新的头像工具处理 (支持 Base64)
                const avatarUrl = getAvatarUrl(this.userAvatar, baseUrl)
                return avatarUrl
            }
            

            // 生成基于用户名的头像
            const generatedUrl = this.generateAvatarFromName(username, false)
            console.log('生成用户名头像:', generatedUrl)
            return generatedUrl
        },

        // 获取对方头像 (如果没有则生成)
        getOtherAvatar() {
            // 检查是否有有效的真实头像
            if (this.otherAvatar && 
                typeof this.otherAvatar === 'string' &&
                this.otherAvatar.trim() !== '' && 
                this.otherAvatar !== 'null' &&
                this.otherAvatar !== 'undefined' &&
                !this.otherAvatar.includes('default-avatar')) {
                // 使用新的头像工具处理 (支持 Base64)
                const avatarUrl = getAvatarUrl(this.otherAvatar, baseUrl)
                return avatarUrl
            }
            // 生成基于聊天标题的头像
            const generatedUrl = this.generateAvatarFromName(this.chatTitle, true)
            return generatedUrl
        },

        // 获取关系显示文本
        getRelationshipLabel(key) {
            return chatRelationshipLabels[key] || '未设置'
        },

        getBubbleClass(msg) {
            return {
                'bubble-text': msg.type === 'text',
                'bubble-image': msg.type === 'image',
                'bubble-voice': msg.type === 'voice',
                'bubble-video': msg.type === 'video',
                'bubble-file': msg.type === 'file',
                'bubble-location': msg.type === 'location'
            }
        },

        // 打开位置
        openLocation(msg) {
            if (msg.latitude && msg.longitude) {
                // #ifdef H5
                // H5端跳转到自定义地图页面查看位置
                uni.navigateTo({
                    url: `/pages/map/map?mode=view&lat=${msg.latitude}&lng=${msg.longitude}&name=${encodeURIComponent(msg.locationName || '位置')}&address=${encodeURIComponent(msg.locationAddress || '')}`
                })
                // #endif
                
                // #ifndef H5
                // APP端使用原生地图查看
                uni.openLocation({
                    latitude: msg.latitude,
                    longitude: msg.longitude,
                    name: msg.locationName || '位置',
                    address: msg.locationAddress || ''
                })
                // #endif
            } else {
                uni.showToast({
                    title: '位置信息不完整',
                    icon: 'none'
                })
            }
        }
    }
}
</script>

<style lang="scss" scoped>
page {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.chat-container {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    width: 100vw;
    margin: 0;
    padding: 0;
    overflow: hidden;
    transition: all 0.3s ease, color 0.3s ease;

    // ===== 浅色主题（默认）=====
    --nav-bg: linear-gradient(135deg, #5B8DEE 0%, #3B6FD0 100%);
    --nav-text: #fff;
    --bg-primary: linear-gradient(180deg, #f8f9fa 0%, #f1f3f4 100%);
    --bg-secondary: #fff;
    --border-color: rgba(0,0,0,0.08);
    --text-primary: #202124;
    --text-secondary: #5f6368;
    --accent-color: #5B8DEE;
    --msg-bubble-self: #5B8DEE;
    --msg-bubble-other: #e8e8e8;
    --msg-text-self: #fff;
    --msg-text-other: #202124;
    --card-shadow: 0 2px 8px rgba(0,0,0,0.06);
    --input-bg: var(--bg-secondary);
    --hover-bg: rgba(91, 141, 238, 0.1);
    --nav-border: rgba(0,0,0,0.06);
    --nav-shadow: 0 2px 12px rgba(0,0,0,0.08);

    // ===== 深色主题 =====
    &.dark-theme {
        --nav-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        --nav-text: #40e0ff;
        --bg-primary: linear-gradient(180deg, #0f0f1e 0%, #0a0a14 100%);
        --bg-secondary: #1a1a2e;
        --border-color: rgba(64, 224, 255, 0.15);
        --text-primary: #e8e8e8;
        --text-secondary: #9ca3af;
        --accent-color: #40e0ff;
        --msg-bubble-self: #40e0ff;
        --msg-bubble-other: #2d3748;
        --msg-text-self: #0a0a14;
        --msg-text-other: #e8e8e8;
        --card-shadow: 0 2px 12px rgba(0,0,0,0.3);
        --input-bg: #0b1220;
        --hover-bg: rgba(64, 224, 255, 0.1);
        --nav-border: rgba(64, 224, 255, 0.08);
        --nav-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
}

// ==================== 顶部导航 ====================
.chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    padding: 10px 15px;
    padding-top: calc(10px + var(--status-bar-height, 20px));
    background: var(--nav-bg);
    width: 100%;
    box-sizing: border-box;
    position: fixed;
    top: 0px;
    left: 0;
    right: 0;
    z-index: 100;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-bottom: none;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);

    &.dark-theme {
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }

    .header-left,
    .header-right {
        width: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;

        &:active {
            transform: scale(0.95);
        }
    }

    .header-left {
        justify-content: flex-start;;
    }

    .header-right {
        justify-content: flex-end;
    }

    .back-icon {
        font-size: 50rpx;
        color: var(--nav-text);
        font-weight: bold;
        transition: all 0.2s ease;
    }

    .more-icon {
        font-size: 40rpx;
        color: var(--nav-text);
        transition: all 0.2s ease;
        filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1));
    }

    .header-center {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .chat-title {
        font-size: 17px;
        font-weight: 600;
        color: var(--nav-text);
        text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        transition: all 0.3s ease;
    }
}

// ==================== 拖拽提示 ====================
.drag-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(91, 141, 238, 0.15);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    pointer-events: none;
}

.drag-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20rpx;
    background: var(--bg-secondary);
    border: 3rpx dashed var(--accent-color);
    border-radius: 20rpx;
    padding: 60rpx 80rpx;
    box-shadow: 0 10rpx 40rpx rgba(91, 141, 238, 0.25);
    animation: dragPulse 1s ease-in-out infinite;
}

.drag-icon {
    font-size: 100rpx;
    animation: dragBounce 1s ease-in-out infinite;
}

.drag-text {
    font-size: 32rpx;
    color: var(--accent-color);
    font-weight: 600;
    letter-spacing: 1rpx;
}

@keyframes dragPulse {
    0%, 100% {
        box-shadow: 0 10rpx 40rpx rgba(91, 141, 238, 0.25);
    }
    50% {
        box-shadow: 0 10rpx 50rpx rgba(91, 141, 238, 0.4);
    }
}

@keyframes dragBounce {
    0%, 100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-20rpx);
    }
}

// ==================== 消息列表 ====================
.message-list {
    flex: 1;
    padding: 20rpx 15rpx;
    margin-top: calc(44px);
    overflow-y: auto;
    background: var(--bg-primary);
    transition: all 0.3s ease;
    width: 100%;
    box-sizing: border-box;
}

.load-more {
    text-align: center;
    padding: 20rpx 0;

    .load-more-text {
        font-size: 24rpx;
        color: #999;
    }
}

.empty-tip {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 100rpx 0;

    .empty-text {
        font-size: 28rpx;
        color: #999;
    }
}

.time-divider {
    text-align: center;
    padding: 20rpx 0;

    .time-text {
        font-size: 22rpx;
        color: #999;
        background: rgba(0, 0, 0, 0.05);
        padding: 8rpx 20rpx;
        border-radius: 20rpx;
    }
}

/* 系统消息样式(撤回提示等) */
.system-message {
    text-align: center;
    padding: 15rpx 0;
    
    .system-text {
        font-size: 24rpx;
        color: #999;
        background: rgba(0, 0, 0, 0.03);
        padding: 10rpx 24rpx;
        border-radius: 6rpx;
        display: inline-block;
    }
}

.message-item {
    margin-bottom: 30rpx;
}

/* 系统消息不需要底部间距 */
.message-item.message-system {
    margin-bottom: 10rpx;
}

.message-content {
    display: flex;
    align-items: flex-start;
    transition: background-color 0.3s ease;
    
    &.message-highlighted {
        animation: pulse-highlight 0.6s ease-in-out;
    }
}

@keyframes pulse-highlight {
    0%, 100% {
        background-color: transparent;
    }
    50% {
        background-color: rgba(7, 193, 96, 0.2);
    }
}

.message-self .message-content {
    justify-content: flex-end; // 改用 justify-content 让内容靠右
}

.avatar {
    width: 80rpx;
    height: 80rpx;
    border-radius: 12rpx;
    flex-shrink: 0;
}

.bubble-wrapper {
    max-width: 60%; // 从 65% 减小到 60%,给头像留更多空间
    margin: 0 12rpx; // 进一步减小左右间距
    display: flex;
    flex-direction: column;
    position: relative; // 为撤回标识定位
}

.message-self .bubble-wrapper {
    align-items: flex-end;
}

/* 撤回标识(仅管理员可见) */
.withdraw-badge {
    position: absolute;
    top: -24rpx;
    right: 0;
    background: rgba(255, 87, 51, 0.9);
    color: #fff;
    font-size: 20rpx;
    padding: 4rpx 12rpx;
    border-radius: 8rpx;
    z-index: 10;
    box-shadow: 0 2rpx 8rpx rgba(255, 87, 51, 0.3);
    
    .withdraw-text {
        color: #fff;
    }
}

.message-self .withdraw-badge {
    right: auto;
    left: 0;
}

/* 撤回消息的气泡样式 */
.message-bubble.withdraw-message {
    opacity: 0.7;
    border: 2rpx dashed rgba(255, 87, 51, 0.5);
}

.message-bubble {
    border-radius: 20rpx;
    overflow: hidden;
    position: relative;
    transition: all 0.3s ease;
}

// 文本气泡
.bubble-text {
    padding: 20rpx 28rpx;
    background: var(--bg-secondary);
    box-shadow: var(--card-shadow);
    transition: all 0.3s ease;
}

.message-self .bubble-text {
    background: var(--msg-bubble-self);

    .text-content {
        color: var(--msg-text-self);
    }
}

.text-content {
    font-size: 30rpx;
    line-height: 1.6;
    color: var(--msg-text-other);
    word-break: break-all;
    transition: all 0.3s ease;
}

// 图片气泡
.bubble-image {
    background: transparent;

    .image-content {
        position: relative;
        border-radius: 20rpx;
        overflow: hidden;
        max-height: 60dvh; /* 防止超长图撑破布局，保持比例裁剪 */
    }

    .msg-image {
        max-width: 400rpx;
        min-width: 200rpx;
        /* max-height: 400rpx;  移除此属性以修复 widthFix 模式下的挤扁问题 */
        border-radius: 20rpx;
        
        &.image-error {
            opacity: 0.5;
            filter: grayscale(50%);
        }
    }
    
    // 图片加载失败遮罩
    .media-error-mask {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 20rpx;
        
        .error-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8rpx;
            color: #fff;
        }
        
        .error-icon {
            font-size: 40rpx;
        }
        
        .error-text {
            font-size: 22rpx;
            opacity: 0.9;
        }
        
        .retry-btn {
            margin-top: 6rpx;
            padding: 6rpx 16rpx;
            background: rgba(255, 255, 255, 0.25);
            border-radius: 16rpx;
            font-size: 22rpx;
            border: 1px solid rgba(255, 255, 255, 0.4);
        }
    }
}

// 语音气泡
.bubble-voice {
    padding: 20rpx 28rpx;
    background: #fff;
    min-width: 150rpx;

    .voice-content {
        display: flex;
        align-items: center;
        gap: 16rpx;
        
        &.voice-error {
            opacity: 0.7;
        }
    }

    .voice-icon {
        display: flex;
        align-items: flex-end;
        height: 36rpx;
        gap: 4rpx;
    }
    
    .voice-error-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        
        text {
            font-size: 32rpx;
        }
    }

    .voice-wave {
        width: 6rpx;
        background: #667eea;
        border-radius: 3rpx;

        &:nth-child(1) {
            height: 12rpx;
        }

        &:nth-child(2) {
            height: 24rpx;
        }

        &:nth-child(3) {
            height: 18rpx;
        }
    }

    .playing .voice-wave {
        animation: wave 0.5s ease-in-out infinite alternate;

        &:nth-child(2) {
            animation-delay: 0.1s;
        }

        &:nth-child(3) {
            animation-delay: 0.2s;
        }
    }

    .voice-duration {
        font-size: 28rpx;
        color: #666;
    }

    .voice-transcript {
        margin-top: 12rpx;
        padding-top: 12rpx;
        border-top: 1rpx solid rgba(102, 102, 102, 0.12);
    }

    .voice-transcript-label {
        display: block;
        font-size: 20rpx;
        color: #999;
        margin-bottom: 6rpx;
    }

    .voice-transcript-text {
        display: block;
        font-size: 24rpx;
        line-height: 1.5;
        color: #333;
        word-break: break-all;
    }
}

.message-self .bubble-voice {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    flex-direction: row-reverse;

    .voice-wave {
        background: #fff;
    }

    .voice-duration {
        color: #fff;
    }

    .voice-transcript {
        border-top-color: rgba(255, 255, 255, 0.18);
    }

    .voice-transcript-label {
        color: rgba(255, 255, 255, 0.72);
    }

    .voice-transcript-text {
        color: #fff;
    }
}

@keyframes wave {
    from {
        transform: scaleY(1);
    }

    to {
        transform: scaleY(1.5);
    }
}

// 视频气泡
.bubble-video {
    .video-content {
        position: relative;
        border-radius: 20rpx;
        overflow: hidden;
    }

    .video-thumbnail {
        width: 400rpx;
        height: 300rpx;
        
        &.media-error {
            opacity: 0.3;
        }
    }

    .play-btn {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80rpx;
        height: 80rpx;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    // 视频加载失败覆盖层
    .media-error-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16rpx;
        color: #fff;
        
        .error-icon {
            font-size: 56rpx;
        }
        
        .error-text {
            font-size: 26rpx;
        }
        
        .retry-btn-small {
            margin-top: 8rpx;
            padding: 6rpx 16rpx;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 16rpx;
            font-size: 22rpx;
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
    }

    .play-icon {
        color: #fff;
        font-size: 30rpx;
        margin-left: 6rpx;
    }

    .video-duration {
        position: absolute;
        bottom: 10rpx;
        right: 10rpx;
        font-size: 22rpx;
        color: #fff;
        background: rgba(0, 0, 0, 0.5);
        padding: 4rpx 12rpx;
        border-radius: 8rpx;
    }
}

// 文件气泡
.bubble-file {
    padding: 20rpx;
    background: #fff;

    .file-content {
        display: flex;
        align-items: center;
        gap: 20rpx;
        
        &.file-error {
            opacity: 0.7;
        }
    }

    .file-icon {
        width: 80rpx;
        height: 80rpx;
        background: #f5f5f5;
        border-radius: 12rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40rpx;
    }

    .file-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8rpx;
        min-width: 200rpx;
    }

    .file-name {
        font-size: 28rpx;
        color: #333;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .file-size {
        font-size: 22rpx;
        color: #999;
    }
    
    .file-error-text {
        font-size: 22rpx;
        color: #f56c6c;
    }
}

// 位置气泡
.bubble-location {
    padding: 20rpx;
    background: #fff;
    min-width: 300rpx;

    .location-content {
        display: flex;
        align-items: center;
        gap: 20rpx;
    }

    .location-icon {
        font-size: 50rpx;
        flex-shrink: 0;
    }

    .location-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8rpx;
    }

    .location-name {
        font-size: 30rpx;
        color: #333;
        font-weight: 500;
    }

    .location-address {
        font-size: 24rpx;
        color: #999;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.message-self .bubble-location {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

    .location-name {
        color: #fff;
    }

    .location-address {
        color: rgba(255, 255, 255, 0.8);
    }
}

// 发送状态
.send-status {
    margin-top: 8rpx;

    .status-sending {
        font-size: 20rpx;
        color: #999;
    }

    .status-failed {
        font-size: 20rpx;
        color: #f44;
    }
}

.bottom-placeholder {
    height: 0; // 移除底部占位
}

// ==================== 底部输入区域 ====================
.input-area {
    position: relative;
    z-index: 100;
    background: var(--bg-secondary);
    border-top: 1rpx solid transparent;
    padding-bottom: max(env(safe-area-inset-bottom), 0px);
    width: 100%;
    box-sizing: border-box;
    transition: all 0.3s ease;
    flex-shrink: 0;

    &:not(.dark-theme) {
        border-top-color: var(--border-color);
    }
}

// 引用消息提示
.ref-tip-container {
    padding: 0rpx 20rpx;
    background: linear-gradient(135deg, rgba(7, 193, 96, 0.15) 0%, rgba(7, 193, 96, 0.08) 100%);
    border-bottom: 3rpx solid #07c160;
    box-shadow: 0 2rpx 8rpx rgba(7, 193, 96, 0.12);
}

.ref-tip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12rpx;
    padding: 8rpx 0;
}

.ref-tip-content {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-width: 0;
}

.ref-tip-label {
    color: #07c160;
    font-weight: 700;
    font-size: 26rpx;
    white-space: nowrap;
    background: rgba(7, 193, 96, 0.1);
    padding: 4rpx 10rpx;
    border-radius: 8rpx;
}

.ref-tip-text {
    color: #333;
    font-size: 26rpx;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ref-tip-close {
    color: #07c160;
    font-size: 32rpx;
    padding: 4rpx 8rpx;
    cursor: pointer;
    transition: transform 0.2s ease;
    
    &:active {
        transform: scale(0.9);
    }
}

// 消息气泡中的引用
.ref-message-container {
    padding: 10rpx 12rpx;
    margin-bottom: 12rpx;
    border-left: 4rpx solid #07c160;
    padding-left: 12rpx;
    background: rgba(7, 193, 96, 0.08);
    border-radius: 6rpx;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:active {
        background: rgba(7, 193, 96, 0.15);
        transform: scale(0.98);
    }
    
    &:hover {
        background: rgba(7, 193, 96, 0.12);
    }
}

.ref-message-item {
    display: flex;
    align-items: center;
    gap: 8rpx;
    font-size: 24rpx;
    line-height: 1.4;
    
    &.self {
        color: #555;
    }
    
    &.other {
        color: #555;
    }
}

.ref-label {
    font-weight: 700;
    color: #07c160;
    flex-shrink: 0;
}

.ref-content {
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.input-bar {
    display: flex;
    align-items: flex-end;
    padding: 16rpx 20rpx;
    gap: 16rpx;
}

.input-btn {
    width: 70rpx;
    height: 70rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform 0.2s ease;

    &:active {
        transform: scale(0.95);
    }

    .btn-icon {
        font-size: 44rpx;
        color: var(--accent-color);
    }
}

.input-wrapper {
    flex: 1;
    background: var(--input-bg);
    border-radius: 36rpx;
    padding: 16rpx 28rpx;
    min-height: 72rpx;
    max-height: 200rpx;
    display: flex;
    align-items: center;
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
    box-shadow: var(--card-shadow);
}

.text-input {
    width: 100%;
    font-size: 30rpx;
    line-height: 1.5;
    max-height: 160rpx;
    color: var(--text-primary);
    background: transparent;
    transition: all 0.3s ease;

    &::placeholder {
        color: var(--text-secondary);
    }
}

.voice-btn {
    flex: 1;
    height: 72rpx;
    background: var(--input-bg);
    border-radius: 36rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    border: 1px solid var(--border-color);
    color: var(--text-primary);

    &.recording {
        background: var(--accent-color);
        color: var(--msg-text-self);
    }

    &.cancel {
        background: #ffcccc;
        color: #c00;
    }

    .voice-btn-text {
        font-size: 28rpx;
        color: #333;
    }
}

.send-btn {
    height: 70rpx;
    padding: 0 30rpx;
    background: var(--accent-color);
    border-radius: 35rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: var(--card-shadow);

    &:active {
        transform: scale(0.95);
        opacity: 0.9;
    }

    .send-text {
        font-size: 28rpx;
        color: #fff;
        font-weight: 600;
        transition: all 0.3s ease;
    }
}

// 表情面板
.emoji-panel {
    height: 500rpx;
    background: var(--bg-secondary);
    border-top: 1rpx solid var(--border-color);
    transition: all 0.3s ease;
    position: relative;
}

.emoji-scroll {
    height: 100%;
    padding: 20rpx;
}

.emoji-grid {
    display: flex;
    flex-wrap: wrap;
}

.emoji-item {
    width: 12.5%;
    height: 80rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 44rpx;
    transition: all 0.2s ease;
    border-radius: 8rpx;

    &:active {
        background: var(--hover-bg, rgba(7, 193, 96, 0.1));
    }
}

// 退格按钮 - 悬浮在表情面板右侧
.emoji-delete-btn {
    position: absolute;
    right: 0;
    top: 20%;
    transform: translateY(-50%);
    width: 80rpx;
    height: 60rpx;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 40rpx 0 0 40rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: -4rpx 4rpx 12rpx rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    z-index: 10;

    &:active {
        transform: translateY(-50%) scale(0.95);
        box-shadow: -2rpx 2rpx 8rpx rgba(0, 0, 0, 0.1);
    }
}

.delete-icon {
    font-size: 44rpx;
    color: white;
    font-weight: bold;
}

// 更多功能面板
.more-panel {
    padding: 40rpx 30rpx;
    background: var(--bg-secondary);
    border-top: 1rpx solid var(--border-color);
    transition: all 0.3s ease;
}

.more-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 40rpx;
}

.more-item {
    width: calc(25% - 30rpx);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16rpx;
    transition: all 0.2s ease;

    &:active {
        transform: scale(0.95);
    }

    .more-text {
        font-size: 24rpx;
        color: var(--text-primary);
        transition: all 0.3s ease;
    }
}

.more-icon-wrapper {
    width: 100rpx;
    height: 100rpx;
    border-radius: 24rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: var(--card-shadow);

    .more-icon {
        font-size: 44rpx;
    }
}

.more-text {
    font-size: 24rpx;
    color: #666;
}

// ==================== 语音录制浮层 ====================
.voice-recording-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
}

.recording-panel {
    width: 300rpx;
    height: 300rpx;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 30rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20rpx;

    &.cancel-mode {
        background: rgba(244, 67, 54, 0.9);
    }
}

.recording-animation {
    position: relative;
    width: 120rpx;
    height: 120rpx;
    display: flex;
    align-items: center;
    justify-content: center;
}

.wave-circle {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2rpx solid rgba(255, 255, 255, 0.3);
    animation: pulse 1.5s ease-out infinite;

    &:nth-child(2) {
        animation-delay: 0.5s;
    }

    &:nth-child(3) {
        animation-delay: 1s;
    }
}

@keyframes pulse {
    0% {
        transform: scale(0.5);
        opacity: 1;
    }

    100% {
        transform: scale(1.5);
        opacity: 0;
    }
}

.mic-icon {
    font-size: 60rpx;
    z-index: 1;
}

.recording-tip {
    font-size: 26rpx;
    color: #fff;
}

.recording-duration {
    font-size: 36rpx;
    color: #fff;
    font-weight: bold;
}

// ==================== 视频播放弹窗 ====================
.video-player-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.video-player {
    width: 100%;
    max-height: 100%;
}

// ==================== 上传进度条 ====================
// 视频上传进度覆盖层
.upload-progress {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20rpx;
    border-radius: 20rpx;
    z-index: 10;

    .progress-bar {
        width: 260rpx;
        height: 8rpx;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4rpx;
        overflow: hidden;

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.3s ease;
            border-radius: 4rpx;
        }
    }

    .progress-text {
        font-size: 24rpx;
        color: #fff;
        font-weight: 500;
    }
}

// 文件上传进度内联显示
.upload-progress-inline {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-top: 8rpx;

    .progress-bar-small {
        flex: 1;
        height: 6rpx;
        background: #e5e5e5;
        border-radius: 3rpx;
        overflow: hidden;

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.3s ease;
            border-radius: 3rpx;
        }
    }

    .progress-text-small {
        font-size: 20rpx;
        color: #999;
        flex-shrink: 0;
        min-width: 60rpx;
        text-align: right;
    }
}

// ==================== 设置面板 ====================
.settings-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    z-index: 999;
}

.settings-content {
    background: #fff;
    border-radius: 32rpx 32rpx 0 0;
    max-height: 80vh;
    overflow-y: auto;
    width: 100%;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from {
        transform: translateY(100%);
    }
    to {
        transform: translateY(0);
    }
}

.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 30rpx 40rpx;
    border-bottom: 1rpx solid #f0f0f0;

    .settings-title {
        font-size: 36rpx;
        font-weight: 600;
        color: #333;
    }

    .close-btn {
        font-size: 60rpx;
        color: #999;
        line-height: 1;
    }
}

.user-info-section {
    display: flex;
    align-items: center;
    padding: 40rpx;
    border-bottom: 1rpx solid #f0f0f0;

    .user-avatar-large {
        width: 120rpx;
        height: 120rpx;
        border-radius: 16rpx;
        margin-right: 30rpx;
    }

    .user-details {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12rpx;

        .user-name-large {
            font-size: 36rpx;
            font-weight: 600;
            color: #333;
        }

        .user-id-text {
            font-size: 26rpx;
            color: #999;
        }
    }
}

.settings-list {
    padding: 20rpx 0;
}

.setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 30rpx 40rpx;
    background: #fff;
    border-bottom: 1rpx solid #f5f5f5;

    &:active {
        background: #f8f8f8;
    }

    &.danger {
        .danger-text {
            color: #ff4444;
        }
    }

    .setting-left {
        display: flex;
        align-items: center;
        flex: 1;

        .setting-icon {
            font-size: 40rpx;
            margin-right: 20rpx;
        }

        .setting-label {
            font-size: 32rpx;
            color: #333;
        }
    }

    .setting-right {
        display: flex;
        align-items: center;
        gap: 12rpx;

        .setting-value {
            font-size: 28rpx;
            color: #999;
        }

        .arrow-icon {
            font-size: 40rpx;
            color: #ccc;
        }
    }
}

// 编辑备注弹窗
.edit-note-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.edit-note-content {
    background: #fff;
    border-radius: 24rpx;
    width: 600rpx;
    padding: 40rpx;

    .edit-note-title {
        font-size: 36rpx;
        font-weight: 600;
        color: #333;
        text-align: center;
        margin-bottom: 40rpx;
    }

    .edit-note-input {
        width: 100%;
        height: 70rpx;
        padding: 0 15rpx;
        margin: 20rpx 0;
        border: 2rpx solid #e5e5e5;
        border-radius: 12rpx;
        font-size: 30rpx;
        margin-bottom: 40rpx;
    }

    .edit-note-buttons {
        display: flex;
        gap: 20rpx;

        button {
            flex: 1;
            height: 80rpx;
            line-height: 80rpx;
            border-radius: 12rpx;
            font-size: 30rpx;
            border: none;

            &.cancel-btn {
                background: #f5f5f5;
                color: #666;
            }

            &.confirm-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
            }
        }
    }
}

// 图片预览面板 - 仿系统级沉浸式体验
.image-preview-modal {
    position: fixed;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #000;
}

.preview-bg-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
}

.preview-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    z-index: 10;
}

// 顶部栏
.preview-header {
    height: 100rpx;
    padding: var(--status-bar-height) 30rpx 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent);
    z-index: 100;

    .header-placeholder { width: 70rpx; }
}

.preview-close-box {
    width: 70rpx;
    height: 70rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    
    .close-icon {
        color: #fff;
        font-size: 32rpx;
    }
}

.count-tag {
    color: #fff;
    font-size: 32rpx;
    font-weight: 500;
}

// 内容区域
.preview-content-box {
    flex: 1;
    width: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.preview-img-main {
    width: 100%;
    height: 100%;
}

// 加载遮罩
.loading-overlay {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(0,0,0,0.3);
    padding: 30rpx;
    border-radius: 20rpx;

    .loading-spinner {
        width: 60rpx;
        height: 60rpx;
        border: 4rpx solid rgba(255,255,255,0.3);
        border-top-color: #07c160;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20rpx;
    }
    
    .loading-text {
        color: #fff;
        font-size: 24rpx;
    }
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

// 导航
.preview-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 120rpx;
    height: 200rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    
    .nav-symbol {
        color: rgba(255, 255, 255, 0.4);
        font-size: 120rpx;
    }

    &:active {
        opacity: 0.7;
    }
}
.preview-prev { left: 0; }
.preview-next { right: 0; }

// 底部栏
.preview-bottom-bar {
    padding-bottom: calc(var(--window-bottom) + 60rpx);
    padding-top: 40rpx;
    background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
}

.bar-inner {
    display: flex;
    justify-content: center;
}

.action-btn-primary {
    background: rgba(7, 193, 96, 0.9);
    padding: 16rpx 40rpx;
    border-radius: 100rpx;
    backdrop-filter: blur(10px);
    
    .btn-inner-text {
        color: #fff;
        font-size: 28rpx;
        font-weight: 500;
    }
}

.status-badge {
    color: rgba(255, 255, 255, 0.7);
    font-size: 24rpx;
    background: rgba(255, 255, 255, 0.1);
    padding: 8rpx 20rpx;
    border-radius: 10rpx;
}
</style>
