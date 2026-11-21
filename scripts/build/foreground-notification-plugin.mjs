import fs from 'node:fs'
import path from 'node:path'
import { parse as parseJson } from 'jsonc-parser'
import { parse } from '@vue/compiler-sfc'

// A page-level host is necessary on mini-programs: App.vue has no visual tree.
// Inject only registered pages, leaving nested components and their layouts alone.
export function notificationPagePaths(config) {
  const entries = (root, pages = []) => pages.map(page => [root + page.path,
    (page.style?.navigationStyle || config.globalStyle?.navigationStyle || 'default') !== 'custom'])
  return new Map([...entries('', config.pages),
    ...(config.subPackages || config.subpackages || []).flatMap(group => entries(group.root + '/', group.pages))])
}
export function injectForegroundNotification(source, name, pages) {
  if (!pages.has(name) || source.includes('<ftx-notification-banner')) return null
  const { descriptor } = parse(source)
  if (!descriptor.template || descriptor.template.src) return null
  const end = descriptor.template.loc.end.offset
  return source.slice(0, end) + `\n  <ftx-notification-banner page-path="${name}" :native-navigation="${pages.get(name)}" />\n` + source.slice(end)
}
export function foregroundNotificationPlugin() {
  let sourceRoot, pages
  return {
    name: 'foreground-notification-page-host', enforce: 'pre',
    configResolved(config) {
      sourceRoot = path.resolve(process.env.UNI_INPUT_DIR || path.join(config.root, 'src'))
      pages = notificationPagePaths(parseJson(fs.readFileSync(path.join(sourceRoot, 'pages.json'), 'utf8')))
    },
    transform(source, id) {
      if (!pages || id.includes('?') || !id.endsWith('.vue')) return null
      const name = path.relative(sourceRoot, id).replace(/\\/g, '/').replace(/\.vue$/, '')
      const code = injectForegroundNotification(source, name, pages)
      return code === null ? null : { code, map: null }
    }
  }
}
