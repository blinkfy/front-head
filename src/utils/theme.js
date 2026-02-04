// 这里的页面映射表需要跟pages.json保持一致
const PAGE_MAPPINGS = {
  'pages/index/index': 'pages-dark/index/index',
  'pages/register/register': 'pages-dark/register/register',
  'pages/home/home': 'pages-dark/home/home',
  'pages/profile/profile': 'pages-dark/profile/profile',
  'pages/about/about': 'pages-dark/about/about',
  'pages/guide/guide': 'pages-dark/guide/guide',
  'pages/change-password/change-password': 'pages-dark/change-password/change-password',
  'pages/map/map': 'pages-dark/map/map',
  'pages/scan/scan': 'pages-dark/scan/scan',
  'pages/history/history': 'pages-dark/history/history',
  'pages/ranking/ranking': 'pages-dark/ranking/ranking',
  'pages/shop/shop': 'pages-dark/shop/shop'
}

export const ThemeManager = {
  // 获取当前主题
  getTheme() {
    const cached = uni.getStorageSync('app_theme')
    console.log('getTheme: cached =', cached)
    return cached || 'light'
  },

  // 设置主题并保存
  setTheme(theme) {
    uni.setStorageSync('app_theme', theme)
    console.log('setTheme: saved', theme)
  },

  // 切换主题
  toggleTheme() {
    const currentTheme = this.getTheme()
    const newTheme = currentTheme === 'light' ? 'dark' : 'light'
    
    this.setTheme(newTheme)
    
    // 获取当前页面栈
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    const currentRoute = currentPage.route
    
    // 计算目标路径
    let targetPath = ''
    
    if (newTheme === 'dark') {
      // 切换到暗色版 (light -> dark)
      // 如果当前是 light 路径 (pages/...)
      if (currentRoute.startsWith('pages/')) {
        // 尝试映射
        targetPath = PAGE_MAPPINGS[currentRoute] || currentRoute.replace('pages/', 'pages-dark/')
      } else {
        targetPath = currentRoute // 已经是dark或者其他
      }
    } else {
      // 切换到亮色版 (dark -> light)
      // 如果当前是 dark 路径 (pages-dark/...)
      if (currentRoute.startsWith('pages-dark/')) {
        // 反向映射
         const key = Object.keys(PAGE_MAPPINGS).find(k => PAGE_MAPPINGS[k] === currentRoute)
         targetPath = key || currentRoute.replace('pages-dark/', 'pages/')
      } else {
        targetPath = currentRoute
      }
    }
    
    // 执行跳转
    // 如果是tabbar页面，通常需要reLaunch
    const tabbarPages = [
      'pages/index/index', 'pages/home/home', 'pages/scan/scan', 'pages/profile/profile',
      'pages-dark/index/index', 'pages-dark/home/home', 'pages-dark/scan/scan', 'pages-dark/profile/profile'
    ]
    
    // 确保路径以 / 开头
    if (!targetPath.startsWith('/')) {
        targetPath = '/' + targetPath
    }
    
    // 带上参数
    const options = currentPage.options || {}
    const params = Object.keys(options).map(key => `${key}=${options[key]}`).join('&')
    if (params) {
        targetPath += `?${params}`
    }

    console.log('Switching theme to', newTheme, 'Target:', targetPath)

    if (tabbarPages.some(p => targetPath.includes(p))) {
        uni.reLaunch({ url: targetPath })
    } else {
        // 如果是在测试页等非tabbar页面，使用redirectTo
        uni.redirectTo({ url: targetPath })
    }
  },

  // 初始化主题（app启动时调用）
  initTheme(launchPath, launchQuery) {
    const theme = this.getTheme()
    console.log('App Launch Theme Check:', theme, 'Path:', launchPath)
    
    // 默认进入的是 pages/ 下的页面
    // 如果主题是 dark 且当前不在 pages-dark，则跳转
    if (theme === 'dark' && launchPath && !launchPath.includes('pages-dark')) {
       let targetPath = PAGE_MAPPINGS[launchPath] || launchPath.replace('pages/', 'pages-dark/')
       
       if (!targetPath.startsWith('/')) targetPath = '/' + targetPath
       
       // 处理参数
       if (launchQuery && Object.keys(launchQuery).length > 0) {
           const params = Object.keys(launchQuery).map(key => `${key}=${launchQuery[key]}`).join('&')
           targetPath += `?${params}`
       }
       
       console.log('Redirecting to dark theme:', targetPath)
       uni.reLaunch({ url: targetPath })
    }
  }
}
