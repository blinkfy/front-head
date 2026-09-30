<template>
  <view class="admin-panel" :class="{ dark }">
    <view class="status-line">
      <text :class="bin.review ? 'approved' : 'pending'">{{ bin.review ? '已通过审核' : '未通过审核' }}</text>
      <text>{{ reports.length ? `有 ${reports.length} 条报错` : '暂无报错' }}</text>
    </view>
    <view class="actions">
      <button size="mini" :disabled="busy" @click="editing = !editing">{{ editing ? '收起编辑' : '编辑资料' }}</button>
      <button v-if="!bin.review" size="mini" :disabled="busy" @click="review(true)">审核通过</button>
      <button v-if="bin.review" size="mini" :disabled="busy" @click="review(false)">撤销审核</button>
      <button size="mini" :disabled="busy" @click="removeBin">删除垃圾桶</button>
      <button v-if="reports.length" size="mini" @click="showReports = !showReports">{{ showReports ? '收起报错' : '查看报错' }}</button>
    </view>
    <scroll-view v-if="editing || showReports" scroll-y class="details">
      <view v-if="showReports" class="reports">
        <button size="mini" :disabled="busy" @click="removeReports">清空报错</button>
        <view v-for="(report, index) in reports" :key="index" class="report">
          <text>{{ report.reason || '未填写原因' }}</text>
          <text class="muted">{{ report.createdAt || '' }} · {{ report.userId || '匿名用户' }}</text>
        </view>
      </view>
      <view v-if="editing" class="form">
        <label>名称<input v-model="draft.name" maxlength="100" /></label>
        <label>描述<textarea v-model="draft.describe" maxlength="2000" auto-height /></label>
        <label>类型<picker :range="['普通垃圾桶', '智能垃圾桶']" :value="draft.type === 'smart' ? 1 : 0" @change="draft.type = Number($event.detail.value) === 1 ? 'smart' : 'normal'"><view class="picker">{{ draft.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶' }}</view></picker></label>
        <label>状态<picker :range="['离线', '在线']" :value="draft.status === 'online' ? 1 : 0" @change="draft.status = Number($event.detail.value) === 1 ? 'online' : 'offline'"><view class="picker">{{ draft.status === 'online' ? '在线' : '离线' }}</view></picker></label>
        <label>纬度<input v-model="draft.latitude" type="text" /></label>
        <label>经度<input v-model="draft.longitude" type="text" /></label>
        <label>图片路径<input v-model="draft.imagePath" maxlength="2000" /></label>
        <label>设备回调地址<input v-model="draft.callback_url" maxlength="2000" /></label>
        <button class="save" size="mini" :disabled="busy" @click="save">{{ busy ? '提交中…' : '保存修改' }}</button>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { approveBin, rejectBin, updateBin, deleteBin, clearBinErrorReports } from '@/api/database'
import { binReports } from '@/utils/map-admin-bins'
const props = defineProps({ bin: { type: Object, required: true }, dark: Boolean })
const emit = defineEmits(['updated'])
const reports = computed(() => binReports(props.bin))
const editing = ref(false)
const showReports = ref(false)
const busy = ref(false)
const draft = ref({})
watch(() => props.bin, bin => {
  editing.value = false
  showReports.value = false
  draft.value = { name: bin.name || '', describe: bin.description || '', type: bin.type || 'normal', status: bin.status || 'offline', latitude: String(bin.latitude ?? ''), longitude: String(bin.longitude ?? ''), imagePath: bin.imagePath || '', callback_url: bin.callback_url || '' }
}, { immediate: true })
async function submit(id, action) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await action()
    if (result?.code !== 0) throw new Error(result?.msg || '操作失败')
    uni.showToast({ title: '操作成功', icon: 'success' })
    emit('updated', id)
  } catch (error) { uni.showToast({ title: error.message || '操作失败', icon: 'none' }) }
  finally { busy.value = false }
}
function review(approved) {
  const id = props.bin.id
  uni.showModal({ title: approved ? '审核通过' : '取消通过审核', content: approved ? '确认将此垃圾桶向普通用户开放？' : '确认将此垃圾桶设为未通过审核？普通用户将不再看到它。', success: result => {
    if (result.confirm) submit(id, () => approved ? approveBin(id) : rejectBin(id))
  } })
}
function removeBin() {
  const id = props.bin.id
  const name = props.bin.name || '此垃圾桶'
  uni.showModal({ title: '删除垃圾桶', content: `确认永久删除“${name}”？删除后地图不再显示此桶，关联的用户设备关系也会删除。`, success: result => {
    if (result.confirm) submit(id, () => deleteBin(id))
  } })
}
function removeReports() {
  const id = props.bin.id
  const count = reports.value.length
  uni.showModal({ title: '清空报错', content: `确认删除此桶的全部 ${count} 条报错记录？垃圾桶本身会保留。`, success: result => {
    if (result.confirm) submit(id, () => clearBinErrorReports(id))
  } })
}
function save() {
  const latitude = Number(draft.value.latitude)
  const longitude = Number(draft.value.longitude)
  if (!draft.value.name.trim() || !draft.value.latitude.trim() || !draft.value.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    uni.showToast({ title: '请填写名称和有效经纬度', icon: 'none' }); return
  }
  const id = props.bin.id
  submit(id, () => updateBin(id, { ...draft.value, name: draft.value.name.trim(), latitude, longitude }))
}
</script>

<style scoped>
.admin-panel { margin-top: 20rpx; padding-top: 16rpx; border-top: 1px solid #dce4e7; color: #243442; }
.status-line, .actions { display: flex; flex-wrap: wrap; gap: 12rpx; align-items: center; }
.status-line { font-size: 24rpx; margin-bottom: 12rpx; }
.pending { color: #6b7280; } .approved { color: #07825e; }
.actions button { margin: 0; font-size: 24rpx; }
.details { max-height: 360rpx; height: 360rpx; margin-top: 12rpx; }
.report { display: flex; flex-direction: column; padding: 12rpx 0; border-bottom: 1px solid #dce4e7; font-size: 26rpx; word-break: break-all; }
.muted { font-size: 22rpx; opacity: .65; }
.form label { display: block; font-size: 24rpx; margin-bottom: 12rpx; }
.form input, .form textarea, .picker { box-sizing: border-box; width: 100%; min-height: 64rpx; margin-top: 6rpx; padding: 10rpx; border-radius: 8rpx; background: #f1f5f9; font-size: 26rpx; }
.save { background: #079a72; color: white; }
.dark { color: #eef5ff; border-color: #36536b; }
.dark .pending { color: #c4cbd5; } .dark .approved { color: #59dfaa; }
.dark .form input, .dark .form textarea, .dark .picker { background: #203345; color: #eef5ff; }
.dark .report { border-color: #36536b; }
</style>
