<template>
	<view class="chat-admin-container" :class="{ 'dark-theme': isDarkTheme }">
		<!-- 自定义导航栏 -->
		<view class="nav-bar" @click.stop>
			<view class="nav-content">
				<view class="nav-left" @click="goBack">
					<text class="back-icon">‹</text>
				</view>
				<view class="nav-title">用户消息</view>
				<view class="nav-right">
					<text class="search-icon" @click="toggleSearch">🔍</text>
				</view>
			</view>
		</view>

		<!-- 搜索栏 -->
		<view class="search-bar" v-if="showSearch" @click.stop>
			<view class="search-input-wrap">
				<text class="search-input-icon">🔍</text>
				<input ref="searchInput" class="search-input" v-model="searchKeyword" placeholder="搜索用户"
					placeholder-class="search-placeholder" @input="onSearchInput" />
				<text class="clear-icon" v-if="searchKeyword" @click="clearSearch">×</text>
			</view>
		</view>

		<!-- 用户列表 -->
		<scroll-view ref="userScroll" class="user-list" scroll-y :scroll-top="scrollTop" :style="{ height: listHeight, backgroundColor: 'var(--list-bg)', paddingTop: headerOffset + 'px' }" @scrolltolower="loadMore"
			refresher-enabled :refresher-triggered="isRefreshing" @refresherrefresh="onRefresh" @click.stop @click="handleContainerClick">
			<!-- 加载中 -->
			<view class="loading-wrap" v-if="loading && userList.length === 0">
				<view class="loading-spinner"></view>
				<text class="loading-text">加载中...</text>
			</view>

			<!-- 空状态 -->
			<view class="empty-wrap" v-else-if="!loading && filteredUserList.length === 0">
				<text class="empty-icon">💬</text>
				<text class="empty-text">{{ searchKeyword ? '未找到匹配的用户' : '暂无用户消息' }}</text>
			</view>

			<!-- 用户列表 -->
			<view class="user-item" :class="{ 'has-unread': user.unreadCount > 0 }" 
				v-for="(user, index) in filteredUserList" :key="user.otherId" @click="openChat(user)"
				:style="{ animationDelay: index * 0.05 + 's' }">
				<view class="avatar-wrap">
					<image class="avatar" :src="getUserAvatar(user)" mode="aspectFill"></image>
					<view class="online-dot" :class="{ online: user.isOnline }"></view>
					<view class="unread-badge" v-if="user.unreadCount > 0">
						{{ user.unreadCount > 99 ? '99+' : user.unreadCount }}
					</view>
				</view>

				<!-- 用户信息 -->
				<view class="user-info">
					<view class="user-name-row">
						<text class="user-name">{{ user.note || user.username }}</text>
						<text class="last-time">{{ formatTime(user.latestContent?.sendTime) }}</text>
					</view>
					<view class="last-message-row">
						<text class="last-message" :class="{ unread: user.unreadCount > 0 }">
							{{ formatLastMessage(user.latestContent) }}
						</text>
						<view class="user-tags" v-if="user.username">
							<text class="tag">{{ user.username }}</text>
						</view>
					</view>
				</view>
			</view>

			<!-- 加载更多 -->
			<view class="load-more" v-if="userList.length > 0 && hasMore">
				<text class="load-more-text">{{ loadingMore ? '加载中...' : '上拉加载更多' }}</text>
			</view>
			<view class="no-more" v-else-if="userList.length > 0 && !hasMore">
				<text class="no-more-text">没有更多了</text>
			</view>
		</scroll-view>

		<!-- 底部操作栏 -->
		<view class="bottom-bar" :style="{ paddingBottom: safeAreaBottom + 'px' }" @click.stop  @click="handleContainerClick">
			<view class="stat-item">
				<text class="stat-value">{{ totalUsers }}</text>
				<text class="stat-label">总用户</text>
			</view>
			<view class="stat-item">
				<text class="stat-value">{{ onlineUsers }}</text>
				<text class="stat-label">在线</text>
			</view>
			<view class="stat-item">
				<text class="stat-value">{{ totalUnread }}</text>
				<text class="stat-label">未读消息</text>
			</view>
		</view>
	</view>
</template>

<script>
import * as chatApi from '@/api/chat'
import { userinfo } from '@/api/user'
import { baseUrl } from '@/api/settings'
import { getAvatarUrl } from '@/utils/avatar-handler.js'
import { triggerMessageNotification } from '@/utils/message-event-bus.js'
export default {
	data() {
		return {
			statusBarHeight: 20,
			safeAreaBottom: 0,
			showSearch: false,
			searchKeyword: '',
			loading: false,
			loadingMore: false,
			isRefreshing: false,
			userList: [],
			page: 1,
			pageSize: 20,
			hasMore: true,
			isDarkTheme: false,
			scrollTop: 0,
			
			// 本地缓存相关
			cacheKey: '', // 存储 key = `chatlist_${userId}`
			lastRefreshTime: 0, // 上次刷新时间
			refreshInterval: 10000, // 10秒刷新一次第一页
			refreshTimer: null, // 定时器
			isPageActive: false // 页面激活状态
		}
	},

computed: {
		headerOffset() {
			const baseOffset = 44 + (this.statusBarHeight || 20)
			const searchOffset = this.showSearch ? 50 : 0
			return baseOffset + searchOffset
		},
		listHeight() {
			const navHeight = 44 + this.statusBarHeight
			const searchHeight = this.showSearch ? 50 : 0
			return `calc(100vh - ${navHeight + searchHeight + this.safeAreaBottom}px)`
		},

		filteredUserList() {
			if (!this.searchKeyword) return this.userList
			const keyword = this.searchKeyword.toLowerCase()
			return this.userList.filter(user => {
				const name = (user.username || '').toLowerCase()
				const note = (user.note || '').toLowerCase()
				return name.includes(keyword) || note.includes(keyword)
			})
		},

		totalUsers() {
			return this.userList.length
		},

		onlineUsers() {
			return this.userList.filter(u => u.isOnline).length
		},

		totalUnread() {
			return this.userList.reduce((sum, u) => sum + (u.unreadCount || 0), 0)
		}
	},

	onLoad() {
		this.isPageActive = true
		const token = uni.getStorageSync('token')
		if (!token) {
			uni.setStorageSync('autoLogin', false)
			uni.navigateTo({ url: '/pages/index/index' })
		}
		
		// 检测主题
		this.checkTheme()
		this.initSystemInfo()
		
		// 初始化缓存 key（基于当前用户）
		this.initCacheKey()
		
		// 从本地缓存加载用户列表
		this.loadFromCache()
		
		// 注意：initLoadAllUsers() 和 startPeriodicRefresh() 
		// 已移动或保留在 onShow 中，或由逻辑控制，避免 onLoad 和 onShow 重复调用
	},

	onShow() {
		this.isPageActive = true
		
		// 初始化加载/刷新
		this.refreshList()
		
		// 启动定时刷新
		this.startPeriodicRefresh()
	},

	onHide() {
		// 页面隐藏时标记为不活跃
		this.isPageActive = false
		this.stopPeriodicRefresh()
	},
	
	onUnload() {
		// 页面卸载时标记为不活跃并停止定时刷新
		this.isPageActive = false
		this.stopPeriodicRefresh()
	},

	// Vue 2/3 通用销毁钩子
	beforeDestroy() {
		this.isPageActive = false
		this.stopPeriodicRefresh()
	},
	beforeUnmount() {
		this.isPageActive = false
		this.stopPeriodicRefresh()
	},

	methods: {
		// ==================== 缓存管理 ====================
		
		/**
		 * 初始化缓存 key
		 */
		initCacheKey() {
			try {
				const userInfo = uni.getStorageSync('userInfo')
				const userId = userInfo?.id || userInfo?.userId || 'unknown'
				this.cacheKey = `chatlist_${userId}`
			} catch (e) {
				console.error('初始化缓存 key 失败:', e)
				this.cacheKey = 'chatlist_unknown'
			}
		},
		
		/**
		 * 从本地缓存加载用户列表
		 */
		loadFromCache() {
			try {
				if (!this.cacheKey) return
				
				const cached = uni.getStorageSync(this.cacheKey)
				if (cached && typeof cached === 'string') {
					const cacheData = JSON.parse(cached)
					if (cacheData && Array.isArray(cacheData.userList)) {
						this.userList = cacheData.userList
						this.lastRefreshTime = cacheData.timestamp || 0
						console.log('从缓存加载用户列表，共', this.userList.length, '个用户')
					}
				}
			} catch (e) {
				console.error('从缓存加载数据失败:', e)
			}
		},
		
		/**
		 * 保存用户列表到本地缓存
		 */
		saveToCache() {
			try {
				if (!this.cacheKey) return
				
				const cacheData = {
					userList: this.userList,
					timestamp: Date.now()
				}
				uni.setStorageSync(this.cacheKey, JSON.stringify(cacheData))
			} catch (e) {
				console.error('保存缓存失败:', e)
			}
		},
		
		/**
		 * 清除缓存（退出登录时调用）
		 */
		clearCache() {
			try {
				if (this.cacheKey) {
					uni.removeStorageSync(this.cacheKey)
					console.log('缓存已清除')
				}
			} catch (e) {
				console.error('清除缓存失败:', e)
			}
		},
		
		// ==================== 定时刷新 ====================
		
		/**
		 * 启动定时刷新第一页
		 */
		startPeriodicRefresh() {
			// 清除旧的定时器
			this.stopPeriodicRefresh()
			
			// 设置新的定时器，每 10 秒刷新一次第一页
			this.refreshTimer = setInterval(() => {
				console.log('定时刷新第一页，当前时间:', new Date().toLocaleTimeString())
				this.refreshFirstPage()
			}, this.refreshInterval)
		},
		
		/**
		 * 初始化加载所有用户（首次进入页面时）
		 */
		async initLoadAllUsers() {
			if (this.loading || !this.isPageActive) return
			this.loading = true
			
			try {
				let page = 1
				let hasMoreData = true
				const maxPages = 15 // 稍微增加，覆盖 200*15=3000 用户
				
				// 使用较大的 pageSize 一次性拉取尽可能多
				const BIG_PAGE_SIZE = 200 
				
				while (hasMoreData && page <= maxPages) {
					// 循环内检查：如果页面已切换，立即跳出
					if (!this.isPageActive) {
						console.log('initLoadAllUsers: 检测到页面非活跃状态，终止抓取进程')
						break
					}

					console.log(`正在全量抓取第 ${page} 轮 (规模: ${BIG_PAGE_SIZE})...`)
					const res = await chatApi.getChatUserList({
						page: page,
						pageSize: BIG_PAGE_SIZE
					})
					
					if (res.code === 0 && res.data) {
						let list = []
						if (Array.isArray(res.data)) {
							list = res.data
						} else if (res.data.list && Array.isArray(res.data.list)) {
							list = res.data.list
						}
						
						if (list.length === 0) {
							console.log(`第 ${page} 轮抓取为空，停止同步`)
							hasMoreData = false
							break
						}
						
						// 处理数据
						const processedList = list.map(user => {
							if (user.unreadCount === undefined) {
								const currentUserId = this.getCurrentUserId()
								const isLatestFromOther = user.latestContent && 
									String(user.latestContent.senderId) !== String(currentUserId)
								user.unreadCount = (user.latestContent?.isRead === false && isLatestFromOther) ? 1 : 0
							}
							return user
						})
						
						// 合并到本地（mergeUserList 会通过 otherId 自动去重）
						this.mergeUserList(processedList, page)
						
						console.log(`第 ${page} 轮抓取完毕: 本批次收到 ${list.length} 个, 累计排重后 ${this.userList.length} 个`)
						
						// 如果返回的数据少于 BIG_PAGE_SIZE，通常说明到头了
						if (list.length < BIG_PAGE_SIZE) {
							hasMoreData = false
						}
						
						page++
					} else {
						hasMoreData = false
						break
					}
					
					await new Promise(resolve => setTimeout(resolve, 150))
				}
				
				this.sortUserList()
				this.page = 1
				this.hasMore = false 
				
				this.saveToCache()
			} catch (e) {
				console.error('全量同步失败:', e)
				uni.showToast({
					title: '同步失败，请重试',
					icon: 'none'
				})
			} finally {
				this.loading = false
			}
		},

		/**
		 * 统一排序用户列表 (按时间倒序)
		 */
		sortUserList() {
			this.userList.sort((a, b) => {
				const timeA = new Date(a.latestContent?.sendTime || a.lastMessageTime || 0).getTime()
				const timeB = new Date(b.latestContent?.sendTime || b.lastMessageTime || 0).getTime()
				return timeB - timeA
			})
		},
		
		/**
		 * 停止定时刷新
		 */
		stopPeriodicRefresh() {
			if (this.refreshTimer) {
				clearInterval(this.refreshTimer)
				this.refreshTimer = null
				console.log('定时刷新已停止')
			}
		},
		
		/**
		 * 刷新第一页
		 */
		async refreshFirstPage() {
			if (!this.isPageActive || this.loading) return
			try {
				const res = await chatApi.getChatUserList({
					page: 1,
					pageSize: this.pageSize
				})

				if (res.code === 0 && res.data) {
					const list = res.data.list || res.data || []
					const processedList = list.map(user => {
						if (user.unreadCount === undefined) {
							const currentUserId = this.getCurrentUserId()
							const isLatestFromOther = user.latestContent && 
								String(user.latestContent.senderId) !== String(currentUserId)
							user.unreadCount = (user.latestContent?.isRead === false && isLatestFromOther) ? 1 : 0
						}
						return user
					})
					
					// 执行增量更新：合并新数据和现有数据（仅第一页）
					const oldLength = this.userList.length
					this.mergeUserList(processedList, 1)
					const newLength = this.userList.length
					
					console.log('第一页刷新完成，新增:', newLength - oldLength, '个用户，总共:', newLength)
					
					this.lastRefreshTime = Date.now()
					this.saveToCache()
				}
			} catch (e) {
				console.error('刷新第一页失败:', e)
			}
		},
		
		/**
		 * 合并用户列表（增量更新）
		 * 处理：新增用户、更新用户信息、顺序调整
		 */
		mergeUserList(newList, page) {
			if (page === 1) {
				// 第一页：完全替换或合并
				const newUserMap = new Map(newList.map(u => [u.otherId, u]))
				const existingUserMap = new Map(this.userList.map(u => [u.otherId, u]))
				
				let updatedCount = 0
				let addedCount = 0
				
				// 更新现有用户的信息
				for (const [userId, newUser] of newUserMap) {
					if (existingUserMap.has(userId)) {
						updatedCount++
						const existingUser = existingUserMap.get(userId)
						
						// 检测是否有新消息（未读消息增加或最新消息内容改变）
						const hadUnread = existingUser.unreadCount > 0
						const hasNewUnread = newUser.unreadCount > 0
						const isNewMessage = !hadUnread && hasNewUnread
						const messageChanged = existingUser.latestContent?.id !== newUser.latestContent?.id
						
						// 如果有新消息，发送系统通知
						if ((isNewMessage || messageChanged) && newUser.latestContent) {
							const senderName = newUser.note || newUser.username || '用户'
							const msgContent = newUser.latestContent.content || '[消息]'
							
							triggerMessageNotification({
								senderName: senderName,
								content: msgContent,
								type: 'text'
							}, {
								playSound: true,
								vibrate: true,
								showNotification: true
							}).catch(e => {
								console.warn('聊天列表消息通知失败:', e)
							})
						}
						
						// 更新用户信息（最后一条消息、在线状态等）
						Object.assign(existingUser, {
							latestContent: newUser.latestContent,
							isOnline: newUser.isOnline,
							unreadCount: newUser.unreadCount,
							avatar: newUser.avatar,
							username: newUser.username,
							note: newUser.note
						})
					} else {
						addedCount++
						// 新增用户
						existingUserMap.set(userId, newUser)
					}
				}
				
				// 重新排序（按最新消息时间倒序）
				// 注意：只排序第一页的用户，保留后续页面的顺序
				const page1Users = Array.from(existingUserMap.values())
					.filter(u => newUserMap.has(u.otherId))
					.sort((a, b) => {
						const timeA = a.latestContent?.sendTime || 0
						const timeB = b.latestContent?.sendTime || 0
						return new Date(timeB).getTime() - new Date(timeA).getTime()
					})
				
				// 合并：排序后的第一页 + 现有的后续页面
				const laterPages = this.userList.filter(u => !newUserMap.has(u.otherId))
				this.userList = [...page1Users, ...laterPages]
				
				console.log(`第一页已合并: 更新 ${updatedCount} 个, 新增 ${addedCount} 个, 总共 ${this.userList.length} 个用户`)
			} else {
				// 后续页面：仅添加不存在的用户
				const existingIds = new Set(this.userList.map(u => u.otherId))
				const usersToAdd = newList.filter(u => !existingIds.has(u.otherId))
				
				console.log(`第 ${page} 页处理: 收到 ${newList.length} 个用户, 已存在 ${newList.length - usersToAdd.length} 个, 新增 ${usersToAdd.length} 个`)
				
				if (usersToAdd.length > 0) {
					this.userList = [...this.userList, ...usersToAdd]
					console.log(`第 ${page} 页已添加, 现在共 ${this.userList.length} 个用户`)
				} else {
					console.log(`第 ${page} 页没有新用户, 保持 ${this.userList.length} 个用户不变`)
				}
			}
		},

		// 验证管理员权限
		async verifyAdminPermission() {
			try {
				const response = await userinfo()
				console.log("user权限response:", response)
				if (response && response.data && response.data.isAdmin) {
					// 权限验证通过
					console.log('管理员权限验证通过')
				} else {
					// 权限验证失败，清除本地伪造的 isAdmin 标记
					uni.removeStorageSync('isAdmin')
					uni.showToast({ title: '权限已过期或被撤销', icon: 'none' })
					setTimeout(() => {
						goBack()
					}, 1000)
				}
			} catch (err) {
				console.error('权限验证失败:', err)
				uni.showToast({ title: '权限验证失败，请重新登录', icon: 'none' })
				setTimeout(() => {
					goBack()
				}, 1000)
			}
		},

		// 初始化系统信息
		initSystemInfo() {
			const systemInfo = uni.getSystemInfoSync()
			this.statusBarHeight = systemInfo.statusBarHeight || 20
			this.safeAreaBottom = systemInfo.safeAreaInsets?.bottom || 0
			
			// 设置 CSS 变量
			if (typeof document !== 'undefined') {
				document.documentElement.style.setProperty('--status-bar-height', this.statusBarHeight + 'px')
			}
		},

		// 检测主题
		checkTheme() {
			try {
				const theme = uni.getStorageSync('app_theme') || 'light'
				this.isDarkTheme = theme === 'dark'
			} catch (e) {
				console.error('检测主题失败:', e)
				this.isDarkTheme = false
			}
		},

		// 切换搜索框
		toggleSearch() {
			this.showSearch = !this.showSearch
			if (!this.showSearch) {
				this.searchKeyword = ''
			}
		},

		// 处理容器点击（关闭搜索框）
		handleContainerClick() {
			if (this.showSearch) {
				// 如果搜索框有内容，让输入框失去焦点；如果没有内容，隐藏搜索框
				if (!this.searchKeyword || this.searchKeyword.trim() === '') {
					this.showSearch = false
					this.searchKeyword = ''
				} else {
					// 有内容时隐藏键盘
					uni.hideKeyboard()
				}
			}
		},

		// 搜索输入
		onSearchInput() {
			// 可以添加防抖处理
		},

		// 清除搜索
		clearSearch() {
			this.searchKeyword = ''
		},

		// 加载用户列表
		async loadUserList() {
			console.log('=== loadUserList 开始 ===', {
				page: this.page,
				pageSize: this.pageSize,
				currentListLength: this.userList.length
			})
			
			if (this.loading && this.page > 1) return // 加载更多时不重复加载
			if (this.page === 1) this.loading = true

			try {
				const res = await chatApi.getChatUserList({
					page: this.page,
					pageSize: this.pageSize
				})

				console.log('=== 获取用户列表响应 ===', {
					code: res.code,
					dataLength: res.data?.list?.length || res.data?.length || 0,
					pageSize: this.pageSize
				})

				if (res.code === 0 && res.data) {
					const list = res.data.list || res.data || []
					
					// 处理数据,添加 unreadCount 字段
					const processedList = list.map(user => {
						// 如果后端没有提供 unreadCount,则根据 latestContent.isRead 来判断
						if (user.unreadCount === undefined) {
							// 如果最新消息未读且不是自己发的,则未读数为1,否则为0
							const currentUserId = this.getCurrentUserId()
							const isLatestFromOther = user.latestContent && 
								String(user.latestContent.senderId) !== String(currentUserId)
							user.unreadCount = (user.latestContent?.isRead === false && isLatestFromOther) ? 1 : 0
						}
						return user
					})
					
					// 使用增量更新逻辑
					const oldLength = this.userList.length
					this.mergeUserList(processedList, this.page)
					const newLength = this.userList.length
					
					console.log('=== mergeUserList 后 ===', {
						page: this.page,
						addedCount: newLength - oldLength,
						totalCount: newLength,
						receivedCount: list.length
					})
					
					// 判断是否还有更多数据
					// 只有当返回的数据少于 pageSize 时，才表示没有更多数据
					this.hasMore = list.length >= this.pageSize
					
					console.log('hasMore 设置为:', this.hasMore, '(返回数据:', list.length, '> pageSize:', this.pageSize, ')')
					
					// 保存到本地缓存
					this.saveToCache()
				}
			} catch (e) {
				console.error('加载用户列表失败:', e)
				uni.showToast({
					title: '加载失败',
					icon: 'none'
				})
				// 出错时不改变 hasMore，允许重试
			} finally {
				this.loading = false
				this.loadingMore = false
				this.isRefreshing = false
			}
		},

		// 获取当前用户ID
		getCurrentUserId() {
			try {
				const userInfo = uni.getStorageSync('userInfo')
				return userInfo?.id || userInfo?.userId || ''
			} catch (e) {
				console.error('获取用户ID失败:', e)
				return ''
			}
		},

		// 刷新列表
		async refreshList() {
			if (!this.isPageActive) return
			this.page = 1
			// 全量加载所有用户
			await this.initLoadAllUsers()
			
			if (!this.isPageActive) return
			
			// 确保滚动回到 header 下方
			this.scrollTop = this.headerOffset
			setTimeout(() => {
				if (this.isPageActive) {
					this.scrollTop = this.headerOffset
				}
			}, 50)
		},

		// 下拉刷新
		async onRefresh() {
			this.isRefreshing = true
			await this.refreshList()
			// 结束刷新，确保滚动位置在 header 下方
			this.isRefreshing = false
			this.scrollTop = this.headerOffset
			setTimeout(() => {
				this.scrollTop = this.headerOffset
			}, 50)
		},

		// 加载更多
		async loadMore() {			
			if (this.loadingMore || !this.hasMore) {
				return
			}
			this.loadingMore = true
			this.page++
			console.log('准备加载第', this.page, 'ҳ')
			await this.loadUserList()
		},

		// 打开聊天
		openChat(user) {
			// 标记已读
			if (user.unreadCount > 0) {
				chatApi.markAsRead(user.otherId)
				user.unreadCount = 0
			}

			uni.navigateTo({
				url: `/pages-nonTheme/chat?chatId=${user.otherId}&title=${encodeURIComponent(user.username)}&userId=${user.otherId}&avatar=${encodeURIComponent(user.avatar || '')}`
			})
		},

		// 格式化时间
		formatTime(timestamp) {
			if (!timestamp) return ''
			const date = new Date(timestamp)
			const now = new Date()
			const diff = now - date

			// 今天
			if (date.toDateString() === now.toDateString()) {
				return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
			}

			// 昨天
			const yesterday = new Date(now)
			yesterday.setDate(yesterday.getDate() - 1)
			if (date.toDateString() === yesterday.toDateString()) {
				return '昨天'
			}

			// 一周内
			if (diff < 7 * 24 * 60 * 60 * 1000) {
				const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
				return days[date.getDay()]
			}

			// 更早
			return `${date.getMonth() + 1}/${date.getDate()}`
		},

		// 格式化最后一条消息
		formatLastMessage(message) {
			if (!message) return '暂无消息'

			// message 可能是对象或字符串
			const msgType = message.type || 'text'
			let msgContent = message.content || ''

			switch (msgType) {
				case 'text':
					// 文本消息，content 直接是字符串
					const textContent = String(msgContent)
					if (!textContent || textContent === '') {
						return '暂无消息'
					}
					if (textContent.length > 40) {
						return textContent.slice(0, 37) + '...'
					}
					return textContent
				case 'image':
					// 图片消息，尝试解析 content
					let imageContent = msgContent
					if (typeof msgContent === 'string') {
						try {
							imageContent = JSON.parse(msgContent)
						} catch (e) {
							// 解析失败，使用默认
						}
					}
					const imageName = imageContent?.name || imageContent?.fileName || 'ͼƬ'
					return '[ͼƬ] ' + (imageName.length > 20 ? imageName.slice(0, 20) + '...' : imageName)
				case 'voice':
					return '[语音]'
				case 'video':
					// 视频消息，尝试解析 content
					let videoContent = msgContent
					if (typeof msgContent === 'string') {
						try {
							videoContent = JSON.parse(msgContent)
						} catch (e) {
							// 解析失败，使用默认
						}
					}
					const videoName = videoContent?.videoName || videoContent?.fileName || '视频'
					return '[视频] ' + (videoName.length > 20 ? videoName.slice(0, 20) + '...' : videoName)
				case 'file':
					// 文件消息，尝试解析 content
					let fileContent = msgContent
					if (typeof msgContent === 'string') {
						try {
							fileContent = JSON.parse(msgContent)
						} catch (e) {
							// 解析失败，使用默认
						}
					}
					const fileName = fileContent?.fileName || '文件'
					return '[文件] ' + (fileName.length > 20 ? fileName.slice(0, 20) + '...' : fileName)
				case 'location':
					// 位置消息，尝试解析 content
					let locationContent = msgContent
					if (typeof msgContent === 'string') {
						try {
							locationContent = JSON.parse(msgContent)
						} catch (e) {
							// 解析失败，使用默认
						}
					}
					const locationName = locationContent?.locationName || '位置'
					return '[位置] ' + (locationName.length > 20 ? locationName.slice(0, 20) + '...' : locationName)
				default:
					return '[其它消息]'
			}
		},

		// 返回上一页
		goBack() {
			// 获取页面栈信息
			const pages = getCurrentPages()
			
			// 如果页面栈中有多于1个页面，说明可以正常返回
			if (pages.length > 1) {
				uni.navigateBack({
					delta: 1,
					fail: () => {
						// 返回失败时的备选方案
						console.log('navigateBack failed, using backup navigation')
						this.handleBackupNavigation()
					}
				})
			} else {
				// 页面栈中只有当前页面，执行备选导航方案
				console.log('No previous page in stack, using backup navigation')
				this.handleBackupNavigation()
			}
		},

		// 备选导航方案
		handleBackupNavigation() {
			// 检查是否是从特定页面进入的（通过页面参数或存储）
			const referrerPage = uni.getStorageSync('rankingReferrer')
			
			if (referrerPage) {
				// 清除存储的来源页面信息
				uni.removeStorageSync('rankingReferrer')
				
				// 延迟一下再跳转，让用户看到提示
				setTimeout(() => {
					// 根据来源页面进行导航
					switch (referrerPage) {
						case 'home':
							uni.reLaunch({ url: '/pages/home/home' })
							break
						case 'profile':
							uni.reLaunch({ url: '/pages/profile/profile' })
							break
						case 'scan':
							uni.reLaunch({ url: '/pages/scan/scan' })
							break
						default:
							uni.reLaunch({ url: '/pages/home/home' })
							break
					}
				}, 500)
			} else {
				// 默认返回首页
				setTimeout(() => {
					uni.reLaunch({ url: '/pages/home/home' })
				}, 500)
			}
		},

		// 生成基于用户名的头像 URL (使用第三方服务)
		generateAvatarFromName(name) {
			if (!name) return this.getDefaultAvatarUrl()
			
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
			// 方案1: UI Avatars (推荐，支持跨平台)
			const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(firstChar)}&background=${bgColor}&color=fff&size=100&font-size=0.4&bold=true`
			
			return avatarUrl
		},

		// 获取默认头像 URL
		getDefaultAvatarUrl() {
			// 使用在线默认头像服务而不是本地文件
			return 'https://ui-avatars.com/api/?name=U&background=999999&color=fff&size=100'
		},

		// 获取用户头像 (如果没有则生成)
		getUserAvatar(user) {
			// 检查是否有有效的真实头像
			if (user.avatar && 
				typeof user.avatar === 'string' &&
				user.avatar.trim() !== '' && 
				user.avatar !== 'null' &&
				user.avatar !== 'undefined' &&
				!user.avatar.includes('default-avatar')) {
				// 使用新的头像工具处理 (支持 Base64)
				const avatarUrl = getAvatarUrl(user.avatar, baseUrl)
				return avatarUrl
			}
			// 没有有效头像时，生成基于用户名的头像
			const username = user.note || user.username || '用户'
			const generatedUrl = this.generateAvatarFromName(username)
			return generatedUrl
		}
	}
}
</script>

<style lang="scss" scoped>
.chat-admin-container {
	min-height: 100vh;
	background-color: var(--bg-primary);
	transition: background-color 0.3s ease, color 0.3s ease;

	// ===== 浅色主题（默认）=====
	--nav-bg: linear-gradient(135deg, #07c160 0%, #00a854 100%);
	--nav-text: #fff;
	--bg-primary: linear-gradient(180deg, #f8f9fa 0%, #f1f3f4 100%);
	--bg-secondary: #fff;
	--border-color: rgba(0,0,0,0.08);
	--text-primary: #202124;
	--text-secondary: #5f6368;
	--accent-color: #07c160;
	--unread-bg: linear-gradient(135deg, #f0fff4 0%, #e6fffa 100%);
	--unread-border: #07c160;
	--tag-bg: rgba(7, 193, 96, 0.12);
	--list-bg: var(--bg-secondary);
	--nav-border: rgba(0,0,0,0.06);
	--nav-shadow: 0 2px 12px rgba(0,0,0,0.08);
	--card-shadow: 0 2px 8px rgba(0,0,0,0.06);
	--hover-bg: rgba(7, 193, 96, 0.04);

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
		--unread-bg: linear-gradient(135deg, rgba(64, 224, 255, 0.08) 0%, rgba(64, 224, 255, 0.12) 100%);
		--unread-border: #40e0ff;
		--tag-bg: rgba(64, 224, 255, 0.15);

		--list-bg: linear-gradient(180deg, #0b1220 0%, #0a0a14 100%);
		--nav-border: rgba(255,255,255,0.08);
		--nav-shadow: 0 4px 20px rgba(0,0,0,0.4);
		--card-shadow: 0 2px 12px rgba(0,0,0,0.3);
		--hover-bg: rgba(64, 224, 255, 0.06);
	}
}

// 导航栏
.nav-bar {
	background: var(--nav-bg);
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 100;
	padding-top: var(--status-bar-height, 20px);
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	border-bottom: 1rpx solid var(--nav-border);
	box-shadow: var(--nav-shadow);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);

	.nav-content {
		// ifdef H5
		height: 24px;
		// endif
		// ifndef H5
		height: 44px;
		// endif
		display: flex;
		align-items: center;
		padding: 0 15px;
	}

	.nav-left {
		width: 40px;
		display: flex;
		align-items: center;
		transition: transform 0.2s ease;

		&:active {
			transform: scale(0.95);
		}

		.back-icon {
			font-size: 50rpx;
			color: var(--nav-text);
			font-weight: bold;
			transition: all 0.2s ease;
		}
	}

	.nav-title {
		flex: 1;
		text-align: center;
		font-size: 17px;
		font-weight: 600;
		color: var(--nav-text);
		text-shadow: 0 1px 2px rgba(0,0,0,0.1);
		transition: all 0.3s ease;
	}

	.nav-right {
		width: 40px;
		display: flex;
		justify-content: flex-end;
		transition: transform 0.2s ease;

		&:active {
			transform: scale(0.95);
		}

		.search-icon {
			font-family: 'iconfont';
			font-size: 20px;
			color: var(--nav-text);
			transition: all 0.2s ease;
			filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1));
		}
	}
}

// 搜索栏
.search-bar {
	position: fixed;
	top: calc(44px + var(--status-bar-height, 20px));
	left: 0;
	right: 0;
	z-index: 99;
	background: var(--bg-primary);
	padding: 5px 15px;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	border-bottom: 1rpx solid var(--border-color);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);

	.search-input-wrap {
		display: flex;
		align-items: center;
		background: var(--bg-secondary);
		border-radius: 25px;
		padding: 10px 16px;
		border: 1px solid var(--border-color);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: var(--card-shadow);

		&:focus-within {
			border-color: var(--accent-color);
			box-shadow: 0 0 0 3px rgba(7, 193, 96, 0.1);
			transform: translateY(-1px);
		}

		.search-input-icon {
			font-family: 'iconfont';
			font-size: 16px;
			color: var(--text-secondary);
			margin-right: 10px;
			transition: color 0.3s ease;
		}

		.search-input {
			flex: 1;
			font-size: 15px;
			background: transparent;
			color: var(--text-primary);
			transition: color 0.3s ease;
		}

		.search-placeholder {
			color: var(--text-secondary);
		}

		.clear-icon {
			font-size: 18px;
			color: var(--text-secondary);
			padding: 0 5px;
			transition: all 0.2s ease;
			border-radius: 50%;

			&:active {
				background-color: var(--hover-bg);
				transform: scale(0.9);
			}
		}
	}
}

// 用户列表
.user-list {
	/* 放在视图顶部，内容通过 scroll-view 的 paddingTop(headerOffset) 保持在 header 下方 */
	margin-top: 0;
	padding-bottom: 10px;
	background: var(--list-bg);
	/* 让列表与 header 有视觉分隔 */
	border-top-left-radius: 16rpx;
	border-top-right-radius: 16rpx;
	overflow: hidden;
	padding-top: 8px;
}

.loading-wrap {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 60px 0;
	animation: fadeIn 0.5s ease-in-out;

	.loading-spinner {
		width: 36px;
		height: 36px;
		border: 3px solid var(--border-color);
		border-top: 3px solid var(--accent-color);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		box-shadow: 0 2px 8px rgba(0,0,0,0.1);
	}

	.loading-text {
		margin-top: 12px;
		font-size: 14px;
		color: var(--text-secondary);
		font-weight: 500;
	}
}

@keyframes fadeIn {
	from {
		opacity: 0;
		transform: translateY(10px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.empty-wrap {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 100px 0;
	animation: fadeIn 0.6s ease-in-out;

	.empty-icon {
		font-size: 72px;
		margin-bottom: 20px;
		opacity: 0.7;
		animation: float 3s ease-in-out infinite;
	}

	.empty-text {
		font-size: 15px;
		color: var(--text-secondary);
		font-weight: 500;
	}
}

@keyframes float {
	0%, 100% {
		transform: translateY(0px);
	}
	50% {
		transform: translateY(-5px);
	}
}

.user-item {
	display: flex;
	align-items: center;
	padding: 12px 20px;
	margin: 2px 12px 0px 12px;
	background: var(--bg-secondary);
	border-radius: 10px;
	border: 1rpx solid var(--border-color);
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	box-shadow: var(--card-shadow);
	position: relative;
	overflow: hidden;
	animation: slideInUp 0.5s ease-out both;

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, transparent 0%, var(--hover-bg) 100%);
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	&:active {
		transform: translateY(1px) scale(0.98);
		box-shadow: 0 1px 4px rgba(0,0,0,0.1);

		&::before {
			opacity: 1;
		}
	}

	// 有未读消息时的样式
	&.has-unread {
		background: var(--unread-bg);
		border-color: var(--unread-border);
		box-shadow: 0 2px 12px rgba(7, 193, 96, 0.15);

		&::after {
			content: '';
			position: absolute;
			left: 0;
			top: 50%;
			transform: translateY(-50%);
			width: 4px;
			height: 60%;
			background: linear-gradient(180deg, var(--accent-color) 0%, rgba(7, 193, 96, 0.6) 100%);
			border-radius: 0 2px 2px 0;
		}

		.user-name {
			font-weight: 600 !important;
			color: var(--text-primary) !important;
		}

		.last-time {
			color: var(--accent-color) !important;
			font-weight: 500;
		}
	}

	.avatar-wrap {
		position: relative;
		margin-right: 14px;
		flex-shrink: 0;

		.avatar {
			width: 52px;
			height: 52px;
			border-radius: 12px;
			transition: all 0.3s ease;
			box-shadow: 0 2px 8px rgba(0,0,0,0.08);
		}

		.online-dot {
			position: absolute;
			bottom: 2px;
			right: 2px;
			width: 12px;
			height: 12px;
			border-radius: 50%;
			background-color: #ccc;
			border: 2px solid var(--bg-secondary);
			transition: all 0.3s ease;
			box-shadow: 0 1px 3px rgba(0,0,0,0.2);

			&.online {
				background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
				animation: pulse 2s infinite;
			}
		}

		.unread-badge {
			position: absolute;
			top: -2px;
			right: -2px;
			min-width: 20px;
			height: 20px;
			line-height: 20px;
			padding: 0 6px;
			font-size: 11px;
			font-weight: bold;
			color: #fff;
			background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
			border-radius: 10px;
			text-align: center;
			box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
			border: 1px solid var(--bg-secondary);
			animation: bounce 1s ease-in-out;
		}
	}

	.user-info {
		flex: 1;
		overflow: hidden;
		min-width: 0; // 防止 flex 子项溢出

		.user-name-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;

			.user-name {
				font-size: 16px;
				color: var(--text-primary);
				font-weight: 500;
				transition: all 0.3s ease;
				max-width: 60%;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.last-time {
				font-size: 12px;
				color: var(--text-secondary);
				transition: all 0.3s ease;
				flex-shrink: 0;
				margin-left: 8px;
			}
		}

		.last-message-row {
			display: flex;
			justify-content: space-between;
			align-items: flex-end;

			.last-message {
				flex: 1;
				font-size: 14px;
				color: var(--text-secondary);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				transition: all 0.3s ease;
				line-height: 1.4;
				max-width: 70%;

				&.unread {
					color: var(--text-primary);
					font-weight: 600;
				}
			}

			.user-tags {
				display: flex;
				margin-left: 12px;
				flex-shrink: 0;

				.tag {
					font-size: 10px;
					color: var(--accent-color);
					background: var(--tag-bg);
					padding: 3px 8px;
					border-radius: 8px;
					margin-left: 6px;
					transition: all 0.3s ease;
					border: 1px solid transparent;
					font-weight: 500;

					&:hover {
						background: var(--accent-color);
						color: white;
					}
				}
			}
		}
	}
}
// 加载更多
.no-more,
.load-more {
	text-align: center;
	padding: 12px 0;
	font-size: 14px;
	color: var(--text-secondary);
	transition: all 0.3s ease;
	.no-more-text,
	.load-more-text {
		display: inline-block;
		padding: 6px 12px;
		border-radius: 12px;
		background: var(--hover-bg);
	}
}
// 底部统计栏
.bottom-bar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	height: 70px;
	background: var(--bg-secondary);
	display: flex;
	justify-content: space-around;
	align-items: center;
	border-top: 1rpx solid var(--border-color);
	z-index: 100;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	box-shadow: 0 -2px 12px rgba(0,0,0,0.08);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 12px;
		border-radius: 12px;
		transition: all 0.3s ease;
		position: relative;

		&::before {
			content: '';
			position: absolute;
			top: 0;
			left: 50%;
			transform: translateX(-50%);
			width: 0;
			height: 2px;
			background: var(--accent-color);
			border-radius: 1px;
			transition: width 0.3s ease;
		}

		&:active {
			transform: scale(0.95);
			background: var(--hover-bg);

			&::before {
				width: 60%;
			}
		}

		.stat-value {
			font-size: 22px;
			font-weight: 700;
			color: var(--accent-color);
			transition: all 0.3s ease;
			text-shadow: 0 1px 2px rgba(0,0,0,0.1);
			margin-bottom: 2px;
		}

		.stat-label {
			font-size: 11px;
			color: var(--text-secondary);
			transition: all 0.3s ease;
			font-weight: 500;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
	}
}

@keyframes slideInUp {
	from {
		opacity: 0;
		transform: translateY(20px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
</style>
