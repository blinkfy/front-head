// 让现有图表绘制代码使用微信 Canvas 2D 节点，保留其他端的绘图接口。
export async function createCanvas2DChartContext(runtime, id, width, height, scope) {
  const canvas = await new Promise((resolve, reject) => {
    const query = runtime.createSelectorQuery()
    const scoped = scope ? query.in(scope) : query
    scoped.select(`#${id}`).fields({ node: true, size: true }).exec(result => {
      const node = result?.[0]?.node
      if (node) resolve(node)
      else reject(new Error('图表画布未就绪，请重试'))
    })
  })
  const ratio = Math.max(1, Number(runtime.getWindowInfo?.().pixelRatio) || 1)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('图表画布暂不可用')
  context.scale(ratio, ratio)
  const chart = {
    setFillStyle: value => { context.fillStyle = value },
    setStrokeStyle: value => { context.strokeStyle = value },
    setLineWidth: value => { context.lineWidth = value },
    setFontSize: value => { context.font = `${value}px sans-serif` },
    setTextAlign: value => { context.textAlign = value },
    setTextBaseline: value => { context.textBaseline = value },
    draw() {} // Canvas 2D 立即绘制，无需旧版命令提交。
  }
  for (const method of ['arc', 'beginPath', 'clearRect', 'closePath', 'fill', 'fillText', 'lineTo', 'moveTo', 'stroke']) {
    chart[method] = (...args) => context[method](...args)
  }
  return chart
}
