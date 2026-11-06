<template>
  <RecyclingShell title="成为回收员" :dark="isDark">
    <view v-if="error" class="recycle-error">{{ error }}<button class="recycle-secondary" :disabled="loading" @click="load">重新加载</button></view>
    <view v-if="loading" class="recycle-empty">加载中…</view>
    <template v-else>
      <view class="recycle-card">
        <text class="recycle-heading">加入上门回收服务</text><text class="recycle-copy">提交服务资料，经平台审核后发布排班，在服务区域内接单。接单后可直接与预约用户聊天。</text>
        <text class="recycle-muted">仅核验服务资料与联系方式，不代表已完成身份实名认证。</text>
      </view>
      <view v-if="profile || application" class="recycle-card">
        <view class="recycle-row"><text class="recycle-heading">当前进度</text><text class="recycle-status">{{ statusText }}</text></view>
        <text v-if="reviewReason" class="recycle-copy">平台说明：{{ reviewReason }}</text>
        <button v-if="profile?.status === 'approved'" class="recycle-primary" @click="workbench">进入回收工作台</button>
        <text v-if="application?.status === 'pending'" class="recycle-copy">申请已提交，请等待平台审核。变更申请不影响原已获批范围；通过后需重新发布排班并开启接单。</text>
        <text v-else-if="profile?.status === 'suspended'" class="recycle-copy">接单资格已停用，请联系平台处理。</text>
        <button v-if="ownAreas.length" class="recycle-secondary" @click="showRanges = !showRanges">{{ showRanges ? '收起范围' : '查看申请范围' }}</button>
        <RecyclingServiceMap v-if="showRanges" :areas="ownAreas" readonly />
        <button v-if="profile?.status === 'suspended'" class="recycle-secondary" :disabled="submitting" @click="support">联系平台</button>
      </view>
      <view v-if="canApply && !error" class="recycle-card">
        <text class="recycle-heading">{{ profile?.status === 'approved' ? '申请变更服务范围' : application?.status === 'rejected' ? '重新申请' : '服务资料' }}</text>
        <text class="recycle-label">服务姓名</text><input v-model="form.serviceName" maxlength="50" placeholder="用户将看到的服务姓名" :disabled="submitting" />
        <text class="recycle-label">业务联系电话</text><input v-model="form.phone" type="number" maxlength="11" placeholder="可联系的手机号" :disabled="submitting" />
        <text class="recycle-label">服务范围（最多10个）</text>
        <view v-for="(area, index) in form.serviceAreas" :key="index" class="recycle-card service-region-row">
          <input v-model="area.name" maxlength="80" placeholder="范围名称，例如：城南上门回收" :disabled="submitting" />
          <text class="recycle-label">所在地区（用于定位查找）</text><ShopRegionPicker v-model="area.region" :disabled="submitting" />
          <RecyclingServiceMap v-model:geometry="area.geometry" :disabled="submitting" />
          <button v-if="form.serviceAreas.length > 1" class="recycle-pill" :disabled="submitting" @click="form.serviceAreas.splice(index, 1)">移除此范围</button>
        </view>
        <button class="recycle-secondary" :disabled="submitting || form.serviceAreas.length >= 10" @click="form.serviceAreas.push({ name: '', region: ['', '', ''], geometry: null })">增加服务范围</button>
        <text class="recycle-muted">请在地图上圈选多边形或设置圆形范围。边界可以跨区县，以地图坐标核验上门位置。审核后须发布排班才会开放预约。</text>
        <text v-if="profile?.status === 'approved'" class="recycle-muted recycle-copy">变更审核期间沿用原获批范围。变更通过时清除未来排班并暂停新单，请重新发布排班；仍有在途任务或预约依赖时需先处理。</text>
        <text class="recycle-label">支持回收品类（可多选）</text><view class="recycle-pills"><button v-for="type in catalog.types" :key="type.id" class="recycle-pill" :class="{ selected: form.typeIds.includes(type.id) }" :disabled="submitting" @click="toggle('typeIds', type.id)">{{ type.name }}</button></view>
        <text class="recycle-label">服务说明（选填）</text><textarea v-model="form.notes" maxlength="500" placeholder="服务经验、车辆或其他说明" :disabled="submitting" />
        <button class="recycle-primary" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : '提交审核' }}</button>
      </view>
    </template>
  </RecyclingShell>
</template>
<script>
import RecyclingShell from './components/RecyclingShell.vue'
import ShopRegionPicker from './components/ShopRegionPicker.vue'
import RecyclingServiceMap from './components/RecyclingServiceMap.vue'
import { normalizeGeometry } from './utils/recycling-geometry.mjs'
import { collectorMe, recyclingCatalog, collectorApply, collectorStatusText, openPlatformSupport, mutationData } from './api/recycling.js'
export default {
  components: { RecyclingShell, ShopRegionPicker, RecyclingServiceMap },
  data: () => ({ isDark: false, loading: false, submitting: false, error: '', profile: null, application: null, catalog: { areas: [], types: [] }, ownAreas: [], form: { serviceName: '', phone: '', serviceAreas: [{ name: '', region: ['', '', ''], geometry: null }], typeIds: [], notes: '' }, showRanges: false, writes: {} }),
  computed: {
    canApply() { return (!this.profile || ['rejected', 'approved'].includes(this.profile.status)) && this.application?.status !== 'pending' },
    statusText() { return collectorStatusText(this.profile?.status || this.application?.status) },
    reviewReason() { return this.profile?.reviewReason || this.application?.reason || '' }
  },
  onShow() { this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.load() },
  methods: {
    async load() {
      if (this.loading) return
      this.loading = true; this.error = ''
      try {
        const [me, catalog] = await Promise.all([collectorMe(), recyclingCatalog()])
        this.profile = me.profile; this.application = me.application; this.catalog = catalog
        const prior = this.application || this.profile
        this.ownAreas = (me.areas || []).filter(area => (prior?.areaIds || []).includes(area.id))
        if (prior && !this.form.serviceName) this.form = { serviceName: prior.serviceName || '', phone: prior.phone || '',
          serviceAreas: this.ownAreas.length ? this.ownAreas.map(area => ({ name: area.name || '', region: area.region || ['', '', ''], geometry: area.geometry || null })) : [{ name: '', region: ['', '', ''], geometry: null }],
          typeIds: prior.typeIds || [], notes: prior.notes || '' }
      } catch (e) { this.error = e.message || '加载失败' } finally { this.loading = false }
    },
    toggle(key, id) { this.form[key] = this.form[key].includes(id) ? this.form[key].filter(value => value !== id) : [...this.form[key], id] },
    workbench() { uni.redirectTo({ url: '/pages-nonTheme/collector-workbench' }) },
    async support() { if (this.submitting) return; this.submitting = true; try { await openPlatformSupport() } catch (e) { uni.showToast({ title: e.message || '平台联系失败', icon: 'none' }) } finally { this.submitting = false } },
    async submit() {
      if (this.submitting) return
      if (!this.form.serviceName.trim() || !/^1[3-9]\d{9}$/.test(this.form.phone) || !this.form.typeIds.length || !this.form.serviceAreas.length) { uni.showToast({ title: '请完善姓名、手机号、服务范围与品类', icon: 'none' }); return }
      const areas = this.form.serviceAreas.map(area => ({ name: area.name.trim(), region: area.region.map(part => String(part || '').trim()), geometry: normalizeGeometry(area.geometry) }))
      if (areas.some(area => !area.name || area.region.length !== 3 || area.region.some(part => !part) || !area.geometry)) { uni.showToast({ title: '请命名每个范围、选择地区并完成有效圈选', icon: 'none' }); return }
      this.submitting = true
      try { await collectorApply(mutationData(this.writes, 'apply', { ...this.form, serviceAreas: areas })); delete this.writes.apply; uni.showToast({ title: '申请已提交', icon: 'success' }); await this.load() } catch (e) { uni.showToast({ title: e.message || '申请失败', icon: 'none' }) } finally { this.submitting = false }
    }
  }
}
</script>
