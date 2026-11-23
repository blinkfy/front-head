const copies = [
  {
    title: '哎呀，小投侠这次看走眼啦～',
    description: '这次暂时没能识别。再给它一次机会吧：重试原图，或换个角度重新拍。'
  },
  {
    title: '小投侠遇到知识盲区了……',
    description: '暂时没认出这是什么宝贝。可以重试原图，或换个角度让我再仔细看看。'
  },
  {
    title: '滴！小投侠迷糊了一下',
    description: '刚才没能识别出这个物品。可以重试原图，或换个角度重新拍摄。'
  },
  {
    title: '这个小家伙藏得有点深哦',
    description: '小投侠暂时没认出它。可以重试原图，或换个角度让我看得更清楚些～'
  },
  {
    title: '哎呀，没接住你的图～',
    description: '这次识别小挑战暂时失败。可以重试原图，或重新拍摄，再挑战一次！'
  },
  {
    title: '暂时没认出它是什么呢',
    description: '可以重试原图，或者换个角度重新拍摄。'
  }
]

let lastTaskId = null
let lastCopy = copies[0]

// 同一次失败（包括返回首页）保持文案，不随渲染或机器人循环切换。
export function getRecognitionFailureCopy(taskId, error) {
  if (error?.code === 'RECOGNITION_TIMEOUT') {
    return { title: '小投侠等得有点久啦', description: '这次识别等待超时，原图已保留。检查网络后可以重试原图，或重新拍摄。' }
  }
  if (/network|failed to fetch|uploadFile:fail|网络/i.test(String(error?.errMsg || error?.message || ''))) {
    return { title: '小投侠的信号断了一下', description: '这次未能完成识别，原图已保留。网络恢复后可重试原图，或重新选图。' }
  }
  if (!taskId) return copies[0]
  if (taskId !== lastTaskId) {
    lastTaskId = taskId
    lastCopy = copies[Math.floor(Math.random() * copies.length)]
  }
  return lastCopy
}
