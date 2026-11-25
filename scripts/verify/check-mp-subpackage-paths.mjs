import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultOutput = fileURLToPath(new URL('../../dist/build/mp-weixin', import.meta.url))
const output = path.resolve(process.argv[2] || process.env.UNI_OUTPUT_DIR || defaultOutput)
const requirePattern = /\brequire\(\s*(['"])(\.[^'"]+)\1\s*\)/g

async function* listFiles(directory = '') {
  for (const entry of await fs.readdir(path.join(output, directory), { withFileTypes: true })) {
    const file = path.posix.join(directory, entry.name)
    if (entry.isDirectory()) yield* listFiles(file)
    else if (entry.isFile()) yield file
  }
}

async function verify() {
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'app.json'), 'utf8'))
  const packages = (manifest.subPackages || manifest.subpackages || []).map(item => ({
    ...item, root: item.root.replace(/\/$/, '')
  }))
  const packageOf = name => packages.find(item => name.startsWith(item.root + '/'))
  const files = new Set()
  for await (const file of listFiles()) files.add(file)
  const errors = []
  let requires = 0
  let components = 0

  function check(from, specifier, targets, asyncComponent = false) {
    const target = targets.find(name => files.has(name))
    if (!target) {
      errors.push(`${from}: ${specifier} -> missing ${targets[0]}`)
      return
    }
    const sourcePackage = packageOf(from)
    const targetPackage = packageOf(target)
    if (!asyncComponent && sourcePackage !== targetPackage && (targetPackage || sourcePackage?.independent)) {
      errors.push(`${from}: ${specifier} -> synchronous cross-package reference to ${target}`)
    }
  }

  for (const file of files) {
    if (file.endsWith('.js')) {
      const source = await fs.readFile(path.join(output, file), 'utf8')
      for (const match of source.matchAll(requirePattern)) {
        const specifier = match[2]
        const target = path.posix.join(path.posix.dirname(file), specifier)
        check(file, specifier, [target, target + '.js', target + '/index.js'])
        requires++
      }
    } else if (file.endsWith('.json')) {
      const config = JSON.parse(await fs.readFile(path.join(output, file), 'utf8'))
      for (const [name, specifier] of Object.entries(config.usingComponents || {})) {
        if (specifier.includes('://')) continue
        const target = specifier.startsWith('/')
          ? path.posix.normalize(specifier).slice(1)
          : path.posix.join(path.posix.dirname(file), specifier)
        const manifestPath = target.endsWith('.json') ? target : target + '.json'
        check(file, specifier, [manifestPath], Boolean(config.componentPlaceholder?.[name]))
        components++
      }
    }
  }

  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`WeChat paths verified: ${requires} relative requires and ${components} component registrations.`)
}

try {
  await verify()
} catch (error) {
  console.error(`WeChat output check failed (${output}):\n${error.message}`)
  process.exitCode = 1
}
