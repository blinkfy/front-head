import fs from 'node:fs/promises'
import path from 'node:path'

// Modules reported by the WeChat analyzer. Copies are made only for subpackages
// that actually require them; any main-package dependency prevents relocation.
const candidates = [
  'api/ai-actions.js', 'api/chat-image-upload.js', 'api/map-config.js',
  'config/digital-twin-visual-system.js', 'config/robot-task-shot-config.js', 'config/robot-task-scene-registry.js', 'config/smart-bin-visual-registry.js',
  'utils/realtime/background-message-preference.js', 'utils/realtime/call-transcript.js', 'utils/realtime/realtime-route.js',
  ...'app-update-core device-api-loader device-session-feedback device-session-stream device-session-transport digital-twin-assets haptics local-asr location-address location-error mp-top-inset sorting-workflow'.split(' ').map(name => `utils/${name}.js`)
]
const requirePattern = /\brequire\(\s*(['"])(\.[^'"]+)\1\s*\)/g
const slash = value => value.split(path.sep).join('/')

export async function relocateMpSubpackageModules(output, moduleCache = new Map()) {
  const app = JSON.parse(await fs.readFile(path.join(output, 'app.json'), 'utf8'))
  const roots = (app.subPackages || app.subpackages || []).map(item => item.root.replace(/\/$/, ''))
  const packageOf = name => roots.find(root => name.startsWith(`${root}/`))
  const files = new Map()
  async function scan(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await scan(full)
      else if (entry.name.endsWith('.js')) files.set(slash(path.relative(output, full)), await fs.readFile(full, 'utf8'))
    }
  }
  await scan(output)
  const emittedFiles = new Set(files.keys())
  // Watch builds may only re-emit a changed page after its shared modules have
  // already been relocated. Keep their original compiled sources for that pass.
  for (const name of candidates) {
    if (files.has(name)) moduleCache.set(name, files.get(name))
    else if (moduleCache.has(name)) files.set(name, moduleCache.get(name))
  }
  const resolveImport = (from, specifier) => {
    let result = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
    if (!path.posix.extname(result)) result += '.js'
    return result
  }
  const relocated = (owner, name) => `${owner}/__shared/${name}`
  const previousCopies = new Map()
  for (const name of candidates) {
    if (!files.has(name)) continue
    for (const owner of roots) {
      previousCopies.set(relocated(owner, name), name)
    }
  }
  const selected = new Set(candidates.filter(name => files.has(name)))
  const imports = new Map()
  for (const [name, code] of files) {
    // A watch build may retain rewritten callers. Count each original module
    // once and resolve references to its existing copies back to that module.
    if (previousCopies.has(name)) continue
    imports.set(name, [...code.matchAll(requirePattern)].map(match => {
      const target = resolveImport(name, match[2])
      return previousCopies.get(target) || target
    }))
  }
  // If a root module requires a candidate, retain it and its candidate dependencies.
  let changed = true
  while (changed) {
    changed = false
    for (const [from, targets] of imports) {
      if (packageOf(from) || selected.has(from)) continue
      for (const target of targets) if (selected.delete(target)) changed = true
    }
  }
  const owners = new Map([...selected].map(name => [name, new Set()]))
  for (const [from, targets] of imports) {
    const owner = packageOf(from)
    if (owner) for (const target of targets) owners.get(target)?.add(owner)
  }
  changed = true
  while (changed) {
    changed = false
    for (const name of selected) for (const dep of imports.get(name) || []) {
      if (!owners.has(dep)) continue
      for (const owner of owners.get(name)) if (!owners.get(dep).has(owner)) {
        owners.get(dep).add(owner)
        changed = true
      }
    }
  }
  const moved = new Set([...selected].filter(name => owners.get(name).size))
  // A watch rebuild can introduce a new main-package consumer.
  for (const name of candidates) {
    if (files.has(name) && !emittedFiles.has(name) && !moved.has(name)) {
      await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true })
      await fs.writeFile(path.join(output, name), files.get(name))
    }
  }
  const rewrite = (code, original, destination, owner) => code.replace(requirePattern, (all, quote, specifier) => {
    const rawTarget = resolveImport(original, specifier)
    const target = previousCopies.get(rawTarget) || rawTarget
    if (original === destination && !moved.has(target) && rawTarget === target) return all
    const resolved = moved.has(target) && owner && owners.get(target).has(owner) ? relocated(owner, target) : target
    let relative = path.posix.relative(path.posix.dirname(destination), resolved)
    if (!relative.startsWith('.')) relative = `./${relative}`
    return `require(${quote}${relative}${quote})`
  })
  const generated = new Set()
  for (const name of moved) for (const owner of owners.get(name)) {
    const dest = relocated(owner, name)
    generated.add(dest)
    await fs.mkdir(path.dirname(path.join(output, dest)), { recursive: true })
    await fs.writeFile(path.join(output, dest), rewrite(files.get(name), name, dest, owner))
  }
  for (const [name, code] of files) {
    const owner = packageOf(name)
    if (!owner || previousCopies.has(name)) continue
    const updated = rewrite(code, name, name, owner)
    if (updated !== code) await fs.writeFile(path.join(output, name), updated)
  }
  for (const name of previousCopies.keys()) {
    if (emittedFiles.has(name) && !generated.has(name)) await fs.rm(path.join(output, name), { force: true })
  }
  for (const name of moved) await fs.rm(path.join(output, name), { force: true })
  console.log(`[mp-modules] Moved ${moved.size} subpackage-only modules out of the main package.`)
  return { moved: [...moved], retained: [...selected].filter(name => !moved.has(name)) }
}

export function mpSubpackageModulesPlugin() {
  const moduleCache = new Map()
  return {
    name: 'mp-subpackage-modules',
    writeBundle: { order: 'post', sequential: true, async handler(options) {
      if (process.env.UNI_PLATFORM !== 'mp-weixin') return
      await relocateMpSubpackageModules(path.resolve(options.dir || process.env.UNI_OUTPUT_DIR), moduleCache)
    } }
  }
}
