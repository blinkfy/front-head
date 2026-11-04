import { createMiniUploadProcessor } from './mp-upload-image-core.mjs'

// #ifdef MP-WEIXIN
const processor = createMiniUploadProcessor({
  getCanvas({ success, fail }) {
    const query = uni.createSelectorQuery()
    query.select('#upload-image-canvas').fields({ node: true, size: true }).exec(results => {
      const canvas = results?.[0]?.node
      canvas ? success({ canvas }) : fail(new Error('当前页面没有图片处理画布'))
    })
  },
  fs: () => wx.getFileSystemManager(),
  root: () => wx.env.USER_DATA_PATH,
  decodeBase64: encoded => wx.base64ToArrayBuffer(encoded),
  exportCanvas: options => wx.canvasToTempFilePath(options)
})
// #endif

export async function compressWechatUploadImage(source, info, quality, maxSize, preserveAlpha) {
  // #ifdef MP-WEIXIN
  return processor(source, info, { quality, maxSize, preserveAlpha })
  // #endif
  // #ifndef MP-WEIXIN
  return null
  // #endif
}
