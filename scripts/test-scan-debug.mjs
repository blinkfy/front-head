import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createScanDebugAccess, roundCodeDebugText } from '../src/utils/scan-debug.mjs'
import { createWebRoundCodeResolver } from '../src/utils/h5-roundcode-core.mjs'

for (const [profile, flag, expected] of [[{isAdmin:true},false,true],[{isAdmin:false},true,false],[{},true,true],[{},'false',false],[null,false,false],['invalid',true,false]]) {
  const store={token:'session',userInfo:profile,isAdmin:flag}
  const allowed=createScanDebugAccess({getStorageSync:key=>store[key]})
  assert.equal(allowed(),expected)
  store.token='another-session'; assert.equal(allowed(),false)
}
assert.equal(createScanDebugAccess(null)(),false)
const id='r_'+'b'.repeat(24)
assert.equal(roundCodeDebugText({kind:'device',token:'a'.repeat(32)}),'/pages-nonTheme/scan?scene='+'a'.repeat(32))
assert.equal(roundCodeDebugText({kind:'registration',sessionId:id}),'/pages/register/register?scene='+id)
assert.throws(()=>roundCodeDebugText({kind:'foreign'}))

let token='session', active=true, imageCalls=0, scanned=0, authorized=0, confirmed=0
const source=(await readFile(new URL('../src/utils/h5-roundcode.js',import.meta.url),'utf8'))
  .replace(/^import .*\n/gm,'').replace(/export /g,'')+'\nglobalThis.preview=previewWebRoundCode;'
const context=vm.createContext({
  uni:{getStorageSync:key=>key==='token'?token:{},showToast(){}},baseUrl:'test',roundCodeDebugText,createWebRoundCodeResolver,
  resolveWechatQrImage:async()=>{imageCalls++;return{data:{kind:'registration',sessionId:id}}},prepareWechatQrImage:async()=>{},
  createRegistrationApi:()=>({scanApp:async()=>{scanned++},authorizeApp:async()=>{authorized++},cancelApp:async()=>{}}),
  createRegistrationDialogs:()=>({confirm:async()=>{confirmed++;return true}})
})
vm.runInContext(source,context)
const preview=await context.preview('image',()=>active)
assert.equal(preview.text,'/pages/register/register?scene='+id)
assert.equal(scanned,0);assert.equal(confirmed,0);assert.equal(authorized,0)
await preview.accept()
assert.equal(imageCalls,1,'acceptance reuses the decoded response instead of uploading again')
assert.equal(scanned,1);assert.equal(confirmed,1);assert.equal(authorized,1)
const stale=await context.preview('image',()=>active)
token='different'; assert.equal(await stale.accept(),null);assert.equal(authorized,1)
console.log('PASS scan debug roles, stale sessions, canonical round-code text and side-effect-free preview / one decode')
