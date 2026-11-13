<template>
  <RecyclingShell title="成为回收员" :dark="isDark" variant="workbench">
    <view v-if="error" class="recycle-error apply-error" role="alert"><text>{{ error }}</text><button class="recycle-secondary" :disabled="loading || submitting" @click="load">重新加载</button></view>
    <view v-if="loading" class="recycle-empty" role="status">正在加载申请资料…</view>
    <template v-else>
      <view class="apply-intro"><text class="apply-title">加入上门回收服务</text><text class="recycle-muted">填写服务资料与地图范围，审核通过后设置报价、排班接单。</text></view>
      <view class="application-progress identity-requirement"><view class="progress-heading"><text class="progress-label">实名认证</text><text class="recycle-status">{{ identity.verified ? '已通过' : '申请前必需' }}</text></view><text class="recycle-muted">{{ identity.verified ? '本人身份已核验，可继续填写服务资料。' : identityError || '先完成本人身份核验，再提交回收员申请。已填写的申请资料会保留。' }}</text><button class="recycle-secondary" :disabled="submitting" @click="verifyIdentity">{{ identity.verified ? '查看认证信息' : '去实名认证' }}</button></view>

      <view v-if="profile || application" class="application-progress" :class="{ 'needs-attention': application?.status === 'rejected' || profile?.status === 'rejected' || profile?.status === 'suspended' }">
        <view class="progress-heading"><text class="progress-label">申请进度</text><text class="recycle-status">{{ statusText }}</text></view>
        <text v-if="reviewReason" class="review-reason">平台说明：{{ reviewReason }}</text>
        <text v-if="profile?.status === 'suspended'" class="recycle-copy">接单资格已停用，请联系平台处理。</text>
        <text v-else-if="application?.status === 'pending'" class="recycle-copy">{{ profile?.status === 'approved' ? '变更申请已提交，审核期间沿用原获批范围；通过后需重新发布排班并开启接单。' : '申请已提交，请等待平台审核。通过后还需进入工作台发布排班并开启接单。' }}</text>
        <text v-else-if="application?.status === 'rejected' || profile?.status === 'rejected'" class="recycle-copy">请根据平台说明修改下方资料，再次提交审核。</text>
        <text v-else-if="profile?.status === 'approved'" class="recycle-copy">下一步：进入工作台的“接单设置”，设置报价、发布排班并开启“接收新单”。仅审核通过还不会开放预约。</text>
        <button v-if="profile?.status === 'approved'" class="recycle-primary" @click="workbench">进入回收工作台</button>
        <button v-if="ownAreas.length" class="apply-text-button progress-range-toggle" :disabled="submitting" :aria-expanded="showRanges" @click="showRanges = !showRanges">{{ showRanges ? '收起申请范围' : '查看申请范围' }}<view :class="['apply-chevron', { expanded: showRanges }]"></view></button>
        <RecyclingServiceMap v-if="showRanges" class="review-range-map" :areas="ownAreas" readonly />
        <button v-if="profile?.status === 'suspended'" class="recycle-secondary" :disabled="submitting" @click="support">联系平台</button>
      </view>

      <view class="guide-section">
        <button class="guide-toggle" :aria-expanded="guideVisible" @click="guideExpanded = !guideVisible"><text>{{ !profile && !application ? '第一次申请？按这4步开始' : '申请指南（简单4步）' }}</text><view class="guide-toggle-action"><text>{{ guideVisible ? '收起指南' : '展开指南' }}</text><view :class="['apply-chevron', { expanded: guideVisible }]"></view></view></button>
        <view v-if="guideVisible" class="apply-guide">
          <view v-for="(step, index) in applicationSteps" :key="step.title" class="apply-guide-step"><text class="apply-guide-number">{{ index + 1 }}</text><view class="apply-guide-content"><text class="apply-guide-title">{{ step.title }}</text><text class="recycle-muted apply-guide-copy">{{ step.copy }}</text></view></view>
          <text class="guide-footnote">接单后可在“我的任务”联系用户聊天。新单提醒请在“接单设置”开启并允许系统通知，站内通知也可随时查看。</text>
        </view>
      </view>

      <view v-if="canApply && !error" :class="['application-form', { 'form-submitting': submitting }]">
        <view v-if="profile?.status === 'approved'" class="change-notice"><text class="setting-label">申请变更服务范围</text><text class="recycle-muted">审核期间沿用原获批范围。通过时会清除未来排班并暂停新单，需重新发布排班；仍有在途任务或预约依赖时请先处理。</text></view>
        <view class="apply-section">
          <view class="apply-section-heading"><text class="apply-section-number">01</text><view><text class="recycle-heading">服务资料</text><text class="recycle-muted">填写对外服务信息，方便用户联系</text></view></view>
          <view class="identity-fields"><view><text class="recycle-label">服务姓名</text><text class="recycle-input verified-service-name">{{ identity.verified ? serviceName || '正在读取实名姓名…' : '完成实名认证后自动显示' }}</text><text class="recycle-muted">使用实名认证姓名，用户将看到此姓名</text></view><view><text class="recycle-label">业务联系电话</text><input class="recycle-input" v-model="form.phone" type="number" maxlength="11" placeholder="可联系的手机号" :disabled="submitting" /></view></view>
        </view>

        <view class="apply-section">
          <view class="apply-section-heading"><text class="apply-section-number">02</text><view><text class="recycle-heading">地图服务范围</text><text class="recycle-muted">圈出实际能上门的范围，最多10个</text></view></view>
          <text class="recycle-muted section-note">首次建议使用圆形范围：设置圆心、调整半径。不规则范围可用多边形圈选，至少添加3个顶点后点击“完成”。</text>
          <view v-for="(area, index) in form.serviceAreas" :key="index" class="application-range">
            <view class="range-heading"><text>范围 {{ index + 1 < 10 ? '0' : '' }}{{ index + 1 }}</text><button v-if="form.serviceAreas.length > 1" class="apply-text-button remove-range" :disabled="submitting" @click="form.serviceAreas.splice(index, 1)">移除此范围</button></view>
            <text class="recycle-label">范围名称</text><input class="recycle-input" v-model="area.name" maxlength="80" placeholder="例如：城南上门回收" :disabled="submitting" />
            <text class="recycle-label">所在地区</text><ShopRegionPicker v-model="area.region" :disabled="submitting" />
            <text class="recycle-muted range-note">地区用于查找，实际边界以地图圈选为准。定位不准时可搜索或移动地图。</text>
            <RecyclingServiceMap class="application-map" v-model:geometry="area.geometry" :disabled="submitting" auto-locate />
          </view>
          <button class="recycle-secondary add-range" :disabled="submitting || form.serviceAreas.length >= 10" @click="form.serviceAreas.push({ name: '', region: ['', '', ''], geometry: null })">增加服务范围</button>
          <text class="recycle-muted range-footnote">边界可以跨区县，以地图范围核验上门位置。审核通过后还需发布排班才会开放预约。</text>
        </view>

        <view class="apply-section">
          <view class="apply-section-heading"><text class="apply-section-number">03</text><view><text class="recycle-heading">回收品类与说明</text><text class="recycle-muted">只选择自己能够处理的品类，可多选</text></view></view>
          <view v-if="catalog.types.length" class="apply-type-grid"><button v-for="type in catalog.types" :key="type.id" class="apply-type" :class="{ selected: form.typeIds.includes(type.id) }" :disabled="submitting" :aria-pressed="form.typeIds.includes(type.id)" @click="toggle('typeIds', type.id)"><view class="type-check"><view v-if="form.typeIds.includes(type.id)" class="type-tick"></view></view><text>{{ type.name }}</text></button></view>
          <text v-else class="recycle-muted section-note">暂无开放的回收品类，请稍后刷新申请资料。</text>
          <text class="recycle-label">服务说明<text class="optional-label">选填</text></text><textarea class="recycle-textarea" v-model="form.notes" maxlength="500" placeholder="服务经验、车辆或其他说明" :disabled="submitting" />
          <text class="notes-count">{{ form.notes.length }}/500</text>
        </view>
        <view class="application-summary"><text class="summary-title">{{ form.serviceAreas.length }}个服务范围 · {{ form.typeIds.length }}项回收品类</text><text class="recycle-muted">提交后可在本页查看结果。审核通过后还需发布排班并开启接单，用户才能预约。</text></view>
        <button class="recycle-primary submit-application" :disabled="submitting || !identity.verified" @click="submit">{{ submitting ? '提交中…' : !identity.verified ? '请先完成实名认证' : profile?.status === 'approved' ? '提交变更申请' : application?.status === 'rejected' || profile?.status === 'rejected' ? '重新提交审核' : '提交审核' }}</button>
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
import { identityStatus } from '@/api/identity.js'
export default {
  components: { RecyclingShell, ShopRegionPicker, RecyclingServiceMap },
  data: () => ({ identity: {}, identityError: '', serviceName: '', formInitialized: false, isDark: false, loading: false, submitting: false, error: '', profile: null, application: null, catalog: { areas: [], types: [] }, ownAreas: [], form: { phone: '', serviceAreas: [{ name: '', region: ['', '', ''], geometry: null }], typeIds: [], notes: '' }, showRanges: false, guideExpanded: null, applicationSteps: [
    { title: '填写服务资料', copy: '服务姓名由实名认证自动带入，请填写业务手机号和可回收品类，可补充服务经验与车辆情况。' },
    { title: '圈选上门范围', copy: '选择所在地区，在地图设置圆形或多边形范围，最多可申请10个。' },
    { title: '提交并等待审核', copy: '完成后在页面底部提交，在本页查看审核结果；未通过可按说明修改重提。' },
    { title: '排班后开启接单', copy: '通过后到工作台设置报价、发布排班并开启“接收新单”，用户才能预约。' }
  ], writes: {} }),
  computed: {
    guideVisible() { return this.guideExpanded === null ? !this.profile && !this.application : this.guideExpanded },
    canApply() { return (!this.profile || ['rejected', 'approved'].includes(this.profile.status)) && this.application?.status !== 'pending' },
    statusText() {
      if (this.profile?.status === 'suspended') return collectorStatusText('suspended')
      if (this.application?.status === 'pending') return this.profile?.status === 'approved' ? '变更审核中' : collectorStatusText('pending')
      if (this.application?.status === 'rejected') return this.profile?.status === 'approved' ? '变更未通过' : collectorStatusText('rejected')
      return collectorStatusText(this.profile?.status || this.application?.status)
    },
    reviewReason() {
      if (this.profile?.status === 'suspended') return this.profile.reviewReason || ''
      if (['pending', 'rejected'].includes(this.application?.status)) return this.application.reason || ''
      return this.profile?.reviewReason || this.application?.reason || ''
    }
  },
  onShow() { this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.refreshIdentity(); this.load() },
  methods: {
    verifyIdentity() { if (!this.submitting) uni.navigateTo({ url: '/pages-nonTheme/identity-verification' }) },
    async refreshIdentity() {
      try { this.identity = await identityStatus(); this.identityError = '' }
      catch (e) { this.identity = {}; this.identityError = e.message || '认证状态获取失败，请进入认证页重试' }
    },
    async load() {
      if (this.loading) return
      this.loading = true; this.error = ''
      try {
        const [me, catalog] = await Promise.all([collectorMe(), recyclingCatalog()])
        this.profile = me.profile; this.application = me.application; this.serviceName = me.serviceName || ''; this.catalog = catalog
        const prior = this.application || this.profile
        this.ownAreas = (me.areas || []).filter(area => (prior?.areaIds || []).includes(area.id))
        if (prior && !this.formInitialized) this.form = { phone: prior.phone || '',
          serviceAreas: this.ownAreas.length ? this.ownAreas.map(area => ({ name: area.name || '', region: area.region || ['', '', ''], geometry: area.geometry || null })) : [{ name: '', region: ['', '', ''], geometry: null }],
          typeIds: prior.typeIds || [], notes: prior.notes || '' }
        this.formInitialized = true
      } catch (e) { this.error = e.message || '加载失败' } finally { this.loading = false }
    },
    toggle(key, id) { this.form[key] = this.form[key].includes(id) ? this.form[key].filter(value => value !== id) : [...this.form[key], id] },
    workbench() { uni.redirectTo({ url: '/pages-nonTheme/collector-workbench' }) },
    async support() { if (this.submitting) return; this.submitting = true; try { await openPlatformSupport() } catch (e) { uni.showToast({ title: e.message || '平台联系失败', icon: 'none' }) } finally { this.submitting = false } },
    async submit() {
      if (this.submitting) return
      if (!this.identity.verified) { uni.showToast({ title: '请先完成实名认证', icon: 'none' }); return }
      if (!/^1[3-9]\d{9}$/.test(this.form.phone) || !this.form.typeIds.length || !this.form.serviceAreas.length) { uni.showToast({ title: '请完善手机号、服务范围与品类', icon: 'none' }); return }
      const areas = this.form.serviceAreas.map(area => ({ name: area.name.trim(), region: area.region.map(part => String(part || '').trim()), geometry: normalizeGeometry(area.geometry) }))
      if (areas.some(area => !area.name || area.region.length !== 3 || area.region.some(part => !part) || !area.geometry)) { uni.showToast({ title: '请命名每个范围、选择地区并完成有效圈选', icon: 'none' }); return }
      this.submitting = true
      try { await collectorApply(mutationData(this.writes, 'apply', { phone: this.form.phone, typeIds: this.form.typeIds, notes: this.form.notes, serviceAreas: areas })); delete this.writes.apply; uni.showToast({ title: '申请已提交', icon: 'success' }); await this.load() } catch (e) { uni.showToast({ title: e.message || '申请失败', icon: 'none' }) } finally { this.submitting = false }
    }
  }
}
</script>
<style scoped>
.apply-intro { padding: 4rpx 0 24rpx; }
.apply-title { display: block; margin-bottom: 10rpx; color: var(--workbench-text); font-size: 36rpx; font-weight: 700; line-height: 1.5; }
.apply-intro .recycle-muted { display: block; line-height: 1.7; }
.guide-section { margin: 6rpx 0 32rpx; border-bottom: 1rpx solid var(--workbench-line); padding-bottom: 18rpx; }
.guide-toggle { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; width: 100%; padding: 16rpx 0; margin: 0; background: transparent; text-align: left; color: var(--workbench-text); font-size: 27rpx; font-weight: 600; line-height: 1.6; border-radius: 0; }
.guide-toggle::after, .apply-text-button::after, .apply-type::after { border: 0; }
.guide-toggle > text { flex: 1; min-width: 0; }
.guide-toggle-action { display: flex; align-items: center; gap: 10rpx; color: var(--workbench-green); font-size: 23rpx; font-weight: 400; flex-shrink: 0; }
.apply-chevron { width: 10rpx; height: 10rpx; border-right: 2rpx solid currentColor; border-bottom: 2rpx solid currentColor; transform: rotate(45deg); flex-shrink: 0; margin-right: 6rpx; }
.apply-chevron.expanded { transform: rotate(225deg); }
.apply-guide { padding: 0 0 8rpx; }
.apply-guide-step { position: relative; display: flex; align-items: flex-start; gap: 16rpx; padding: 14rpx 0; }
.apply-guide-step + .apply-guide-step::before { content: ''; position: absolute; top: -14rpx; left: 17rpx; width: 2rpx; height: 28rpx; background: var(--workbench-line); }
.apply-guide-number { display: flex; align-items: center; justify-content: center; flex: 0 0 36rpx; height: 36rpx; border-radius: 50%; background: #10b981; color: #fff; font-size: 22rpx; font-weight: 600; }
.apply-guide-content { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.apply-guide-title { display: block; color: var(--workbench-text); font-size: 26rpx; font-weight: 600; line-height: 1.5; }
.apply-guide-copy { display: block; margin-top: 4rpx; font-size: 23rpx; line-height: 1.65; }
.guide-footnote { display: block; padding: 16rpx 0 4rpx 52rpx; font-size: 22rpx; line-height: 1.65; color: var(--workbench-muted); }
.application-progress { padding: 24rpx; margin-bottom: 24rpx; border: 1rpx solid var(--workbench-line); border-left: 5rpx solid #10b981; border-radius: 0 16rpx 16rpx 0; background: var(--workbench-surface); }
.progress-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-bottom: 10rpx; }
.progress-label { color: var(--workbench-text); font-size: 30rpx; font-weight: 700; }
.review-reason { display: block; padding: 14rpx 18rpx; margin-top: 16rpx; background: var(--workbench-soft); font-size: 25rpx; line-height: 1.65; overflow-wrap: anywhere; }
.application-progress .recycle-copy { font-size: 25rpx; }
.needs-attention { border-left-color: var(--workbench-warning); }
.needs-attention .recycle-status { color: var(--workbench-warning); }
.apply-text-button { display: flex; align-items: center; justify-content: center; gap: 12rpx; padding: 14rpx 4rpx; margin: 0; border-radius: 0; background: transparent; color: var(--workbench-green); font-size: 24rpx; line-height: 1.5; }
.progress-range-toggle { margin-top: 14rpx; }
.review-range-map { margin-top: 20rpx; }
.apply-section { margin-bottom: 34rpx; min-width: 0; }
.apply-section + .apply-section { padding-top: 28rpx; border-top: 8rpx solid var(--workbench-divider); }
.apply-section-heading { display: flex; align-items: center; gap: 16rpx; padding: 20rpx; margin-bottom: 18rpx; background: var(--workbench-soft); border-left: 6rpx solid #10b981; border-radius: 0 14rpx 14rpx 0; }
.apply-section-heading > view { flex: 1; min-width: 0; }
.apply-section-heading .recycle-heading { font-size: 30rpx; font-weight: 700; margin: 0 0 4rpx; }
.apply-section-heading .recycle-muted { font-size: 22rpx; }
.apply-section-number { display: flex; align-items: center; justify-content: center; flex: 0 0 52rpx; height: 52rpx; border-radius: 14rpx; background: linear-gradient(135deg,#10b981,#059669); color: #fff; font-size: 25rpx; font-weight: 700; }
.identity-fields .verified-service-name { display: block; padding: 20rpx; line-height: 1.5; min-height: 84rpx; height: auto; box-sizing: border-box; overflow-wrap: anywhere; }
.identity-fields .recycle-label, .application-range .recycle-label { font-size: 26rpx; font-weight: 600; }
.section-note { display: block; margin: 12rpx 0 20rpx; line-height: 1.7; }
.application-range { margin-top: 24rpx; padding: 0 20rpx 24rpx; border: 1rpx solid var(--workbench-line); border-radius: 12rpx; background: var(--workbench-surface); min-width: 0; }
.range-heading { display: flex; justify-content: space-between; align-items: center; gap: 12rpx; min-height: 76rpx; border-bottom: 1rpx solid var(--workbench-line); color: var(--workbench-text); font-size: 27rpx; font-weight: 600; }
.range-heading > text { flex: 1; min-width: 0; }
.remove-range { color: var(--workbench-warning); font-size: 23rpx; flex-shrink: 0; }
.range-note { display: block; margin: 12rpx 0 20rpx; font-size: 22rpx; line-height: 1.65; }
.range-footnote { display: block; margin-top: 18rpx; font-size: 23rpx; line-height: 1.65; }
.application-map :deep(.map-button) { min-height: 72rpx; padding: 14rpx 18rpx; border-radius: 24rpx; }
.application-map :deep(.map-search .map-input) { height: 76rpx; min-height: 76rpx; font-size: 24rpx; }
.application-map :deep(.map-actions) { gap: 10rpx; }
.application-map :deep(.map-hint) { font-size: 22rpx; }
.application-map :deep(.radius-row) { align-items: center; }
.apply-type-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 20rpx; }
.apply-type { display: flex; align-items: center; justify-content: flex-start; gap: 14rpx; width: 100%; min-width: 0; min-height: 88rpx; margin: 0; padding: 18rpx 10rpx; box-sizing: border-box; border-radius: 0; border-bottom: 1rpx solid var(--workbench-line); background: transparent; color: var(--workbench-text); font-size: 26rpx; line-height: 1.6; text-align: left; }
.apply-type.selected { background: var(--workbench-soft); border-radius: 8rpx; color: var(--workbench-green); }
.apply-type > text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.type-check { display: flex; align-items: center; justify-content: center; width: 26rpx; height: 26rpx; box-sizing: border-box; border: 2rpx solid var(--workbench-muted); border-radius: 5rpx; flex-shrink: 0; }
.selected .type-check { background: #10b981; border-color: #10b981; }
.type-tick { width: 13rpx; height: 8rpx; border-left: 3rpx solid #fff; border-bottom: 3rpx solid #fff; transform: translateY(-2rpx) rotate(-45deg); }
.optional-label { margin-left: 14rpx; color: var(--workbench-muted); font-size: 22rpx; font-weight: 400; }
.notes-count { display: block; margin-top: 6rpx; text-align: right; color: var(--workbench-muted); font-size: 21rpx; }
.application-summary { display: flex; flex-direction: column; gap: 8rpx; padding: 20rpx 24rpx; margin-top: 8rpx; background: var(--workbench-soft); border-radius: 12rpx; }
.summary-title { color: var(--workbench-text); font-size: 26rpx; font-weight: 600; }
.application-summary .recycle-muted { font-size: 22rpx; line-height: 1.65; }
.change-notice { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 28rpx; padding: 18rpx 20rpx; border-left: 4rpx solid var(--workbench-green); background: var(--workbench-soft); }
.setting-label { color: var(--workbench-text); font-size: 27rpx; font-weight: 600; }
.apply-error { display: flex; flex-direction: column; align-items: flex-start; gap: 12rpx; }
.apply-error .recycle-secondary { margin: 0; width: auto; }
.form-submitting { pointer-events: none; opacity: .7; }
@media (min-width: 768px) { .identity-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; } .application-range { padding-left: 24px; padding-right: 24px; } }
</style>
