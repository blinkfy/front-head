<template>
  <RecyclingShell title="成为回收员" :dark="isDark">
    <view v-if="error" class="recycle-error">{{ error }}<button class="recycle-secondary" :disabled="loading" @click="load">重新加载</button></view>
    <view v-if="loading" class="recycle-empty">加载中…</view>
    <template v-else>
      <view class="recycle-card">
        <text class="recycle-heading">加入上门回收服务</text><text class="recycle-copy">提交服务资料，经平台审核后发布排班，在服务区域内接单。接单后可直接与预约用户聊天。</text>
        <button class="recycle-secondary" @click="guideExpanded = !guideVisible">{{ guideVisible ? '收起申请指南' : '查看申请指南' }}</button>
        <view v-if="guideVisible" class="apply-guide">
          <text class="apply-guide-title">第一次申请？按这4步开始</text>
          <view v-for="(step, index) in applicationSteps" :key="step.title" class="apply-guide-step">
            <text class="apply-guide-number">{{ index + 1 }}</text>
            <view class="apply-guide-content"><text class="apply-guide-title">{{ step.title }}</text><text class="recycle-muted apply-guide-copy">{{ step.copy }}</text></view>
          </view>
          <text class="recycle-muted apply-guide-copy">接单后，在“我的任务”查看预约、联系用户聊天，并按订单提示完成上门回收。如需新单提醒，请在“接单设置”开启“新单提醒”，并允许系统通知；站内通知可在消息页查看。</text>
        </view>
      </view>
      <view v-if="profile || application" class="recycle-card">
        <view class="recycle-row"><text class="recycle-heading">当前进度</text><text class="recycle-status">{{ statusText }}</text></view>
        <text v-if="reviewReason" class="recycle-copy">平台说明：{{ reviewReason }}</text>
        <text v-if="profile?.status === 'approved'" class="recycle-copy">下一步：进入回收工作台的“接单设置”，发布可服务的日期、范围与时段，并开启“接收新单”。仅审核通过还不会开放预约。</text>
        <button v-if="profile?.status === 'approved'" class="recycle-primary" @click="workbench">进入回收工作台</button>
        <text v-if="application?.status === 'pending'" class="recycle-copy">{{ profile?.status === 'approved' ? '变更申请已提交，可在此查看审核结果。审核期间沿用原获批范围；通过后需重新发布排班并开启接单。' : '申请已提交，可在此查看审核结果。通过后还需进入回收工作台，发布排班并开启接单。' }}</text>
        <text v-else-if="application?.status === 'rejected' || profile?.status === 'rejected'" class="recycle-copy">请根据平台说明修改下方资料，再次提交审核。</text>
        <text v-else-if="profile?.status === 'suspended'" class="recycle-copy">接单资格已停用，请联系平台处理。</text>
        <button v-if="ownAreas.length" class="recycle-secondary" @click="showRanges = !showRanges">{{ showRanges ? '收起范围' : '查看申请范围' }}</button>
        <RecyclingServiceMap v-if="showRanges" :areas="ownAreas" readonly />
        <button v-if="profile?.status === 'suspended'" class="recycle-secondary" :disabled="submitting" @click="support">联系平台</button>
      </view>
      <view v-if="canApply && !error" class="recycle-card">
        <text class="recycle-heading">{{ profile?.status === 'approved' ? '申请变更服务范围' : application?.status === 'rejected' ? '重新申请' : '服务资料' }}</text>
        <text class="recycle-label">服务姓名</text><input class="recycle-input" v-model="form.serviceName" maxlength="50" placeholder="用户将看到的服务姓名" :disabled="submitting" />
        <text class="recycle-label">业务联系电话</text><input class="recycle-input" v-model="form.phone" type="number" maxlength="11" placeholder="可联系的手机号" :disabled="submitting" />
        <text class="recycle-label">服务范围（最多10个）</text>
        <text class="recycle-muted apply-guide-copy">圈出你实际能够上门的范围。第一次建议选“圆形范围”：设置圆心，再调整半径；不规则范围可用“多边形圈选”，至少添加3个顶点后点击“完成”。</text>
        <view v-for="(area, index) in form.serviceAreas" :key="index" class="recycle-card service-region-row">
          <input class="recycle-input" v-model="area.name" maxlength="80" placeholder="范围名称，例如：城南上门回收" :disabled="submitting" />
          <text class="recycle-label">所在地区（用于定位查找）</text><ShopRegionPicker v-model="area.region" :disabled="submitting" />
          <text class="recycle-muted apply-guide-copy">地区仅用于定位查找，实际服务边界以地图圈选为准。请先核对地图位置；定位不准时可搜索或移动地图。</text>
          <RecyclingServiceMap v-model:geometry="area.geometry" :disabled="submitting" auto-locate />
          <button v-if="form.serviceAreas.length > 1" class="recycle-pill" :disabled="submitting" @click="form.serviceAreas.splice(index, 1)">移除此范围</button>
        </view>
        <button class="recycle-secondary" :disabled="submitting || form.serviceAreas.length >= 10" @click="form.serviceAreas.push({ name: '', region: ['', '', ''], geometry: null })">增加服务范围</button>
        <text class="recycle-muted">请在地图上圈选多边形或设置圆形范围。边界可以跨区县，以地图坐标核验上门位置。审核后须发布排班才会开放预约。</text>
        <text v-if="profile?.status === 'approved'" class="recycle-muted recycle-copy">变更审核期间沿用原获批范围。变更通过时清除未来排班并暂停新单，请重新发布排班；仍有在途任务或预约依赖时需先处理。</text>
        <text class="recycle-label">支持回收品类（可多选）</text><text class="recycle-muted apply-guide-copy">只选择你能处理的品类，平台会据此匹配可接订单。</text><view class="recycle-pills"><button v-for="type in catalog.types" :key="type.id" class="recycle-pill" :class="{ selected: form.typeIds.includes(type.id) }" :disabled="submitting" @click="toggle('typeIds', type.id)">{{ type.name }}</button></view>
        <text class="recycle-label">服务说明（选填）</text><textarea class="recycle-textarea" v-model="form.notes" maxlength="500" placeholder="服务经验、车辆或其他说明" :disabled="submitting" />
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
  data: () => ({ isDark: false, loading: false, submitting: false, error: '', profile: null, application: null, catalog: { areas: [], types: [] }, ownAreas: [], form: { serviceName: '', phone: '', serviceAreas: [{ name: '', region: ['', '', ''], geometry: null }], typeIds: [], notes: '' }, showRanges: false, guideExpanded: null, applicationSteps: [
    { title: '填写服务资料', copy: '填服务姓名、联系电话，勾选你能回收的品类；服务经验和车辆情况可在服务说明中补充。' },
    { title: '圈选上门范围', copy: '给范围起名、选择地区，再在地图上画出能到达的范围，可添加多个。' },
    { title: '提交并等待审核', copy: '资料填完后点击页面底部“提交审核”，在本页查看结果；未通过时按平台说明修改后重提。' },
    { title: '排班后开启接单', copy: '审核通过后进入回收工作台 → 接单设置，选择日期、服务范围和时段，保存排班，再开启“接收新单”。用户才能预约相应时段，你可在“待接单”中接单。' }
  ], writes: {} }),
  computed: {
    guideVisible() { return this.guideExpanded === null ? !this.profile && !this.application : this.guideExpanded },
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
<style scoped>
.apply-guide { margin-top: 24rpx; padding: 24rpx; border-radius: 16rpx; background: #f2f8f4; }
.apply-guide-title { display: block; font-weight: 600; line-height: 1.6; }
.apply-guide-step { display: flex; align-items: flex-start; margin-top: 22rpx; }
.apply-guide-number { flex-shrink: 0; width: 40rpx; height: 40rpx; margin-right: 16rpx; border-radius: 50%; background: #16845b; color: #fff; text-align: center; line-height: 40rpx; font-size: 24rpx; }
.apply-guide-content { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.apply-guide-copy { display: block; margin-top: 12rpx; }
.recycle-dark .apply-guide { background: #243d2e; }
</style>
