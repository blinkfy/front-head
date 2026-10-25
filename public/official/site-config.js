// 仅官网展示配置；不参与登录、注册或任何业务 API。
// TODO：上线审核前，由应用负责人确认主体及联系方式。
window.FENTOUXIA_OFFICIAL = Object.freeze({
  developer: 'blinkfy', // 开发者公开标识，来源：用户提供的 GitHub 主页
  developerUrl: 'https://github.com/blinkfy',
  legalEntity: '', // TODO：实际运营主体 / 版权所有者，不从项目作者推定
  contactEmail: '', // TODO：公开联系邮箱
  contactDetails: '', // TODO：其他公开联系方式（选填）
  icp: '', // TODO：如适用，填写真实 ICP 备案号
  icpUrl: '', // TODO：对应真实备案查询链接（选填）
  downloadUrl: 'https://rgqexbnzzipc.sealosbja.site/files/download/classfication.apk', // 复用应用关于页的现有下载入口
  downloadLabel: '下载公测版 ↗',
  webUrl: './index.html#/pages/home/home', // 复用现有 H5 业务首页；登录与权限仍由业务页处理
  releaseStatus: 'Android 公测版 · 已开放下载',
  releaseNote: '尚未上架应用商店，可直接下载体验。',
  promoVideoUrl: './official/video/%E5%88%86%E6%8A%95%E4%BE%A0%E8%AE%BE%E8%AE%A1.m3u8',
})
