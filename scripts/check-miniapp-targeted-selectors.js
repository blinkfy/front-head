const fs = require('node:fs')
const path = require('node:path')
const postcss = require('postcss')
const selectorParser = require('postcss-selector-parser')

const ROOT = path.resolve(__dirname, '..')
const FILES = [
  'src/components/AccountMergeChoice.vue',
  'src/components/WechatProfileForm.vue',
  'src/components/WasteCategoryModal.vue',
  'src/components/MapBinAdminPanel.vue',
  'src/components/dashboard/CompactMetricCard.vue',
  'src/pages-admin/components/digital-twin/ScenarioAnalyticsPanel.vue',
  'src/pages-admin/components/digital-twin/RobotTaskReplayOverlay.vue',
  'src/pages-admin/components/digital-twin/ReplayTimeline.vue',
  'src/pages-admin/components/digital-twin/ReplayControls.vue',
  'src/pages-admin/components/digital-twin/StableMapLabel.vue',
  'src/pages-admin/components/digital-twin/ParkScenarioOverlay.vue',
  'src/pages-admin/components/digital-twin/ParkReplayCanvas.vue',
  'src/pages-admin/components/digital-twin/LiveSimulationControls.vue',
  'src/pages-admin/components/digital-twin/CenterWorkflowOverlay.vue',
  'src/pages-admin/components/digital-twin/EntityInspector.vue',
  'src/pages-admin/components/collection/RiskAlgorithmWorkbench.vue'
]
const UNSUPPORTED_TAGS = new Set(
  'a b blockquote button canvas circle code defs div em form g h1 h2 h3 h4 h5 h6 hr i image img input label line li marker ol p path picker polyline polygon pre radio rect scroll-view select small span strong switch svg table tbody td text textarea th thead tr ul video view'
    .split(/\s+/)
)

function preprocessMp(source) {
  const output = []
  const conditions = []
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*\/\*\s*#(ifdef|ifndef)\s+([^*]+)\*\/\s*$/)
    if (directive) {
      conditions.push({ platform: directive[2].trim(), include: directive[1] === 'ifdef' })
      continue
    }
    if (/^\s*\/\*\s*#endif\s*\*\/\s*$/.test(line)) {
      conditions.pop()
      continue
    }
    if (conditions.every(({ platform, include }) => (platform === 'MP-WEIXIN') === include)) {
      output.push(line)
    }
  }
  return output.join('\n')
}

function getStyleBlocks(filePath, source) {
  if (!filePath.endsWith('.vue')) return [source]
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1])
}

const violations = []
for (const relativePath of FILES) {
  const absolutePath = path.join(ROOT, relativePath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  for (const style of getStyleBlocks(relativePath, source)) {
    postcss.parse(preprocessMp(style), { from: relativePath }).walkRules((rule) => {
      let parent = rule.parent
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return
        parent = parent.parent
      }
      const unsupported = []
      selectorParser((selectors) => {
        selectors.walk((node) => {
          if (node.type === 'tag' && UNSUPPORTED_TAGS.has(node.value.toLowerCase())) {
            unsupported.push(node.value)
          } else if (node.type === 'id' || node.type === 'attribute') {
            unsupported.push(node.toString())
          }
        })
      }).processSync(rule.selector)
      if (unsupported.length) {
        violations.push(`${relativePath}:${rule.source.start.line} [${unsupported.join(', ')}] ${rule.selector}`)
      }
    })
  }
}

if (violations.length) {
  console.error('Unsupported MP selectors in targeted components:')
  for (const violation of violations) console.error(violation)
  process.exitCode = 1
} else {
  console.log(`Mini-program selector check passed for ${FILES.length} targeted components.`)
}
