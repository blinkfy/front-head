import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function mpMainPackageAssetsPlugin() {
  return {
    name: 'mp-main-package-assets',
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler(options) {
        if (process.env.UNI_PLATFORM !== 'mp-weixin') return
        const output = path.resolve(options.dir || process.env.UNI_OUTPUT_DIR)
        const app = JSON.parse(await fs.readFile(path.join(output, 'app.json'), 'utf8'))
        const roots = new Set((app.subPackages || app.subpackages || []).map(item => item.root))
        if (!roots.has('pages-admin') || !roots.has('pages-nonTheme')) throw new Error('Required existing icon subpackages are missing')
        const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/static/manifest.json'), 'utf8'))
        const tables = manifest.filter(icon => icon.id.endsWith('_table') && !['lottery_record_table', 'reservation_order_table'].includes(icon.id))
        const resources = tables.map(icon => ({ file: icon.file, package: 'pages-admin' }))
        resources.push({ file: 'Icon.webp.png', package: 'pages-nonTheme' })
        let saved = 0
        for (const resource of resources) {
          const from = path.resolve(output, 'static', resource.file)
          const to = path.resolve(output, resource.package, 'static', resource.file)
          if (!from.startsWith(output + path.sep) || !to.startsWith(output + path.sep)) throw new Error('Invalid package asset path')
          const data = await fs.readFile(path.join(root, 'src/static', resource.file))
          await fs.mkdir(path.dirname(to), { recursive: true })
          await fs.writeFile(to, data)
          // 仅删除已成功复制的构建副本，源码及 WebP 字节保持不变。
          await fs.rm(from, { force: true })
          saved += data.length
        }
        // JSON 已编译进 JS；运行时不读取这一重复静态文件。
        const duplicate = path.join(output, 'static/manifest.json')
        try { saved += (await fs.stat(duplicate)).size } catch (_) {}
        await fs.rm(duplicate, { force: true })
        console.log(`[mp-assets] Moved ${tables.length} database icons and the about logo; saved ${(saved / 1024).toFixed(2)} KiB from main package.`)
      }
    }
  }
}
