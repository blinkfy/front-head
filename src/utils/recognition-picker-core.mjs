// Keep platform routing independent from camera UI and the recognition request.
export function createRecognitionImagePicker({ runtime, platform, detectCamera, openWebCamera }) {
  let picking = false
  return function chooseRecognitionImage(options = {}) {
    if (picking) return
    picking = true
    let settled = false
    const finish = (kind, value) => {
      if (settled) return
      settled = true
      picking = false
      try { options[kind]?.(value) } finally { options.complete?.(value) }
    }
    const fail = error => finish('fail', error || { errMsg: 'chooseImage:fail cancel' })
    const success = result => {
      if (!result?.tempFilePaths?.[0]) return fail({ errMsg: 'chooseImage:fail 未获取到图片' })
      finish('success', result)
    }
    const album = () => runtime.chooseImage({ ...options, sourceType: ['album'], success, fail, complete: undefined })
    const camera = () => {
      if (platform === 'weixin') {
        runtime.navigateTo({
          url: '/pages-nonTheme/recognition-camera',
          events: {
            captured: result => success({ ...result, fromEmbeddedCamera: true }),
            cameraCancelled: fail
          },
          fail
        })
      } else {
        Promise.resolve().then(openWebCamera).then(result => {
          try {
            if (result?.useAlbum) album()
            else success(result)
          } catch (error) { fail(error) }
        }, fail)
      }
    }
    const sources = options.sourceType || ['album', 'camera']
    const menu = () => runtime.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: result => {
        try { result.tapIndex === 0 ? camera() : album() } catch (error) { fail(error) }
      },
      fail
    })
    try {
      if (platform === 'weixin') menu()
      else if (platform === 'h5') {
        if (!sources.includes('camera')) return album()
        Promise.resolve().then(detectCamera).then(available => {
          try { available ? (sources.includes('album') ? menu() : camera()) : album() } catch (error) { fail(error) }
        }, () => { try { album() } catch (error) { fail(error) } })
      } else {
        // APP and other mini-programs retain their existing native chooser.
        runtime.chooseImage({ ...options, success, fail, complete: undefined })
      }
    } catch (error) { fail(error) }
  }
}
