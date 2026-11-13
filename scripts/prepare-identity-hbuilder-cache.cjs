// Reuse the exact, resolved SDK artifacts from verify-identity-android-native.cjs.
// This only prepares local IDE compilation; native resources/.so still require a custom base.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const AdmZip = require('adm-zip')

async function main() {
  const root = path.resolve(__dirname, '..')
  const hbuilder = path.resolve(process.argv[2] || process.env.HBUILDERX_HOME || 'D:/HBuilderX')
  const config = path.join(root, 'src/uni_modules/ftx-identity-capture/utssdk/app-android/config.json')
  const work = path.join(root, 'unpackage/native-identity-check')
  const proof = JSON.parse(fs.readFileSync(path.join(work, 'verification.json'), 'utf8'))
  const coordinates = JSON.parse(fs.readFileSync(config, 'utf8')).dependencies
  if (JSON.stringify(coordinates) !== JSON.stringify(proof.coordinates)) throw new Error('Run the native verification script again: dependency versions changed')
  const resolverFile = path.join(hbuilder, 'plugins/uts-development-android/out/external.js')
  const resolverSource = fs.readFileSync(resolverFile, 'utf8')
  // Fail closed when HBuilder changes its cache contract; never modify its installed code.
  if (!resolverSource.includes('e.getCacheFile=(t,e,n)=>{const r=a(t),i=a(JSON.stringify(e.sort()))') ||
      !resolverSource.includes('e.addPrefix=(t,e="implementation")')) throw new Error('Unsupported HBuilder dependency cache format; configure Gradle/Android SDK instead')
  if (!process.env.APPDATA) throw new Error('Windows APPDATA is required')
  const userData = path.join(process.env.APPDATA, 'HBuilder X')
  const artifactDir = path.join(userData, '.uts-development-android/gradle/artifacts/ftx-identity-capture')
  const sources = path.join(work, 'dependencies/build/artifacts')
  const artifacts = fs.readdirSync(sources).filter(name => /\.(aar|jar)$/.test(name)).sort()
  if (artifacts.length !== proof.artifactCount) throw new Error('Resolved SDK artifact set changed; run native verification first')
  const files = []
  const jarEntries = new Set()
  const addJar = (name, buffer) => {
    const jar = new AdmZip(buffer)
    for (const entry of jar.getEntries()) jarEntries.add(entry.entryName)
    files.push({ name, buffer })
  }
  for (const name of artifacts) {
    const buffer = fs.readFileSync(path.join(sources, name))
    if (name.endsWith('.jar')) addJar(name, buffer)
    else for (const entry of new AdmZip(buffer).getEntries()) {
      if (entry.entryName === 'classes.jar' || /^libs\/[^/]+\.jar$/.test(entry.entryName)) {
        addJar(`${name.slice(0, -4)}-${entry.entryName.replaceAll('/', '-')}`, entry.getData())
      }
    }
  }
  for (const required of ['androidx/activity/ComponentActivity.class', 'androidx/camera/core/CameraSelector.class',
    'androidx/camera/lifecycle/ProcessCameraProvider.class', 'androidx/camera/view/PreviewView.class',
    'com/google/mediapipe/tasks/vision/facelandmarker/FaceLandmarker.class']) {
    if (!jarEntries.has(required)) throw new Error(`Missing SDK class: ${required}`)
  }
  fs.mkdirSync(artifactDir, { recursive: true })
  const jars = files.map(({ name, buffer }) => {
    const target = path.join(artifactDir, name)
    fs.writeFileSync(target, buffer)
    return target
  })
  const md5 = value => crypto.createHash('md5').update(value).digest('hex')
  const dependencyKey = md5(JSON.stringify(coordinates.map(value => `implementation '${value}'`).sort()))
  for (const file of new Set([config, config.replaceAll('\\', '/')])) {
    const cache = path.join(userData, '.uts-development-android/gradle/cache', md5(file), `${dependencyKey}.json`)
    fs.mkdirSync(path.dirname(cache), { recursive: true })
    fs.writeFileSync(cache, JSON.stringify(jars))
  }
  // Check the installed HBuilder resolver accepts both path conventions and validates the actual files.
  const resolver = require(resolverFile)
  for (const file of new Set([config, config.replaceAll('\\', '/')])) {
    const result = await resolver.gradleBuild({ file, buildDir: userData, appRoot: hbuilder }, { type: 1, valid: true })
    if (result.code !== 0 || result.data.length !== jars.length) throw new Error('HBuilder did not accept the prepared SDK dependencies')
  }
  console.log(`Prepared ${jars.length} real SDK JARs for HBuilder. Run HBuilder compilation to verify integration; this is not APK packaging.`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
