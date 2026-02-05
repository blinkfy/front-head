<template>
    <view class="database-page" v-if="adminUser">
        <!-- 动态科技背景 -->
        <view class="tech-background">
            <view class="grid-overlay"></view>
            <view class="floating-particles">
                <view class="particle" v-for="n in 12" :key="n" :style="{ animationDelay: (n * 0.5) + 's' }"></view>
            </view>
            <view class="circuit-lines">
                <view class="line horizontal"></view>
                <view class="line vertical"></view>
            </view>
            <view class="data-streams">
                <view class="stream" v-for="n in 6" :key="n"></view>
            </view>
        </view>

        <!-- 可滚动内容区域 -->
        <scroll-view class="database-scroll-container" scroll-y enable-back-to-top :scroll-with-animation="true"
            :show-scrollbar="false">
            <view class="database-container">

                <!-- 头部状态栏 -->
                <view class="status-bar">
                    <view class="safe-area-top"></view>
                    <view class="status-content">
                        <view class="back-btn" @click="goBack">
                            <text class="back-icon">←</text>
                        </view>
                        <text class="title-text">数据库管理</text>
                        <view class="refresh-btn" @click="handleRefresh" :class="{ rotating: isRefreshing }">
                            <text>♻️</text>
                        </view>
                    </view>
                </view>

                <!-- 数据表选择卡片 -->
                <view class="tables-card">
                    <scroll-view class="tables-scroll" scroll-x :show-scrollbar="false">
                        <view class="tables-row">
                            <view class="table-item" v-for="table in tables" :key="table.name"
                                :class="{ active: currentTable === table.name }" @click="selectTable(table.name)">
                                <text class="table-icon">{{ table.icon }}</text>
                                <view class="table-info">
                                    <text class="table-name">{{ table.label }}</text>
                                    <text class="table-count">{{ table.count }}</text>
                                </view>
                            </view>
                        </view>
                    </scroll-view>
                </view>

                <!-- 搜索栏 -->
                <view class="search-card" v-if="currentTable">
                    <view class="search-container">
                        <view class="search-icon">🔍</view>
                        <input class="search-input" :value="searchKeyword" :placeholder="getSearchPlaceholder()"
                            @input="handleSearchInput" @confirm="handleSearch" confirm-type="search" />
                        <view class="search-clear" v-if="searchKeyword" @click="clearSearch">
                            <text>✕</text>
                        </view>
                        <view class="search-btn" @click="handleSearch">
                            <text>搜索</text>
                        </view>
                    </view>

                    <!-- 时间筛选栏 -->
                    <view class="filter-container">
                        <view class="filter-item">
                            <text class="filter-label">📅 开始日期</text>
                            <picker mode="date" :value="startDate" @change="onStartDateChange"
                                :end="endDate || getCurrentDate()">
                                <view class="filter-picker">
                                    <text class="filter-value">{{ startDate || '选择日期' }}</text>
                                    <text class="picker-arrow">▼</text>
                                </view>
                            </picker>
                        </view>

                        <view class="filter-item">
                            <text class="filter-label">📅 结束日期</text>
                            <picker mode="date" :value="endDate" @change="onEndDateChange" :start="startDate"
                                :end="getCurrentDate()">
                                <view class="filter-picker">
                                    <text class="filter-value">{{ endDate || '选择日期' }}</text>
                                    <text class="picker-arrow">▼</text>
                                </view>
                            </picker>
                        </view>

                        <!-- Messages表专属筛选 -->
                        <template v-if="currentTable === 'Messages'">
                            <view class="filter-item">
                                <text class="filter-label">📝 消息类型</text>
                                <picker :value="messageTypeFilterIndex" :range="messageTypeFilterOptions"
                                    range-key="label" @change="onMessageTypeFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ messageTypeFilterOptions[messageTypeFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">👁️ 已读状态</text>
                                <picker :value="readStatusFilterIndex" :range="readStatusFilterOptions"
                                    range-key="label" @change="onReadStatusFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ readStatusFilterOptions[readStatusFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">↩️ 撤回状态</text>
                                <picker :value="withdrawStatusFilterIndex" :range="withdrawStatusFilterOptions"
                                    range-key="label" @change="onWithdrawStatusFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ withdrawStatusFilterOptions[withdrawStatusFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">🗑️ 发送者删除</text>
                                <picker :value="senderDeletedFilterIndex" :range="deletedFilterOptions"
                                    range-key="label" @change="onSenderDeletedFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ deletedFilterOptions[senderDeletedFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">🗑️ 接收者删除</text>
                                <picker :value="receiverDeletedFilterIndex" :range="deletedFilterOptions"
                                    range-key="label" @change="onReceiverDeletedFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ deletedFilterOptions[receiverDeletedFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>
                        </template>

                        <!-- Chat表专属筛选 -->
                        <template v-if="currentTable === 'Chat'">
                            <view class="filter-item">
                                <text class="filter-label">👥 关系类型</text>
                                <picker :value="relationshipFilterIndex" :range="relationshipFilterOptions"
                                    range-key="label" @change="onRelationshipFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ relationshipFilterOptions[relationshipFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">🔇 勿扰状态</text>
                                <picker :value="muteFilterIndex" :range="muteFilterOptions"
                                    range-key="label" @change="onMuteFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ muteFilterOptions[muteFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">📌 置顶状态</text>
                                <picker :value="topFilterIndex" :range="topFilterOptions"
                                    range-key="label" @change="onTopFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ topFilterOptions[topFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>
                        </template>

                        <!-- History表专属筛选 -->
                        <template v-if="currentTable === 'History'">
                            <view class="filter-item">
                                <text class="filter-label">📍 来源</text>
                                <picker :value="sourceFilterIndex" :range="sourceFilterOptions"
                                    range-key="label" @change="onSourceFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ sourceFilterOptions[sourceFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>
                        </template>

                        <!-- Bin表专属筛选 -->
                        <template v-if="currentTable === 'Bin'">
                            <view class="filter-item">
                                <text class="filter-label">✅ 审核状态</text>
                                <picker :value="reviewFilterIndex" :range="reviewFilterOptions"
                                    range-key="label" @change="onReviewFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ reviewFilterOptions[reviewFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">📡 状态</text>
                                <picker :value="statusFilterIndex" :range="statusFilterOptions"
                                    range-key="label" @change="onStatusFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ statusFilterOptions[statusFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>

                            <view class="filter-item">
                                <text class="filter-label">🗑️ 类型</text>
                                <picker :value="binTypeFilterIndex" :range="binTypeFilterOptions"
                                    range-key="label" @change="onBinTypeFilterChange">
                                    <view class="filter-picker">
                                        <text class="filter-value">{{ binTypeFilterOptions[binTypeFilterIndex].label }}</text>
                                        <text class="picker-arrow">▼</text>
                                    </view>
                                </picker>
                            </view>
                        </template>

                        <view class="filter-actions">
                            <view class="filter-reset-btn" @click="resetFilters">
                                <text>重置所有筛选</text>
                            </view>
                        </view>
                    </view>
                </view>

                <!-- 当前表数据展示 -->
                <view class="data-card" v-if="currentTable">
                    <view class="data-header">
                        <text class="data-title">{{ getCurrentTableLabel() }}</text>
                        <view class="data-actions">
                            <view class="action-icon-btn" @click="handleAdd">
                                <text>➕</text>
                            </view>
                        </view>
                    </view>

                    <!-- 数据列表 -->
                    <view class="data-list">
                        <view v-if="tableData.length > 0" class="data-item" v-for="(item, index) in tableData"
                            :key="item.id || index">
                            <!-- 左侧ID列（所有表统一显示） -->
                            <view class="data-id-column">
                                <view class="id-badge">
                                    <text class="id-number">{{ currentTable === 'Chat' ? item.userId : item.id }}</text>
                                </view>
                            </view>

                            <view class="data-content">
                                <!-- Users 表 -->
                                <template v-if="currentTable === 'Users'">
                                    <view class="data-row">
                                        <text class="data-label">用户:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(item.username)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">积分:</text>
                                        <text class="data-value" style="color: #ffff80; font-weight: bold;">{{
                                            item.points || 0 }}</text>
                                    </view>
                                </template>

                                <!-- Bin 表 -->
                                <template v-if="currentTable === 'Bin'">
                                    <view class="data-row">
                                        <text class="data-label">名称:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(item.name)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">描述:</text>
                                        <rich-text class="data-value"
                                            :nodes="highlightText(item.describe || '')"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">类型:</text>
                                        <text class="data-value">{{ getBinTypeLabel(item.type) }}</text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">状态:</text>
                                        <text class="data-value"
                                            :class="item.status === 'online' ? 'success' : 'error'">{{ item.status
                                            }}</text>
                                    </view>
                                </template>

                                <!-- UserDevice 表 -->
                                <template v-if="currentTable === 'UserDevice'">
                                    <view class="data-row">
                                        <text class="data-label">用户:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(`${item.username || '未知'} (ID: ${item.userId})`)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">设备:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(`${item.deviceName || '未知设备'} (ID: ${item.deviceId})`)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">描述:</text>
                                        <rich-text class="data-value"
                                            :nodes="highlightText(item.deviceDescribe || '')"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">连接时间:</text>
                                        <text class="data-value">{{ formatTime(item.connectedAt) }}</text>
                                    </view>
                                </template>

                                <!-- History 表 -->
                                <template v-if="currentTable === 'History'">
                                    <view class="data-row">
                                        <text class="data-label">用户:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(`${item.username || '未知'} (用户ID: ${item.userId})`)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">分类:</text>
                                        <rich-text class="data-value"
                                            :nodes="highlightText(item.category || '')"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">来源:</text>
                                        <text class="data-value">{{ sourceLabels[item.source] || item.source }}</text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">时间:</text>
                                        <text class="data-value">{{ formatTime(item.createdAt) }}</text>
                                    </view>
                                </template>

                                <!-- Messages 表 -->
                                <template v-if="currentTable === 'Messages'">
                                    <view class="data-row">
                                        <text class="data-label">发送者:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(`${item.senderName || '未知'} (${item.senderId})`)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">接收者:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(`${item.receiverName || '未知'} (${item.receiverId})`)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">类型:</text>
                                        <text class="data-value">{{ messageTypeLabels[item.type] || item.type }}</text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">内容:</text>
                                        <rich-text class="data-value"
                                            :nodes="highlightText((item.content || '').substring(0, 100))"></rich-text>
                                    </view>
                                    <view v-if="item.refId" class="data-row">
                                        <text class="data-label">引用消息ID:</text>
                                        <text class="data-value">{{ item.refId}}</text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">状态:</text>
                                        <text class="data-value">
                                            <text v-if="item.isRead" style="color: #40e0ff;">已读</text>
                                            <text v-else style="color: #999;">未读</text>
                                            <text v-if="item.isWithdraw" style="color: #f44; margin-left: 10rpx;">已撤回</text>
                                        </text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">时间:</text>
                                        <text class="data-value">{{ formatTime(item.sendTime) }}</text>
                                    </view>
                                </template>

                                <!-- Chat 表 -->
                                <template v-if="currentTable === 'Chat'">
                                    <view class="data-row">
                                        <text class="data-label">用户:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(`${item.userName || '未知'} (${item.userId})`)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">对方:</text>
                                        <rich-text class="data-value highlight"
                                            :nodes="highlightText(`${item.otherName || '未知'} (${item.otherId})`)"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">关系:</text>
                                        <text class="data-value">{{ chatRelationshipLabels[item.relationship] || item.relationship }}</text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">备注:</text>
                                        <rich-text class="data-value"
                                            :nodes="highlightText(item.note || '无')"></rich-text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">状态:</text>
                                        <text class="data-value">
                                            <text v-if="item.mute" style="color: #f44;">勿扰</text>
                                            <text v-if="item.top" style="color: #ffd700; margin-left: 10rpx;">置顶</text>
                                            <text v-if="!item.mute && !item.top" style="color: #999;">正常</text>
                                        </text>
                                    </view>
                                    <view class="data-row">
                                        <text class="data-label">最新消息ID:</text>
                                        <text class="data-value">{{ item.latestContentId || '-' }}</text>
                                    </view>
                                </template>
                            </view>

                            <!-- 操作按钮 -->
                            <view class="data-item-actions">
                                <view class="item-action-btn edit" @click="handleEdit(item)">
                                    <text>✏️</text>
                                </view>
                                <view class="item-action-btn delete" @click="handleDelete(item)">
                                    <text>🗑️</text>
                                </view>
                            </view>
                        </view>

                        <view v-else class="no-data">
                            <text class="no-data-text">暂无数据</text>
                        </view>
                    </view>

                    <!-- 分页器 -->
                    <view v-if="totalPages > 1" class="pagination">
                        <view class="pagination-left">
                            <view class="page-btn" :class="{ disabled: currentPage === 1 }" @click="handlePrevPage">
                                <text>◀</text>
                            </view>
                        </view>

                        <view class="pagination-center">
                            <text class="page-text">{{ currentPage }}/{{ totalPages }}</text>
                            <text class="total-text">共{{ totalCount }}条</text>
                        </view>

                        <view class="pagination-right">
                            <view class="page-btn" :class="{ disabled: currentPage === totalPages }"
                                @click="handleNextPage">
                                <text>▶</text>
                            </view>
                        </view>
                    </view>
                </view>

                <!-- 底部提示 -->
                <view class="footer-tip">
                    <text class="tip-icon">ℹ️</text>
                    <text class="tip-text">最后更新：{{ formatTime(lastUpdateTime) }}</text>
                </view>

            </view>
        </scroll-view>

        <!-- 编辑/新增弹窗 -->
        <view class="modal-overlay" v-if="showEditModal" @click="closeEditModal">
            <view class="modal-container" @click.stop>
                <view class="modal-header">
                    <text class="modal-title">{{ editMode === 'add' ? '新增' : '编辑' }}{{ getCurrentTableLabel() }}</text>
                    <view class="modal-close" @click="closeEditModal">
                        <text>✕</text>
                    </view>
                </view>

                <scroll-view class="modal-body" scroll-y>
                    <!-- Users 表单 -->
                    <template v-if="currentTable === 'Users'">
                        <view class="form-item">
                            <text class="form-label">用户名 *</text>
                            <input class="form-input" v-model="editForm.username" placeholder="请输入用户名" />
                        </view>
                        <view class="form-item" v-if="editMode === 'add'">
                            <text class="form-label">密码 *</text>
                            <input class="form-input" v-model="editForm.password" type="password" placeholder="请输入密码" />
                        </view>
                        <view class="form-item" v-else>
                            <text class="form-label">新密码（不填则不修改）</text>
                            <input class="form-input" v-model="editForm.password" type="password"
                                placeholder="请输入新密码" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">头像URL</text>
                            <input class="form-input" v-model="editForm.avatar" placeholder="请输入头像URL" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">积分</text>
                            <input class="form-input" v-model="editForm.points" type="number" placeholder="请输入积分" />
                        </view>

                        <!-- 编辑模式：显示时间信息 -->
                        <view v-if="editMode === 'edit'" class="time-info-section">
                            <view class="time-info-item">
                                <text class="time-label">创建时间:</text>
                                <text class="time-value">{{ formatFullTime(editForm.createdAt) }}</text>
                            </view>
                            <view class="time-info-item">
                                <text class="time-label">更新时间:</text>
                                <text class="time-value">{{ formatFullTime(editForm.updatedAt) }}</text>
                            </view>
                        </view>
                    </template>

                    <!-- Bin 表单 -->
                    <template v-if="currentTable === 'Bin'">
                        <view class="form-item">
                            <text class="form-label">垃圾桶名称 *</text>
                            <input class="form-input" v-model="editForm.name" placeholder="请输入垃圾桶名称" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">描述</text>
                            <input class="form-input" v-model="editForm.describe" placeholder="请输入描述" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">类型 *</text>
                            <picker mode="selector" :range="Object.values(binTypeLabels)" @change="onBinTypeChange">
                                <view class="picker-view">{{ getBinTypeLabel(editForm.type) || '请选择类型' }}</view>
                            </picker>
                        </view>
                        <view class="form-item">
                            <text class="form-label">图片路径</text>
                            <input class="form-input" v-model="editForm.imagePath" placeholder="请输入图片路径" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">经度</text>
                            <input class="form-input" v-model="editForm.longitude" type="digit" placeholder="请输入经度" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">纬度</text>
                            <input class="form-input" v-model="editForm.latitude" type="digit" placeholder="请输入纬度" />
                        </view>
                        <view class="form-item checkbox-item">
                            <text class="form-label">审核通过</text>
                            <switch :checked="editForm.review" @change="editForm.review = $event.detail.value"
                                color="#40e0ff" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">状态</text>
                            <picker mode="selector" :range="['online', 'offline']" @change="onStatusChange">
                                <view class="picker-view">{{ editForm.status || '请选择状态' }}</view>
                            </picker>
                        </view>

                        <!-- 编辑模式：显示时间信息 -->
                        <view v-if="editMode === 'edit'" class="time-info-section">
                            <view class="time-info-item">
                                <text class="time-label">创建时间:</text>
                                <text class="time-value">{{ formatFullTime(editForm.createdAt) }}</text>
                            </view>
                            <view class="time-info-item">
                                <text class="time-label">最后在线:</text>
                                <text class="time-value">{{ formatFullTime(editForm.last_online_at) }}</text>
                            </view>
                        </view>
                    </template>

                    <!-- UserDevice 表单 -->
                    <template v-if="currentTable === 'UserDevice'">
                        <view class="form-item">
                            <text class="form-label">用户ID *</text>
                            <input class="form-input" v-model="editForm.userId" type="number" placeholder="请输入用户ID" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">设备ID (垃圾桶ID) *</text>
                            <input class="form-input" v-model="editForm.deviceId" type="number" placeholder="请输入设备ID" />
                        </view>

                        <!-- 编辑模式：显示时间信息 -->
                        <view v-if="editMode === 'edit'" class="time-info-section">
                            <view class="time-info-item">
                                <text class="time-label">连接时间:</text>
                                <text class="time-value">{{ formatFullTime(editForm.connectedAt) }}</text>
                            </view>
                            <view class="time-info-item">
                                <text class="time-label">最后活跃:</text>
                                <text class="time-value">{{ formatFullTime(editForm.lastActiveAt) }}</text>
                            </view>
                        </view>
                    </template>

                    <!-- History 表单 -->
                    <template v-if="currentTable === 'History'">
                        <view class="form-item">
                            <text class="form-label">用户ID *</text>
                            <input class="form-input" v-model="editForm.userId" type="number" placeholder="请输入用户ID" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">垃圾类别 *</text>
                            <picker mode="selector" :range="categories" @change="onCategoryChange">
                                <view class="picker-view">{{ editForm.category || '请选择垃圾类别' }}</view>
                            </picker>
                        </view>

                        <!-- 编辑模式：显示图片预览和删除按钮 -->
                        <view v-if="editMode === 'edit' && editForm" class="form-item">
                            <text v-if="editForm.imageUrl" class="form-label">识别图片</text>
                            <view v-if="editForm.imageUrl" class="image-preview-container">
                                <image class="form-image-preview" :src="editForm.imageUrl" mode="aspectFit" />
                                <view class="image-delete-btn" @click="deleteImage">
                                    <text>🗑️ 删除图片</text>
                                </view>
                            </view>
                        </view>

                        <!-- 新增模式：不显示图片字段（由设备自动上传） -->
                        <view v-if="editMode === 'add'" class="form-item">
                            <view class="form-tip">
                                <text class="tip-icon">ℹ️</text>
                                <text class="tip-text">图片由设备自动识别上传，手动新增记录无需填写图片</text>
                            </view>
                        </view>

                        <view class="form-item">
                            <text class="form-label">识别置信度</text>
                            <input class="form-input" v-model="editForm.confidence" type="digit" placeholder="0-100" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">来源</text>
                            <picker mode="selector" :range="Object.values(sourceLabels)" @change="onSourceChange">
                                <view class="picker-view">{{ sourceLabels[editForm.source] || '请选择来源' }}</view>
                            </picker>
                        </view>

                        <!-- 编辑模式：显示时间信息 -->
                        <view v-if="editMode === 'edit'" class="time-info-section">
                            <view class="time-info-item">
                                <text class="time-label">创建时间:</text>
                                <text class="time-value">{{ formatFullTime(editForm.createdAt) }}</text>
                            </view>
                        </view>
                    </template>

                    <!-- Messages 表单 -->
                    <template v-if="currentTable === 'Messages'">
                        <view class="form-item">
                            <text class="form-label">发送者ID *</text>
                            <input class="form-input" v-model="editForm.senderId" type="number" placeholder="请输入发送者ID" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">接收者ID *</text>
                            <input class="form-input" v-model="editForm.receiverId" type="number" placeholder="请输入接收者ID" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">消息类型 *</text>
                            <picker mode="selector" :range="Object.values(messageTypeLabels)" @change="onMessageTypeChange">
                                <view class="picker-view">{{ messageTypeLabels[editForm.type] || '请选择消息类型' }}</view>
                            </picker>
                        </view>
                        <view class="form-item">
                            <text class="form-label">消息内容</text>
                            <textarea class="form-textarea" v-model="editForm.content" placeholder="请输入消息内容（JSON格式）" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">引用消息ID</text>
                            <input class="form-input" v-model="editForm.refId" type="number" placeholder="请输入引用消息ID（可选）" />
                        </view>
                        <view class="form-item checkbox-item">
                            <text class="form-label">已读</text>
                            <switch :checked="editForm.isRead" @change="editForm.isRead = $event.detail.value"
                                color="#40e0ff" />
                        </view>
                        <view class="form-item checkbox-item">
                            <text class="form-label">已撤回</text>
                            <switch :checked="editForm.isWithdraw" @change="editForm.isWithdraw = $event.detail.value"
                                color="#40e0ff" />
                        </view>
                        <view class="form-item checkbox-item">
                            <text class="form-label">发送者已删除</text>
                            <switch :checked="editForm.isDeletedBySender" @change="editForm.isDeletedBySender = $event.detail.value"
                                color="#40e0ff" />
                        </view>
                        <view class="form-item checkbox-item">
                            <text class="form-label">接收者已删除</text>
                            <switch :checked="editForm.isDeletedByReceiver" @change="editForm.isDeletedByReceiver = $event.detail.value"
                                color="#40e0ff" />
                        </view>

                        <!-- 编辑模式：显示时间信息 -->
                        <view v-if="editMode === 'edit'" class="time-info-section">
                            <view class="time-info-item">
                                <text class="time-label">发送时间:</text>
                                <text class="time-value">{{ formatFullTime(editForm.sendTime) }}</text>
                            </view>
                        </view>
                    </template>

                    <!-- Chat 表单 -->
                    <template v-if="currentTable === 'Chat'">
                        <view class="form-item">
                            <text class="form-label">用户ID *</text>
                            <input class="form-input" v-model="editForm.userId" type="number" placeholder="请输入用户ID" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">另一方用户ID *</text>
                            <input class="form-input" v-model="editForm.otherId" type="number" placeholder="请输入另一方用户ID" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">关系类型</text>
                            <picker mode="selector" :range="Object.values(chatRelationshipLabels)" @change="onChatRelationshipChange">
                                <view class="picker-view">{{ chatRelationshipLabels[editForm.relationship] || '请选择关系类型' }}</view>
                            </picker>
                        </view>
                        <view class="form-item">
                            <text class="form-label">备注（最多40字）</text>
                            <input class="form-input" v-model="editForm.note" placeholder="请输入备注" maxlength="40" />
                        </view>
                        <view class="form-item checkbox-item">
                            <text class="form-label">免打扰</text>
                            <switch :checked="editForm.mute" @change="editForm.mute = $event.detail.value"
                                color="#40e0ff" />
                        </view>
                        <view class="form-item checkbox-item">
                            <text class="form-label">置顶</text>
                            <switch :checked="editForm.top" @change="editForm.top = $event.detail.value"
                                color="#40e0ff" />
                        </view>
                        <view class="form-item">
                            <text class="form-label">最新消息ID</text>
                            <input class="form-input" v-model="editForm.latestContentId" type="number" placeholder="请输入最新消息ID" />
                        </view>
                    </template>
                </scroll-view>

                <view class="modal-footer">
                    <view class="modal-btn cancel" @click="closeEditModal">
                        <text>取消</text>
                    </view>
                    <view class="modal-btn confirm" @click="handleSave">
                        <text>保存</text>
                    </view>
                </view>
            </view>
        </view>
    </view>
    <view v-else>
        <div style="color:blue;font-size:36px;font-weight: bold;">404</div>
        <div>Page Not Found</div>
    </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
    getUsersList, createUser, updateUser, deleteUser,
    getBinsList, createBin, updateBin, deleteBin,
    getUserDevicesList, createUserDevice, updateUserDevice, deleteUserDevice,
    getHistoryList, createHistory, updateHistory, deleteHistory,
    getMessagesList, createMessage, updateMessage, deleteMessage,
    getChatList, createChat, updateChat, deleteChat,
    getDatabaseStats
} from '@/api/database'

// 响应式数据
const isRefreshing = ref(false)
const lastUpdateTime = ref(Date.now())
const currentTable = ref('Users')
const showEditModal = ref(false)
const editMode = ref('add') // 'add' 或 'edit'
const editForm = ref({})
const adminUser = ref(false)

// 搜索相关
const searchKeyword = ref('')
const searchTimer = ref(null)

// 时间筛选相关
const startDate = ref('')
const endDate = ref('')

// Messages表筛选
const messageTypeFilterIndex = ref(0)
const messageTypeFilterOptions = ref([
    { label: '全部类型', value: null },
    { label: '文本', value: 'text' },
    { label: '图片', value: 'image' },
    { label: '语音', value: 'voice' },
    { label: '视频', value: 'video' },
    { label: '文件', value: 'file' },
    { label: '位置', value: 'location' },
    { label: '其他', value: 'others' }
])
const readStatusFilterIndex = ref(0)
const readStatusFilterOptions = ref([
    { label: '全部', value: null },
    { label: '已读', value: true },
    { label: '未读', value: false }
])
const withdrawStatusFilterIndex = ref(0)
const withdrawStatusFilterOptions = ref([
    { label: '全部', value: null },
    { label: '已撤回', value: true },
    { label: '未撤回', value: false }
])
const senderDeletedFilterIndex = ref(0)
const receiverDeletedFilterIndex = ref(0)
const deletedFilterOptions = ref([
    { label: '全部', value: null },
    { label: '已删除', value: true },
    { label: '未删除', value: false }
])

// Chat表筛选
const relationshipFilterIndex = ref(0)
const relationshipFilterOptions = ref([
    { label: '全部关系', value: null },
    { label: '好友', value: 'friend' },
    { label: '客服', value: 'customer_s' },
    { label: '客户', value: 'customer_c' },
    { label: '陌生人', value: 'stranger' }
])
const muteFilterIndex = ref(0)
const muteFilterOptions = ref([
    { label: '全部', value: null },
    { label: '免打扰', value: true },
    { label: '开启提醒', value: false }
])
const topFilterIndex = ref(0)
const topFilterOptions = ref([
    { label: '全部', value: null },
    { label: '已置顶', value: true },
    { label: '未置顶', value: false }
])

// History表筛选
const sourceFilterIndex = ref(0)
const sourceFilterOptions = ref([
    { label: '全部来源', value: null },
    { label: '在线识别', value: 'online' },
    { label: '设备分类', value: 'device' }
])

// Bin表筛选
const reviewFilterIndex = ref(0)
const reviewFilterOptions = ref([
    { label: '全部', value: null },
    { label: '已审核', value: true },
    { label: '未审核', value: false }
])
const statusFilterIndex = ref(0)
const statusFilterOptions = ref([
    { label: '全部状态', value: null },
    { label: '在线', value: 'online' },
    { label: '离线', value: 'offline' }
])
const binTypeFilterIndex = ref(0)
const binTypeFilterOptions = ref([
    { label: '全部类型', value: null },
    { label: '智能垃圾桶', value: 'smart' },
    { label: '普通垃圾桶', value: 'normal' }
])

// 分页相关
const currentPage = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)
const totalPages = ref(0)

// 数据表配置
const tables = ref([
    { name: 'Users', label: '用户表', icon: '👤', count: 0 },
    { name: 'Bin', label: '垃圾桶表', icon: '🗑️', count: 0 },
    { name: 'UserDevice', label: '用户设备表', icon: '📱', count: 0 },
    { name: 'History', label: '历史记录表', icon: '📝', count: 0 },
    { name: 'Messages', label: '消息表', icon: '💬', count: 0 },
    { name: 'Chat', label: '聊天表', icon: '💭', count: 0 }
])

// 当前表数据
const tableData = ref([])

// 选择器数据
const binTypes = ['smart', 'normal']
const binTypeLabels = { 'smart': '智能垃圾桶', 'normal': '普通垃圾桶' }
// 垃圾分类
const categories = ['可回收垃圾', '有害垃圾', '厨余垃圾', '其他垃圾']
// 修正：source 只有 'online' 和 'device' 两个值
const sources = ['online', 'device']
const sourceLabels = {
    'online': '在线识别',
    'device': '设备分类'
}
// 消息类型
const messageTypes = ['text', 'image', 'voice', 'video', 'file', 'location', 'others']
const messageTypeLabels = {
    'text': '文本',
    'image': '图片',
    'voice': '语音',
    'video': '视频',
    'file': '文件',
    'location': '位置',
    'others': '其他'
}
// 聊天关系类型
const chatRelationships = ['friend', 'customer_s', 'customer_c', 'stranger']
const chatRelationshipLabels = {
    'friend': '好友',
    'customer_s': '客服',
    'customer_c': '客户',
    'stranger': '陌生人'
}

// 方法
function formatTime(timestamp) {
    if (!timestamp) return '-'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMinutes = Math.floor((now - date) / 60000)

    if (diffMinutes < 1) return '刚刚'
    if (diffMinutes < 60) return `${diffMinutes}分钟前`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}小时前`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}天前`

    return date.toLocaleDateString()
}

// 格式化完整时间 (用于编辑表单显示)
function formatFullTime(timestamp) {
    if (!timestamp) return '暂无'
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function getCurrentTableLabel() {
    const table = tables.value.find(t => t.name === currentTable.value)
    return table ? table.label : ''
}

function selectTable(tableName) {
    currentTable.value = tableName
    currentPage.value = 1  // 重置到第一页
    searchKeyword.value = ''  // 清空搜索
    startDate.value = ''  // 清空开始日期
    endDate.value = ''  // 清空结束日期
    
    // 重置所有筛选条件
    messageTypeFilterIndex.value = 0
    readStatusFilterIndex.value = 0
    withdrawStatusFilterIndex.value = 0
    senderDeletedFilterIndex.value = 0
    receiverDeletedFilterIndex.value = 0
    relationshipFilterIndex.value = 0
    muteFilterIndex.value = 0
    topFilterIndex.value = 0
    sourceFilterIndex.value = 0
    reviewFilterIndex.value = 0
    statusFilterIndex.value = 0
    binTypeFilterIndex.value = 0
    
    loadTableData()
}

// 获取当前日期 (YYYY-MM-DD)
function getCurrentDate() {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// 开始日期变化
function onStartDateChange(e) {
    startDate.value = e.detail.value
    console.log('开始日期:', startDate.value)
    currentPage.value = 1  // 重置到第一页
    loadTableData()
}

// 结束日期变化
function onEndDateChange(e) {
    endDate.value = e.detail.value
    console.log('结束日期:', endDate.value)
    currentPage.value = 1  // 重置到第一页
    loadTableData()
}

// 重置日期筛选
function resetDateFilter() {
    startDate.value = ''
    endDate.value = ''
    console.log('重置日期筛选')
    currentPage.value = 1  // 重置到第一页
    loadTableData()
}

// Messages表筛选方法
function onMessageTypeFilterChange(e) {
    messageTypeFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onReadStatusFilterChange(e) {
    readStatusFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onWithdrawStatusFilterChange(e) {
    withdrawStatusFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onSenderDeletedFilterChange(e) {
    senderDeletedFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onReceiverDeletedFilterChange(e) {
    receiverDeletedFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

// Chat表筛选方法
function onRelationshipFilterChange(e) {
    relationshipFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onMuteFilterChange(e) {
    muteFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onTopFilterChange(e) {
    topFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

// History表筛选方法
function onSourceFilterChange(e) {
    sourceFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

// Bin表筛选方法
function onReviewFilterChange(e) {
    reviewFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onStatusFilterChange(e) {
    statusFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

function onBinTypeFilterChange(e) {
    binTypeFilterIndex.value = e.detail.value
    currentPage.value = 1
    loadTableData()
}

// 重置所有筛选条件
function resetFilters() {
    // 重置日期
    startDate.value = ''
    endDate.value = ''
    
    // 重置Messages表筛选
    messageTypeFilterIndex.value = 0
    readStatusFilterIndex.value = 0
    withdrawStatusFilterIndex.value = 0
    senderDeletedFilterIndex.value = 0
    receiverDeletedFilterIndex.value = 0
    
    // 重置Chat表筛选
    relationshipFilterIndex.value = 0
    muteFilterIndex.value = 0
    topFilterIndex.value = 0
    
    // 重置History表筛选
    sourceFilterIndex.value = 0
    
    // 重置Bin表筛选
    reviewFilterIndex.value = 0
    statusFilterIndex.value = 0
    binTypeFilterIndex.value = 0
    
    currentPage.value = 1
    loadTableData()
}

// 获取搜索占位符
function getSearchPlaceholder() {
    const placeholders = {
        'Users': '搜索用户名',
        'Bin': '搜索垃圾桶名称、描述',
        'UserDevice': '搜索用户名、垃圾桶名、描述',
        'History': '搜索用户名、垃圾种类',
        'Messages': '搜索消息内容',
        'Chat': '搜索用户名'
    }
    return placeholders[currentTable.value] || '搜索...'
}

// 搜索输入处理(防抖)
function handleSearchInput(e) {
    // uni-app input 事件需要从 e.detail.value 获取值
    searchKeyword.value = e.detail.value

    if (searchTimer.value) {
        clearTimeout(searchTimer.value)
    }
    searchTimer.value = setTimeout(() => {
        console.log('执行搜索，关键词:', searchKeyword.value)
        currentPage.value = 1  // 重置到第一页
        loadTableData()
    }, 500)  // 500ms 防抖
}

// 搜索按钮点击
function handleSearch() {
    currentPage.value = 1  // 重置到第一页
    loadTableData()
}

// 清空搜索
function clearSearch() {
    searchKeyword.value = ''
    currentPage.value = 1  // 重置到第一页
    loadTableData()
}

async function loadTableData() {
    try {
        uni.showLoading({ title: '加载中...', mask: true })

        // 构建分页参数
        const params = {
            page: currentPage.value,
            pageSize: pageSize.value
        }

        // 添加搜索关键词
        if (searchKeyword.value.trim()) {
            params.keyword = searchKeyword.value.trim()
        }

        // 添加时间筛选参数
        if (startDate.value) {
            params.startDate = startDate.value
        }
        if (endDate.value) {
            params.endDate = endDate.value
        }

        // 根据当前表添加特定筛选参数
        if (currentTable.value === 'Messages') {
            // Messages表筛选
            const typeFilter = messageTypeFilterOptions.value[messageTypeFilterIndex.value]
            if (typeFilter.value !== null) {
                params.type = typeFilter.value
            }
            const readFilter = readStatusFilterOptions.value[readStatusFilterIndex.value]
            if (readFilter.value !== null) {
                params.isRead = readFilter.value
            }
            const withdrawFilter = withdrawStatusFilterOptions.value[withdrawStatusFilterIndex.value]
            if (withdrawFilter.value !== null) {
                params.isWithdraw = withdrawFilter.value
            }
            const senderDeletedFilter = deletedFilterOptions.value[senderDeletedFilterIndex.value]
            if (senderDeletedFilter.value !== null) {
                params.senderDeleted = senderDeletedFilter.value
            }
            const receiverDeletedFilter = deletedFilterOptions.value[receiverDeletedFilterIndex.value]
            if (receiverDeletedFilter.value !== null) {
                params.receiverDeleted = receiverDeletedFilter.value
            }
        } else if (currentTable.value === 'Chat') {
            // Chat表筛选
            const relationshipFilter = relationshipFilterOptions.value[relationshipFilterIndex.value]
            if (relationshipFilter.value !== null) {
                params.relationship = relationshipFilter.value
            }
            const muteFilter = muteFilterOptions.value[muteFilterIndex.value]
            if (muteFilter.value !== null) {
                params.mute = muteFilter.value
            }
            const topFilter = topFilterOptions.value[topFilterIndex.value]
            if (topFilter.value !== null) {
                params.top = topFilter.value
            }
        } else if (currentTable.value === 'History') {
            // History表筛选
            const sourceFilter = sourceFilterOptions.value[sourceFilterIndex.value]
            if (sourceFilter.value !== null) {
                params.source = sourceFilter.value
            }
        } else if (currentTable.value === 'Bin') {
            // Bin表筛选
            const reviewFilter = reviewFilterOptions.value[reviewFilterIndex.value]
            if (reviewFilter.value !== null) {
                params.review = reviewFilter.value
            }
            const statusFilter = statusFilterOptions.value[statusFilterIndex.value]
            if (statusFilter.value !== null) {
                params.status = statusFilter.value
            }
            const typeFilter = binTypeFilterOptions.value[binTypeFilterIndex.value]
            if (typeFilter.value !== null) {
                params.type = typeFilter.value
            }
        }

        console.log('请求参数:', params)

        let response
        switch (currentTable.value) {
            case 'Users':
                response = await getUsersList(params)
                break
            case 'Bin':
                response = await getBinsList(params)
                break
            case 'UserDevice':
                response = await getUserDevicesList(params)
                break
            case 'History':
                response = await getHistoryList(params)
                break
            case 'Messages':
                response = await getMessagesList(params)
                break
            case 'Chat':
                response = await getChatList(params)
                break
        }

        if (response && response.code === 0) {
            tableData.value = response.data.list || []
            totalCount.value = response.data.total || 0
            totalPages.value = Math.ceil(totalCount.value / pageSize.value)

            // 更新计数
            const table = tables.value.find(t => t.name === currentTable.value)
            if (table) {
                table.count = totalCount.value
            }
        } else {
            uni.showToast({
                title: response?.msg || '加载失败',
                icon: 'none'
            })
            tableData.value = []
            totalCount.value = 0
            totalPages.value = 0
        }
    } catch (error) {
        console.error('加载数据失败:', error)
        uni.showToast({
            title: '加载失败：' + (error.msg || '网络错误'),
            icon: 'none'
        })
        if(error.msg&&error.msg.includes('登录')) {
            setTimeout(() => {
                uni.setStorageSync('autoLogin', false)
                uni.reLaunch({
                    url: '/pages/index/index'
                })
            }, 1000)
        } else if (error.msg&&error.msg.includes('权限')) {
            setTimeout(() => {
                goBack()
            }, 1000)
        }
        tableData.value = []
    } finally {
        uni.hideLoading()
    }
}

async function handleRefresh() {
    if (isRefreshing.value) return

    isRefreshing.value = true

    try {
        await loadTableData()
        lastUpdateTime.value = Date.now()
        uni.showToast({ title: '刷新完成', icon: 'success' })
    } catch (error) {
        console.error('刷新失败:', error)
    } finally {
        isRefreshing.value = false
    }
}

// 分页方法
function handlePageChange(page) {
    if (page < 1 || page > totalPages.value) return
    currentPage.value = page
    loadTableData()
}

function handlePrevPage() {
    if (currentPage.value > 1) {
        handlePageChange(currentPage.value - 1)
    }
}

function handleNextPage() {
    if (currentPage.value < totalPages.value) {
        handlePageChange(currentPage.value + 1)
    }
}

function handleAdd() {
    editMode.value = 'add'
    editForm.value = {}

    // 根据不同表设置默认值
    if (currentTable.value === 'Users') {
        editForm.value = { username: '', password: '', avatar: '', points: 0 }
    } else if (currentTable.value === 'Bin') {
        editForm.value = {
            name: '',
            describe: '',
            type: 'normal',
            imagePath: '',
            longitude: '',
            latitude: '',
            review: false,
            status: 'offline'
        }
    } else if (currentTable.value === 'UserDevice') {
        editForm.value = { userId: '', deviceId: '' }
    } else if (currentTable.value === 'History') {
        editForm.value = { userId: '', category: '可回收垃圾', imageUrl: '', confidence: '', source: 'online' }
    } else if (currentTable.value === 'Messages') {
        editForm.value = { 
            senderId: '', 
            receiverId: '', 
            type: 'text', 
            content: '', 
            refId: '',
            isRead: false, 
            isWithdraw: false, 
            isDeletedBySender: false, 
            isDeletedByReceiver: false 
        }
    } else if (currentTable.value === 'Chat') {
        editForm.value = { userId: '', otherId: '', relationship: 'friend', note: '', mute: false, top: false, latestContentId: '' }
    }

    showEditModal.value = true
}

function handleEdit(item) {
    editMode.value = 'edit'
    editForm.value = { ...item }
    showEditModal.value = true
}

async function handleDelete(item) {
    uni.showModal({
        title: '确认删除',
        content: `确定要删除这条记录吗？`,
        confirmText: '删除',
        cancelText: '取消',
        confirmColor: '#ef4444',
        success: async (res) => {
            if (res.confirm) {
                try {
                    uni.showLoading({ title: '删除中...' })

                    let response
                    switch (currentTable.value) {
                        case 'Users':
                            response = await deleteUser(item.id)
                            break
                        case 'Bin':
                            response = await deleteBin(item.id)
                            break
                        case 'UserDevice':
                            // UserDevice 使用联合主键 (userId, deviceId)
                            response = await deleteUserDevice(item.userId, item.deviceId)
                            break
                        case 'History':
                            response = await deleteHistory(item.id)
                            break
                        case 'Messages':
                            response = await deleteMessage(item.id)
                            break
                        case 'Chat':
                            // Chat 使用联合主键 (userId, otherId)
                            response = await deleteChat(item.userId, item.otherId)
                            break
                    }

                    if (response && response.code === 0) {
                        uni.showToast({ title: '删除成功', icon: 'success' })
                        // 重新加载数据
                        await loadTableData()
                    } else {
                        uni.showToast({
                            title: response?.msg || '删除失败',
                            icon: 'none'
                        })
                    }
                } catch (error) {
                    console.error('删除失败:', error)
                    uni.showToast({
                        title: '删除失败：' + (error.message || '网络错误'),
                        icon: 'none'
                    })
                } finally {
                    uni.hideLoading()
                }
            }
        }
    })
}

async function handleSave() {
    // 简单验证
    if (currentTable.value === 'Users') {
        if (!editForm.value.username) {
            uni.showToast({ title: '请输入用户名', icon: 'none' })
            return
        }
        if (editMode.value === 'add' && !editForm.value.password) {
            uni.showToast({ title: '请输入密码', icon: 'none' })
            return
        }
    } else if (currentTable.value === 'Bin') {
        if (!editForm.value.name || !editForm.value.type) {
            uni.showToast({ title: '请填写必填项', icon: 'none' })
            return
        }
    } else if (currentTable.value === 'UserDevice') {
        if (!editForm.value.userId || !editForm.value.deviceId) {
            uni.showToast({ title: '请填写必填项', icon: 'none' })
            return
        }
    } else if (currentTable.value === 'History') {
        if (!editForm.value.userId || !editForm.value.category) {
            uni.showToast({ title: '请填写必填项', icon: 'none' })
            return
        }
    } else if (currentTable.value === 'Messages') {
        if (!editForm.value.senderId || !editForm.value.receiverId || !editForm.value.type) {
            uni.showToast({ title: '请填写必填项', icon: 'none' })
            return
        }
    } else if (currentTable.value === 'Chat') {
        if (!editForm.value.userId || !editForm.value.otherId) {
            uni.showToast({ title: '请填写必填项', icon: 'none' })
            return
        }
    }

    try {
        uni.showLoading({ title: '保存中...' })

        let response
        const data = { ...editForm.value }

        // 类型转换
        if (currentTable.value === 'Users') {
            data.points = Number(data.points) || 0
        } else if (currentTable.value === 'Bin') {
            data.latitude = data.latitude ? Number(data.latitude) : null
            data.longitude = data.longitude ? Number(data.longitude) : null
            // 过滤掉不应该发送的敏感字段，避免设备token被误传导致后端身份验证混淆
            delete data.token
            delete data.device_token
            delete data.deviceToken
        } else if (currentTable.value === 'UserDevice') {
            data.userId = Number(data.userId)
            data.deviceId = Number(data.deviceId)
        } else if (currentTable.value === 'History') {
            data.userId = Number(data.userId)
            data.confidence = data.confidence ? Number(data.confidence) : null
            // 确保 imageUrl 为 null 时正确传递（删除图片）
            if (data.imageUrl === null || data.imageUrl === '') {
                data.imageUrl = null
            }
        } else if (currentTable.value === 'Messages') {
            data.senderId = Number(data.senderId)
            data.receiverId = Number(data.receiverId)
        } else if (currentTable.value === 'Chat') {
            data.userId = Number(data.userId)
            data.otherId = Number(data.otherId)
            if (data.latestContentId) {
                data.latestContentId = Number(data.latestContentId)
            }
        }

        if (editMode.value === 'add') {
            // 新增
            switch (currentTable.value) {
                case 'Users':
                    response = await createUser(data)
                    break
                case 'Bin':
                    response = await createBin(data)
                    break
                case 'UserDevice':
                    response = await createUserDevice(data)
                    break
                case 'History':
                    response = await createHistory(data)
                    break
                case 'Messages':
                    response = await createMessage(data)
                    break
                case 'Chat':
                    response = await createChat(data)
                    break
            }
        } else {
            // 编辑
            switch (currentTable.value) {
                case 'Users':
                    response = await updateUser(editForm.value.id, data)
                    break
                case 'Bin':
                    response = await updateBin(editForm.value.id, data)
                    break
                case 'UserDevice':
                    // UserDevice 使用联合主键 (userId, deviceId)
                    response = await updateUserDevice(editForm.value.userId, editForm.value.deviceId, data)
                    break
                case 'History':
                    response = await updateHistory(editForm.value.id, data)
                    break
                case 'Messages':
                    response = await updateMessage(editForm.value.id, data)
                    break
                case 'Chat':
                    // Chat 使用联合主键 (userId, otherId)
                    response = await updateChat(editForm.value.userId, editForm.value.otherId, data)
                    break
            }
        }

        if (response && response.code === 0) {
            uni.showToast({ title: '保存成功', icon: 'success' })
            closeEditModal()
            // 重新加载数据
            await loadTableData()
        } else {
            uni.showToast({
                title: response?.msg || '保存失败',
                icon: 'none'
            })
        }
    } catch (error) {
        console.error('保存失败:', error)
        uni.showToast({
            title: '保存失败：' + (error.msg || '网络错误'),
            icon: 'none'
        })
    } finally {
        uni.hideLoading()
    }
}

function closeEditModal() {
    showEditModal.value = false
    editForm.value = {}
}

function deleteImage() {
    uni.showModal({
        title: '确认删除',
        content: '确定要删除这张图片吗？删除后将无法恢复。',
        confirmText: '删除',
        cancelText: '取消',
        confirmColor: '#ef4444',
        success: (res) => {
            if (res.confirm) {
                editForm.value.imageUrl = null
                uni.showToast({ title: '图片已删除', icon: 'success' })
            }
        }
    })
}

function onBinTypeChange(e) {
    const types = Object.keys(binTypeLabels)
    editForm.value.type = types[e.detail.value]
}

function onStatusChange(e) {
    editForm.value.status = ['online', 'offline'][e.detail.value]
}

function onCategoryChange(e) {
    // 直接使用选中的汉字值
    editForm.value.category = categories[e.detail.value]
}

function onSourceChange(e) {
    // 使用定义的 sources 数组，只有 'online' 和 'device'
    editForm.value.source = sources[e.detail.value]
}

function onMessageTypeChange(e) {
    const types = messageTypes
    editForm.value.type = types[e.detail.value]
}

function onChatRelationshipChange(e) {
    const relationships = chatRelationships
    editForm.value.relationship = relationships[e.detail.value]
}

function getBinTypeLabel(type) {
    return binTypeLabels[type] || type
}

// 高亮搜索关键字
function highlightText(text) {
    if (!text) return text

    const keyword = searchKeyword.value.trim()
    if (!keyword) return text

    const textStr = String(text)

    // 使用正则表达式进行不区分大小写的搜索
    const regex = new RegExp(`(${keyword})`, 'gi')

    // 替换匹配的文本为带高亮样式的 HTML
    const highlightedText = textStr.replace(regex, '<span style=" color: #ffd700; font-weight: 800; padding: 2rpx 4rpx; border-radius: 4rpx;">$1</span>')

    return highlightedText
}

function goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
        uni.navigateBack()
    } else {
        uni.reLaunch({
            url: '/pages/index/index'
        })
    }
}

// 加载统计信息
async function loadStats() {
    adminUser.value = uni.getStorageSync('isAdmin') || false
    try {
        const response = await getDatabaseStats()
        if (response && response.code === 0) {
            const stats = response.data
            tables.value.forEach(table => {
                switch (table.name) {
                    case 'Users':
                        table.count = stats.usersCount || 0
                        break
                    case 'Bin':
                        table.count = stats.binsCount || 0
                        break
                    case 'UserDevice':
                        table.count = stats.userDevicesCount || 0
                        break
                    case 'History':
                        table.count = stats.historyCount || 0
                        break
                    case 'Messages':
                        table.count = stats.messagesCount || 0
                        break
                    case 'Chat':
                        table.count = stats.chatsCount || 0
                }
            })
            adminUser.value = true
        }
    } catch (error) {
        if(error.msg){
            uni.showToast({
                title: '加载失败：' + error.msg || '网络错误',
                icon: 'none'
            })
        }
        if (error.msg && (error.msg.includes('登录'))) {
            setTimeout(() => {
                uni.reLaunch({
                    url: '/pages/index/index'
                })
            }, 1000)
        } else if (error.msg && (error.msg.includes('权限'))) {
            setTimeout(() => {
                goBack()
            }, 1000)
        }
        console.error('加载统计信息失败:', error)
    }
}

// 初始化
onMounted(async () => {
    await loadStats()
    await loadTableData()
})

onUnmounted(() => {
})
</script>

<style scoped>
/* 页面根容器 */
.database-page {
    height: 100vh;
    position: relative;
    overflow: hidden;
}

/* 滚动容器 */
.database-scroll-container {
    height: 100vh;
    width: 100%;
    position: relative;
    overflow-y: auto;
}

/* 内容容器 */
.database-container {
    min-height: 100vh;
    background: radial-gradient(ellipse at center, #0a1a2f 0%, #051015 70%, #000508 100%);
    position: relative;
    padding: 0;
    padding-bottom: max(40rpx, calc(40rpx + env(safe-area-inset-bottom)));
    box-sizing: border-box;
}

/* 动态科技背景 */
.tech-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
}

.grid-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image:
        linear-gradient(rgba(64, 224, 255, 0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(64, 224, 255, 0.12) 1px, transparent 1px);
    background-size: 50px 50px;
    animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
    0% {
        transform: translate(0, 0);
    }

    100% {
        transform: translate(50px, 50px);
    }
}

.floating-particles {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.particle {
    position: absolute;
    width: 4px;
    height: 4px;
    background: radial-gradient(circle, #40e0ff 0%, transparent 70%);
    border-radius: 50%;
    animation: floatParticle 8s ease-in-out infinite;
}

@keyframes floatParticle {

    0%,
    100% {
        transform: translateY(0) scale(1);
        opacity: 0.3;
    }

    50% {
        transform: translateY(-30px) scale(1.5);
        opacity: 1;
    }
}

.circuit-lines {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.line {
    position: absolute;
    background: linear-gradient(90deg, transparent 0%, #40e0ff 50%, transparent 100%);
    opacity: 0.6;
}

.line.horizontal {
    top: 30%;
    left: 0;
    width: 100%;
    height: 2px;
    animation: lineFlowH 6s ease-in-out infinite;
}

.line.vertical {
    top: 0;
    right: 20%;
    width: 2px;
    height: 100%;
    background: linear-gradient(0deg, transparent 0%, #40e0ff 50%, transparent 100%);
    animation: lineFlowV 8s ease-in-out infinite;
}

@keyframes lineFlowH {

    0%,
    100% {
        opacity: 0.3;
    }

    50% {
        opacity: 0.8;
    }
}

@keyframes lineFlowV {

    0%,
    100% {
        opacity: 0.3;
    }

    50% {
        opacity: 0.8;
    }
}

.data-streams {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.stream {
    position: absolute;
    width: 1px;
    height: 100%;
    background: linear-gradient(0deg,
            transparent 0%,
            #40e0ff 10%,
            transparent 20%,
            transparent 80%,
            #00ff88 90%,
            transparent 100%);
    animation: streamFlow 4s linear infinite;
}

.stream:nth-child(1) {
    left: 15%;
    animation-delay: 0s;
}

.stream:nth-child(2) {
    left: 35%;
    animation-delay: 1s;
}

.stream:nth-child(3) {
    left: 55%;
    animation-delay: 2s;
}

.stream:nth-child(4) {
    left: 75%;
    animation-delay: 0.5s;
}

.stream:nth-child(5) {
    left: 85%;
    animation-delay: 1.5s;
}

.stream:nth-child(6) {
    left: 95%;
    animation-delay: 2.5s;
}

@keyframes streamFlow {
    0% {
        transform: translateY(-100%);
        opacity: 0;
    }

    10% {
        opacity: 1;
    }

    90% {
        opacity: 1;
    }

    100% {
        transform: translateY(100%);
        opacity: 0;
    }
}

/* 头部状态栏 */
.status-bar {
    position: relative;
    z-index: 10;
    background: rgba(0, 25, 45, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(64, 224, 255, 0.4);
}

.safe-area-top {
    height: env(safe-area-inset-top);
    min-height: 44rpx;
}

.status-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 40rpx;
    position: relative;
}

.back-btn {
    width: 60rpx;
    height: 60rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(64, 224, 255, 0.1);
    border: 1px solid rgba(64, 224, 255, 0.3);
    cursor: pointer;
    transition: all 0.3s ease;
}

.back-btn:active {
    transform: scale(0.95);
    background: rgba(64, 224, 255, 0.2);
}

.back-icon {
    font-size: 36rpx;
    color: #40e0ff;
    font-weight: bold;
}

.title-text {
    color: #40e0ff;
    font-size: 32rpx;
    font-weight: 700;
    letter-spacing: 2rpx;
    flex: 1;
    text-align: center;
}

.refresh-btn {
    width: 60rpx;
    height: 60rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(64, 224, 255, 0.1);
    border: 1px solid rgba(64, 224, 255, 0.3);
    font-size: 32rpx;
    cursor: pointer;
    transition: all 0.3s ease;
}

.refresh-btn:active {
    transform: scale(0.95);
    background: rgba(64, 224, 255, 0.2);
}

.refresh-btn.rotating {
    animation: rotate 1s linear infinite;
}

@keyframes rotate {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

/* 数据表选择卡片 */
.tables-card {
    position: relative;
    z-index: 10;
    margin: 16rpx 0;
    background: rgba(0, 35, 65, 0.95);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(64, 224, 255, 0.4);
    padding: 12rpx 0;
}

.tables-scroll {
    width: 100%;
    white-space: nowrap;
}

.tables-row {
    display: inline-flex;
    gap: 8rpx;
    padding: 0 20rpx;
    min-width: 100%;
    justify-content: center;
}

.table-item {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    padding: 8rpx 12rpx;
    background: rgba(64, 224, 255, 0.05);
    border-radius: 16rpx;
    border: 2px solid rgba(64, 224, 255, 0.2);
    cursor: pointer;
    transition: all 0.3s ease;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 120rpx;
}

.table-item:active {
    transform: scale(0.95);
}

.table-item.active {
    background: rgba(64, 224, 255, 0.2);
    border-color: rgba(64, 224, 255, 0.6);
    box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.3);
}

.table-icon {
    font-size: 32rpx;
    flex-shrink: 0;
}

.table-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rpx;
}

.table-name {
    color: #ffffff;
    font-size: 22rpx;
    font-weight: 500;
    line-height: 1.2;
}

.table-count {
    color: #40e0ff;
    font-size: 18rpx;
    font-weight: 600;
    line-height: 1;
}

/* 搜索栏 */
.search-card {
    position: relative;
    z-index: 10;
    margin: 0 40rpx 20rpx;
    background: rgba(0, 35, 65, 0.95);
    backdrop-filter: blur(20px);
    border-radius: 30rpx;
    border: 1px solid rgba(64, 224, 255, 0.4);
    padding: 20rpx 24rpx;
}

.search-container {
    display: flex;
    align-items: center;
    gap: 12rpx;
    background: rgba(64, 224, 255, 0.05);
    border: 1px solid rgba(64, 224, 255, 0.3);
    border-radius: 20rpx;
    padding: 0 20rpx;
    height: 72rpx;
}

.search-icon {
    font-size: 28rpx;
    color: rgba(64, 224, 255, 0.6);
    flex-shrink: 0;
}

.search-input {
    flex: 1;
    height: 100%;
    font-size: 26rpx;
    color: #ffffff;
    background: transparent;
    border: none;
    outline: none;
}

.search-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
}

.search-clear {
    width: 36rpx;
    height: 36rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
    font-size: 20rpx;
    color: rgba(255, 255, 255, 0.6);
    transition: all 0.3s ease;
}

.search-clear:active {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(0.9);
}

.search-btn {
    padding: 12rpx 24rpx;
    background: rgba(64, 224, 255, 0.2);
    border: 1px solid rgba(64, 224, 255, 0.5);
    border-radius: 16rpx;
    font-size: 24rpx;
    color: #40e0ff;
    cursor: pointer;
    transition: all 0.3s ease;
    flex-shrink: 0;
}

.search-btn:active {
    background: rgba(64, 224, 255, 0.3);
    transform: scale(0.95);
}

/* 时间筛选栏 */
.filter-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12rpx;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1px solid rgba(64, 224, 255, 0.2);
}

.filter-item {
    flex: 0 0 calc(33.33% - 8rpx);
    min-width: 180rpx;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
}

.filter-label {
    font-size: 22rpx;
    color: rgba(255, 255, 255, 0.6);
    padding-left: 4rpx;
}

.filter-picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14rpx 16rpx;
    background: rgba(64, 224, 255, 0.05);
    border: 1px solid rgba(64, 224, 255, 0.3);
    border-radius: 16rpx;
    min-height: 60rpx;
}

.filter-value {
    font-size: 24rpx;
    color: #ffffff;
    flex: 1;
}

.picker-arrow {
    font-size: 20rpx;
    color: rgba(64, 224, 255, 0.6);
    margin-left: 8rpx;
}

.filter-actions {
    display: flex;
    align-items: flex-end;
    padding-bottom: 2rpx;
}

.filter-reset-btn {
    padding: 14rpx 20rpx;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 16rpx;
    font-size: 24rpx;
    color: #ef4444;
    cursor: pointer;
    transition: all 0.3s ease;
    white-space: nowrap;
}

.filter-reset-btn:active {
    background: rgba(239, 68, 68, 0.3);
    transform: scale(0.95);
}

/* 数据展示卡片 */
.data-card {
    position: relative;
    z-index: 10;
    margin: 0 40rpx 30rpx;
    background: rgba(0, 35, 65, 0.95);
    backdrop-filter: blur(20px);
    border-radius: 30rpx;
    border: 1px solid rgba(64, 224, 255, 0.4);
    padding: 28rpx;
}

.data-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24rpx;
}

.data-title {
    color: #40e0ff;
    font-size: 32rpx;
    font-weight: 600;
}

.data-actions {
    display: flex;
    gap: 12rpx;
}

.action-icon-btn {
    width: 56rpx;
    height: 56rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(64, 224, 255, 0.1);
    border-radius: 50%;
    border: 1px solid rgba(64, 224, 255, 0.3);
    font-size: 28rpx;
    cursor: pointer;
    transition: all 0.3s ease;
}

.action-icon-btn:active {
    transform: scale(0.9);
    background: rgba(64, 224, 255, 0.2);
}

.data-list {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
}

.data-item {
    display: flex;
    gap: 16rpx;
    padding: 16rpx;
    background: rgba(64, 224, 255, 0.05);
    border-radius: 12rpx;
    border: 1px solid rgba(64, 224, 255, 0.2);
    align-items: stretch;
    min-height: 90rpx;
}

/* ID列样式（所有表统一） */
.data-id-column {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 70rpx;
    padding: 8rpx;
}

.id-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 54rpx;
    height: 54rpx;
    background: linear-gradient(135deg, rgba(64, 224, 255, 0.2) 0%, rgba(64, 224, 255, 0.1) 100%);
    border-radius: 10rpx;
    border: 2px solid rgba(64, 224, 255, 0.4);
    box-shadow: 0 2rpx 8rpx rgba(64, 224, 255, 0.15);
}

.id-number {
    color: #40e0ff;
    font-size: 24rpx;
    font-weight: 700;
    letter-spacing: 0.5rpx;
}

.data-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
}

.data-row {
    display: flex;
    gap: 10rpx;
    align-items: center;
}

.data-label {
    color: rgba(255, 255, 255, 0.6);
    font-size: 22rpx;
    min-width: 90rpx;
    flex-shrink: 0;
}

.data-value {
    color: #ffffff;
    font-size: 22rpx;
    flex: 1;
    word-break: break-all;
}

.data-value.highlight {
    color: #40e0ff;
    font-weight: 600;
}

.data-value.success {
    color: #22c55e;
    font-weight: 600;
}

.data-value.error {
    color: #ef4444;
    font-weight: 600;
}

/* rich-text 组件样式继承 */
rich-text {
    line-height: inherit;
    word-break: break-all;
}

.data-item-actions {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    justify-content: center;
}

.item-action-btn {
    width: 44rpx;
    height: 44rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 22rpx;
    cursor: pointer;
    transition: all 0.3s ease;
}

.item-action-btn.edit {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
}

.item-action-btn.edit:active {
    transform: scale(0.9);
    background: rgba(59, 130, 246, 0.2);
}

.item-action-btn.delete {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.item-action-btn.delete:active {
    transform: scale(0.9);
    background: rgba(239, 68, 68, 0.2);
}

.no-data {
    text-align: center;
    padding: 60rpx 20rpx;
}

.no-data-text {
    color: rgba(255, 255, 255, 0.5);
    font-size: 26rpx;
}

/* 分页器样式 */
.pagination {
    position: relative;
    z-index: 10;
    margin: 20rpx 0rpx;
    padding: 12rpx 20rpx;
    background: rgba(0, 35, 65, 0.95);
    backdrop-filter: blur(20px);
    border-radius: 10rpx;
    border: 1px solid rgba(64, 224, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
}

.pagination-left,
.pagination-right {
    flex: 0 0 auto;
}

.pagination-center {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.page-text {
    color: #40e0ff;
    font-size: 26rpx;
    font-weight: 600;
}

.total-text {
    color: rgba(255, 255, 255, 0.6);
    font-size: 20rpx;
}

.page-btn {
    padding: 10rpx 18rpx;
    background: rgba(64, 224, 255, 0.1);
    border: 1px solid rgba(64, 224, 255, 0.35);
    border-radius: 12rpx;
    color: #40e0ff;
    font-size: 28rpx;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.page-btn.disabled {
    opacity: 0.25;
    cursor: not-allowed;
}

/* 编辑弹窗 */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(10px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30rpx 20rpx;
}

.modal-container {
    width: 100%;
    max-width: 680rpx;
    max-height: 85vh;
    background: rgba(0, 35, 65, 0.98);
    border-radius: 30rpx;
    border: 2px solid rgba(64, 224, 255, 0.5);
    box-shadow: 0 0 40rpx rgba(64, 224, 255, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 28rpx 24rpx;
    border-bottom: 1px solid rgba(64, 224, 255, 0.3);
}

.modal-title {
    color: #40e0ff;
    font-size: 30rpx;
    font-weight: 600;
}

.modal-close {
    width: 44rpx;
    height: 44rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
    font-size: 26rpx;
    cursor: pointer;
    transition: all 0.3s ease;
    flex-shrink: 0;
}

.modal-close:active {
    transform: scale(0.9);
    background: rgba(239, 68, 68, 0.2);
}

.modal-body {
    flex: 1;
    padding: 24rpx;
    overflow-y: auto;
}

.form-item {
    margin-bottom: 28rpx;
}

.form-item.checkbox-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.form-label {
    display: block;
    color: rgba(255, 255, 255, 0.8);
    font-size: 26rpx;
    margin-bottom: 12rpx;
}

.checkbox-item .form-label {
    margin-bottom: 0;
}

.form-input {
    width: 100%;
    height: 76rpx;
    padding: 0 20rpx;
    background: rgba(64, 224, 255, 0.05);
    border: 1px solid rgba(64, 224, 255, 0.3);
    border-radius: 16rpx;
    color: #ffffff;
    font-size: 26rpx;
    box-sizing: border-box;
}

.form-input:focus {
    border-color: rgba(64, 224, 255, 0.6);
    background: rgba(64, 224, 255, 0.1);
}

.form-textarea {
    width: 100%;
    min-height: 140rpx;
    padding: 14rpx 20rpx;
    background: rgba(64, 224, 255, 0.05);
    border: 1px solid rgba(64, 224, 255, 0.3);
    border-radius: 16rpx;
    color: #ffffff;
    font-size: 26rpx;
    box-sizing: border-box;
    line-height: 1.6;
}

.form-textarea:focus {
    border-color: rgba(64, 224, 255, 0.6);
    background: rgba(64, 224, 255, 0.1);
}

.image-preview-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16rpx;
    padding: 16rpx;
    background: rgba(64, 224, 255, 0.05);
    border: 1px solid rgba(64, 224, 255, 0.3);
    border-radius: 16rpx;
}

.form-image-preview {
    width: 300rpx;
    height: 300rpx;
    border-radius: 12rpx;
    border: 1px solid rgba(64, 224, 255, 0.3);
    background: rgba(0, 0, 0, 0.3);
}

.image-delete-btn {
    padding: 16rpx 32rpx;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 12rpx;
    color: #ef4444;
    font-size: 26rpx;
    cursor: pointer;
}

/* 时间信息区域样式 */
.time-info-section {
    padding: 0rpx 36rpx 0rpx 0rpx;
}

.time-info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3rpx 0;
}

.time-label {
    color: rgba(255, 255, 255, 0.6);
    font-size: 24rpx;
    flex-shrink: 0;
}

.time-value {
    color: #ffffff;
    font-size: 24rpx;
    font-family: 'Courier New', monospace;
    text-align: right;
    flex: 1;
    margin-left: 16rpx;
    margin-right: 16rpx;
    transition: all 0.3s ease;
}

.image-delete-btn:active {
    transform: scale(0.95);
    background: rgba(239, 68, 68, 0.3);
}

.form-tip {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 20rpx;
    background: rgba(64, 224, 255, 0.05);
    border-radius: 12rpx;
    border: 1px solid rgba(64, 224, 255, 0.2);
}

.form-tip .tip-icon {
    font-size: 28rpx;
}

.form-tip .tip-text {
    color: rgba(255, 255, 255, 0.7);
    font-size: 24rpx;
    line-height: 1.5;
}

.picker-view {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    background: rgba(64, 224, 255, 0.05);
    border: 1px solid rgba(64, 224, 255, 0.3);
    border-radius: 16rpx;
    color: #ffffff;
    font-size: 26rpx;
    display: flex;
    align-items: center;
    box-sizing: border-box;
}

.modal-footer {
    display: flex;
    gap: 16rpx;
    padding: 32rpx;
    border-top: 1px solid rgba(64, 224, 255, 0.3);
}

.modal-btn {
    flex: 1;
    height: 80rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16rpx;
    font-size: 28rpx;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.modal-btn.cancel {
    background: rgba(156, 163, 175, 0.1);
    border: 1px solid rgba(156, 163, 175, 0.3);
    color: rgba(255, 255, 255, 0.8);
}

.modal-btn.cancel:active {
    transform: scale(0.95);
    background: rgba(156, 163, 175, 0.2);
}

.modal-btn.confirm {
    background: rgba(64, 224, 255, 0.2);
    border: 1px solid rgba(64, 224, 255, 0.5);
    color: #40e0ff;
}

.modal-btn.confirm:active {
    transform: scale(0.95);
    background: rgba(64, 224, 255, 0.3);
}



/* 底部提示 */
.footer-tip {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    margin: 30rpx 40rpx;
    padding: 20rpx;
    background: rgba(64, 224, 255, 0.05);
    border-radius: 16rpx;
    border: 1px solid rgba(64, 224, 255, 0.2);
}

.tip-icon {
    font-size: 24rpx;
}

.tip-text {
    color: rgba(255, 255, 255, 0.7);
    font-size: 22rpx;
}
</style>
