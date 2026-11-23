export function createReportPhotoSelection({ chooseImage, compressImage, getPhotos, setPhotos, setProcessing, canChoose, onError }) {
  let operationId = 0
  let active = false

  function choose() {
    const photos = getPhotos()
    if (active || !canChoose() || photos.length >= 3) return
    const operation = ++operationId
    active = true
    setProcessing(true)

    const isCurrent = () => operation === operationId
    const finish = () => {
      if (!isCurrent()) return
      active = false
      setProcessing(false)
    }
    const fail = error => {
      if (!isCurrent()) return
      finish()
      if (!/cancel/i.test(String(error?.errMsg || error?.message || ''))) onError(error)
    }

    try {
      chooseImage({
        count: 3 - photos.length,
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
        success: async result => {
          if (!isCurrent()) return
          const paths = (result?.tempFilePaths || []).slice(0, 3 - getPhotos().length)
          if (!paths.length) { finish(); return }
          try {
            const compressed = []
            for (const path of paths) {
              if (!isCurrent()) return
              const photo = await compressImage(path)
              if (!/^data:image\/(?:jpe?g|png|webp);base64,/i.test(String(photo || ''))) {
                throw new Error('仅支持 JPG、PNG 或 WebP 格式，请重新选择照片')
              }
              compressed.push(photo)
            }
            if (isCurrent()) setPhotos([...getPhotos(), ...compressed].slice(0, 3))
          } catch (error) {
            if (isCurrent()) onError(error)
          } finally { finish() }
        },
        fail
      })
    } catch (error) { fail(error) }
  }

  return {
    choose,
    dispose() { operationId += 1; active = false }
  }
}
