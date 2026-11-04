import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { parse: parseSfc, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const babel = require('@babel/parser')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const chatPath = path.join(root, 'src/pages-nonTheme/chat.vue')
const chatSource = fs.readFileSync(chatPath, 'utf8')
const sfc = parseSfc(chatSource, { filename: chatPath }).descriptor

function astFor(source, filename = 'chat-test.js') {
  return babel.parse(source, { sourceType: 'unambiguous', plugins: ['optionalChaining', 'objectRestSpread'] })
}

function property(objectNode, name) {
  return objectNode.properties.find(item => item.type === 'ObjectProperty' && item.key.name === name)
}

function getVueMethod(name, globals = {}) {
  const ast = astFor(sfc.script.content, chatPath)
  const exported = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration
  const methods = property(exported, 'methods')?.value
  const method = methods?.properties.find(item => item.key?.name === name)
  assert.ok(method, `chat.vue method ${name} exists`)
  return vm.runInNewContext(`({${sfc.script.content.slice(method.start, method.end)}})[${JSON.stringify(name)}]`, globals)
}

function loadSfc(relativePath) {
  const filename = path.join(root, relativePath)
  const parsed = parseSfc(fs.readFileSync(filename, 'utf8'), { filename })
  assert.deepEqual(parsed.errors, [], `${relativePath} parses`)
  return { filename, descriptor: parsed.descriptor }
}

function getSfcMethod(relativePath, name, globals = {}) {
  const { filename, descriptor } = loadSfc(relativePath)
  const ast = astFor(descriptor.script.content, filename)
  const exported = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration
  const methods = property(exported, 'methods')?.value
  const method = methods?.properties.find(item => item.key?.name === name)
  assert.ok(method, `${relativePath} method ${name} exists`)
  return vm.runInNewContext(`({${descriptor.script.content.slice(method.start, method.end)}})[${JSON.stringify(name)}]`, globals)
}

function getVueComputed(name) {
  const ast = astFor(sfc.script.content, chatPath)
  const exported = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration
  const computed = property(exported, 'computed')?.value
  const entry = computed?.properties.find(item => item.key?.name === name)
  assert.ok(entry, `chat.vue computed ${name} exists`)
  return vm.runInNewContext(`({${sfc.script.content.slice(entry.start, entry.end)}})[${JSON.stringify(name)}]`)
}

function getMixinMethod(relativePath, variableName, methodName, globals = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const ast = astFor(source, relativePath)
  const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration' &&
    node.declaration.declarations.some(item => item.id.name === variableName))?.declaration
  const objectNode = declaration?.declarations.find(item => item.id.name === variableName)?.init
  const method = objectNode?.properties.find(item => item.key?.name === methodName)
  assert.ok(method, `${variableName}.${methodName} exists`)
  return vm.runInNewContext(`({${source.slice(method.start, method.end)}})[${JSON.stringify(methodName)}]`, globals)
}

function getMixinObject(relativePath, variableName, globals = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const ast = astFor(source, relativePath)
  const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration' &&
    node.declaration.declarations.some(item => item.id.name === variableName))?.declaration
  const objectNode = declaration?.declarations.find(item => item.id.name === variableName)?.init
  assert.ok(objectNode, `${variableName} exists`)
  const entries = objectNode.properties.filter(item => item.type === 'ObjectMethod')
    .map(item => source.slice(item.start, item.end)).join(',')
  return vm.runInNewContext(`({${entries}})`, globals)
}

function makeMethodContext(overrides = {}) {
  return {
    isChatPageActive: true,
    isChatPageDestroyed: false,
    chatId: 'chat-1',
    isGroupChat: false,
    messages: [],
    messagePollingVersion: 4,
    canPollMessages() { return this.isChatPageActive && !this.isChatPageDestroyed },
    lastSyncedMessageId: null,
    lastHistoryReconcileAt: Date.now(),
    saveMessagesToStorage() {},
    clearLoadedOriginalImage() {},
    imageRetryNonces: {},
    ...overrides
  }
}

function testSfcCompiles() {
  assert.ok(sfc.template && sfc.script && sfc.styles.length, 'chat.vue contains template, script, and styles')
  const compiledScript = compileScript(sfc, { id: 'chat-reliability-test' })
  assert.ok(compiledScript.content.length > 0, 'SFC script compiles')
  const template = compileTemplate({ source: sfc.template.content, filename: chatPath, id: 'chat-reliability-test' })
  assert.deepEqual(template.errors, [], 'SFC template compiles')
  for (const [index, style] of sfc.styles.entries()) {
    const result = compileStyle({ source: style.content, filename: chatPath, id: `chat-style-${index}`, preprocessLang: style.lang })
    assert.deepEqual(result.errors, [], `SFC style ${index + 1} compiles`)
  }
  astFor(fs.readFileSync(path.join(root, 'src/utils/chat-events.js'), 'utf8'), 'chat-events.js')
}

function testAdditionalSfcCompiles() {
  for (const relativePath of [
    'src/pages-nonTheme/components/ChatSelectionDialog.vue',
    'src/pages-nonTheme/components/ChatHistorySearch.vue',
    'src/pages-nonTheme/chatlist.vue',
    'src/App.vue'
  ]) {
    const { filename, descriptor } = loadSfc(relativePath)
    const compiledScript = compileScript(descriptor, { id: `chat-actions-${path.basename(filename)}` })
    assert.ok(compiledScript.content.length > 0, `${relativePath} script compiles`)
    const template = compileTemplate({ source: descriptor.template.content, filename, id: `chat-actions-${path.basename(filename)}` })
    assert.deepEqual(template.errors, [], `${relativePath} template compiles`)
    for (const [index, style] of descriptor.styles.entries()) {
      const result = compileStyle({ source: style.content, filename, id: `chat-actions-${path.basename(filename)}-${index}`, preprocessLang: style.lang })
      assert.deepEqual(result.errors, [], `${relativePath} style ${index + 1} compiles`)
    }
  }
}

function testSelectionLimit() {
  const toastOptions = []
  const uni = { showToast: value => toastOptions.push(value) }
  const toggle = getSfcMethod('src/pages-nonTheme/components/ChatSelectionDialog.vue', 'toggle', { uni })
  const dialog = { busy: false, multiple: true, selected: Array.from({ length: 100 }, (_, index) => String(index + 1)) }
  toggle.call(dialog, '101')
  assert.equal(dialog.selected.length, 100, 'invite selection is capped at 100 members')
  assert.equal(dialog.selected.includes('101'), false, 'member beyond the cap is not selected')
  assert.match(toastOptions[0]?.title || '', /100/)
  toggle.call(dialog, '1')
  assert.equal(dialog.selected.length, 99, 'removing an existing choice is still permitted at the cap')
  toggle.call(dialog, '101')
  assert.equal(dialog.selected.length, 100, 'a new choice is accepted after making room')
}

async function testMessageActions() {
  const toasts = []
  const uni = { hideKeyboard() {}, showToast: value => toasts.push(value), showModal: options => options.success({ confirm: true }) }
  const actionModule = getMixinObject('src/pages-nonTheme/chat/message-actions-methods.js', 'messageActionsMethods', {
    chatApi: { forwardChatMessages: async () => ({}) }, requestKey: (() => { let index = 0; return () => `batch-${++index}` })(), uni
  })
  let mediaActivated = false
  const selecting = { selectingMessages: false, selectedMessageIds: [], showEmojiPanel: true, showMorePanel: true,
    messageMenu: null, playVideo() { mediaActivated = true }, saveMessagesToStorage() {}, messages: [],
    cancelMessageSelection: actionModule.cancelMessageSelection }
  actionModule.onMessageLongPressV2.call(selecting, { id: 81, type: 'video', status: 'sent', content: 'vid' })
  assert.ok(selecting.messageMenu.actions.some(action => action.key === 'select'))
  await actionModule.executeMessageAction.call(selecting, 'select')
  assert.equal(selecting.selectingMessages, true)
  assert.equal(Array.from(selecting.selectedMessageIds).join(','), '81')
  assert.equal(selecting.showEmojiPanel, false)
  assert.equal(selecting.showMorePanel, false)
  assert.equal(mediaActivated, false, 'selecting a video does not trigger video playback')

  const failedDelete = { selectedMessageIds: ['81', '82'], messages: [{ id: 81 }, { id: 82 }], messageActionBusy: false,
    isGroupChat: false, saveMessagesToStorage() {}, cancelMessageSelection: actionModule.cancelMessageSelection,
    deleteMessageIds: async () => { throw new Error('offline') } }
  await actionModule.deleteSelectedMessages.call(failedDelete, { uni, console })
  assert.deepEqual(failedDelete.messages.map(message => message.id), [81, 82], 'failed delete keeps messages locally')
  assert.deepEqual(failedDelete.selectedMessageIds, ['81', '82'], 'failed delete retains selected IDs for retry')
  assert.equal(failedDelete.selectingMessages, undefined)
  assert.equal(failedDelete.messageActionBusy, false)

  const sent = []
  const forwardApi = { forwardChatMessages: async data => { sent.push(data); if (sent.length === 1) throw new Error('temporary failure') } }
  const forwarding = getMixinObject('src/pages-nonTheme/chat/message-actions-methods.js', 'messageActionsMethods', {
    chatApi: forwardApi, requestKey: (() => { let index = 0; return () => `batch-${++index}` })(), uni
  })
  const forwardContext = { selectedMessageIds: ['81', '82'], forwardAttempt: null, isGroupChat: false, cancelMessageSelection() {},
    uni: { showToast() {} } }
  await assert.rejects(forwarding.forwardSelectedMessages.call(forwardContext, 'user:5'))
  const failedBatch = { ...sent[0], messageIds: sent[0].messageIds.slice() }
  await forwarding.forwardSelectedMessages.call(forwardContext, 'user:5')
  assert.deepEqual(sent[1].messageIds, failedBatch.messageIds, 'forward retry preserves the original message IDs')
  assert.equal(sent[1].clientMessageId, failedBatch.clientMessageId, 'same-target retry reuses batch idempotency key')
  await forwarding.forwardSelectedMessages.call(forwardContext, 'group:9')
  assert.notEqual(sent[2].clientMessageId, failedBatch.clientMessageId, 'changing target creates a fresh batch key')
  assert.deepEqual(sent[2].messageIds, failedBatch.messageIds, 'changing target does not alter selected message IDs')
}

async function testGroupManagement() {
  const calls = []
  const api = new Proxy({}, { get: (_, name) => async (...args) => { calls.push({ name, args });
    if (name === 'updateGroup') throw new Error('offline')
    if (name === 'getFriends') return { data: { list: [{ id: 2, username: 'new' }, { id: 3, username: 'already' }] } }
    return { data: {} }
  } })
  const messages = []
  const uni = { showToast: value => messages.push(value), showModal: options => options.success({ confirm: true }), showActionSheet() {} }
  const management = getMixinObject('src/pages-nonTheme/chat/group-management-methods.js', 'groupManagementMethods', { chatApi: api, getDisplayName: user => user.username, uni })

  const canManage = getVueComputed('canManageGroup')
  assert.equal(canManage.call({ isGroupChat: true, groupInfo: { currentMember: { role: 'admin' } } }), true, 'admins can manage the group')
  assert.equal(canManage.call({ isGroupChat: true, groupInfo: { currentMember: { role: 'member' } } }), false, 'ordinary members cannot manage the group')
  const canRemove = getVueMethod('canRemoveGroupMember', { uni })
  const admin = { isGroupChat: true, canManageGroup: true, groupInfo: { currentMember: { role: 'admin' } }, getCurrentUserId: () => '1' }
  assert.equal(canRemove.call(admin, { userId: 2, role: 'member' }), true)
  assert.equal(canRemove.call(admin, { userId: 3, role: 'admin' }), false, 'admin cannot remove another admin')
  assert.equal(canRemove.call(admin, { userId: 1, role: 'member' }), false, 'member cannot remove self')

  const inviteContext = { canManageGroup: false, groupId: 'g1', groupInfo: { Members: [{ userId: 3 }] }, selectionItems: [], selectionMode: '' }
  await management.inviteGroupMembers.call(inviteContext)
  assert.equal(calls.filter(call => call.name === 'getFriends').length, 0, 'unauthorized member cannot open invite flow')
  inviteContext.canManageGroup = true
  await management.inviteGroupMembers.call(inviteContext)
  assert.equal(inviteContext.selectionMode, 'invite')
  assert.deepEqual(inviteContext.selectionItems.map(item => item.id), ['2'], 'invite excludes existing members')

  const selectionDialog = loadSfc('src/pages-nonTheme/components/ChatSelectionDialog.vue').descriptor
  const dialogMethod = getSfcMethod('src/pages-nonTheme/components/ChatSelectionDialog.vue', 'toggle')
  const dialog = { busy: false, multiple: true, selected: [], items: [{ id: '2' }] }
  dialogMethod.call(dialog, '2'); dialogMethod.call(dialog, '3')
  assert.equal(Array.from(dialog.selected).join(','), '2,3', 'invite selection allows multiple members')
  dialog.multiple = false
  dialogMethod.call(dialog, '4')
  assert.equal(Array.from(dialog.selected).join(','), '4', 'single-destination forwarding replaces selection')
  assert.ok(selectionDialog.template.content.includes('multiple'), 'selection dialog exposes multiple mode to invitation UI')

  const announcement = { canManageGroup: true, savingAnnouncement: false, announcementDraft: ' keep this draft ', editingAnnouncement: true,
    groupId: 'g1', applyGroupInfo() {}, uni }
  await management.saveGroupAnnouncement.call(announcement)
  assert.equal(announcement.announcementDraft, ' keep this draft ', 'failed save retains the editable announcement draft')
  assert.equal(announcement.editingAnnouncement, true)
  assert.equal(announcement.savingAnnouncement, false)

  const mute = getVueMethod('toggleMute', { chatApi: api, uni, console })
  const groupMuteContext = { isGroupChat: true, groupId: 'g1', otherUserId: 'u1', contactSettings: { mute: false } }
  await mute.call(groupMuteContext, { detail: { value: true } })
  assert.equal(calls.filter(call => call.name === 'updateGroupSettings').length, 1)
  assert.equal(calls.filter(call => call.name === 'updateContactMute').length, 0, 'group mute uses group settings API only')
  assert.equal(calls.find(call => call.name === 'updateGroupSettings').args[0], 'g1')
  assert.equal(calls.find(call => call.name === 'updateGroupSettings').args[1].notificationMuted, true)

  const menuCalls = []
  const menuUni = { showActionSheet: options => menuCalls.push(options), showModal: options => options.success({ confirm: true }), showToast() {} }
  let removed = 0
  let muted = 0
  const menuManagement = getMixinObject('src/pages-nonTheme/chat/group-management-methods.js', 'groupManagementMethods', { chatApi: api, getDisplayName: user => user.username, uni: menuUni })
  const menuContext = { removingGroupMemberId: '', canRemoveGroupMember: () => true, isGroupOwner: true, groupId: 'g1',
    getGroupMemberName: member => member.name, confirmRemoveGroupMember() { removed++ }, toggleGroupMemberMute() { muted++ },
    loadGroupDetail() {} }
  menuManagement.manageGroupMember.call(menuContext, { userId: 8, role: 'member', name: 'member', mute: false })
  assert.equal(Array.from(menuCalls[0].itemList).slice(0, 3).join(','), '设为管理员,转让群主,移除群聊', 'owner action indexes 0–2 preserve their original actions')
  assert.equal(menuCalls[0].itemList[3], '禁言', 'owner mute action is appended at index 3')
  await menuCalls[0].success({ tapIndex: 2 })
  assert.equal(removed, 1, 'owner index 2 still removes a member')
  await menuCalls[0].success({ tapIndex: 3 })
  assert.equal(muted, 1, 'owner index 3 toggles member mute')
  menuContext.isGroupOwner = false
  menuManagement.manageGroupMember.call(menuContext, { userId: 8, role: 'member', name: 'member', mute: false })
  assert.equal(Array.from(menuCalls[1].itemList).join(','), '移除群聊,禁言', 'admin menu has only remove and mute actions')
  await menuCalls[1].success({ tapIndex: 0 })
  await menuCalls[1].success({ tapIndex: 1 })
  assert.equal(removed, 2, 'admin index 0 removes a member')
  assert.equal(muted, 2, 'admin index 1 toggles member mute')
}

async function testGroupMuteAndAliasActions() {
  const apiCalls = []
  const api = new Proxy({}, { get: (_, name) => async (...args) => { apiCalls.push({ name, args }); return {} } })
  const toastCalls = []
  let modal
  const uni = { showModal: options => { modal = options }, showToast: options => toastCalls.push(options) }
  const management = getMixinObject('src/pages-nonTheme/chat/group-management-methods.js', 'groupManagementMethods', { chatApi: api, uni })
  const aliasContext = { isGroupChat: true, groupSettingsBusy: false, groupId: 'g1',
    groupInfo: { currentMember: { userId: 4, alias: '旧名' }, Members: [{ userId: 4, alias: '旧名' }] }, getCurrentUserId: () => 4 }
  management.editGroupAlias.call(aliasContext)
  await modal.success({ confirm: true, content: 'a'.repeat(40) })
  assert.equal(apiCalls.at(-1).name, 'updateGroupSettings', 'alias uses the existing group settings API')
  assert.equal(apiCalls.at(-1).args[1].alias.length, 40, '40-character alias is accepted')
  assert.equal(aliasContext.groupInfo.currentMember.alias.length, 40)
  management.editGroupAlias.call(aliasContext)
  await modal.success({ confirm: true, content: 'b'.repeat(41) })
  assert.equal(apiCalls.length, 1, 'alias longer than 40 characters is rejected before API call')
  management.editGroupAlias.call(aliasContext)
  await modal.success({ confirm: true, content: '   ' })
  assert.equal(apiCalls.at(-1).args[1].alias, '', 'clearing alias is sent as an empty legacy settings value')
  assert.equal(aliasContext.groupInfo.currentMember.alias, null, 'clearing alias restores null account-name state')
  assert.equal(aliasContext.groupInfo.Members[0].alias, null)

  let resolveModeration
  const moderationApi = { updateGroupModeration: (...args) => { apiCalls.push({ name: 'updateGroupModeration', args }); return new Promise(resolve => { resolveModeration = resolve }) } }
  const moderation = getMixinObject('src/pages-nonTheme/chat/group-management-methods.js', 'groupManagementMethods', { chatApi: moderationApi, uni })
  const groupContext = { canManageGroup: true, groupSettingsBusy: false, groupId: 'g1', groupInfo: { muteAll: false } }
  const enabling = moderation.toggleGroupMuteAll.call(groupContext, { detail: { value: true } })
  assert.equal(groupContext.groupInfo.muteAll, true, 'all-mute state updates optimistically')
  assert.equal(groupContext.groupSettingsBusy, true)
  resolveModeration({})
  await enabling
  assert.equal(groupContext.groupSettingsBusy, false)
  moderationApi.updateGroupModeration = () => Promise.reject(new Error('offline'))
  const disabling = moderation.toggleGroupMuteAll.call(groupContext, { detail: { value: false } })
  assert.equal(groupContext.groupInfo.muteAll, false, 'disable is also optimistic')
  await disabling
  assert.equal(groupContext.groupInfo.muteAll, true, 'failed moderation request rolls the value back')
  assert.equal(groupContext.groupSettingsBusy, false)

  let memberMuteCalls = 0
  const memberApi = { updateGroupMemberMute: async () => { memberMuteCalls++; throw new Error('offline') } }
  const memberUni = { showModal: options => options.success({ confirm: true }), showToast: options => toastCalls.push(options) }
  const memberMethods = getMixinObject('src/pages-nonTheme/chat/group-management-methods.js', 'groupManagementMethods', { chatApi: memberApi, uni: memberUni })
  const member = { userId: 8, name: '成员', mute: false }
  const memberContext = { removingGroupMemberId: '', canRemoveGroupMember: () => true, groupId: 'g1', getGroupMemberName: item => item.name }
  const muteResult = memberMethods.toggleGroupMemberMute.call(memberContext, member)
  assert.equal(memberContext.removingGroupMemberId, '8', 'member mute uses shared busy guard')
  await memberMethods.toggleGroupMemberMute.call(memberContext, member)
  assert.equal(memberMuteCalls, 1, 'busy guard prevents duplicate mute requests')
  await muteResult
  assert.equal(member.mute, false, 'failed member mute leaves the prior state intact')
  assert.equal(memberContext.removingGroupMemberId, '', 'busy guard clears after failure')
  memberContext.canRemoveGroupMember = () => false
  await memberMethods.toggleGroupMemberMute.call(memberContext, member)
  assert.equal(memberMuteCalls, 1, 'role gate blocks unauthorized member mute')
}

async function testGroupSendRestrictionsAndAliases() {
  const blockReason = getVueComputed('groupSendBlockReason')
  assert.equal(blockReason.call({ isGroupChat: false }), '')
  assert.equal(blockReason.call({ isGroupChat: true, groupInfo: { currentMember: { role: 'member', mute: true } } }), '你已被禁言，暂时无法发送消息')
  assert.equal(blockReason.call({ isGroupChat: true, groupInfo: { muteAll: true, currentMember: { role: 'member' } } }), '全员禁言中，仅群主和管理员可发言')
  assert.equal(blockReason.call({ isGroupChat: true, groupInfo: { muteAll: true, currentMember: { role: 'admin' } } }), '')

  const aliases = getVueComputed('groupMemberAliases')
  const memberAliases = aliases.call({ groupInfo: { Members: [{ userId: 7, alias: '群内昵称' }, { userId: 8, alias: '' }] } })
  assert.equal(memberAliases['7'], '群内昵称')
  assert.equal(memberAliases['8'], undefined)
  const author = getVueMethod('getMessageSenderName', { getDisplayName: user => user.nickname || user.username || '' })
  assert.equal(author.call({ isGroupChat: true, groupMemberAliases: memberAliases }, { senderId: 7, senderName: '账号名' }), '群内昵称')
  assert.equal(author.call({ isGroupChat: true, groupMemberAliases: memberAliases }, { isAi: true, senderId: 7 }), 'AI 环保助手', 'AI display name has precedence over aliases')

  const apiCalls = []
  const api = new Proxy({}, { get: (_, name) => (...args) => { apiCalls.push({ name, args }); return Promise.resolve({}) } })
  const dispatch = getMixinMethod('src/pages-nonTheme/chat/send-methods.js', 'messageSendMethods', 'sendCreatedMessage', { chatApi: api })
  await assert.rejects(dispatch.call({ isGroupChat: true, groupSendBlockReason: 'muted', groupId: 'g1' },
    { type: 'image', content: 'blob:should-not-upload', clientMessageId: 'client-1' }), /muted/)
  assert.equal(apiCalls.length, 0, 'muted group rejects dispatch before image upload API')
}

async function testDraftIsolation() {
  const storage = new Map([['token', 'token-1']])
  const uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key) }
  const saveDraft = getMixinMethod('src/pages-nonTheme/chat/message-actions-methods.js', 'messageActionsMethods', 'saveChatDraft', { uni })
  const restoreDraft = getMixinMethod('src/pages-nonTheme/chat/message-actions-methods.js', 'messageActionsMethods', 'restoreChatDraft', { uni })
  let userId = 'account-1'
  const context = { getCurrentUserId: () => userId, storageKey: 'chat_messages_account-1_direct-1', inputText: 'draft for account 1', refMessageId: '23', showRefSuggestion: true,
    draftIdentity: 'account-1', draftStorageKey: 'draft_chat_messages_account-1_direct-1', draftSaveTimer: null }
  saveDraft.call(context, { uni, clearTimeout() {} })
  assert.equal(storage.get(context.draftStorageKey).text, 'draft for account 1', 'draft saves under account and conversation key')
  assert.equal(storage.get(context.draftStorageKey).refId, '23')
  storage.set('token', 'token-refreshed')
  context.inputText = 'same account after token refresh'
  saveDraft.call(context, { uni, clearTimeout() {} })
  assert.equal(storage.get(context.draftStorageKey).text, 'same account after token refresh', 'token refresh does not invalidate same-account draft')
  userId = 'account-2'
  context.inputText = 'other account must not overwrite'
  saveDraft.call(context, { uni, clearTimeout() {} })
  assert.equal(storage.get(context.draftStorageKey).text, 'same account after token refresh', 'switching account cannot overwrite the old account draft')
  context.inputText = ''; context.refMessageId = null
  restoreDraft.call(context, { uni })
  assert.equal(context.draftIdentity, 'account-2')
  assert.equal(context.draftStorageKey, 'draft_chat_messages_account-1_direct-1', 'draft key remains conversation-specific')
}

async function testHistorySearchRacesAndCursor() {
  let resolveOld
  const requests = []
  const getChatHistory = params => {
    requests.push(params)
    if (requests.length === 1) return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve({ data: [{ id: 30 }, { id: 20 }], hasMore: true })
  }
  const getGroupHistory = (groupId, params) => { requests.push({ groupId, ...params }); return Promise.resolve({ data: [{ id: 10 }], hasMore: false }) }
  const search = getSfcMethod('src/pages-nonTheme/components/ChatHistorySearch.vue', 'search', { getChatHistory, getGroupHistory })
  const loadMore = getSfcMethod('src/pages-nonTheme/components/ChatHistorySearch.vue', 'loadMore', { getChatHistory, getGroupHistory })
  const pending = []
  const context = { groupId: '', chatId: 'direct-1', keyword: 'needle', type: '', messages: [], loading: false, hasMore: true, error: '', version: 0,
    loadMore() { const request = loadMore.call(this); pending.push(request); return request } }
  search.call(context)
  context.type = 'image'
  search.call(context)
  resolveOld({ data: [{ id: 99 }], hasMore: true })
  await Promise.all(pending)
  assert.equal(Array.from(context.messages, message => message.id).join(','), '30,20', 'type switch discards prior in-flight search results')
  assert.equal(requests[1].type, 'image')
  await loadMore.call(context)
  assert.equal(requests[2].lastMessageId, 20, 'direct history cursor follows oldest loaded result')
  context.groupId = 'g1'; context.messages = [{ id: 12 }]; context.loading = false; context.hasMore = true
  await loadMore.call(context)
  assert.equal(requests[3].beforeId, 12, 'group history cursor uses beforeId')
  assert.equal(requests[3].lastMessageId, undefined)
}

async function testHistoryPolling() {
  const fetch = getMixinMethod('src/pages-nonTheme/chat/sync-methods.js', 'messageSyncMethods', 'fetchConversationUpdates')
  const context = makeMethodContext({
    messages: Array.from({ length: 20 }, (_, index) => ({ id: 900 + index })),
    lastSyncedMessageId: 1000,
    getConversationHistory: async params => {
      assert.equal(params.pageSize, 100)
      const start = params.afterId + 1
      const end = Math.min(start + 99, 1120)
      return { incremental: true, hasMore: end < 1120, data: Array.from({ length: end - start + 1 }, (_, i) => ({ id: start + i })) }
    }
  })
  const result = await fetch.call(context, 4)
  assert.equal(result.length, 120, 'fetches every new message across incremental pages')
  assert.equal(context.lastSyncedMessageId, 1120)

  const sendingContext = makeMethodContext({
    messages: [{ id: 'local-123', clientMessageId: 'local-123', status: 'sending' }],
    lastSyncedMessageId: 50,
    getConversationHistory: async () => ({ incremental: true, hasMore: false, data: [{ id: 999, isSelf: true, status: 'sent' }] })
  })
  await fetch.call(sendingContext, 4)
  assert.equal(sendingContext.lastSyncedMessageId, 999, 'server ID, rather than pending local ID, controls cursor')

  const hidden = makeMethodContext({ isChatPageActive: false, lastSyncedMessageId: 50,
    getConversationHistory: async () => { throw new Error('hidden page must not fetch') } })
  assert.equal((await fetch.call(hidden, 4)).length, 0, 'hidden page aborts history requests')

  let legacyCalls = 0
  const legacy = makeMethodContext({ lastSyncedMessageId: 50,
    getConversationHistory: async () => { legacyCalls++; return { data: [{ id: 51 }, { id: 52 }] } } })
  assert.equal((await fetch.call(legacy, 4)).length, 2, 'legacy history response falls back to its recent page')
  assert.equal(legacyCalls, 1, 'legacy response does not loop without incremental metadata')

  const missingContext = makeMethodContext({ messages: [{ id: 11, isSelf: true }, { id: 12, isSelf: false }],
    lastSyncedMessageId: 50, lastHistoryReconcileAt: 0,
    getConversationHistory: async params => params.messageIds
      ? { data: [{ id: 12 }], missingIds: ['11'] }
      : { incremental: true, hasMore: false, data: [] } })
  await fetch.call(missingContext, 4)
  assert.deepEqual(missingContext.messages.map(message => message.id), [12], 'reconciliation removes only personally deleted messages')
}

async function testHistoryCacheCursor() {
  const fetch = getMixinMethod('src/pages-nonTheme/chat/sync-methods.js', 'messageSyncMethods', 'fetchConversationUpdates')
  const calls = []
  const cursorContext = makeMethodContext({ lastSyncedMessageId: 500, lastHistoryReconcileAt: Date.now(),
    messages: [{ id: 20 }, { id: 490 }],
    getConversationHistory: async (params, options) => { calls.push({ params, options }); return { incremental: true, hasMore: false, data: [{ id: 501 }] } } })
  await fetch.call(cursorContext, 4)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.afterId, 500, 'saved cursor prevents a long cached conversation from replaying from its earliest ID')
  assert.equal(calls[0].params.messageIds, undefined)
  assert.equal(cursorContext.lastSyncedMessageId, 501)

  const initialCalls = []
  const initialContext = makeMethodContext({ lastSyncedMessageId: null, lastHistoryReconcileAt: Date.now(),
    messages: [{ id: 100 }, { id: 110 }],
    getConversationHistory: async (params) => {
      initialCalls.push(params)
      return { incremental: true, hasMore: false, data: Array.from({ length: 11 }, (_, index) => ({ id: 100 + index })) }
    } })
  await fetch.call(initialContext, 4)
  assert.equal(initialCalls.length, 1, 'initial incremental range covers cache without a second ID lookup')
  assert.equal(initialCalls[0].afterId, 99)
  assert.equal(initialCalls[0].messageIds, undefined, 'covered cache is not fetched again by message IDs')
  assert.equal(initialContext.lastSyncedMessageId, 110)

  const initialize = getMixinMethod('src/pages-nonTheme/chat/cache-methods.js', 'historyCacheMethods', 'initializeMessages')
  let cacheLoads = 0
  let serverLoads = 0
  let pollingStarts = 0
  const nativeContext = { async loadMessagesFromStorage() { cacheLoads++ }, async loadMessagesFromServer() { serverLoads++ },
    isChatPageDestroyed: false, positionInitialChatAtBottom() {}, canPollMessages: () => true,
    startMessagePolling() { pollingStarts++ } }
  await initialize.call(nativeContext)
  assert.equal(cacheLoads, 1)
  assert.equal(serverLoads, 0, 'native initialization does not duplicate the server history load')
  assert.equal(pollingStarts, 1)
}

async function testHistoryCacheSnapshotCompatibility() {
  const records = new Map()
  const storeNames = new Set()
  const store = {
    createIndex() {},
    put(record) { records.set(record.conversationKey, record) },
    get(key) {
      const request = {}
      setTimeout(() => { request.result = records.get(key); request.onsuccess?.() }, 0)
      return request
    }
  }
  const database = {
    objectStoreNames: { contains: name => storeNames.has(name) },
    createObjectStore(name) { storeNames.add(name); return store },
    transaction() {
      const transaction = { objectStore: () => store }
      const originalPut = store.put
      store.put = record => { originalPut(record); setTimeout(() => transaction.oncomplete?.(), 0) }
      return transaction
    }
  }
  const previousIndexedDb = globalThis.indexedDB
  globalThis.indexedDB = { open() {
    const request = { result: database }
    setTimeout(() => { request.onupgradeneeded?.(); request.onsuccess?.() }, 0)
    return request
  } }
  try {
    const cacheSource = fs.readFileSync(path.join(root, 'src/utils/chat-history-cache.js'), 'utf8')
    const cacheUrl = `data:text/javascript;base64,${Buffer.from(cacheSource).toString('base64')}`
    const cache = await import(cacheUrl)
    const messages = [{ id: 201, type: 'text', content: 'cached row', timestamp: 1 }]
    await cache.saveChatHistoryCache('conversation-1', messages, 222)
    const legacyValue = await cache.loadChatHistoryCache('conversation-1')
    assert.ok(Array.isArray(legacyValue), 'legacy load call still returns the message array')
    const snapshot = await cache.loadChatHistoryCache('conversation-1', true)
    assert.equal(snapshot.lastSyncedMessageId, 222, 'sync cursor is returned with the snapshot when opted in')
    assert.equal(snapshot.messages[0].content, 'cached row')
    assert.equal(records.get('conversation-1').lastSyncedMessageId, 222, 'messages and sync cursor share one persisted record')
  } finally {
    if (previousIndexedDb === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previousIndexedDb
  }
}

function testMergeIdentity() {
  const merge = getVueMethod('mergeMessages')
  const context = makeMethodContext({ messages: [
    { id: 'local-a', clientMessageId: 'local-a', type: 'text', content: 'same', timestamp: 10, isSelf: true },
    { id: 'local-b', clientMessageId: 'local-b', type: 'text', content: 'same', timestamp: 11, isSelf: true },
    { id: 'media-a', clientMessageId: 'media-a', type: 'image', content: 'blob:a', timestamp: 12, isSelf: true },
    { id: '50', type: 'text', content: 'numeric ID', timestamp: 13, isSelf: false }
  ] })
  merge.call(context, [
    { id: 40, clientMessageId: 'local-a', type: 'text', content: 'same', timestamp: 10, isSelf: true },
    { id: 'media-40', clientMessageId: 'media-a', type: 'image', content: 'https://server/image', timestamp: 12, isSelf: true },
    { id: 50, type: 'text', content: 'numeric ID', timestamp: 13, isSelf: false }
  ])
  assert.equal(context.messages.length, 4, 'exact client IDs reconcile while identical text and unrelated media stay distinct')
  assert.equal(context.messages.filter(message => message.content === 'same').length, 2)
  assert.equal(context.messages.find(message => message.id === 40)?.clientMessageId, 'local-a', 'number/string message IDs reconcile')
  assert.equal(context.messages.filter(message => message.clientMessageId === 'media-a').length, 1, 'polling acknowledgement does not duplicate upload')

  const updateStatus = getVueMethod('updateMessageStatus')
  const ackFirst = makeMethodContext({ messages: [{ id: 'pending-1', clientMessageId: 'pending-1', status: 'sending' }] })
  updateStatus.call(ackFirst, 'pending-1', 'sent', 60)
  merge.call(ackFirst, [{ id: '60', clientMessageId: 'pending-1', status: 'sent', timestamp: 1 }])
  assert.equal(ackFirst.messages.length, 1, 'ack before poll remains one message across string/number IDs')
  const pollFirst = makeMethodContext({ messages: [{ id: 'pending-2', clientMessageId: 'pending-2', status: 'sending' }] })
  merge.call(pollFirst, [{ id: 61, clientMessageId: 'pending-2', status: 'sent', timestamp: 1 }])
  updateStatus.call(pollFirst, 'pending-2', 'sent', '61')
  assert.equal(pollFirst.messages.length, 1, 'poll before ack removes the optimistic duplicate')
}

async function testSendIdsAndRefs() {
  const calls = []
  const api = new Proxy({}, { get: (_, name) => (...args) => { calls.push({ name, args }); return Promise.resolve({ data: {} }) } })
  const send = getMixinMethod('src/pages-nonTheme/chat/send-methods.js', 'messageSendMethods', 'sendCreatedMessage', { chatApi: api })
  const types = ['text', 'image', 'voice', 'video', 'file', 'location']
  for (const isGroupChat of [false, true]) {
    for (const type of types) {
      const message = { id: `client-${type}`, clientMessageId: `client-${type}`, refId: '77', type,
        content: 'payload', duration: 4, thumbnail: 'thumb', fileName: 'f.txt', fileSize: 9,
        locationName: 'place', locationAddress: 'street', latitude: 1, longitude: 2 }
      send.call({ isGroupChat, groupId: 'g1', chatId: 'c1', otherUserId: 'u1' }, message, () => {})
    }
  }
  assert.equal(calls.length, 12, 'all six message types dispatch in direct and group chats')
  const directFields = { sendImageMessage: 3, sendVoiceMessage: 4, sendVideoMessage: 6, sendFileMessage: 6, sendLocationMessage: 6 }
  for (const { name, args } of calls) {
    if (name === 'sendTextMessage') {
      assert.equal(args[0].clientMessageId, 'client-text')
      assert.equal(args[0].refId, '77')
    } else if (name.startsWith('sendGroup')) {
      const data = args.find(arg => arg && typeof arg === 'object' && !Array.isArray(arg))
      if (name === 'sendGroupTextMessage') { assert.equal(args[2], '77'); assert.equal(args[3], 'client-text') }
      else if (name === 'sendGroupLocationMessage') { assert.equal(data.refId, '77'); assert.equal(data.clientMessageId, 'client-location') }
      else { assert.equal(args.at(-1), 'client-' + name.replace('sendGroup', '').replace('Message', '').toLowerCase()) }
    } else {
      const options = args.at(-1)
      assert.equal(options.clientMessageId, 'client-' + name.replace('send', '').replace('Message', '').toLowerCase())
      assert.equal(options.refId, '77')
      assert.ok(directFields[name] !== undefined, `unexpected direct sender ${name}`)
    }
  }

  const createMessage = getVueMethod('createMessage')
  const resend = getVueMethod('resendMessage')
  for (const type of types) {
    const generated = createMessage.call({ refMessageId: '77' }, type, 'hello', { duration: 4, fileName: 'f.txt', fileSize: 9 })
    assert.ok(generated.clientMessageId && generated.id === generated.clientMessageId)
    assert.equal(generated.refId, '77', `${type} initial send captures selected quote`)
    let resent
    const resendContext = { messages: [generated], saveMessagesToStorage() {},
      getConversationHistory: async () => ({ data: [] }), mergeMessages() {}, formatServerMessage: message => message,
      sendCreatedMessage: msg => { resent = msg; return Promise.resolve({}) }, getServerMessageId: () => '', updateMessageStatus() {} }
    generated.status = 'failed'
    await resend.call(resendContext, generated)
    assert.equal(resent.clientMessageId, generated.clientMessageId, `${type} retry reuses original idempotency key`)
    assert.equal(resent.refId, '77', `${type} retry retains quote ID`)
  }
}

async function testReferenceNavigation() {
  const jump = getVueMethod('jumpToRefMessage', { uni: { showLoading() {}, hideLoading() {}, showToast() {} }, setTimeout: () => 1, console })
  const sender = getVueMethod('getRefMessageSenderName')
  const context = makeMethodContext({ messages: [], isGroupChat: true, isChatPageActive: true,
    getConversationHistory: async () => ({ data: [{ id: 19, senderName: '群成员甲', senderId: 3, type: 'text', content: 'old', timestamp: 1 }] }),
    getGroupMessageBoundaryId: () => null,
    mergeMessages(messages) { this.messages.push(...messages) },
    formatServerMessage(message) { return message },
    getMessageSenderName(message) { return message.senderName },
    $nextTick(callback) { callback() },
    scrollToMessage: '', highlightMessageId: null })
  await jump.call(context, '19')
  assert.equal(context.scrollToMessage, 'msg-19', 'reference jump targets the rendered message anchor')
  context.messages = [{ id: 19, senderName: '群成员甲', senderId: 3, isSelf: false }]
  assert.equal(sender.call(context, 19), '群成员甲', 'group quote displays the quoted member name')
}

async function testNotifications() {
  const source = fs.readFileSync(path.join(root, 'src/utils/notification.js'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export default[\s\S]*$/m, '')
    .replace(/^export /gm, '')
  const toasts = [], navigations = [], timers = []
  const bodyChildren = []
  const elements = new Map()
  const document = {
    body: { appendChild(element) { bodyChildren.push(element); elements.set(element.id, element) } },
    createElement() { return { style: {}, addEventListener(name, callback) { this[name] = callback }, remove() { this.removed = true } } },
    getElementById(id) { return elements.get(id) || null }
  }
  let audioContexts = 0
  let nativeAudioContexts = 0
  const audioContext = { currentTime: 0, destination: {}, createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} } },
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } },
    close() { this.closed = true; return { catch() {} } } }
  const context = { document, window: { AudioContext: function MockAudioContext() { audioContexts++; return audioContext } },
    uni: { showToast: options => toasts.push(options), navigateTo: options => navigations.push(options),
      getSystemInfoSync: () => ({ platform: 'native-mock' }), createInnerAudioContext() { nativeAudioContexts++; return {} } },
    setTimeout: (callback, duration) => { timers.push({ callback, duration }); return timers.length }, clearTimeout() {},
    vibrateHapticPattern: async () => {}, console, setInterval, clearInterval }
  vm.runInNewContext(`${source}\nglobalThis.notificationExports={showNotification,notifyNewMessage,openChatNotification,playNotificationSound}`, context)
  const { showNotification, notifyNewMessage, openChatNotification, playNotificationSound } = context.notificationExports
  notifyNewMessage({ senderName: 'Ada', content: 'hello' }, { showNotification: false, useSystemNotification: true, playSound: false, vibrate: false })
  assert.equal(bodyChildren.length, 0, 'showNotification=false suppresses DOM banners')
  assert.equal(toasts.length, 0, 'showNotification=false suppresses native/toast notifications')
  showNotification({ title: 'Ada', content: 'hello', duration: 1234, onTap: () => openChatNotification({ groupId: 'g 1', senderName: 'Ada' }) })
  assert.equal(timers.length, 1, 'DOM notification timer is installed')
  assert.equal(timers[0].duration, 1234, 'notification duration is interpreted in milliseconds')
  assert.ok(bodyChildren[0].click, 'DOM notification is clickable')
  bodyChildren[0].click()
  assert.match(navigations[0].url, /conversationType=group/)
  assert.match(navigations[0].url, /groupId=g%201/)
  await playNotificationSound('default')
  assert.equal(audioContexts, 1, 'H5 sound path uses Web Audio without relying on web platform detection')
  assert.equal(nativeAudioContexts, 0, 'H5 sound path does not create a native audio player')
  assert.equal(timers[1].duration, 350, 'generated sound schedules completion after its tones')
  timers[1].callback()
  assert.equal(audioContext.closed, true, 'Web Audio context closes after the sound completes')
}

async function testTransportAccountIsolation() {
  const { createChatEventsTransport } = await import(pathToFileURL(path.join(root, 'src/utils/chat-events-transport.mjs')).href)
  let token = 'old-token'
  const sockets = []
  const timers = new Map()
  let timerId = 0
  const events = []
  const connectionEvents = []
  const transport = createChatEventsTransport({ getToken: () => token, getBaseUrl: () => 'https://example.test',
    connectSocket: () => {
      const socket = { handlers: {}, closeCount: 0, onMessage(callback) { this.handlers.message = callback },
        onClose(callback) { this.handlers.close = callback }, onError(callback) { this.handlers.error = callback },
        close() { this.closeCount++ }, send() {} }
      sockets.push(socket)
      return socket
    }, onEvent: event => events.push(event), onConnected: event => connectionEvents.push(event),
    setTimer: callback => { const id = ++timerId; timers.set(id, callback); return id },
    clearTimer: id => timers.delete(id) })
  transport.setActive(true)
  assert.equal(sockets.length, 1)
  const stale = sockets[0]
  assert.equal(transport.isConnected(), false, 'transport is not healthy before authentication')
  stale.handlers.message({ data: JSON.stringify({ type: 'connected' }) })
  assert.equal(transport.isConnected(), true, 'authenticated current socket is healthy')
  assert.equal(connectionEvents[0].reconnected, false, 'first connection reports reconnected=false')
  token = 'new-token'
  assert.equal(transport.isConnected(), false, 'token replacement invalidates the old socket immediately')
  const tick = [...timers.values()][0]
  timers.clear()
  tick()
  assert.equal(sockets.length, 2, 'token change replaces account socket')
  assert.equal(transport.isConnected(), false, 'replacement socket is unhealthy until authenticated')
  stale.handlers.message({ data: JSON.stringify({ type: 'chat.changed', conversationId: 'old-account' }) })
  assert.equal(events.length, 0, 'old account socket events are ignored')
  const current = sockets[1]
  current.handlers.message({ data: JSON.stringify({ type: 'connected' }) })
  assert.equal(transport.isConnected(), true)
  assert.equal(connectionEvents[1].reconnected, false, 'a new token begins a fresh connection lifecycle')
  transport.setActive(true)
  assert.equal(sockets.length, 2, 'reactivation does not duplicate the live connection')
  const realNow = Date.now
  let now = 100000
  Date.now = () => now
  current.handlers.close({ code: 1006 })
  const retry = [...timers.values()][0]
  timers.clear()
  now += 1000
  retry()
  assert.equal(sockets.length, 3, 'closed socket reconnects after the bounded backoff')
  const reconnected = sockets[2]
  assert.equal(transport.isConnected(), false, 'reconnected socket is unhealthy until authenticated')
  reconnected.handlers.message({ data: JSON.stringify({ type: 'connected' }) })
  assert.equal(transport.isConnected(), true)
  assert.equal(connectionEvents[2].reconnected, true, 'same-token reconnect reports reconnected=true')
  now += 45001
  assert.equal(transport.isConnected(), false, 'stale heartbeat makes the socket unhealthy')
  current.handlers.message({ data: JSON.stringify({ type: 'chat.changed', conversationId: 'stale-reconnect' }) })
  assert.equal(events.length, 0, 'events from a disconnected socket are ignored after reconnect')
  Date.now = realNow
  transport.setActive(false)
  reconnected.handlers.message({ data: JSON.stringify({ type: 'chat.changed' }) })
  assert.equal(events.length, 0, 'logout stops the reconnected socket')
  transport.setActive(true)
  const afterReactivation = sockets[3]
  afterReactivation.handlers.message({ data: JSON.stringify({ type: 'connected' }) })
  assert.equal(connectionEvents[3].reconnected, false, 'deactivation resets the next connection lifecycle')
  transport.setActive(false)
}

function testChatEventsReconnectNotification() {
  const filename = path.join(root, 'src/utils/chat-events.js')
  const source = fs.readFileSync(filename, 'utf8')
  astFor(source, filename)
  const emitted = []
  let config
  const executable = source.replace(/^import .*$/gm, '').replace(/^export function /gm, 'function ')
  const context = {
    baseUrl: 'https://example.test',
    messageBus: { emit: (event, payload) => emitted.push({ event, payload }) },
    triggerMessageNotification: async () => {},
    initChatNotificationNavigation() {},
    createChatEventsTransport(options) { config = options; return { isConnected: () => false, setActive() {} } },
    uni: { getStorageSync: () => '', connectSocket() {} }, setInterval, clearInterval, console
  }
  vm.runInNewContext(`${executable}\nglobalThis.__testExports={isChatEventsConnected,setChatEventsActive,setActiveChatConversation}`, context)
  config.onConnected({ reconnected: false })
  assert.equal(emitted.length, 0, 'first connection does not emit chat.reconnected')
  config.onConnected({ reconnected: true })
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].event, 'chat.reconnected', 'only a reconnect emits the chat.reconnected event')
}

async function testRealtimePollingGates() {
  let connected = true
  let pollingCalls = 0
  let clock = 100000
  const pollIfNeeded = getVueMethod('pollMessagesIfNeeded', { isChatEventsConnected: () => connected, Date: { now: () => clock } })
  const page = { messagePollingVersion: 7, activeMessagePollingVersion: null, chatEventsDirty: false, lastMessageCheckAt: clock,
    pollMessages() { pollingCalls++ } }
  pollIfNeeded.call(page, 7)
  assert.equal(pollingCalls, 0, 'healthy idle WebSocket suppresses periodic history HTTP')
  clock += 59000
  pollIfNeeded.call(page, 7)
  assert.equal(pollingCalls, 0, 'healthy idle WebSocket stays quiet for the first 59 seconds')
  clock += 1000
  pollIfNeeded.call(page, 7)
  assert.equal(pollingCalls, 1, 'healthy idle WebSocket performs a low-frequency catch-up after one minute')
  page.activeMessagePollingVersion = 7
  page.chatEventsDirty = true
  pollIfNeeded.call(page, 7)
  assert.equal(pollingCalls, 1, 'busy history request does not amplify HTTP requests')
  assert.equal(page.chatEventsDirty, true, 'dirty work survives while a request is busy')
  page.activeMessagePollingVersion = null
  pollIfNeeded.call(page, 7)
  assert.equal(pollingCalls, 2, 'one pending dirty batch schedules one catch-up')
  assert.equal(page.chatEventsDirty, false)
  connected = false
  pollIfNeeded.call(page, 7)
  assert.equal(pollingCalls, 3, 'unhealthy WebSocket retains HTTP fallback polling')

  const merged = []
  let immediatePolls = 0
  const handle = getVueMethod('handleChatEvent', { document: { querySelector: () => null }, uni: { showToast() {}, navigateBack() {} } })
  const handlerPage = { chatId: 'chat-1', canPollMessages: () => true, chatEventsDirty: false, messageCacheReady: true,
    messagePollingVersion: 2, activeMessagePollingVersion: null, formatServerMessage: message => message,
    mergeMessages(messages) { merged.push(...messages) }, pollMessages() { immediatePolls++ },
    $nextTick(callback) { callback() }, scrollToBottom() {} }
  handle.call(handlerPage, { kind: 'message', conversationId: 'chat-1', message: { id: 30, type: 'text', content: 'incoming' } })
  assert.equal(merged.length, 1, 'WebSocket message is merged locally immediately')
  assert.equal(handlerPage.chatEventsDirty, true, 'WebSocket message schedules later HTTP reconciliation')
  assert.equal(immediatePolls, 0, 'message event does not issue one HTTP request per event')
  handlerPage.activeMessagePollingVersion = 2
  handlerPage.chatEventsDirty = false
  handle.call(handlerPage, { kind: 'conversation.updated', conversationId: 'chat-1' })
  assert.equal(handlerPage.chatEventsDirty, true, 'non-message invalidation is retained during a busy catch-up')
  assert.equal(handlerPage.pendingHistoryReconcile, true, 'busy invalidation requests a full history reconciliation')

  const poll = getVueMethod('pollMessages', { isChatEventsConnected: () => true, document: { querySelector: () => null }, console: { ...console, error() {} } })
  const pollPage = { canPollMessages: () => true, messagePollingVersion: 7, activeMessagePollingVersion: null,
    chatEventsDirty: false, isGroupChat: false, messages: [], fetchConversationUpdates: async () => { throw new Error('temporary HTTP failure') },
    formatServerMessage: message => message, mergeMessages() {}, positionInitialChatAtBottom() {}, $nextTick(callback) { callback() } }
  await poll.call(pollPage, 7)
  assert.equal(pollPage.chatEventsDirty, true, 'failed HTTP catch-up restores dirty state for retry')
}

async function testChatListRealtimeGates() {
  let connected = true
  let clock = 100000
  const timeouts = []
  const globals = { isChatEventsConnected: () => connected, Date: { now: () => clock },
    setTimeout(callback, delay) { const timer = { callback, delay, cleared: false }; timeouts.push(timer); return timer },
    clearTimeout(timer) { if (timer) timer.cleared = true } }
  const refresh = getSfcMethod('src/pages-nonTheme/chatlist.vue', 'refreshChatListIfNeeded', globals)
  const schedule = getSfcMethod('src/pages-nonTheme/chatlist.vue', 'scheduleChatRefresh', globals)
  let refreshes = 0
  const page = { isPageActive: true, isSearching: false, loading: false, loadingMore: false, refreshInterval: 10000,
    lastRefreshTime: clock, chatListDirty: false, chatRefreshTimer: null,
    refreshFirstPage: async () => { refreshes++; page.lastRefreshTime = clock; return true },
    refreshChatListIfNeeded() { return refresh.call(this) } }
  await refresh.call(page)
  assert.equal(refreshes, 0, 'healthy idle WebSocket suppresses periodic chat-list HTTP')
  schedule.call(page)
  schedule.call(page)
  assert.equal(timeouts.length, 1, 'bursts of chat events coalesce behind one delayed refresh')
  assert.equal(page.chatListDirty, true)
  page.chatRefreshTimer = null
  clock += 10000
  await timeouts[0].callback()
  assert.equal(refreshes, 1, 'one dirty batch refreshes the first page')
  page.chatListDirty = false
  await refresh.call(page)
  assert.equal(refreshes, 1, 'healthy WebSocket remains quiet after the dirty batch')
  schedule.call(page)
  assert.equal(timeouts.length, 2)
  page.chatRefreshTimer = null
  await timeouts[1].callback()
  assert.equal(refreshes, 1, 'second event inside the refresh window is throttled')
  assert.equal(page.chatListDirty, true, 'throttled refresh remains queued as dirty')
  clock += 10000
  await refresh.call(page)
  assert.equal(refreshes, 2, 'dirty chat list refreshes after the event throttle expires')
  page.chatListDirty = false
  await refresh.call(page)
  assert.equal(refreshes, 2, 'healthy idle list remains quiet after event reconciliation')
  clock += 59999
  await refresh.call(page)
  assert.equal(refreshes, 2, 'healthy idle list stays quiet for the first 59 seconds')
  clock += 1
  await refresh.call(page)
  assert.equal(refreshes, 3, 'healthy idle list performs a low-frequency check after one minute')

  connected = false
  page.lastRefreshTime = 0
  await refresh.call(page)
  assert.equal(refreshes, 4, 'disconnected WebSocket uses periodic HTTP fallback')
  page.refreshFirstPage = async () => { refreshes++; return false }
  page.lastRefreshTime = 0
  await refresh.call(page)
  assert.equal(page.chatListDirty, true, 'failed fallback refresh remains dirty for a later retry')
}

async function main() {
  const cases = [
    ['SFC compile', testSfcCompiles],
    ['additional SFC compile', testAdditionalSfcCompiles],
    ['selection limit', testSelectionLimit],
    ['history polling', testHistoryPolling],
    ['history cache cursor', testHistoryCacheCursor],
    ['history cache snapshot compatibility', testHistoryCacheSnapshotCompatibility],
    ['message identity merge', testMergeIdentity],
    ['send IDs and refs', testSendIdsAndRefs],
    ['reference navigation', testReferenceNavigation],
    ['notifications', testNotifications],
    ['transport account isolation', testTransportAccountIsolation],
    ['chat-events reconnect notification', testChatEventsReconnectNotification],
    ['message actions', testMessageActions],
    ['group management', testGroupManagement],
    ['group mute and alias actions', testGroupMuteAndAliasActions],
    ['group send restrictions and aliases', testGroupSendRestrictionsAndAliases],
    ['draft isolation', testDraftIsolation],
    ['history search races', testHistorySearchRacesAndCursor],
    ['realtime polling gates', testRealtimePollingGates],
    ['chat-list realtime gates', testChatListRealtimeGates]
  ]
  const failures = []
  const actionsOnly = process.argv.includes('--actions-only')
  const finalOnly = process.argv.includes('--final-only')
  const loadOnly = process.argv.includes('--load-only')
  const transportOnly = process.argv.includes('--transport-only')
  const selected = loadOnly
    ? cases.filter(([name]) => ['SFC compile', 'additional SFC compile', 'history polling', 'history cache cursor', 'history cache snapshot compatibility', 'transport account isolation', 'realtime polling gates', 'chat-list realtime gates'].includes(name))
    : transportOnly
    ? cases.filter(([name]) => ['transport account isolation', 'chat-events reconnect notification'].includes(name))
    : process.argv.includes('--group-extras-only')
    ? cases.filter(([name]) => ['SFC compile', 'group management', 'group mute and alias actions', 'group send restrictions and aliases'].includes(name))
    : finalOnly
    ? cases.filter(([name]) => ['SFC compile', 'additional SFC compile', 'selection limit', 'notifications'].includes(name))
    : actionsOnly ? cases.filter(([name]) => ['additional SFC compile', 'message actions', 'group management', 'draft isolation', 'history search races'].includes(name)) : cases
  for (const [name, run] of selected) {
    try { await run(); console.log(`PASS ${name}`) }
    catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.message}`) }
  }
  if (failures.length) {
    console.error(`${failures.length} chat reliability test group(s) failed.`)
    process.exitCode = 1
  } else console.log('Chat reliability semantic tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
