// 专用资源分包（仅放烘焙后的 GLB 和就绪标记，无页面），避免撑大 pages-dark 触发 2048KB 分包上限。
// 分包准备在普通小程序页面上下文完成，不在 XR 组件 attached 阶段发起。
export const ROBOT_MP_PACKAGE_NAME = 'pages-robot'
let packageRequest = null

export function ensureRobotModelPackage() {
  if (!packageRequest) {
    const request = new Promise((resolve, reject) => {
      // 保留原生异步 require；此文件输出至 components，路径相对于该目录。
      require(`../${ROBOT_MP_PACKAGE_NAME}/static/robot_3d/package-ready.js`, resolve,
        error => reject(new Error(error?.errMsg || error?.message || 'Robot resource package loading failed')))
    })
    packageRequest = request.catch(error => { packageRequest = null; throw error })
  }
  return packageRequest
}
