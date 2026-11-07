<template>
    <view class="chat-container" :class="{ 'dark-theme': isDarkTheme }" @drop="onDrop" @dragover.prevent="onDragOver" @dragleave="onDragLeave"
        :style="{ 'background': isDragOver ? 'rgba(7, 193, 96, 0.1)' : 'transparent', 'transition': 'background 0.3s ease', '--chat-status-bar-height': statusBarHeight + 'px' }">
    <!-- #ifdef APP-PLUS -->
    <AppConfirmDialog ref="appConfirmDialog" />
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <canvas type="2d" id="upload-image-canvas" style="position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;" />
    <!-- #endif -->
        <!-- 拖拽提示 -->
        <view v-if="isDragOver" class="drag-overlay">
            <view class="drag-hint">
                <ManifestIcon class="drag-icon" id="file_document" :scale="1" />
                <text class="drag-text">释放即可发送文件</text>
            </view>
        </view>
        <!-- 顶部导航栏 -->
        <view class="chat-header">
            <view class="header-left" @click="goBack">
                <ManifestIcon class="back-icon" id="back" :scale="1.1" />
            </view>
            <view class="header-center">
                <text class="chat-title">{{ chatTitle }}{{ isGroupChat ? ' · 群聊' : '' }}</text>
            </view>
            <view class="header-right" @click="showMoreOptions">
                <ManifestIcon class="more-icon" id="more" :scale="1.1" />
            </view>
        </view>

        <view v-if="!isGroupChat && (liveLocationState.offers[String(otherUserId)] || (liveLocationState.phase === 'sharing' && String(liveLocationState.peer?.id) === String(otherUserId)))" class="location-share-entry" @click="openLiveLocation">
            <ManifestIcon id="map_location" size="26px" />
            <view class="location-share-copy"><text class="location-share-title">{{ liveLocationState.phase === 'sharing' && String(liveLocationState.peer?.id) === String(otherUserId) ? '实时位置共享' : '对方发起的位置共享' }}</text><text class="location-share-subtitle">点击查看位置状态</text></view>
            <text class="location-share-arrow">›</text>
        </view>

        <RealtimeActivityEntry :show-location="false" />

        <!-- 消息列表区域 -->
        <scroll-view class="message-list" scroll-y :scroll-top="scrollTop" :scroll-into-view="scrollToMessage"
            @scrolltoupper="loadMoreMessages">
            <!-- 加载更多提示 -->
            <view class="load-more" v-if="hasMoreMessages">
                <text class="load-more-text" @click="loadMoreMessages">{{ isLoadingMore ? '加载中...' : '点击加载更多' }}</text>
            </view>

            <!-- 空消息提示 -->
            <view v-if="timelineMessages.length === 0 && !bookingContextError" class="empty-tip">
                <text class="empty-text">暂无消息，开始聊天吧</text>
            </view>

            <!-- 消息项 -->
            <view v-for="(msg, index) in timelineMessages" :key="msg.id" :id="'msg-' + msg.id" class="message-item"
                :class="{ 'message-selecting': selectingMessages && !msg.bookingOrder, 'message-selected': selectedMessageIds.includes(String(msg.id)), 'message-self': msg.isSelf, 'message-other': !msg.isSelf, 'message-system': msg.type === 'system' }">
                <view v-if="selectingMessages && !msg.bookingOrder" class="message-select-hitbox" @click.stop="toggleMessageSelection(msg)">
                    <text v-if="msg.status === 'sent' && !msg.isWithdraw" class="message-select-check">{{ selectedMessageIds.includes(String(msg.id)) ? '●' : '○' }}</text>
                </view>
                <!-- 时间分隔 -->
                <view v-if="shouldShowTime(index)" class="time-divider">
                    <text class="time-text">{{ formatTime(msg.timestamp) }}</text>
                </view>

                <BookingChatContext v-if="msg.bookingOrder" :order="msg.bookingOrder" :disabled="selectingMessages" />
                <!-- 系统消息(撤回提示等) -->
                <view v-else-if="msg.type === 'system'" class="system-message">
                    <text class="system-text">{{ msg.content }}</text>
                </view>

                <!-- 消息内容 -->
                <view v-else :id="`message-${msg.id}`" class="message-content" :class="{ 'message-highlighted': highlightMessageId === msg.id }">
                    <!-- 对方头像 -->
                    <image v-if="!msg.isSelf" class="avatar" :src="getMessageAvatar(msg)"
                        mode="aspectFill" />

                    <!-- 消息气泡 -->
                    <view class="bubble-wrapper">
                        <text v-if="!msg.isSelf && (isGroupChat || msg.isAi)" class="group-sender-name">{{ getMessageSenderName(msg) }}</text>
                        <!-- 管理员模式下,显示撤回标识 -->
                        <view v-if="mode === 'admin' && msg.isWithdraw" class="withdraw-badge">
                            <text class="withdraw-text">已撤回</text>
                        </view>
                        
                        <view class="message-bubble" :class="[getBubbleClass(msg), { 'withdraw-message': mode === 'admin' && msg.isWithdraw }]" @longpress="onMessageLongPressV2(msg)" @contextmenu.prevent="onMessageLongPressV2(msg)">
                            <!-- 引用消息 -->
                            <view v-if="msg.refId" class="ref-message-container" @click.stop="jumpToRefMessage(msg.refId)">
                                <view class="ref-message-item" :class="[getRefMessageType(msg.refId)]">
                                    <text class="ref-label">{{ getRefMessageSenderName(msg.refId) }}:</text>
                                    <text class="ref-content">{{ getRefMessagePreview(msg.refId) }}</text>
                                </view>
                            </view>

                            <!-- AI 文本使用受限 Markdown，普通用户消息保持原有纯文本展示。 -->
                            <RealtimeActivityMessage v-if="realtimeActivityCard(msg)" :card="realtimeActivityCard(msg)" :self="msg.isSelf"
                                :recording="localCallRecording(msg)" @open="openRealtimeActivity(msg)" @open-recording="openCallRecording(msg)" />
                            <CommunityPostMessage v-else-if="msg.type === 'others'" :card="communityPostCard(msg)" @open="openCommunityPost(msg)" />
                            <ChatMarkdown v-else-if="msg.type === 'text' && msg.isAi" class="text-content ai-markdown-content" :markdown="msg.content" :dark="isDarkTheme" />
                            <text v-else-if="msg.type === 'text'" class="text-content">{{ msg.content }}</text>

                            <!-- 图片消息 -->
                            <view v-else-if="msg.type === 'image'" class="image-content" @click="previewImage(msg)">
                                <!-- 原图已预加载时直接复用；未缓存时仍优先使用缩略图以节省首次流量 -->
                                <image :src="getImageDisplaySrc(msg)" :data-message-id="msg.id" :data-original-token="loadedOriginalImageTokens[msg.id] || ''" :data-retry-nonce="imageRetryNonces[msg.id] || ''" mode="widthFix" class="msg-image"
                                    :class="{ 'image-error': mediaLoadErrors[msg.id]?.type === 'image' }"
                                    @error="onImageError(msg, $event)" @load="onImageLoad(msg, $event)" />
                                <view v-if="imageRetryLoadingIds[msg.id]" class="media-error-mask">
                                    <view class="error-content">
                                        <text class="error-text">重新加载中</text>
                                    </view>
                                </view>
                                <!-- 加载失败遮罩 -->
                                <view v-else-if="mediaLoadErrors[msg.id]?.type === 'image'" class="media-error-mask" @click.stop="retryLoadMedia(msg, 'image')">
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
                                    <ManifestIcon class="play-icon" id="play_action" :scale="1.1" />
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
                                    <ManifestIcon :id="getFileIcon(msg.fileName)" :scale="1.1" />
                                </view>
                                <view class="file-info">
                                    <text class="file-name">{{ msg.fileName }}</text>
                                    <view class="file-meta" v-if="!mediaLoadErrors[msg.id]?.type">
                                        <text class="file-size">{{ formatFileSize(msg.fileSize) }}</text>
                                        <text v-if="isFilePreviewable(msg)" class="file-preview-hint">在线预览</text>
                                    </view>
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
                                <ManifestIcon class="location-icon" id="map_location" />
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

            <view v-if="bookingContextError" class="load-more">
                <text class="load-more-text" @click="loadBookingContext">预约信息暂不可用，点击重试</text>
            </view>

            <!-- 底部占位 -->
            <view class="bottom-placeholder"></view>
        </scroll-view>

        <!-- 底部输入区域 -->
        <view v-if="!selectingMessages && groupSendBlockReason" class="group-muted-notice">{{ groupSendBlockReason }}</view>
        <view v-if="!selectingMessages && !groupSendBlockReason" class="input-area" :class="{ 'input-area-expanded': showMorePanel }">
            <!-- 引用消息提示 -->
            <view v-if="showRefSuggestion && refMessageId" class="ref-tip-container">
                <view class="ref-tip">
                    <view class="ref-tip-content">
                        <text class="ref-tip-label">引用:</text>
                        <text class="ref-tip-text">{{ getRefMessagePreview(refMessageId) }}</text>
                    </view>
                    <ManifestIcon class="ref-tip-close" id="close" @click="clearRefMessage" />
                </view>
            </view>
            
            <!-- 主输入栏 -->
            <view class="input-bar">
                <!-- 语音/键盘切换 -->
                <view class="input-btn" @click="toggleVoiceMode">
                    <ManifestIcon v-if="!isVoiceMode" class="btn-icon" id="voice_recognition" />
                    <ManifestIcon v-else class="btn-icon" id="keyboard" :scale="1.1" />
                </view>

                <!-- 文本输入框 -->
                <view v-if="!isVoiceMode" class="input-wrapper" :style="{ height: inputWrapperHeight + 'rpx' }">
                    <textarea class="text-input" v-model="inputText" :placeholder="inputPlaceholder" :maxlength="2000"
                        :style="{ height: inputTextareaHeight + 'rpx' }" :auto-height="false" :show-confirm-bar="false"
                        @linechange="onInputLineChange" @focus="onInputFocus" @blur="onInputBlur"
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
                    <ManifestIcon class="btn-icon" id="attachment" :scale="1.1" />
                </view>
            </view>

            <!-- 表情面板 -->
            <view v-if="showEmojiPanel && !groupSendBlockReason" class="emoji-panel">
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
                    <ManifestIcon class="delete-icon" id="delete" :scale="1" />
                </view>
            </view>

            <!-- 更多功能面板 -->
            <view v-if="showMorePanel && !groupSendBlockReason" class="more-panel">
                <view class="more-grid">
                    <view v-if="!isGroupChat && voiceCallState.supported" class="more-item" @click="startVoiceCall()">
                        <view class="more-icon-wrapper"><ManifestIcon class="more-icon" id="chat_voice_call" :scale="1.5" /></view>
                        <text class="more-text">语音通话</text>
                    </view>
                    <view v-if="!isGroupChat && voiceCallState.videoSupported" class="more-item" @click="startVoiceCall('video')">
                        <view class="more-icon-wrapper"><ManifestIcon class="more-icon" id="chat_video_call" :scale="1.5" /></view>
                        <text class="more-text">视频通话</text>
                    </view>
                    <!-- #ifdef MP-WEIXIN -->
                    <view v-if="!isGroupChat" class="more-item" @click="openWebCall('audio')">
                        <view class="more-icon-wrapper"><ManifestIcon class="more-icon" id="chat_voice_call" :scale="1.5" /></view><text class="more-text">网页语音通话</text>
                    </view>
                    <view v-if="!isGroupChat" class="more-item" @click="openWebCall('video')">
                        <view class="more-icon-wrapper"><ManifestIcon class="more-icon" id="chat_video_call" :scale="1.5" /></view><text class="more-text">网页视频通话</text>
                    </view>
                    <!-- #endif -->
                    <!-- #ifndef APP-PLUS || H5 || MP-WEIXIN -->
                    <view v-if="!isGroupChat" class="more-item" @click="showCallSupport">
                        <view class="more-icon-wrapper"><ManifestIcon class="more-icon" id="chat_voice_call" :scale="1.5" /></view>
                        <text class="more-text">通话说明</text>
                    </view>
                    <!-- #endif -->
                    <view class="more-item" @click="chooseImage">
                        <view class="more-icon-wrapper">
                            <ManifestIcon class="more-icon" id="image_gallery" :scale="1.9" />
                        </view>
                        <text class="more-text">图片</text>
                    </view>
                    <view class="more-item" @click="shootPhoto">
                        <view class="more-icon-wrapper">
                            <ManifestIcon class="more-icon" id="camera_scan" :scale="1.8" />
                        </view>
                        <text class="more-text">拍照</text>
                    </view>
                    <view class="more-item" @click="chooseVideo">
                        <view class="more-icon-wrapper">
                            <ManifestIcon class="more-icon" id="video" :scale="2" />
                        </view>
                        <text class="more-text">视频</text>
                    </view>
                    <view class="more-item" @click="recordVideo">
                        <view class="more-icon-wrapper">
                            <ManifestIcon class="more-icon" id="video" :scale="2" />
                        </view>
                        <text class="more-text">录像</text>
                    </view>
                    <view class="more-item" @click="chooseFile">
                        <view class="more-icon-wrapper">
                            <ManifestIcon class="more-icon" id="file_document" :scale="1.9" />
                        </view>
                        <text class="more-text">文件</text>
                    </view>
                    <view class="more-item" @click="sendLocation">
                        <view class="more-icon-wrapper">
                            <ManifestIcon class="more-icon" id="map_location" :scale="1.8" />
                        </view>
                        <text class="more-text">位置</text>
                    </view>
                    <view v-if="!isGroupChat && liveLocationState.supported" class="more-item" @click="openLiveLocation">
                        <view class="more-icon-wrapper"><ManifestIcon class="more-icon" id="nearby_map" :scale="1.9" /></view>
                        <text class="more-text">实时位置</text>
                    </view>
                </view>
            </view>
        </view>

        <!-- 语音录制浮层 -->
        <view v-if="isRecording" class="voice-recording-overlay">
            <view class="recording-panel" :class="{ 'cancel-mode': isCancelVoice }">
                <view class="recording-animation">
                    <view class="wave-circle" v-for="i in 3" :key="i"></view>
                    <ManifestIcon class="mic-icon" id="voice_recognition" />
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
                    <view class="close-btn" @click="closeSettingsModal">
                        <ManifestIcon id="close" size="36rpx" />
                    </view>
                </view>

                <!-- 用户信息 -->
                <view class="user-info-section">
                    <view class="group-avatar-editor" :class="{ editable: canManageGroup }" @click="editGroupAvatar">
                        <image class="user-avatar-large" :src="otherAvatarUrl" mode="aspectFill" />
                        <view v-if="canManageGroup" class="group-avatar-edit-mask"><text>编辑</text></view>
                    </view>
                    <view class="user-details" :class="{ editable: canManageGroup }" @click="editGroupName">
                        <text class="user-name-large">{{ chatTitle }}</text>
                        <text class="user-id-text">{{ isGroupChat ? `${groupInfo?.Members?.length || 0} 位成员` : `ID: ${otherUserId}` }}</text>
                        <text v-if="canManageGroup" class="group-edit-hint">点击修改群名</text>
                    </view>
                </view>

                <view v-if="isGroupChat" class="group-members-section">
                    <view class="group-members-heading">
                        <text class="group-members-title">群成员</text>
                        <text class="group-members-count">{{ groupInfo?.Members?.length || 0 }} 人</text>
                    </view>
                    <input v-model="memberSearch" class="group-member-search" placeholder="搜索群成员" />
                    <view v-if="isGroupOwner" class="group-members-loading"><ManifestIcon id="chat_group_transfer" size="28rpx" /> 点击“管理”可设置管理员或转让群主</view>
                    <view v-if="groupInfo?.Members?.length" class="group-members-grid">
                        <view v-for="member in filteredGroupMembers" :key="member.userId" class="group-member">
                            <image class="group-member-avatar" :src="getGroupMemberAvatar(member)" mode="aspectFill" />
                            <text class="group-member-name">{{ getGroupMemberName(member) }}</text>
                            <text v-if="getGroupMemberRole(member)" class="group-member-role">{{ getGroupMemberRole(member) }}</text>
                            <text v-if="member.mute" class="group-member-role">已禁言</text>
                            <button v-if="canRemoveGroupMember(member)" class="group-member-remove"
                                :disabled="!!removingGroupMemberId" @click.stop="manageGroupMember(member)"><ManifestIcon id="chat_group_admin" size="24rpx" /> 管理</button>
                        </view>
                    </view>
                    <text v-else class="group-members-loading">正在加载成员...</text>
                    <text v-if="groupInfo?.Members?.length && !filteredGroupMembers.length" class="group-members-loading">未找到匹配的成员</text>
                </view>

                <!-- 设置项列表 -->
                <view class="settings-list" :class="{ 'settings-list-group': isGroupChat }">
                    <view v-if="isGroupChat" class="settings-section-title settings-section-first">个人设置</view>
                    <view class="setting-item" @click="showHistorySearch = true"><view class="setting-left"><ManifestIcon class="setting-icon" id="chat_history_search" :scale="1.1" /><text class="setting-label">查找聊天记录</text></view><ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" /></view>
                    <template v-if="isGroupChat">
                        <view class="setting-item" @click="editGroupAlias">
                            <view class="setting-left"><ManifestIcon class="setting-icon" id="chat_group_alias" :scale="1.1" /><text class="setting-label">我在本群的昵称</text></view>
                            <text class="setting-value">{{ groupInfo?.currentMember?.alias || '未设置' }}</text>
                            <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                        </view>
                        <view class="setting-item">
                            <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="pin" :scale="1.1" />
                                <text class="setting-label">置顶聊天</text>
                            </view>
                            <switch :checked="contactSettings.top" @change="toggleTop" color="#07c160" />
                        </view>
                        <view class="setting-item">
                            <view class="setting-left"><ManifestIcon class="setting-icon" id="notification_off" :scale="1.1" /><text class="setting-label">消息免打扰</text></view>
                            <switch :checked="contactSettings.mute" @change="toggleMute" color="#07c160" />
                        </view>
                        <view class="settings-section-title">群信息与管理</view>
                        <view class="setting-item" @click="showGroupAnnouncement">
                            <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="announcement" :scale="1.1" />
                                <text class="setting-label">群公告</text>
                            </view>
                            <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                        </view>
                        <view v-if="canManageGroup" class="setting-item" @click="inviteGroupMembers">
                            <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="chat_member_invite" :scale="1.1" />
                                <text class="setting-label">邀请成员</text>
                            </view>
                            <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                        </view>
                        <view v-if="canManageGroup" class="setting-item">
                            <view class="setting-left"><ManifestIcon class="setting-icon" id="chat_group_mute" :scale="1.1" /><text class="setting-label">全员禁言</text></view>
                            <switch :checked="!!groupInfo?.muteAll" :disabled="groupSettingsBusy" @change="toggleGroupMuteAll" color="#07c160" />
                        </view>
                        <view class="settings-section-title">危险操作</view>
                        <view class="setting-item" @click="confirmClearChat"><view class="setting-left"><ManifestIcon class="setting-icon" id="delete" :scale="1.1" /><text class="setting-label">清空我的聊天记录</text></view><ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" /></view>
                        <view class="setting-item danger" @click="confirmLeaveGroup">
                            <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="leave_group" :scale="1.1" />
                                <text class="setting-label danger-text">退出群聊</text>
                            </view>
                            <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                        </view>
                        <view v-if="isGroupOwner" class="setting-item danger" @click="confirmDissolveGroup">
                            <view class="setting-left"><ManifestIcon class="setting-icon" id="chat_group_dissolve" :scale="1.1" /><text class="setting-label danger-text">解散群聊</text></view>
                            <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                        </view>
                    </template>
                    <template v-else>
                    <!-- 备注名 -->
                    <view class="setting-item" @click="startEditNote">
                        <view class="setting-left">
                            <ManifestIcon class="setting-icon" id="post_edit" />
                            <text class="setting-label">备注名</text>
                        </view>
                        <view class="setting-right">
                            <text class="setting-value">{{ contactSettings.note || '未设置' }}</text>
                            <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                        </view>
                    </view>

                    <!-- 关系 -->
                    <view class="setting-item" @click="selectRelationship">
                        <view class="setting-left">
                            <text class="setting-label">关系</text>
                        </view>
                        <view class="setting-right">
                            <text class="setting-value">{{ getRelationshipLabel(contactSettings.relationship) }}</text>
                            <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                        </view>
                    </view>

                    <!-- 免打扰 -->
                    <view class="setting-item">
                        <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="notification_off" :scale="1.1" />
                            <text class="setting-label">消息免打扰</text>
                        </view>
                        <switch :checked="contactSettings.mute" @change="toggleMute" color="#07c160" />
                    </view>

                    <!-- 置顶 -->
                    <view class="setting-item">
                        <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="pin" :scale="1.1" />
                            <text class="setting-label">置顶聊天</text>
                        </view>
                        <switch :checked="contactSettings.top" @change="toggleTop" color="#07c160" />
                    </view>

                    <!-- 清空聊天记录 -->
                    <view class="setting-item" @click="confirmClearChat">
                        <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="delete" :scale="1.1" />
                            <text class="setting-label">清空聊天记录</text>
                        </view>
                        <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                    </view>

                    <!-- 删除联系人 -->
                    <view class="setting-item danger" @click="confirmDeleteContact">
                        <view class="setting-left">
                                <ManifestIcon class="setting-icon" id="chat_member_remove" :scale="1.1" />
                            <text class="setting-label danger-text">删除联系人</text>
                        </view>
                        <ManifestIcon class="arrow-icon" id="chevron_right" :scale="1" />
                    </view>
                    </template>
                </view>
            </view>
        </view>

        <ChatHistorySearch v-if="showHistorySearch" :group-id="isGroupChat ? String(groupId) : ''" :chat-id="String(chatId)"
            @close="showHistorySearch = false" @select="showHistorySearch = false; showSettingsModal = false; jumpToRefMessage($event)" />
        <view v-if="messageMenu" class="edit-note-modal" @click="messageMenu = null">
            <view class="message-action-menu" @click.stop>
                <view v-for="action in messageMenu.actions" :key="action.key" class="message-action-menu-item" @click="executeMessageAction(action.key)"><ManifestIcon :id="messageActionIcons[action.key]" size="40rpx" /><text>{{ action.label }}</text></view>
                <view class="message-action-menu-item" @click="messageMenu = null"><ManifestIcon id="close" size="40rpx" /><text>取消</text></view>
            </view>
        </view>
        <view v-if="selectingMessages" class="message-selection-toolbar" :style="{ paddingBottom: safeAreaBottom + 'px' }">
            <button :disabled="messageActionBusy" @click="cancelMessageSelection">取消</button>
            <text>{{ selectedMessageIds.length }} 条</text>
            <button :disabled="!selectedMessageIds.length || messageActionBusy" @click="chooseForwardConversation"><ManifestIcon id="chat_forward" size="32rpx" /> 转发</button>
            <button :disabled="!selectedMessageIds.length || messageActionBusy" @click="deleteSelectedMessages"><ManifestIcon id="delete" size="32rpx" /> 删除</button>
        </view>

        <ChatSelectionDialog :open="!!selectionMode" :title="selectionMode === 'invite' ? '邀请成员' : '转发到'"
            :items="selectionItems" :multiple="selectionMode === 'invite'" :busy="selectionBusy"
            @close="!selectionBusy && (selectionMode = '')" @confirm="confirmChatSelection" />
        <view v-if="editingAnnouncement" class="edit-note-modal" @click="!savingAnnouncement && (editingAnnouncement = false)">
            <view class="edit-note-content" @click.stop>
                <text class="edit-note-title">编辑群公告</text>
                <textarea v-model="announcementDraft" class="announcement-input" maxlength="500" placeholder="填写群公告，留空可清除" />
                <text class="group-members-loading">{{ announcementDraft.length }}/500</text>
                <view class="edit-note-buttons">
                    <button class="cancel-btn" :disabled="savingAnnouncement" @click="editingAnnouncement = false">取消</button>
                    <button class="confirm-btn" :disabled="savingAnnouncement" @click="saveGroupAnnouncement">{{ savingAnnouncement ? '保存中…' : '保存' }}</button>
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
                        <ManifestIcon class="close-icon" id="close" />
                    </view>
                    <text class="count-tag" v-if="previewImageList.length > 1">{{ previewCurrentIndex + 1 }} / {{ previewImageList.length }}</text>
                    <view class="header-placeholder"></view>
                </view>
                
                <!-- 图片主体 -->
                <view class="preview-content-box">
                    <image :key="'preview-image-' + currentPreviewMessage.id" :src="getImageDisplaySrc(currentPreviewMessage)"
                        :data-message-id="currentPreviewMessage.id" :data-original-token="loadedOriginalImageTokens[currentPreviewMessage.id] || ''" :data-retry-nonce="imageRetryNonces[currentPreviewMessage.id] || ''" mode="aspectFit" class="preview-img-main" @error="onImageError(currentPreviewMessage, $event)" @load="onImageLoad(currentPreviewMessage, $event)"/>
                    
                    <!-- 加载中遮罩 -->
                    <view v-if="isCurrentPreviewImageRetrying" class="loading-overlay">
                        <view class="loading-spinner"></view>
                        <text class="loading-text">重新加载中</text>
                    </view>
                    <view v-else-if="isCurrentPreviewImageLoading" class="loading-overlay">
                        <view class="loading-spinner"></view>
                        <text class="loading-text">正在加载高清原图...</text>
                    </view>
                </view>
                
                <!-- 左右导航 -->
                <template v-if="previewImageList.length > 1">
                    <view class="preview-nav preview-prev" @click.stop="prevPreviewImage">
                        <ManifestIcon class="nav-symbol" id="chevron_left" :scale="1" />
                    </view>
                    <view class="preview-nav preview-next" @click.stop="nextPreviewImage">
                        <ManifestIcon class="nav-symbol" id="chevron_right" :scale="1" />
                    </view>
                </template>
                
                <!-- 底部交互层 -->
                <view class="preview-bottom-bar">
                    <view class="bar-inner">
                        <view v-if="isLargeImage(currentPreviewMessage) && !loadedOriginalImages[currentPreviewMessage.id] && !isCurrentPreviewImageLoading && !isCurrentPreviewImageRetrying"
                            class="action-btn-primary" @click.stop="loadOriginalImage(currentPreviewMessage)">
                            <text class="btn-inner-text">查看原图 ({{ formatFileSize(currentPreviewMessage.fileSize) }})</text>
                        </view>
                        <text v-else-if="isLargeImage(currentPreviewMessage) && isCurrentPreviewImageRetrying" class="status-badge">重新加载中</text>
                        <text v-else-if="isLargeImage(currentPreviewMessage) && isCurrentPreviewImageLoading" class="status-badge">正在加载原图</text>
                        <text v-else-if="isLargeImage(currentPreviewMessage) && loadedOriginalImages[currentPreviewMessage.id]" class="status-badge">已加载原图</text>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
import AppConfirmDialog from '@/components/AppConfirmDialog.vue'
import { showAppModal } from '@/utils/app-confirm-dialog.js'
import { chooseAppImage } from '@/utils/image-picker.js'
import BookingChatContext from './components/BookingChatContext.vue'
import { bookingChatContext } from './api/recycling.js'
import * as chatApi from '@/pages-nonTheme/api/chat.js'
import { audioInitializationMethods, voiceRecordingMethods, voicePlaybackMethods, voiceTranscriptionMethods } from '@/pages-nonTheme/chat/audio-methods.js'
import { mediaSendMethods, mediaPickerMethods, attachmentIngressMethods } from '@/pages-nonTheme/chat/attachment-methods.js'
import { imageSourceMethods, imagePreviewMethods, imageLoadingMethods, imageErrorMethods, imageRetryMethods } from '@/pages-nonTheme/chat/image-methods.js'
import { videoPlaybackMethods, fileAccessMethods, mediaFormattingMethods } from '@/pages-nonTheme/chat/file-methods.js'
import { historyCacheMethods, localFileCacheMethods } from '@/pages-nonTheme/chat/cache-methods.js'
import ChatHistorySearch from '@/pages-nonTheme/components/ChatHistorySearch.vue'
import { messageActionsMethods } from '@/pages-nonTheme/chat/message-actions-methods.js'
import ChatSelectionDialog from '@/pages-nonTheme/components/ChatSelectionDialog.vue'
import { groupManagementMethods } from '@/pages-nonTheme/chat/group-management-methods.js'
import { messageSyncMethods } from '@/pages-nonTheme/chat/sync-methods.js'
import { messageSendMethods } from '@/pages-nonTheme/chat/send-methods.js'
import { messageBus } from '@/utils/message-event-bus.js'
import { setActiveChatConversation, isChatEventsConnected } from '@/utils/chat-events.js'
import { getUserProfile } from '@/api/user.js'
import { baseUrl } from '@/api/settings.js'
import { getAvatarUrl } from '@/utils/avatar-handler.js'
import { prepareAvatarUpload } from '@/utils/upload-image.js'
import { triggerMessageNotification } from '@/utils/message-event-bus.js'
import { setChatFeedbackBlocked } from '@/utils/chat-feedback.js'
import { embeddedWebCallUrl, requestWebCallTicket } from '@/utils/web-call-entry.mjs'
import { appendRecordingBridge, listCallRecordings } from '@/utils/call-recordings.js'
import { recordingIdentity, validRecordingCallId, recordingPlayable } from '@/utils/call-recording-preference.mjs'
import RealtimeActivityEntry from '@/components/RealtimeActivityEntry.vue'
import { voiceCalls, voiceCallState, openVoiceCallPage } from '@/utils/voice-call.js'
import { liveLocationState } from '@/utils/live-location.js'
import { chooseMiniLocation, isLocationCancelled } from '@/utils/mini-location.js'
import { locationErrorMessage } from '@/utils/location-error.mjs'
import ChatMarkdown from '@/pages-nonTheme/components/ChatMarkdown.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getManifestIconPath } from '@/utils/manifest-icons.js'
import { communityPostCard, communityPostLink } from './utils/community-social.js'
import CommunityPostMessage from './components/CommunityPostMessage.vue'
import RealtimeActivityMessage from './components/RealtimeActivityMessage.vue'
import { realtimeActivityCard, realtimeActivitySummary } from '@/utils/realtime-activity.mjs'
import { getDisplayName } from '@/utils/display-name.js'

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
    components: { AppConfirmDialog, RealtimeActivityEntry, BookingChatContext,
        ChatMarkdown,
        CommunityPostMessage, RealtimeActivityMessage,
        ChatSelectionDialog,
        ChatHistorySearch,
        ManifestIcon
    },
    data() {
        return {
            bookingOrderId: '', bookingOrders: [], bookingContextRevision: 0, bookingContextError: false,
            chatId: '', // 聊天会话ID
            conversationType: 'direct',
            groupId: '',
            groupInfo: null,
            groupSettingsBusy: false,
            memberSearch: '',
            showHistorySearch: false,
            messageMenu: null,
            messageActionIcons: { copy: 'chat_copy', delete: 'delete', quote: 'chat_quote', forward: 'chat_forward', select: 'chat_multi_select', transcribe: 'chat_voice_text', recall: 'chat_recall', retry: 'refresh' },
            selectingMessages: false,
            selectedMessageIds: [],
            messageActionBusy: false,
            forwardAttempt: null,
            leavingGroup: false,
            selectionMode: '',
            selectionItems: [],
            selectionBusy: false,
            editingAnnouncement: false,
            announcementDraft: '',
            savingAnnouncement: false,
            removingGroupMemberId: '',
            lastSyncedMessageId: null,
            lastHistoryReconcileAt: 0,
            isMentionStreaming: false,
            aiStreamingMessageId: '',
            mentionAbortController: null,
            mentionSocket: null,
            chatTitle: '聊天',
            userAvatar: '',
            otherAvatar: '', // 对方头像
            otherUsername: '', // 对方原始用户名
            locationChoosing: false,
            otherUserId: '', // 对方用户ID
            loadingUserProfile: false,
            hasSyncedUserProfile: false,
            mode: 'customer', // 聊天模式: 'customer' 普通模式, 'admin' 管理员模式
            isDarkTheme: false, // 主题状态
            statusBarHeight: 20, // 状态栏高度
            safeAreaBottom: 0, // 底部安全区域高度

            // 消息相关
            messages: [],
            messageCacheReady: false,
            // 页面离开后异步恢复的缓存不能重新启动轮询，避免退出登录后遗留请求持续报未登录。
            isChatPageActive: false,
            isChatPageDestroyed: false,
            webCallOpening: false,
            messagePollingVersion: 0,
            activeMessagePollingVersion: null,
            hasInitialScrolledToBottom: false,
            lastGroupHistoryReconcileAt: 0,
            scrollTop: 0,
            scrollToMessage: '',
            hasMoreMessages: true,
            isLoadingMore: false,
            currentPage: 1,
            pageSize: 20, // 每页加载数量

            // 输入相关
            voiceCallState,
            callRecordingIndex: {},
            callRecordingOwner: '',
            callRecordingRevision: 0,
            callRecordingListener: null,
            liveLocationState,
            inputText: '',
            inputPlaceholder: '输入消息...',
            inputTextLineCount: 1,
            isVoiceMode: false,
            showEmojiPanel: false,
            showMorePanel: false,

            // 语音录制
            isRecording: false,
            isCancelVoice: false,
            chatFeedbackOwner: `chat-media:${Date.now()}:${Math.random()}`,
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
            pollingInterval: 5000, // 断线回退和繁忙会话的已读合并间隔
            chatEventsDirty: false,
            chatEventsConnected: false,
            pendingHistoryReconcile: false,
            lastMessageCheckAt: 0,
            
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
            h5DragDropListeners: null,
            // 缩略图缓存: { originalPath: thumbnailUrl }
            thumbnailCache: {},
            
            // 已加载原图的消息: { messageId: originalImageUrl } - 用于缓存大图的原始URL
            loadedOriginalImages: {},
            // 绑定到 image 节点的版本号，用来忽略图片换源前遗留的异步 error 回调。
            loadedOriginalImageTokens: {},
            originalImageTokenSeed: 0,
            // 只用于强制重新请求 image 标签的网络地址，绝不写回消息 content。
            imageRetryNonces: {},
            imageRetryCounts: {},
            imageRetryLoadingIds: {},
            // 缩略图服务临时不可用时直接回退原图下载地址（可从对象存储回源）。
            thumbnailFallbackIds: {},
            // 正在加载原图的消息，用于防止重复点击；每个图片独立计数，不和预览页全局状态混用。
            originalImageLoadingIds: {},
            
            // 图片预览面板
            showImagePreview: false, // 是否显示图片预览
            previewImageList: [], // 预览图片列表（按时间排序的所有图片消息）
            previewCurrentIndex: 0, // 当前预览的图片索引
            
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

    watch: {
        isRecording() { this.syncChatFeedbackMedia() },
        playingVoiceId() { this.syncChatFeedbackMedia() },
        inputText() { this.queueChatDraftSave() },
        refMessageId() { this.queueChatDraftSave() }
    },
    computed: {
        isGroupChat() {
            return this.conversationType === 'group' && !!this.groupId
        },

        // 输入区最多显示四行，超过后让 textarea 自身滚动，避免撑开底栏。
        inputTextareaHeight() {
            return Math.min(Math.max(this.inputTextLineCount, 1), 4) * 45
        },

        inputWrapperHeight() {
            return Math.min(Math.max(this.inputTextareaHeight + 24, 72), 204)
        },

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

        timelineMessages() {
            const messages = this.visibleMessages
            if (!this.bookingOrders.length) return messages

            const oldest = this.hasMoreMessages ? messages[0]?.timestamp : undefined
            const cards = []
            for (const order of this.bookingOrders) {
                const timestamp = order.acceptedAt ? new Date(order.acceptedAt).getTime() : NaN
                if (!Number.isFinite(timestamp)) continue
                // Older cards enter with their history. Keep the order used to open this chat accessible.
                if (oldest != null && timestamp < oldest && String(order.id) !== String(this.bookingOrderId)) continue
                cards.push({ id: `booking-${order.id}`, timestamp, bookingOrder: order })
            }
            return [...messages, ...cards].sort((a, b) => a.timestamp - b.timestamp)
        },

        // 当前预览的消息
        currentPreviewMessage() {
            if (this.previewImageList.length === 0) return null
            return this.previewImageList[this.previewCurrentIndex] || null
        },

        // 仅当前正在预览的那一张大图展示加载遮罩，其他图片的异步完成不会影响它。
        isCurrentPreviewImageLoading() {
            const message = this.currentPreviewMessage
            return Boolean(message && this.isLargeImage(message) && this.originalImageLoadingIds[message.id])
        },

        isCurrentPreviewImageRetrying() {
            const message = this.currentPreviewMessage
            return Boolean(message && this.imageRetryLoadingIds[message.id])
        },
        
        voiceBtnText() {
            if (this.isRecording) {
                return this.isCancelVoice ? '松开取消' : '松开发送'
            }
            return '按住说话'
        },

        // 存储 key
        storageKey() {
            const userId = this.getCurrentUserId() || 'unknown'
            return CHAT_STORAGE_PREFIX + userId + '_' + this.chatId
        },

        // 当前用户头像 (计算属性，避免重复调用)
        userAvatarUrl() {
            const userInfo = uni.getStorageSync('userInfo')
            const username = getDisplayName(userInfo)
            
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
            if (this.chatTitle && (this.chatTitle.includes('AI') || this.chatTitle.includes('ai') || this.chatTitle.includes('智能') || this.chatTitle.includes('助手'))) {
                return getManifestIconPath('ai_assistant')
            }
            // 检查是否有有效的真实头像
            if (this.otherAvatar && 
                typeof this.otherAvatar === 'string' &&
                this.otherAvatar.trim() !== '' && 
                this.otherAvatar !== 'null' &&
                this.otherAvatar !== 'undefined' &&
                !this.otherAvatar.includes('default-avatar')) {
                if (this.isGroupChat && !this.otherAvatar.startsWith('data:') && !this.otherAvatar.startsWith('http')) {
                    return `${baseUrl}/files/download/${this.otherAvatar.replace(/^[/\\]+/, '')}`
                }
                const avatarUrl = getAvatarUrl(this.otherAvatar, baseUrl)
                return avatarUrl
            }
            // 生成基于聊天标题的头像
            return this.generateAvatarFromName(this.chatTitle, true)
        },

        isGroupOwner() { return this.isGroupChat && this.groupInfo?.currentMember?.role === 'owner' },
        filteredGroupMembers() {
            const keyword = this.memberSearch.trim().toLowerCase()
            return (this.groupInfo?.Members || []).filter(member => `${this.getGroupMemberName(member)} ${member.User?.username || ''} ${member.userId}`.toLowerCase().includes(keyword))
        },
        canManageGroup() {
            const role = this.groupInfo?.currentMember?.role
            return this.isGroupChat && (role === 'owner' || role === 'admin')
        },
        groupMemberAliases() {
            return Object.fromEntries((this.groupInfo?.Members || []).filter(member => member.alias).map(member => [String(member.userId), member.alias]))
        },
        groupSendBlockReason() {
            if (!this.isGroupChat) return ''
            const member = this.groupInfo?.currentMember
            if (member?.mute) return '你已被禁言，暂时无法发送消息'
            return this.groupInfo?.muteAll && member?.role === 'member' ? '全员禁言中，仅群主和管理员可发言' : ''
        }
    },

    onLoad(options) {
        this.bookingOrderId = /^\d+$/.test(String(options.bookingOrderId || '')) ? options.bookingOrderId : ''
        console.log('=== chat页面 onLoad 触发 ===', 'chatId:', options.chatId)
        
        // 检测主题
        this.checkTheme()
        
        // 初始化系统信息
        this.initSystemInfo()
        
        // 初始化(需要先初始化,loadUserInfo会设置mode)
        this.initRecorder()
        this.initAudioPlayer()
        this.loadUserInfo() // 会读取userInfo.isAdmin并设置mode

        if (options.conversationType === 'group' || options.groupId) {
            this.conversationType = 'group'
            this.groupId = options.groupId || String(options.chatId || '').replace(/^group:/, '')
            this.chatId = `group:${this.groupId}`
        } else if (options.chatId) {
            this.chatId = options.chatId
        }

        if (options.title) {
            const decodedTitle = decodeURIComponent(options.title)
            this.chatTitle = decodedTitle
            this.otherUsername = decodedTitle
        }

        if (options.avatar) {
            this.otherAvatar = decodeURIComponent(options.avatar)
        }

        if (options.userId && this.conversationType !== 'group') {
            this.otherUserId = options.userId
        }

        // 已有参数，直接加载消息
        if (!this.chatId) {
            this.chatId = 'chat_' + this.otherUserId + '_' + Date.now()
        }
        this.restoreChatDraft()
        this.initializeMessages()
        
        // 加载本地文件缓存
        this.loadLocalFileCache()
        
        // 加载联系人设置
        if (this.isGroupChat) {
            this.loadGroupDetail()
        } else if (this.otherUserId) {
            this.loadContactSettings()
        }
        
        // 注意:不再使用 uni.$on 监听位置选择事件,改为在 onShow 中从 storage 读取
    },

    onShow() {
        this.syncChatFeedbackMedia()
        if (!this.callRecordingListener) {
            this.callRecordingListener = () => { void this.refreshCallRecordings() }
            uni.$on('call-recordings:changed', this.callRecordingListener)
        }
        void this.refreshCallRecordings()
        setActiveChatConversation(this.isGroupChat ? this.chatId : String(this.otherUserId || this.chatId))
        if (!this.chatEventListener) {
            this.chatEventListener = (event = {}) => {
                if (event.notification?.kind === 'booking' || (!event.type && !event.kind)) this.loadBookingContext()
                if (event.type !== 'notification.changed') this.handleChatEvent(event)
            }
            messageBus.on('chat.changed', this.chatEventListener)
            messageBus.on('chat.reconnected', this.chatEventListener)
            messageBus.on('notification.changed', this.chatEventListener)
        }
        this.isChatPageActive = true
        this.loadBookingContext()

        // 每次显示页面时重新加载用户信息（确保头像更新）
        this.loadUserInfo()

        // 进入聊天即同步已读状态，避免返回消息列表时读取到旧缓存
        this.markCurrentChatRead()
        
        // 首次进入会等待本地缓存恢复完成，之后每次显示只重启一次轮询。
        if (this.messageCacheReady) {
            this.startMessagePolling()
        }

        // H5 原生事件仅在当前聊天页可见时绑定，避免缓存页继续接收粘贴和拖拽事件。
        this.$nextTick(() => {
            this.initDragDropEvent()
        })
        
        // 从存储中读取选择的位置（H5、APP、小程序都支持）
        const locationData = uni.getStorageSync('selectedLocation')
        if (locationData) {
            this.handleLocationSelected(locationData)
            // 立即清除存储的数据,防止重复处理
            uni.removeStorageSync('selectedLocation')
        }
    },
    
    // #ifdef APP-PLUS
    onBackPress(event) {
      if (event.from === 'backbutton' && this.$refs.appConfirmDialog?.current) {
        this.$refs.appConfirmDialog.settle(false)
        return true
      }
    },
    // #endif
    onHide() {
        this.$refs.appConfirmDialog?.cancelAll()
        this.cancelRecord()
        this.saveChatDraft()
        setActiveChatConversation('')
        if (this.chatEventListener) {
            messageBus.off('chat.changed', this.chatEventListener)
            messageBus.off('chat.reconnected', this.chatEventListener)
            messageBus.off('notification.changed', this.chatEventListener)
            this.chatEventListener = null
        }
        // 页面隐藏时停止轮询，节省资源
        this.isChatPageActive = false
        this.stopMessagePolling()
        this.cleanupDragDropEvent()
    },

    onUnload() {
        this.callRecordingRevision++
        if (this.callRecordingListener) uni.$off('call-recordings:changed', this.callRecordingListener)
        this.$refs.appConfirmDialog?.cancelAll()
        this.cancelRecord()
        setChatFeedbackBlocked(this.chatFeedbackOwner, false)
        this.saveChatDraft()
        setActiveChatConversation('')
        if (this.chatEventListener) {
            messageBus.off('chat.changed', this.chatEventListener)
            messageBus.off('chat.reconnected', this.chatEventListener)
            messageBus.off('notification.changed', this.chatEventListener)
            this.chatEventListener = null
        }
        // 停止消息轮询
        this.isChatPageActive = false
        this.isChatPageDestroyed = true
        this.stopMessagePolling()
        this.cleanupDragDropEvent()
        if (this.mentionAbortController) this.mentionAbortController.abort()
        this.closeMentionSocket()
        
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
        this.isChatPageActive = false
        this.isChatPageDestroyed = true
        this.stopMessagePolling()
        this.cleanupDragDropEvent()
    },

    methods: {
        async loadBookingContext() {
            const peer = this.otherUserId || this.chatId
            if (this.isGroupChat || !/^\d+$/.test(String(peer))) return

            const revision = ++this.bookingContextRevision
            const token = uni.getStorageSync('token')
            const isCurrent = () => this.isChatPageActive && !this.isChatPageDestroyed &&
                revision === this.bookingContextRevision && token === uni.getStorageSync('token') &&
                peer === (this.otherUserId || this.chatId)
            try {
                const data = await bookingChatContext(peer)
                if (!isCurrent()) return
                this.bookingOrders = data.orders || []
                this.bookingContextError = false
            } catch (_) {
                if (!isCurrent()) return
                this.bookingOrders = []
                this.bookingContextError = Boolean(this.bookingOrderId)
            }
        },
        openLiveLocation() {
            const offer = liveLocationState.offers[String(this.otherUserId)]
            const name = this.contactSettings.note || this.otherUsername || this.chatTitle || '联系人'
            uni.navigateTo({ url: `/pages-nonTheme/live-location?peerId=${encodeURIComponent(this.otherUserId)}&name=${encodeURIComponent(name)}${offer ? `&sessionId=${encodeURIComponent(offer.sessionId)}` : ''}` })
            this.showMorePanel = false
        },
        async openWebCall(mode) {
            if (this.webCallOpening) return
            const target = { peerId: this.otherUserId, selfId: this.getCurrentUserId(), mode,
                name: this.contactSettings.note || this.otherUsername || this.chatTitle }
            let url = embeddedWebCallUrl(baseUrl, target)
            if (!url) { uni.showToast({ title: '通话入口不可用，请检查联系人和 HTTPS 地址', icon: 'none' }); return }
            this.webCallOpening = true
            const token = uni.getStorageSync('token') || ''
            uni.showLoading({ title: '正在打开通话' })
            try {
                const ticket = await requestWebCallTicket(uni, baseUrl, token)
                if (!this.isChatPageActive || this.isChatPageDestroyed || token !== (uni.getStorageSync('token') || '') || String(target.selfId) !== String(this.getCurrentUserId())) return
                if (!ticket) {
                    uni.showToast({ title: '无法登录网页通话，请检查网络或更新服务', icon: 'none' })
                    return
                }
                url = appendRecordingBridge(embeddedWebCallUrl(baseUrl, target, ticket))
                this.showMorePanel = false
                uni.navigateTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(url)}&title=${encodeURIComponent(mode === 'video' ? '视频通话' : '语音通话')}` })
            } finally { this.webCallOpening = false; uni.hideLoading() }
        },
        showCallSupport() {
            showAppModal(this, {
                title: '语音与视频通话',
                content: '当前小程序暂不支持直接语音、视频通话。可以在分投侠 App 登录同一账号后，与使用 App 或支持通话的网页版联系人通话。',
                confirmText: '查看 App', cancelText: '知道了',
                success: result => { if (result.confirm) uni.navigateTo({ url: '/pages-nonTheme/about' }) }
            })
        },
        startVoiceCall(mode = 'audio') {
            try {
                voiceCalls.start({ id: this.otherUserId, name: this.contactSettings.note || this.otherUsername || this.chatTitle }, mode)
                this.showMorePanel = false
            } catch (error) { uni.showToast({ title: error.message || '暂时无法发起通话', icon: 'none' }) }
        },
        syncChatFeedbackMedia() {
            setChatFeedbackBlocked(this.chatFeedbackOwner, !this.isChatPageDestroyed && !!(this.isRecording || this.playingVoiceId))
        },
        realtimeActivityCard,
        async refreshCallRecordings() {
            const revision = ++this.callRecordingRevision
            const identity = recordingIdentity()
            if (this.isGroupChat || !identity.admin) { this.callRecordingIndex = {}; this.callRecordingOwner = ''; return }
            const rows = await listCallRecordings().catch(() => [])
            if (revision !== this.callRecordingRevision) return
            const current = recordingIdentity()
            const index = Object.create(null)
            this.callRecordingOwner = ''
            if (current.admin && current.owner === identity.owner) {
                for (const row of rows) {
                    if (row.owner !== current.owner || !recordingPlayable(row) || !validRecordingCallId(row.callId)) continue
                    if (index[row.callId]) index[row.callId].count++
                    else index[row.callId] = { count: 1, name: row.name }
                }
                this.callRecordingOwner = current.owner
            }
            this.callRecordingIndex = index
        },
        localCallRecording(message) {
            const card = realtimeActivityCard(message)
            if (!card?.connected || card.activity !== 'call') return null
            const recording = this.callRecordingIndex[card.sessionId]
            if (!recording) return null
            const { admin, owner } = recordingIdentity()
            const peer = String(this.otherUserId)
            return admin && owner === this.callRecordingOwner && ((String(card.fromId) === owner && String(card.toId) === peer) ||
                (String(card.toId) === owner && String(card.fromId) === peer)) ? recording : null
        },
        openCallRecording(message) {
            if (this.localCallRecording(message)) uni.navigateTo({ url: `/pages-nonTheme/call-recordings?callId=${realtimeActivityCard(message).sessionId}` })
        },
        openRealtimeActivity(message) {
            const card = realtimeActivityCard(message)
            const ownId = String(this.getCurrentUserId())
            if (!card || this.isGroupChat || ![String(card.fromId), String(card.toId)].includes(ownId)) return
            const peerId = String(card.fromId) === ownId ? String(card.toId) : String(card.fromId)
            if (peerId !== String(this.otherUserId)) return
            const name = this.contactSettings.note || this.otherUsername || this.chatTitle || '联系人'
            if (card.activity === 'location') {
                // Always join this exact session. An expired record never starts a new share.
                uni.navigateTo({ url: `/pages-nonTheme/live-location?peerId=${encodeURIComponent(peerId)}&name=${encodeURIComponent(name)}&sessionId=${encodeURIComponent(card.sessionId)}` })
            } else if (['calling', 'incoming', 'connecting', 'connected'].includes(voiceCallState.phase)) {
                if (String(voiceCallState.peer?.id) === peerId) openVoiceCallPage()
                else uni.showToast({ title: '请先结束当前通话', icon: 'none' })
            } else {
                // #ifdef APP-PLUS || H5
                this.startVoiceCall(card.mode)
                // #endif
                // #ifdef MP-WEIXIN
                void this.openWebCall(card.mode)
                // #endif
                // #ifndef APP-PLUS || H5 || MP-WEIXIN
                this.showCallSupport()
                // #endif
            }
        },
        communityPostLink,
        communityPostCard,
        openCommunityPost(message) {
            const url = communityPostLink(message)
            if (url) uni.navigateTo({ url })
            else uni.showToast({ title: '帖子链接无效', icon: 'none' })
        },
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
        ...audioInitializationMethods,

        normalizeStoredUserInfo(userInfo) {
            return userInfo?.data || userInfo?.user || userInfo || {}
        },

        hasUsableAvatar(avatar) {
            return Boolean(
                avatar &&
                typeof avatar === 'string' &&
                avatar.trim() !== '' &&
                avatar !== 'null' &&
                avatar !== 'undefined' &&
                !avatar.includes('default-avatar') &&
                !avatar.includes('/images/person.webp.png')
            )
        },

        async loadUserInfo() {
            try {
                const userInfo = this.normalizeStoredUserInfo(uni.getStorageSync('userInfo'))
                const hasCachedAdminPermission = userInfo?.isAdmin === true || uni.getStorageSync('isAdmin') === true
                this.mode = hasCachedAdminPermission ? 'admin' : 'customer'
                if (userInfo) {
                    if (this.hasUsableAvatar(userInfo.avatar)) {
                        this.userAvatar = userInfo.avatar
                    }
                }
                if (!this.hasSyncedUserProfile) {
                    this.loadUserProfileForAvatar()
                }
            } catch (e) {
                console.error('获取用户信息失败', e)
            }
        },

        async loadUserProfileForAvatar() {
            if (this.loadingUserProfile) return
            this.loadingUserProfile = true
            try {
                const res = await getUserProfile()
                if (res && res.code === 0 && res.data) {
                    if (this.hasUsableAvatar(res.data.avatar)) {
                        this.userAvatar = res.data.avatar
                    }
                    const isAdmin = res.data.isAdmin === true
                    this.mode = isAdmin ? 'admin' : 'customer'
                    if (isAdmin) {
                        uni.setStorageSync('isAdmin', true)
                    } else {
                        uni.removeStorageSync('isAdmin')
                    }
                    const cached = this.normalizeStoredUserInfo(uni.getStorageSync('userInfo'))
                    uni.setStorageSync('userInfo', {
                        ...cached,
                        ...res.data,
                        id: res.data.id || cached.id || cached.userId,
                        userId: res.data.id || cached.userId || cached.id
                    })
                }
            } catch (e) {
                console.warn('加载当前用户头像失败:', e?.message || e)
            } finally {
                this.loadingUserProfile = false
                this.hasSyncedUserProfile = true
            }
        },

        cleanupDragDropEvent() {
            // #ifdef H5
            const listeners = this.h5DragDropListeners
            if (!listeners) return

            document.removeEventListener('paste', listeners.pasteHandler, true)
            document.removeEventListener('dragover', listeners.documentDragOverHandler, false)
            document.removeEventListener('drop', listeners.documentDropHandler, false)
            this.h5DragDropListeners = null
            this.isDragOver = false
            // #endif
        },

        // 初始化拖拽事件（H5环境）
        initDragDropEvent() {
            // #ifdef H5
            this.cleanupDragDropEvent()
            const container = document.querySelector('.chat-container')
            if (!container) {
                console.warn('未找到 chat-container 元素')
                return
            }

            // 拖拽本身由模板事件处理；这里只阻止页面外拖放触发浏览器默认行为。
            const documentDragOverHandler = (e) => {
                e.preventDefault()
            }
            const documentDropHandler = (e) => {
                e.preventDefault()
            }
            // 在捕获阶段处理文件粘贴，避免同一文件同时被原生和模板事件重复上传。
            const pasteHandler = (e) => {
                if (!container.contains(e.target)) return
                const clipboardData = e.clipboardData
                if (!clipboardData) return
                const hasFile = (clipboardData.files && clipboardData.files.length > 0) ||
                    Array.from(clipboardData.items || []).some(item => item.kind === 'file')
                if (!hasFile) return
                e.preventDefault()
                e.stopPropagation()
                this.onPasteNative(e)
            }

            document.addEventListener('paste', pasteHandler, true)
            document.addEventListener('dragover', documentDragOverHandler, false)
            document.addEventListener('drop', documentDropHandler, false)
            this.h5DragDropListeners = {
                pasteHandler,
                documentDragOverHandler,
                documentDropHandler
            }
            // #endif
        },

        ...imageSourceMethods,

        // ==================== 本地存储 ====================
        ...historyCacheMethods,

        // ==================== 本地文件缓存 ====================
        ...localFileCacheMethods,

        // ==================== 消息轮询 ====================
        handleChatEvent(event = {}) {
            if (!this.canPollMessages() || (event.conversationId && String(event.conversationId) !== String(this.chatId))) return
            if (event.kind === 'group.removed') {
                this.isChatPageActive = false
                this.stopMessagePolling()
                if (this.leavingGroup) return
                uni.showToast({ title: '你已退出群聊或群聊已解散', icon: 'none' })
                uni.navigateBack()
                return
            }
            if (event.kind === 'group.updated') this.loadGroupDetail()
            if (event.kind === 'message' && event.message?.id) {
                // Render the received record immediately. Batch HTTP catch-up/read
                // updates on the existing timer instead of fetching for every event.
                let atBottom = true
                // #ifdef H5
                const view = document.querySelector('.message-list')
                if (view) atBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 100
                // #endif
                this.mergeMessages([this.formatServerMessage({ ...event.message, Sender: event.message.Sender || event.sender })])
                this.chatEventsDirty = true
                if (atBottom) this.$nextTick(() => this.scrollToBottom())
                return
            }
            this.pendingHistoryReconcile = true
            this.chatEventsDirty = true
            if (this.messageCacheReady && this.activeMessagePollingVersion !== this.messagePollingVersion) {
                this.chatEventsDirty = false
                this.pollMessages()
            }
        },

        pollMessagesIfNeeded(pollingVersion = this.messagePollingVersion) {
            if (this.activeMessagePollingVersion === pollingVersion) return
            if (isChatEventsConnected() && !this.chatEventsDirty && Date.now() - this.lastMessageCheckAt < 60000) return
            this.chatEventsDirty = false
            this.pollMessages(pollingVersion)
        },

        startMessagePolling() {
            // 清除现有的轮询
            this.stopMessagePolling()
            if (!this.canPollMessages()) return

            const pollingVersion = this.messagePollingVersion
            this.lastHistoryReconcileAt = 0
            
            // 立即执行一次
            this.pollMessages(pollingVersion)
            
            // 启动定时轮询
            this.messagePollingTimer = setInterval(() => {
                this.pollMessagesIfNeeded(pollingVersion)
            }, this.pollingInterval)
        },
        
        stopMessagePolling() {
            // 令已经发出的请求在返回后失效，避免它更新已隐藏或销毁的页面。
            this.messagePollingVersion += 1
            this.activeMessagePollingVersion = null
            if (this.messagePollingTimer) {
                clearInterval(this.messagePollingTimer)
                this.messagePollingTimer = null
            }
        },

        canPollMessages() {
            if (!this.isChatPageActive || this.isChatPageDestroyed || !this.chatId) return false
            try {
                return Boolean(uni.getStorageSync('token'))
            } catch (e) {
                return false
            }
        },

        getConversationHistory(params = {}, requestOptions = {}) {
            return this.isGroupChat
                ? chatApi.getGroupHistory(this.groupId, params, requestOptions)
                : chatApi.getChatHistory({ chatId: this.chatId, ...params }, requestOptions)
        },

        getGroupMessageBoundaryId(direction = 'latest') {
            const ids = this.messages
                .map(message => Number(message.id))
                .filter(id => Number.isSafeInteger(id) && id > 0)
            if (ids.length === 0) return null
            return ids.reduce((boundary, id) => (
                direction === 'earliest' ? Math.min(boundary, id) : Math.max(boundary, id)
            ))
        },

        ...messageSyncMethods,
        ...messageSendMethods,

        async pollMessages(pollingVersion = this.messagePollingVersion) {
            if (
                !this.canPollMessages() ||
                pollingVersion !== this.messagePollingVersion ||
                this.activeMessagePollingVersion === pollingVersion
            ) return

            this.activeMessagePollingVersion = pollingVersion
            this.lastMessageCheckAt = Date.now()
            this.chatEventsConnected = isChatEventsConnected()
            if (this.pendingHistoryReconcile) {
                this.lastHistoryReconcileAt = 0
                this.pendingHistoryReconcile = false
            }
            try {
                // 静默获取最新消息（不显示加载提示）
                const messageList = await this.fetchConversationUpdates(pollingVersion)
                if (!this.canPollMessages() || pollingVersion !== this.messagePollingVersion) return

                if (messageList.length > 0) {
                    const serverMessages = messageList.map(m => this.formatServerMessage(m))
                    
                    // 检查是否有新消息
                    const existingIds = new Set(this.messages.map(m => String(m.id)))
                    const newMessages = serverMessages.filter(m => !existingIds.has(String(m.id)))
                    
                    if (newMessages.length > 0) {
                        console.log(`轮询发现 ${newMessages.length} 条新消息`)
                        this.mergeMessages(serverMessages)
                        
                        // 如果在底部，自动滚动
                        this.$nextTick(() => {
                            // #ifdef H5
                            const scrollView = document.querySelector('.message-list')
                            if (scrollView) {
                                const isAtBottom = scrollView.scrollHeight - scrollView.scrollTop - scrollView.clientHeight < 100
                                if (isAtBottom) {
                                    this.scrollToBottom()
                                }
                            }
                            // #endif
                        })
                    } else {
                        // 即使没有新消息，也要更新现有消息（可能状态变化）
                        this.mergeMessages(serverMessages)
                    }
                }
                this.positionInitialChatAtBottom()
            } catch (e) {
                if (this.canPollMessages() && pollingVersion === this.messagePollingVersion) {
                    this.chatEventsDirty = true
                    if (this.isGroupChat && (e?.statusCode === 403 || e?.statusCode === 404)) {
                        this.isChatPageActive = false
                        this.stopMessagePolling()
                        uni.showToast({ title: '群聊已不可访问', icon: 'none' })
                        uni.navigateBack()
                    } else console.error('轮询消息失败:', e)
                }
                // 轮询失败不影响用户使用，静默处理
            } finally {
                if (this.activeMessagePollingVersion === pollingVersion) {
                    this.activeMessagePollingVersion = null
                }
            }
        },

        // ==================== 从服务器加载消息 ====================
        async loadMessagesFromServer() {
            try {
                const res = await this.getConversationHistory({
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
                        if (!localMsg.clientMessageId && typeof localMsg.id === 'string' && localMsg.id.includes('_')) {
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
            const activity = realtimeActivityCard(serverMsg)
            const postCard = communityPostCard(serverMsg)
            const currentUserId = this.getCurrentUserId()
            const isSelf = !serverMsg.isAi && (currentUserId
                ? String(serverMsg.senderId) === String(currentUserId)
                : String(serverMsg.receiverId) === String(this.otherUserId))
            
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
                clientMessageId: serverMsg.clientMessageId || null,
                type: activity || postCard ? 'others' : serverMsg.type || 'text',
                content: activity ? JSON.stringify(activity) : postCard ? JSON.stringify(postCard) : content,
                isSelf: isSelf,
                isAi: !!serverMsg.isAi,
                senderId: serverMsg.senderId,
                receiverId: serverMsg.receiverId,
                senderName: serverMsg.isAi ? 'AI 环保助手' : getDisplayName(serverMsg.Sender || serverMsg.sender, ''),
                senderUsername: serverMsg.Sender?.username || serverMsg.sender?.username || '',
                senderNickname: serverMsg.Sender?.nickname || serverMsg.sender?.nickname || '',
                senderAvatar: serverMsg.isAi ? '' : (serverMsg.Sender?.avatar || serverMsg.sender?.avatar || ''),
                timestamp: new Date(serverMsg.sendTime || serverMsg.createTime || serverMsg.timestamp).getTime() || Date.now(),
                status: 'sent',
                duration: serverMsg.duration || parsedContent?.duration,
                voiceText: parsedContent?.toText || '',
                voicePath: parsedContent?.path || '',
                fileName: serverMsg.fileName || parsedContent?.fileName || parsedContent?.name,
                fileSize: serverMsg.fileSize || parsedContent?.fileSize || parsedContent?.size,
                thumbnail: serverMsg.type === 'image'
                    ? this.buildReviewUrl(parsedContent?.path || content)
                    : (serverMsg.thumbnail || (parsedContent?.thumbnail ? `${baseUrl}/files/download/${parsedContent.thumbnail}` : null)),
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

        decodeTokenPayload(token) {
            try {
                const payload = String(token || '').split('.')[1]
                if (!payload) return null
                const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
                const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
                let json = ''
                // #ifdef H5
                json = decodeURIComponent(escape(window.atob(padded)))
                // #endif
                // #ifndef H5
                const decoder = typeof atob === 'function' ? atob : null
                if (decoder) json = decodeURIComponent(escape(decoder(padded)))
                // #endif
                return json ? JSON.parse(json) : null
            } catch (e) {
                return null
            }
        },

        getServerMessageId(data) {
            return data?.id || data?.messageId || data?._id || ''
        },

        markCurrentChatRead() {
            if (this.isGroupChat) {
                this.markChatListCacheRead(`group:${this.groupId}`)
                return
            }
            const targetId = this.otherUserId || this.chatId
            if (!targetId) return
            this.markChatListCacheRead(targetId)
            chatApi.markAsRead(targetId).catch(e => {
                console.warn('标记聊天已读失败:', e?.message || e)
            })
        },

        markChatListCacheRead(targetId) {
            try {
                const currentUserId = this.getCurrentUserId()
                if (!currentUserId || !targetId) return
                const cacheKey = `chatlist_${currentUserId}`
                const cached = uni.getStorageSync(cacheKey)
                if (!cached || typeof cached !== 'string') return
                const cacheData = JSON.parse(cached)
                if (!cacheData || !Array.isArray(cacheData.userList)) return

                let changed = false
                cacheData.userList = cacheData.userList.map(user => {
                    if (String(user.otherId) !== String(targetId)) return user
                    changed = true
                    return {
                        ...user,
                        unreadCount: 0,
                        latestContent: user.latestContent
                            ? { ...user.latestContent, isRead: true }
                            : user.latestContent
                    }
                })
                if (changed) {
                    cacheData.timestamp = Date.now()
                    uni.setStorageSync(cacheKey, JSON.stringify(cacheData))
                }
            } catch (e) {
                console.warn('同步聊天列表已读缓存失败:', e?.message || e)
            }
        },

        syncChatListTopCache(targetId, top) {
            try {
                const currentUserId = this.getCurrentUserId()
                if (!currentUserId || !targetId) return
                const cacheKey = `chatlist_${currentUserId}`
                const cached = uni.getStorageSync(cacheKey)
                if (!cached || typeof cached !== 'string') return
                const cacheData = JSON.parse(cached)
                if (!cacheData || !Array.isArray(cacheData.userList)) return

                let changed = false
                cacheData.userList = cacheData.userList.map(user => {
                    if (String(user.otherId) !== String(targetId)) return user
                    changed = true
                    return {
                        ...user,
                        top: Boolean(top)
                    }
                }).sort((a, b) => {
                    const topDiff = Number(Boolean(b?.top)) - Number(Boolean(a?.top))
                    if (topDiff !== 0) return topDiff
                    const timeA = new Date(a?.latestContent?.sendTime || a?.lastMessageTime || 0).getTime() || 0
                    const timeB = new Date(b?.latestContent?.sendTime || b?.lastMessageTime || 0).getTime() || 0
                    return timeB - timeA
                })

                if (changed) {
                    cacheData.timestamp = Date.now()
                    uni.setStorageSync(cacheKey, JSON.stringify(cacheData))
                }
            } catch (e) {
                console.warn('同步聊天置顶缓存失败:', e?.message || e)
            }
        },

        // 获取当前用户ID
        getCurrentUserId() {
            try {
                const userInfo = uni.getStorageSync('userInfo')
                const userId =
                    userInfo?.id ||
                    userInfo?.userId ||
                    userInfo?.user?.id ||
                    userInfo?.user?.userId ||
                    userInfo?.data?.id ||
                    userInfo?.data?.userId ||
                    ''
                if (userId !== '' && userId !== null && userId !== undefined) {
                    return userId
                }
                const tokenPayload = this.decodeTokenPayload(uni.getStorageSync('token'))
                return tokenPayload?.userId || tokenPayload?.id || ''
            } catch (e) {
                console.error('获取用户ID失败:', e)
                return ''
            }
        },

        // 合并消息（去重并更新）
        mergeMessages(serverMessages) {
            const incoming = new Map(serverMessages.map(message => [String(message.id), message]))
            const byClientKey = new Map(serverMessages.filter(message => message.clientMessageId).map(message => [message.clientMessageId, message]))
            const merged = new Map()
            for (const local of this.messages) {
                const server = incoming.get(String(local.id)) || (local.clientMessageId && byClientKey.get(local.clientMessageId))
                let message = server || local
                if (server && local.type === 'image' && local.content !== server.content) {
                    this.clearLoadedOriginalImage(local.id)
                    delete this.imageRetryNonces[local.id]
                }
                if (server && !server.isWithdraw && local.isSelf && ['image', 'video', 'file'].includes(local.type) && local.content?.startsWith('blob:')) {
                    message = { ...server, content: local.content,
                        thumbnail: local.type === 'video' && local.thumbnail?.startsWith('blob:') ? local.thumbnail : server.thumbnail }
                } else if (server && local.originalLoaded && local.content === server.content) {
                    message = { ...server, originalLoaded: true }
                }
                merged.set(String(message.id), message)
            }
            for (const [id, server] of incoming) if (!merged.has(id)) merged.set(id, server)
            const messages = Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp || (Number(a.id) || 0) - (Number(b.id) || 0))
            if (JSON.stringify(messages) !== JSON.stringify(this.messages)) {
                this.messages = messages
                this.saveMessagesToStorage()
            }
        },

        // ==================== 消息加载 ====================
        async loadMoreMessages() {
            if (this.isLoadingMore || !this.hasMoreMessages) return

            this.isLoadingMore = true

            try {
                this.currentPage++
                const historyParams = {
                    page: this.currentPage,
                    pageSize: this.pageSize
                }
                {
                    const earliestMessageId = this.getGroupMessageBoundaryId('earliest')
                    if (earliestMessageId) {
                        historyParams.page = 1
                        if (this.isGroupChat) historyParams.beforeId = earliestMessageId
                        else historyParams.lastMessageId = earliestMessageId
                    }
                }
                const res = await this.getConversationHistory(historyParams)

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
                    const existingIds = new Set(this.messages.map(m => String(m.id)))
                    const newMessages = serverMessages.filter(m => !existingIds.has(String(m.id)))
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
            this.saveChatDraft()
            this.resetTextInputHeight()

            // 发送到服务器
            try {
                const res = await this.sendCreatedMessage(msg)

                // 更新消息ID和状态
                const newId = this.getServerMessageId(res.data)
                if (newId) {
                    this.updateMessageStatus(msg.id, 'sent', newId)
                } else {
                    this.updateMessageStatus(msg.id, 'sent')
                }
                
                // The reference was consumed when the optimistic message was created.
                if (this.shouldInvokeAi(text)) {
                    this.requestMentionAi(text)
                }
            } catch (e) {
                console.error('发送文本消息失败', e)
                this.updateMessageStatus(msg.id, 'failed')
            }
        },

        shouldInvokeAi(text) {
            return /@AI\b/i.test(String(text || ''))
        },

        requestMentionAi(mentionText) {
            if (this.isMentionStreaming) {
                uni.showToast({ title: 'AI 正在回复上一条消息', icon: 'none' })
                return
            }
            const aiMessage = {
                id: `ai_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: 'text',
                content: '正在思考...',
                isSelf: false,
                isAi: true,
                senderName: 'AI 对话助手',
                timestamp: Date.now(),
                status: 'streaming'
            }
            this.isMentionStreaming = true
            this.aiStreamingMessageId = aiMessage.id
            this.addMessage(aiMessage)

            // #ifdef H5
            this.streamMentionAiH5(mentionText, aiMessage.id)
            // #endif
            // #ifndef H5
            this.streamMentionAiSocket(mentionText, aiMessage.id)
            // #endif
        },

        updateStreamingAiMessage(messageId, content, options = {}) {
            const message = this.messages.find((item) => item.id === messageId)
            if (!message) return
            if (content !== undefined) message.content = content || '正在思考...'
            if (options.status) message.status = options.status
            if (options.newId) message.id = options.newId
            this.saveMessagesToStorage()
            this.$nextTick(() => this.scrollToBottom())
        },

        finishMentionAi(messageId, content, newId) {
            this.updateStreamingAiMessage(messageId, content, { status: 'sent', newId })
            this.isMentionStreaming = false
            this.aiStreamingMessageId = ''
            this.mentionAbortController = null
            this.closeMentionSocket()
        },

        failMentionAi(messageId, message) {
            this.updateStreamingAiMessage(messageId, message || 'AI 回复失败，请稍后重试。', { status: 'failed' })
            this.isMentionStreaming = false
            this.aiStreamingMessageId = ''
            this.mentionAbortController = null
            this.closeMentionSocket()
        },

        closeMentionSocket() {
            if (!this.mentionSocket) return
            try {
                if (typeof this.mentionSocket.close === 'function') this.mentionSocket.close()
                else if (typeof uni.closeSocket === 'function') uni.closeSocket()
            } catch (_) {}
            this.mentionSocket = null
        },

        async streamMentionAiH5(mentionText, messageId) {
            try {
                this.mentionAbortController = new AbortController()
                const token = uni.getStorageSync('token') || ''
                const response = await fetch(`${baseUrl}/api/chat/ai/mention/stream`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: token } : {})
                    },
                    body: JSON.stringify({
                        conversationType: this.isGroupChat ? 'group' : 'direct',
                        targetUserId: this.otherUserId,
                        groupId: this.groupId,
                        mentionText
                    }),
                    signal: this.mentionAbortController.signal
                })
                if (!response.ok || !response.body) throw new Error(`请求失败 (${response.status})`)

                const reader = response.body.getReader()
                const decoder = new TextDecoder('utf-8')
                let buffer = ''
                while (true) {
                    const { value, done } = await reader.read()
                    if (done) break
                    buffer += decoder.decode(value, { stream: true })
                    const events = buffer.split('\n\n')
                    buffer = events.pop() || ''
                    for (const eventBlock of events) {
                        let eventName = 'message'
                        let data = null
                        for (const line of eventBlock.split('\n')) {
                            if (line.startsWith('event:')) eventName = line.slice(6).trim()
                            if (line.startsWith('data:')) {
                                try { data = JSON.parse(line.slice(5).trim()) } catch (_) {}
                            }
                        }
                        if (!data) continue
                        if (eventName === 'delta') this.updateStreamingAiMessage(messageId, data.full || data.chunk)
                        else if (eventName === 'done') this.finishMentionAi(messageId, data.content, data.messageId)
                        else if (eventName === 'error') this.failMentionAi(messageId, data.message)
                    }
                }
                reader.releaseLock()
                if (this.isMentionStreaming && this.aiStreamingMessageId === messageId) {
                    this.failMentionAi(messageId, 'AI 回复已中断，请重试。')
                }
            } catch (error) {
                if (error?.name === 'AbortError') return
                console.error('AI 流式回复失败:', error)
                this.failMentionAi(messageId, error?.message || 'AI 回复失败，请稍后重试。')
            }
        },

        streamMentionAiSocket(mentionText, messageId) {
            const token = uni.getStorageSync('token') || ''
            if (!token) {
                this.failMentionAi(messageId, '登录已失效，请重新登录。')
                return
            }
            const socketUrl = `${baseUrl.replace(/^http/, 'ws')}/ws/ai/chat?token=${encodeURIComponent(token)}`
            let settled = false
            const fail = (message) => {
                if (settled) return
                settled = true
                this.failMentionAi(messageId, message)
            }
            const sendMentionPayload = (sender) => {
                try {
                    const payload = JSON.stringify({
                        type: 'mention',
                        conversationType: this.isGroupChat ? 'group' : 'direct',
                        targetUserId: this.otherUserId,
                        groupId: this.groupId,
                        mentionText
                    })
                    if (sender && typeof sender.send === 'function') {
                        sender.send({ data: payload })
                    } else if (typeof uni.sendSocketMessage === 'function') {
                        uni.sendSocketMessage({ data: payload })
                    }
                } catch (_) {}
            }
            const handleMessage = (event) => {
                let data
                try { data = JSON.parse(event.data) } catch (_) { return }
                if (data.type === 'delta') this.updateStreamingAiMessage(messageId, data.full || data.chunk)
                else if (data.type === 'done') {
                    settled = true
                    this.finishMentionAi(messageId, data.content, data.messageId)
                } else if (data.type === 'error') fail(data.message || 'AI 回复失败，请稍后重试。')
            }
            const handleError = () => fail('AI 连接失败，请稍后重试。')
            const handleClose = () => {
                if (!settled && this.isMentionStreaming) fail('AI 连接已关闭，请重试。')
            }
            try {
                const socket = uni.connectSocket({ url: socketUrl, complete: () => {} })
                this.mentionSocket = socket
                // 兼容性处理：部分平台 socket 实例没有 onOpen 等方法，回退到全局监听
                if (socket && typeof socket.onOpen === 'function') {
                    socket.onOpen(() => sendMentionPayload(socket))
                    socket.onMessage(handleMessage)
                    socket.onError(handleError)
                    socket.onClose(handleClose)
                } else {
                    // 使用全局事件监听（兼容旧版/部分平台）
                    uni.onSocketOpen(() => sendMentionPayload(socket))
                    uni.onSocketMessage(handleMessage)
                    uni.onSocketError(handleError)
                    uni.onSocketClose(handleClose)
                }
            } catch (error) {
                fail(error?.message || 'AI 连接失败，请稍后重试。')
            }
        },

        ...mediaSendMethods,

        createMessage(type, content, extra = {}) {
            const clientMessageId = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 14)
            return {
                id: clientMessageId,
                clientMessageId,
                type,
                content,
                isSelf: true,
                timestamp: Date.now(),
                status: 'sending',
                refId: this.refMessageId || null,  // Capture the reference before async work starts.
                ...extra
            }
        },

        addMessage(msg) {
            this.messages.push(msg)
            if (msg.refId && String(msg.refId) === String(this.refMessageId)) this.clearRefMessage()
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
                    } else if (msgData.type === 'image' && parsed.path) {
                        content = `${baseUrl}/files/download/${String(parsed.path).replace(/\\/g, '/')}`
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
            if (msg.type === 'image') {
                msg.thumbnail = this.buildReviewUrl(content)
            }
            this.messages.push(msg)
            this.saveMessagesToStorage()
            this.$nextTick(() => {
                this.scrollToBottom()
            })
            
            // 发送系统通知 
            // 获取发送者名称
            const senderName = this.contactSettings.note || this.otherUsername || this.chatTitle || '用户'
            
            // 调用全局通知系统
            triggerMessageNotification({
                senderName: senderName,
                content: msgData.content,
                type: msgData.type || 'text',
                fileName: msgData.fileName
            }, {
                playSound: !this.contactSettings.mute,
                vibrate: false,
                quiet: true,
                showNotification: false
            }).catch(e => {
                console.warn('消息通知失败:', e)
            })
        },

        updateMessageStatus(msgId, status, newId = null) {
            const msg = this.messages.find(m => m.id === msgId)
            if (msg) {
                msg.status = status
                // If polling received the ack first, retain just the server copy.
                if (newId && this.messages.some(item => item !== msg && String(item.id) === String(newId))) {
                    this.messages = this.messages.filter(item => item !== msg)
                    this.saveMessagesToStorage()
                    return
                }
                // 如果提供了新ID(服务器返回的真实ID),则更新消息ID
                if (newId && newId !== msgId) {
                    msg.id = newId
                }
                this.saveMessagesToStorage()
            }
        },

        async resendMessage(msg) {
            if (!msg || msg.status === 'sending') return
            if (!msg.clientMessageId && String(msg.id).includes('_')) msg.clientMessageId = String(msg.id)
            const originalId = msg.id
            msg.status = 'sending'
            this.saveMessagesToStorage()

            try {
                if (msg.clientMessageId) {
                    const response = await this.getConversationHistory({ clientMessageId: msg.clientMessageId, pageSize: 1 })
                    const rows = Array.isArray(response.data) ? response.data : response.data?.list || []
                    const delivered = rows.find(message => message.clientMessageId === msg.clientMessageId)
                    if (delivered) {
                        this.mergeMessages([this.formatServerMessage(delivered)])
                        return
                    }
                }
                const res = await this.sendCreatedMessage(msg)

                if (res && res.data) {
                    const newId = this.getServerMessageId(res.data)
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
        ...mediaPickerMethods,

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
            if (this.locationChoosing) return
            this.locationChoosing = true
            const owner = uni.getStorageSync('token') || ''
            const peer = this.otherUserId
            const page = getCurrentPages().slice(-1)[0]
            const isCurrent = () => getCurrentPages().slice(-1)[0] === page && owner === (uni.getStorageSync('token') || '') && peer === this.otherUserId
            chooseMiniLocation({ isCurrent }).then(res => {
                const msg = this.createMessage('location', '', {
                    locationName: res.name || '位置分享', locationAddress: res.address || '',
                    latitude: res.latitude, longitude: res.longitude
                })
                this.addMessage(msg)
                this.sendLocationMessage(msg)
            }).catch(error => {
                if (!isCurrent() || isLocationCancelled(error)) return
                showAppModal(this, {
                    title: '暂时无法选择位置',
                    content: `${locationErrorMessage(error)}。也可在地图中手动选点。`,
                    confirmText: '打开地图', showCancel: true,
                    success: result => {
                        if (result.confirm && isCurrent()) {
                            const page = this.theme === 'dark' ? '/pages-dark/map/map?mode=select' : '/pages/map/map?mode=select'
                            uni.navigateTo({ url: page })
                        }
                    }
                })
            }).finally(() => { this.locationChoosing = false })
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
                const res = await this.sendCreatedMessage(msg)

                const newId = this.getServerMessageId(res.data)
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
        ...voiceRecordingMethods,

        // ==================== 语音播放 ====================
        ...voicePlaybackMethods,

        // ==================== 图片预览 ====================
        ...imagePreviewMethods,

        // 加载原图并缓存
        ...imageLoadingMethods,

        // ==================== 视频播放 ====================
        ...videoPlaybackMethods,

        // ==================== 文件操作 ====================
        ...fileAccessMethods,

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

        // linechange 同时覆盖逐字输入、换行和一次性粘贴；不支持该事件的平台会保持单行并在框内滚动。
        onInputLineChange(event) {
            const lineCount = Number(event?.detail?.lineCount)
            if (!Number.isFinite(lineCount) || lineCount < 1) return
            this.inputTextLineCount = Math.min(Math.max(Math.round(lineCount), 1), 4)
        },

        resetTextInputHeight() {
            this.inputTextLineCount = 1
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
            if (this.isGroupChat) this.loadGroupDetail()
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
                if (this.isGroupChat) await chatApi.updateGroupSettings(this.groupId, { notificationMuted: mute })
                else await chatApi.updateContactMute({ userId: this.otherUserId, mute })

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
                if (this.isGroupChat) {
                    await chatApi.updateGroupTop(this.groupId, top)
                } else {
                    await chatApi.updateContactTop({
                        userId: this.otherUserId,
                        top: top
                    })
                }

                this.contactSettings.top = top
                this.syncChatListTopCache(this.isGroupChat ? `group:${this.groupId}` : this.otherUserId, top)
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
            showAppModal(this, {
                title: '提示',
                content: '仅清空你自己的聊天记录，对方或其他群成员的记录将保留。此操作不可恢复。',
                success: async (res) => {
                    if (res.confirm) {
                        try {
                            await (this.isGroupChat ? chatApi.clearGroupHistory(this.groupId) : chatApi.clearChatHistory(this.chatId))
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
            showAppModal(this, {
                title: '警告',
                content: '确定删除该联系人及你自己的聊天记录吗？对方的记录不受影响。',
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
            if (this.isGroupChat) return
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

        async loadGroupDetail() {
            if (!this.isGroupChat) return
            try {
                const res = await chatApi.getGroupDetail(this.groupId)
                if (!res?.data) return
                this.groupInfo = res.data
                this.chatTitle = res.data.name || this.chatTitle
                this.otherAvatar = res.data.avatar || ''
                this.contactSettings.top = !!res.data.currentMember?.top
                this.contactSettings.mute = !!res.data.currentMember?.notificationMuted
            } catch (e) {
                console.error('加载群聊信息失败:', e)
            }
        },

        applyGroupInfo(group) {
            if (!group) return
            this.groupInfo = { ...(this.groupInfo || {}), ...group }
            this.chatTitle = group.name || this.chatTitle
            this.otherAvatar = group.avatar || ''
            if (this.groupSendBlockReason) { this.showEmojiPanel = false; this.showMorePanel = false }
        },

        editGroupName() {
            if (!this.canManageGroup) return
            showAppModal(this, {
                title: '修改群名称',
                editable: true,
                placeholderText: '请输入群名称',
                success: async (result) => {
                    if (!result.confirm) return
                    const name = String(result.content || '').trim()
                    if (!name) {
                        uni.showToast({ title: '群名称不能为空', icon: 'none' })
                        return
                    }
                    try {
                        const res = await chatApi.updateGroup(this.groupId, { name })
                        this.applyGroupInfo(res.data)
                        uni.showToast({ title: '群名称已更新', icon: 'success' })
                    } catch (error) {
                        console.error('修改群名称失败:', error)
                        uni.showToast({ title: '修改失败', icon: 'none' })
                    }
                }
            })
        },

        editGroupAvatar() {
            if (!this.canManageGroup) return
            chooseAppImage({
                count: 1,
                sizeType: ['compressed'],
                sourceType: ['album', 'camera'],
                success: async (result) => {
                    const filePath = result.tempFilePaths?.[0]
                    if (!filePath) return
                    let prepared
                    try {
                        uni.showLoading({ title: '上传中' })
                        prepared = await prepareAvatarUpload(filePath)
                        const res = await chatApi.updateGroupAvatar(this.groupId, prepared.path, undefined, prepared.file)
                        this.applyGroupInfo(res.data)
                        uni.showToast({ title: '群头像已更新', icon: 'success' })
                    } catch (error) {
                        console.error('修改群头像失败:', error)
                        uni.showToast({ title: '上传失败', icon: 'none' })
                    } finally {
                        prepared?.cleanup()
                        uni.hideLoading()
                    }
                }
            })
        },

        getGroupMemberName(member) {
            return member?.alias || getDisplayName(member?.User, `成员 ${member?.userId || ''}`)
        },

        getGroupMemberAvatar(member) {
            const avatar = member?.User?.avatar || ''
            if (avatar && typeof avatar === 'string' && !avatar.includes('default-avatar')) {
                return getAvatarUrl(avatar, baseUrl)
            }
            return this.generateAvatarFromName(this.getGroupMemberName(member), true)
        },

        getGroupMemberRole(member) {
            return ({ owner: '群主', admin: '管理员' })[member?.role] || ''
        },

        canRemoveGroupMember(member) {
            if (!this.canManageGroup || !member?.userId) return false
            if (String(member.userId) === String(this.getCurrentUserId())) return false
            return member.role === 'member' || (this.groupInfo?.currentMember?.role === 'owner' && member.role === 'admin')
        },

        async confirmRemoveGroupMember(member) {
            if (this.removingGroupMemberId || !this.canRemoveGroupMember(member)) return
            this.removingGroupMemberId = String(member.userId)
            try {
                const confirmed = await new Promise((resolve) => {
                    showAppModal(this, {
                        title: '移除群成员',
                        content: `确定将“${this.getGroupMemberName(member)}”移出群聊吗？`,
                        confirmText: '移除',
                        confirmColor: '#ef4444',
                        success: (result) => resolve(result.confirm),
                        fail: () => resolve(false)
                    })
                })
                if (!confirmed || !this.canRemoveGroupMember(member)) return
                const res = await chatApi.removeGroupMember(this.groupId, member.userId)
                if (res?.code !== 0) throw new Error(res?.msg || '移除失败，请重试')
                this.groupInfo.Members = this.groupInfo.Members.filter((item) => String(item.userId) !== String(member.userId))
                uni.showToast({ title: '已移除成员', icon: 'success' })
            } catch (error) {
                console.error('移除群成员失败:', error)
                uni.showToast({ title: '移除失败，请重试', icon: 'none' })
            } finally {
                this.removingGroupMemberId = ''
            }
        },

        ...groupManagementMethods,

        confirmLeaveGroup() {
            if (this.isGroupOwner) { uni.showToast({ title: '请先在成员管理中转让群主，或解散群聊', icon: 'none' }); return }
            showAppModal(this, {
                title: '退出群聊',
                content: '退出后将不再接收该群消息，确定继续吗？',
                confirmColor: '#ef4444',
                success: async (result) => {
                    if (!result.confirm) return
                    try {
                        this.leavingGroup = true
                        await chatApi.leaveGroup(this.groupId)
                        uni.showToast({ title: '已退出群聊', icon: 'success' })
                        setTimeout(() => uni.navigateBack(), 500)
                    } catch (e) {
                        this.leavingGroup = false
                        console.error('退出群聊失败:', e)
                    }
                }
            })
        },

        // 旧的 showMoreOptions 改名为 showMoreOptions_old,用于向后兼容
        showMoreOptions_old() {
            uni.showActionSheet({
                itemList: ['清空聊天记录'],
                success: (res) => {
                    if (res.tapIndex === 0) {
                        showAppModal(this, {
                            title: '提示',
                            content: '仅清空你自己的聊天记录，对方或其他群成员的记录将保留。此操作不可恢复。',
                            success: async (r) => {
                                if (r.confirm) {
                                    // 同步清空服务器记录
                                    try {
                                        await (this.isGroupChat ? chatApi.clearGroupHistory(this.groupId) : chatApi.clearChatHistory(this.chatId))
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
        ...attachmentIngressMethods,

        ...messageActionsMethods,

        ...voiceTranscriptionMethods,

        positionInitialChatAtBottom() {
            if (this.hasInitialScrolledToBottom || this.messages.length === 0) return
            this.hasInitialScrolledToBottom = true
            this.$nextTick(() => {
                this.scrollToBottom()
                // 等待首屏图片等异步布局稳定后再确认一次，保证长缓存进入时落在最新消息。
                setTimeout(() => this.scrollToBottom(), 60)
            })
        },

        scrollToBottom() {
            const last = this.timelineMessages[this.timelineMessages.length - 1]
            if (last) this.scrollToMessage = 'msg-' + last.id
        },

        // 图片加载成功
        onImageLoad(msg) {
            // 图片加载成功
        },

        // 图片加载失败
        ...imageErrorMethods,
        
        // 图片加载成功
        ...imageRetryMethods,

        // 用户头像加载失败,清除无效头像,强制生成新头像
        onUserAvatarError() {
            // 将头像设置为空,触发重新渲染,这次会生成头像
            this.userAvatar = ''
        },

        // ==================== 工具方法 ====================
        shouldShowTime(index) {
            if (index === 0) return true

            const current = this.timelineMessages[index]
            const prev = this.timelineMessages[index - 1]

            return current.timestamp - prev.timestamp > 300000 // 5分钟
        },

        formatTime(timestamp) {
            const date = new Date(timestamp)
            const now = new Date()
            const diff = now - date

            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            const timeStr = `${hours}:${minutes}`

            if (diff < 86400000 && date.getDate() === now.getDate()) {
                return timeStr
            } else if (diff < 172800000) {
                return '昨天 ' + timeStr
            } else {
                const month = String(date.getMonth() + 1).padStart(2, '0')
                const day = String(date.getDate()).padStart(2, '0')
                return `${month}/${day} ${timeStr}`
            }
        },

        ...mediaFormattingMethods,

        // ==================== 消息引用相关 ====================
        // 获取被引用消息的预览文本
        getRefMessagePreview(refId) {
            const refMsg = this.messages.find(m => String(m.id) === String(refId))
            if (!refMsg) return '[点击加载原消息]'
            if (refMsg.isWithdraw) return '[消息已撤回]'
            
            switch (refMsg.type) {
                case 'others':
                    if (realtimeActivityCard(refMsg)) return realtimeActivitySummary(realtimeActivityCard(refMsg), refMsg.isSelf)
                    return communityPostCard(refMsg) ? `[社区帖子] ${communityPostCard(refMsg).title}` : '[消息]'
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
            const refMsg = this.messages.find(m => String(m.id) === String(refId))
            if (!refMsg) return '用户'
            if (refMsg.isSelf) return '你'
            return this.isGroupChat ? this.getMessageSenderName(refMsg) : (this.contactSettings.note || this.otherUsername || this.chatTitle || '对方')
        },

        // 获取被引用消息的类型，用于样式判断
        getRefMessageType(refId) {
            const refMsg = this.messages.find(m => String(m.id) === String(refId))
            if (!refMsg) return 'unknown'
            return refMsg.isSelf ? 'self' : 'other'
        },

        // 清除当前选择的引用消息
        clearRefMessage() {
            this.refMessageId = null
            this.showRefSuggestion = false
        },

        // 跳转到被引用的消息
        async jumpToRefMessage(refId) {
            if (this.loadingReference) return
            this.loadingReference = true
            try {
                let target = this.messages.find(message => String(message.id) === String(refId))
                if (!target) {
                    uni.showLoading({ title: '定位消息中' })
                    const result = await this.getConversationHistory({ messageId: refId, pageSize: 1 })
                    const rows = Array.isArray(result.data) ? result.data : result.data?.list || []
                    const raw = rows.find(message => String(message.id) === String(refId))
                    if (!raw) { uni.showToast({ title: '原消息已删除或不可访问', icon: 'none' }); return }
                    const boundary = this.getGroupMessageBoundaryId('earliest')
                    const loaded = [raw]
                    let cursor = Number(refId)
                    // Fill the intervening history, so adding an old reference does not
                    // move the older-history cursor past an unloaded gap.
                    while (boundary && cursor < boundary && this.isChatPageActive) {
                        const response = await this.getConversationHistory({ afterId: cursor, pageSize: 100 })
                        const batch = Array.isArray(response.data) ? response.data : response.data?.list || []
                        const maximum = batch.reduce((value, message) => Math.max(value, Number(message.id) || 0), cursor)
                        loaded.push(...batch)
                        if (!response.incremental || maximum <= cursor) break
                        cursor = maximum
                    }
                    if (!this.isChatPageActive) return
                    this.mergeMessages(loaded.map(message => this.formatServerMessage(message)))
                    target = this.messages.find(message => String(message.id) === String(refId))
                }
                this.scrollToMessage = ''
                this.$nextTick(() => {
                    this.scrollToMessage = `msg-${refId}`
                    this.highlightMessageId = target.id
                    setTimeout(() => { this.highlightMessageId = null }, 1500)
                })
            } catch (error) {
                console.error('定位引用消息失败:', error)
                uni.showToast({ title: '定位失败，请重试', icon: 'none' })
            } finally {
                this.loadingReference = false
                uni.hideLoading()
            }
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

        getMessageAvatar(msg) {
            if (msg?.isAi || (msg?.senderName && (msg.senderName.includes('AI') || msg.senderName.includes('ai')))) {
                return getManifestIconPath('ai_assistant')
            }
            if (msg?.senderAvatar && typeof msg.senderAvatar === 'string' &&
                msg.senderAvatar.trim() !== '' &&
                msg.senderAvatar !== 'null' &&
                msg.senderAvatar !== 'undefined') {
                return getAvatarUrl(msg.senderAvatar, baseUrl)
            }
            if (this.isGroupChat) {
                const members = this.groupInfo?.Members || []
                let member = msg?.senderId != null
                    ? members.find(member => String(member.userId) === String(msg.senderId))
                    : null
                if (!member && msg?.senderId == null && msg?.senderName) {
                    const matches = members.filter(member => member.User?.username === (msg.senderUsername || msg.senderName))
                    if (matches.length === 1) member = matches[0]
                }
                if (member) return this.getGroupMemberAvatar(member)
            }
            // 群聊中用发送者姓名生成头像，避免回落到群聊标题首字
            if (this.isGroupChat && msg?.senderName) {
                return this.generateAvatarFromName(msg.senderName, true)
            }
            return this.otherAvatarUrl
        },

        getMessageSenderName(msg) {
            if (msg?.isAi) return 'AI 环保助手'
            if (this.isGroupChat && this.groupMemberAliases?.[String(msg?.senderId)]) return this.groupMemberAliases[String(msg.senderId)]
            return msg?.senderName || getDisplayName({ nickname: msg?.senderNickname, username: msg?.senderUsername }, this.chatTitle || '群成员')
        },

        // ==================== 已移至 computed 的方法（用于向后兼容） ====================
        
        // 原始的用户头像生成逻辑（已移至 computed.userAvatarUrl）
        _getUserAvatarOld() {
            // 获取用户信息
            const userInfo = uni.getStorageSync('userInfo')
            const username = getDisplayName(userInfo)
            
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
    // 旧版或部分小程序内核不识别 100dvh 时，保留可用的视口高度回退。
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    margin: 0;
    padding: 0;
    padding-top: var(--chat-header-height, 64px);
    box-sizing: border-box;
    --chat-header-height: 64px;
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

.chat-header .back-icon,
.chat-header .more-icon { filter: brightness(0) invert(1); }

.location-share-entry {
    display: flex; align-items: center; gap: 10px; flex: none;
    margin-top: 0; padding: 12px 18px; background: #e6f2eb; color: #227451;
}
.location-share-copy { flex: 1; min-width: 0; }
.location-share-title { display: block; font-size: 14px; font-weight: 600; }
.location-share-subtitle { display: block; margin-top: 3px; font-size: 11px; color: #668574; }
.location-share-arrow { font-size: 24px; }
.dark-theme .location-share-entry { background: #233d2e; color: #c0e4ce; }
.location-share-entry + .message-list { margin-top: 0; }
/* #ifdef APP-PLUS || MP-WEIXIN */
.chat-container { --chat-header-height: calc(44px + var(--chat-status-bar-height, 20px)); }
/* #endif */

/* #ifdef APP-PLUS || MP-WEIXIN */
.chat-header {
    height: calc(44px + var(--chat-status-bar-height, 20px));
    padding: var(--chat-status-bar-height, 20px) 15px 0;
}
/* #endif */

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
    margin-top: 0;
    min-height: 0;
    overflow-y: auto;
    background: var(--bg-primary);
    transition: all 0.3s ease;
    width: 100%;
    box-sizing: border-box;
}

/* #ifdef APP-PLUS || MP-WEIXIN */
.message-list {
    margin-top: 0;
}
/* #endif */

/* #ifdef MP-WEIXIN */
// 小程序的 scroll-view 必须拥有确定高度，才能由自身而不是 page 承担滚动。
.chat-container {
    min-height: 0;
    max-height: 100vh;
}

.message-list {
    height: 0;
    min-height: 0;
}
/* #endif */

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

.message-selecting { position: relative; padding-left: 44rpx; }
.message-selected { background: rgba(7,193,96,.08); }
.message-select-hitbox { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 5; }
.message-select-check { position: absolute; left: 5rpx; top: 36rpx; color: #07a96a; font-size: 36rpx; }
.message-action-menu { width: 500rpx; max-width: 90vw; max-height: 80vh; overflow-y: auto; border-radius: 20rpx; background: #fff; color: #25342e; }
.message-action-menu-item { display: flex; align-items: center; gap: 24rpx; padding: 24rpx 32rpx; text-align: left; font-size: 30rpx; border-bottom: 1rpx solid #edf0ee; }
.message-selection-toolbar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 900; display: flex; gap: 18rpx; align-items: center; justify-content: center; padding: 20rpx; background: #fff; box-shadow: 0 -2rpx 10rpx #0001; }
.message-selection-toolbar button { display: inline-flex; align-items: center; justify-content: center; gap: 6rpx; margin: 0; font-size: 26rpx; padding: 0 22rpx; }
.message-selection-toolbar text { font-size: 26rpx; color: #819088; }

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

.group-sender-name {
    margin: 0 0 6rpx 4rpx;
    color: #8a94a6;
    font-size: 22rpx;
    line-height: 1.2;
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

    .file-meta {
        display: flex;
        align-items: center;
        gap: 10rpx;
    }

    .file-preview-hint {
        padding: 2rpx 8rpx;
        border-radius: 6rpx;
        background: rgba(59, 130, 246, 0.1);
        color: #2563eb;
        font-size: 20rpx;
        line-height: 1.4;
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
.group-muted-notice {
    flex-shrink: 0;
    padding: 18px 16px calc(18px + env(safe-area-inset-bottom, 0px));
    text-align: center;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    font-size: 14px;
}

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
    min-width: 0;
    min-height: 72rpx;
    max-height: 204rpx;
    background: var(--input-bg);
    border-radius: 36rpx;
    padding: 12rpx 28rpx;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    align-items: stretch;
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
    box-shadow: var(--card-shadow);
}

.text-input {
    width: 100%;
    min-width: 0;
    min-height: 0;
    max-height: none;
    box-sizing: border-box;
    font-size: 30rpx;
    line-height: 1.5;
    color: var(--text-primary);
    background: transparent;
    overflow-y: auto;
    word-break: break-all;
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
    background: #e9eeeb;
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
    background: #eef2f0;
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
        width: 64rpx;
        height: 64rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
    }
}

.user-info-section {
    display: flex;
    align-items: center;
    padding: 40rpx;
    border-bottom: 1rpx solid #f0f0f0;

.group-avatar-editor {
    position: relative;
    flex-shrink: 0;
    width: 120rpx;
    height: 120rpx;
    margin-right: 30rpx;
    overflow: hidden;
    border-radius: 16rpx;

    &.editable {
        cursor: pointer;
    }

    .user-avatar-large {
        width: 120rpx;
        height: 120rpx;
        border-radius: 16rpx;
    }

    .group-avatar-edit-mask {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.42);
        color: #fff;
        font-size: 22rpx;
    }
}

    .user-details {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12rpx;

        &.editable {
            cursor: pointer;
        }

        .user-name-large {
            font-size: 36rpx;
            font-weight: 600;
            color: #333;
        }

        .user-id-text {
            font-size: 26rpx;
            color: #999;
        }

        .group-edit-hint {
            font-size: 22rpx;
            color: #0a9f75;
        }
    }
}

.group-members-section {
    padding: 24rpx 40rpx 30rpx;
    border-bottom: 1rpx solid #f0f0f0;
}

.group-members-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20rpx;
}

.group-members-title {
    font-size: 28rpx;
    font-weight: 600;
    color: #333;
}

.group-members-count,
.group-members-loading {
    font-size: 23rpx;
    color: #999;
}

.group-member-search { height: 64rpx; box-sizing: border-box; margin: 16rpx 0; padding: 0 18rpx; border-radius: 10rpx; background: #f3f5f4; font-size: 25rpx; }
.announcement-input { width: 100%; height: 280rpx; margin: 24rpx 0 12rpx; box-sizing: border-box; padding: 20rpx; background: #f3f5f4; border-radius: 12rpx; font-size: 28rpx; }

.group-members-grid {
    display: flex;
    flex-wrap: wrap;
}

.group-member {
    width: 20%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0 7rpx;
    margin-bottom: 22rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6rpx;
}

.group-member-avatar {
    width: 76rpx;
    height: 76rpx;
    border-radius: 16rpx;
    background: #edf3f2;
}

.group-member-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 21rpx;
    line-height: 28rpx;
    color: #49545d;
    text-align: center;
}

.group-member-role {
    padding: 0 7rpx;
    border-radius: 6rpx;
    background: #e5f7ef;
    color: #07865f;
    font-size: 18rpx;
    line-height: 26rpx;
}

.group-member-remove {
    margin: 0;
    padding: 4rpx 12rpx;
    border-radius: 8rpx;
    background: #fff0f0;
    color: #ef4444;
    font-size: 21rpx;
    line-height: 32rpx;

    &::after {
        border: none;
    }

    &[disabled] {
        opacity: 0.5;
    }
}

.settings-list {
    padding: 20rpx 0;
}

.settings-section-title {
    padding: 22rpx 40rpx 14rpx;
    border-top: 12rpx solid #f3f5f4;
    background: #fff;
    color: #7b8881;
    font-size: 24rpx;
    font-weight: 600;
    line-height: 1.5;
}

.settings-section-first {
    border-top: 1rpx solid #e5ebe7;
}

.settings-list-group > .setting-item {
    border-bottom-color: #e5ebe7;
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

            &::after { border: none; }

            &.confirm-btn {
                background: #16845b;
                color: #fff;

                &:active { background: #116d4b; }
            }

            &[disabled] {
                opacity: 0.5;
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
