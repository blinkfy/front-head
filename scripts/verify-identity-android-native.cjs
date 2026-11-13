// Compile the real Kotlin implementation and UTS-generated bridge against actual SDK classes.
// This is not APK packaging: resource merging, native .so linking and device tests are separate.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const hbuilder = path.resolve(process.argv[2] || process.env.HBUILDERX_HOME || 'D:/HBuilderX')
const work = path.join(root, 'unpackage/native-identity-check')
const plugin = path.join(root, 'src/uni_modules/ftx-identity-capture/utssdk/app-android')
const maven = path.join(work, 'tools/apache-maven-3.9.9/bin/mvn.cmd')
const jdk = path.join(hbuilder, 'plugins/amazon-corretto')
const kotlinHome = path.join(hbuilder, 'plugins/uniapp-runextension/kotlinc')
const runtime = path.join(hbuilder, 'plugins/uniapp-runextension/lib')
const project = path.join(work, 'dependencies')
fs.mkdirSync(project, { recursive: true })
const env = { ...process.env, JAVA_HOME: jdk, TEMP: work, TMP: work }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited ${result.status}`)
}
function batch(command, args) {
  // cmd is only used to execute installed .bat compiler tools; no filesystem mutation via cmd.
  run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${command}" ${args.map(a => `"${a}"`).join(' ')}"`], { windowsVerbatimArguments: true })
}
async function main() {
  if (!fs.existsSync(maven)) throw new Error(`Install the official Maven 3.9.9 binary distribution under ${path.dirname(path.dirname(maven))}; verify its SHA512 first.`)
  const coordinates = JSON.parse(fs.readFileSync(path.join(plugin, 'config.json'), 'utf8')).dependencies
  if (!coordinates.every(value => typeof value === 'string' && /^[\w.:-]+$/.test(value))) throw new Error('Only explicit Maven coordinates are supported by this verification script')
  const artifacts = path.join(project, 'build/artifacts')
  // These upstream POMs omit <type>aar</type> on transitive edges. Gradle reads
  // Android metadata, whereas this isolated Maven resolver needs explicit types.
  const transitiveAars = ['com.google.mediapipe:tasks-core:0.10.21',
    'com.google.android.datatransport:transport-api:3.0.0', 'com.google.android.datatransport:transport-backend-cct:3.1.0',
    'com.google.android.datatransport:transport-runtime:3.1.0']
  const exclusions = transitiveAars.map(value => {
    const [group, artifact] = value.split(':')
    return `<exclusion><groupId>${group}</groupId><artifactId>${artifact}</artifactId></exclusion>`
  }).join('')
  fs.writeFileSync(path.join(project, 'pom.xml'), `<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>ftx.verify</groupId><artifactId>identity</artifactId><version>1</version>
<repositories><repository><id>google</id><url>https://dl.google.com/dl/android/maven2/</url></repository></repositories>
<dependencies>${[...coordinates, ...transitiveAars].map(value => {
    const [group, artifact, version] = value.split(':')
    return `<dependency><groupId>${group}</groupId><artifactId>${artifact}</artifactId><version>${version}</version><type>aar</type><exclusions>${exclusions}</exclusions></dependency>`
  }).join('')}</dependencies></project>`)
  const settings = path.join(project, 'settings.xml')
  fs.writeFileSync(settings, '<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"/>')
  batch(maven, ['-B', '-q', '-s', settings, `-Dmaven.repo.local=${path.join(work, 'maven-cache')}`, '-f', path.join(project, 'pom.xml'),
    'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:copy-dependencies', `-DoutputDirectory=${artifacts}`])
  const jars = []
  for (const name of fs.readdirSync(artifacts)) {
    const file = path.join(artifacts, name)
    if (name.endsWith('.jar')) jars.push(file)
    if (name.endsWith('.aar')) {
      const archive = new AdmZip(file)
      for (const entry of archive.getEntries()) {
        if (entry.entryName === 'classes.jar' || /^libs\/[^/]+\.jar$/.test(entry.entryName)) {
          const output = path.join(project, 'classes', name, entry.entryName)
          fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, entry.getData()); jars.push(output)
        }
      }
    }
  }
  // HBuilderX runtime has its own core/core-ktx; use the versions selected by Maven instead.
  const runtimeJars = fs.readdirSync(runtime).filter(name => name.endsWith('.jar') && !/^core(-ktx)?-/.test(name)).map(name => path.join(runtime, name))
  const outputDir = path.join(work, 'transpiled/app-android')
  Object.assign(process.env, { UNI_INPUT_DIR: path.join(root, 'src'), UNI_OUTPUT_DIR: outputDir,
    UNI_COMPILER_VERSION: '5.26.2026091802', UNI_HBUILDERX_PLUGINS: path.join(hbuilder, 'plugins'), NODE_ENV: 'production', UNI_UTS_PLATFORM: 'app-android' })
  const compiled = await require('@dcloudio/uni-uts-v1/dist/kotlin.js').compile(path.join(plugin, 'index.uts'), {
    inputDir: path.join(root, 'src'), outputDir, sourceMap: false, isX: false, isSingleThread: false, isPlugin: true,
    isModule: false, isExtApi: false, components: [], customElements: [], extApis: {}, uniModules: []
  })
  if (compiled.error) throw new Error(JSON.stringify(compiled.error))
  const generated = path.join(outputDir, compiled.filename)
  const nativeFiles = fs.readdirSync(plugin).filter(name => name.endsWith('.kt')).map(name => path.join(plugin, name))
  const jar = path.join(work, 'identity-native.jar')
  const args = [generated, ...nativeFiles, '-cp', [...runtimeJars, ...jars].join(path.delimiter), '-d', jar, '-jvm-target', '1.8', '-kotlin-home', kotlinHome]
  // An argument file avoids Windows' command-line length limit and preserves paths with spaces.
  const argsFile = path.join(work, 'kotlinc.args')
  fs.writeFileSync(argsFile, args.map(value => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`).join('\n'))
  batch(path.join(kotlinHome, 'bin/kotlinc.bat'), [`@${argsFile}`])
  const classes = new AdmZip(jar).getEntries().map(entry => entry.entryName)
  for (const expected of ['ftx/identity/IdentityCaptureActivity.class', 'ftx/identity/IdentityCaptureBridge.class']) {
    if (!classes.includes(expected)) throw new Error(`Missing compiled class: ${expected}`)
  }
  const dexDir = path.join(work, 'dex')
  fs.mkdirSync(dexDir, { recursive: true })
  const androidJar = path.join(runtime, 'android_36.jar')
  const r8 = path.join(hbuilder, 'plugins/uniapp-runextension/utsServer_jar/r8-8.10.21.jar')
  const dexArgs = ['-cp', r8, 'com.android.tools.r8.D8', '--min-api', '24', '--lib', androidJar,
    '--output', dexDir, ...[...runtimeJars.filter(file => file !== androidJar), ...jars].flatMap(file => ['--classpath', file]), jar]
  const dexArgsFile = path.join(work, 'd8-java.args')
  fs.writeFileSync(dexArgsFile, dexArgs.map(value => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`).join('\n'))
  run(path.join(jdk, 'bin/java.exe'), [`@${dexArgsFile}`])
  const dex = fs.readFileSync(path.join(dexDir, 'classes.dex'))
  if (dex.subarray(0, 4).toString() !== 'dex\n' || !dex.includes(Buffer.from('Lftx/identity/IdentityCaptureActivity;'))) throw new Error('Invalid native DEX output')
  fs.writeFileSync(path.join(work, 'verification.json'), JSON.stringify({ source: path.relative(root, plugin),
    coordinates, artifactCount: fs.readdirSync(artifacts).length, classCount: classes.length, kotlinJar: jar,
    dex: path.join(dexDir, 'classes.dex'), apkPackaged: false, iosLinked: false, verifiedAt: new Date().toISOString() }, null, 2))
  console.log(`PASS: real Android implementation and UTS bridge compiled to JAR and DEX (${classes.length} entries). Output: ${jar}`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
