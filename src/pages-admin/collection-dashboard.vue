<template>
  <view :class="['screen', isLightTheme ? 'light-theme' : 'dark-theme', { 'admin-light-theme': isLightTheme }]">

    <!-- ===== 顶部 panel ===== -->
    <view class="top panel">
      <view class="row">
        <view>
          <view class="title">垃圾清运可视化大屏</view>
          <view class="sub">
            <text class="sub-copy">Tencent Map + 清运路径实时调度</text>
            <text :class="['compact-status', databaseOffline ? 'warn' : statusCls]">{{ compactStatusText }}</text>
          </view>
        </view>
        <AdminScreenHeader
          screen-key="collectionDashboard"
          :tone="isLightTheme ? 'light' : 'dark'"
          @back="goBack"
          @screen-action="handleAdminScreenAction"
        >
          <view class="actions">
            <view class="clock">{{ clockText }}</view>
            <view :class="['status', statusCls]">{{ statusText }}</view>
            <view class="strategy">
              <view
                v-for="s in strategyOptions"
                :key="s.value"
                :class="['strategy-btn', routeStrategy === s.value ? 'active' : '']"
                @tap="onStrategyTap(s.value)"
              >{{ s.label }}</view>
            </view>
            <view
              :class="['btn', 'blue', monitor.active ? 'is-disabled' : '']"
              :aria-disabled="String(monitor.active)"
              @tap="handleRefreshTap"
            >立即刷新</view>
            <view :class="['btn', 'monitor-chip', 'fault-btn', faultCenter.open ? 'active' : '']" @tap="openFaultCenter">
              <text class="feature-icon">⚠</text><text>故障处理</text>
              <text v-if="faultCenter.summary.total" class="fault-badge">{{ faultCenter.summary.total }}</text>
            </view>
            <view :class="['btn', 'monitor-chip', monitor.scene === 'telemetry' ? 'active' : '']" @tap="toggleRiskMonitor">
              <text class="feature-icon">!</text><text>{{ monitor.active && monitor.scene === 'telemetry' ? '退出预警' : '风险预警' }}</text>
            </view>
            <view :class="['btn', 'monitor-chip', monitor.scene === 'dispatch' ? 'active' : '']" @tap="toggleDispatchMonitor">
              <text class="feature-icon">↗</text><text>{{ monitor.active && monitor.scene === 'dispatch' ? '退出监测' : '调度监测' }}</text>
            </view>
          </view>
        </AdminScreenHeader>
      </view>

      <view v-if="databaseOffline" class="database-degraded-banner" role="status">
        <text class="database-degraded-dot"></text>
        <text>{{ DATABASE_OFFLINE_MESSAGE }}</text>
        <text class="database-degraded-detail">部分实时写入暂不可用，数据库恢复后自动解除提示</text>
      </view>

      <!-- 指标卡片 -->
      <view class="cards">
        <CompactMetricCard icon="▦" label="桶位总数" :value="metrics.total" :trend="metricDeltas.total[0]" :tone="isLightTheme ? 'light' : 'dark'" />
        <CompactMetricCard icon="!" label="紧急桶位" :value="metrics.urgent" :trend="metricDeltas.urgent[0]" :tone="isLightTheme ? 'light' : 'dark'" />
        <CompactMetricCard icon="◔" label="平均满载率" :value="metrics.averageStr" :gauge-value="metrics.average" :trend="metricDeltas.average[0]" :tone="isLightTheme ? 'light' : 'dark'" />
        <CompactMetricCard icon="⌁" label="本次路线里程" :value="metrics.distanceStr" :trend="metrics.routeAvailable ? metricDeltas.distance[0] : null" :tone="isLightTheme ? 'light' : 'dark'" />
        <CompactMetricCard icon="◷" label="预计完工时长" :value="metrics.durationStr" :trend="metrics.routeAvailable ? metricDeltas.duration[0] : null" :tone="isLightTheme ? 'light' : 'dark'" />
      </view>
    </view>

    <!-- ===== 风险预警：全部桶位与自选详情 ===== -->
    <view v-show="monitor.active && monitor.scene === 'telemetry'" class="telemetry-scene">
      <view class="panel telemetry-selector">
        <view class="block-title">全部桶位风险 <text class="note">{{ riskMonitorBins.length }} 个点位</text></view>
        <scroll-view class="list" scroll-y>
          <view
            v-for="bin in riskMonitorBins"
            :key="'monitor-risk-' + bin.id"
            :class="['risk-monitor-item', String(monitor.binId) === String(bin.id) ? 'active' : '']"
            @tap="selectRiskMonitorBin(bin.id)"
          >
            <view class="risk-top">
              <view class="name">{{ bin.pointCode || bin.name }}</view>
              <view :class="['chip', bin.alertLevel === 'critical' ? 'red' : bin.alertLevel === 'warning' ? 'orange' : 'green']">{{ bin.alertTitle }}</view>
            </view>
            <view class="subline"><text>{{ bin.pointName || bin.name }}</text><text>桶体 {{ bin.binCode || '--' }}</text></view>
            <view class="subline"><text>当前 {{ bin.fill.toFixed(1) }}%</text><text>120分钟 {{ bin.predicted120.toFixed(1) }}%</text></view>
            <view class="subline"><text>满载概率 {{ bin.probability120.toFixed(1) }}%</text><text>置信度 {{ bin.confidence.toFixed(1) }}%</text></view>
            <view class="risk-mini-track"><view :class="['risk-mini-fill', bin.alertLevel]" :style="{ width: bin.fill + '%' }"></view></view>
            <view class="risk-prediction">{{ bin.fullTimeLabel }}</view>
          </view>
        </scroll-view>
      </view>
      <RiskAlgorithmWorkbench
        :visualization="riskVisualization"
        :selected-id="monitor.binId"
        :horizon="riskHorizon"
        :playing="riskPlaying"
        @select="selectRiskMonitorBin"
        @horizon="setRiskHorizon"
        @toggle-play="toggleRiskPlayback"
      />
    </view>

    <!-- ===== 主体三列 ===== -->
    <view v-if="entryTransitioning" class="panel sorting-entry-loading" role="status">
      <view class="sorting-entry-loading__pulse"></view>
      <view>
        <text class="sorting-entry-loading__title">{{ selectedSortingCenter.name }}</text>
        <text class="sorting-entry-loading__desc">正在载入分拣清洗实时进度…</text>
      </view>
    </view>

    <view v-show="!entryTransitioning && !(monitor.active && (monitor.scene === 'telemetry' || monitor.scene === 'sorting'))" class="main">

      <!-- 左列 -->
      <view class="col left">
        <view class="panel block">
          <view class="block-title">风险桶位排行 <text class="note">高负载 > 临界 > 正常</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!riskBins.length" class="empty">暂无桶位数据</view>
            <view
              v-for="(bin, index) in riskBins"
              :key="'risk-' + bin.id"
              :class="['risk', selectedBinId === String(bin.id) ? 'active' : '']"
              @tap="focusBin(bin.id)"
            >
              <view class="risk-top">
                <view class="rank">{{ index + 1 }}</view>
                <view class="name">{{ bin.pointCode || bin.name }}</view>
                <view :class="['chip', sev(bin.currentFill)]">{{ sevLabel(bin.currentFill) }}</view>
              </view>
              <view class="subline">
                <text>{{ bin.pointName || bin.name }}</text>
                <text>桶体 {{ bin.binCode || '--' }}</text>
              </view>
              <view class="subline">
                <text>满载率 {{ clampFill(bin.currentFill).toFixed(1) }}%</text>
                <text>{{ countdownToFull(bin.hoursToFull) }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="panel block">
          <view class="block-title">2小时风险预测 <text class="note">Top 6</text></view>
          <view class="bars">
            <view v-if="!forecastBins.length" class="empty" style="flex:1">暂无预测数据</view>
            <view v-for="bin in forecastBins" :key="'bar-' + bin.id" class="bar">
              <view class="bar-shell">
                <view
                  :class="['bar-fill', bin.predictedFillInHorizon >= 85 ? 'alert' : '']"
                  :style="{ height: clamp(bin.predictedFillInHorizon, 0, 100).toFixed(1) + '%' }"
                ></view>
              </view>
              <text class="bar-val">{{ clamp(bin.predictedFillInHorizon, 0, 100).toFixed(1) }}%</text>
              <text class="bar-name">{{ bin.pointCode || String(bin.name || '').slice(0, 5) || '点位' }}</text>
            </view>
          </view>
        </view>

        <view class="panel block slot-status-panel">
          <view class="block-title">点位状态 <text class="note">点位 / 当前桶体</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!pointStatusRows.length" class="empty">暂无点位状态</view>
            <view v-for="row in pointStatusRows" :key="'slot-' + row.id" :class="['slot-row', row.stateCls]">
              <view class="slot-row-top">
                <text class="slot-code">{{ row.pointCode }}</text>
                <text class="slot-state">{{ row.slotStateLabel }}</text>
              </view>
              <view class="slot-row-sub"><text>{{ row.pointName }}</text><text>桶体 {{ row.hasBin ? row.binCode : '--' }}</text></view>
              <view class="slot-row-sub"><text>{{ row.taskLabel }}</text></view>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- 中列（地图 + 时间轴） -->
      <view class="col center">
        <view class="panel map-wrap">
          <!-- #ifdef H5 -->
          <view class="map-stage">
            <view id="map" :class="{ 'is-ready': h5MapReady }"></view>
            <view v-if="!h5MapReady" class="map-placeholder">
              <text class="map-placeholder-title">{{ h5MapError ? '地图暂不可用' : '地图加载中' }}</text>
              <text class="map-placeholder-desc">
                {{ h5MapError || (h5MapLoading ? '清运数据会先展示，地图初始化完成后自动出现。' : '正在准备地图画布。') }}
              </text>
            </view>
          </view>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <map
            class="mp-map"
            :latitude="mapCenter.latitude"
            :longitude="mapCenter.longitude"
            :scale="mapScale"
            :markers="mapMarkers"
            :polyline="mapPolyline"
            show-location
            @markertap="onMarkerTap"
          ></map>
          <!-- #endif -->
          <view class="brief">
            <text class="brief-title">{{ monitor.scene === 'sorting' ? '分拣中心进度' : monitor.active ? '智能调度监测' : '路线概览' }}</text>
            <text v-for="(line, i) in (monitor.active ? monitor.mapBrief : briefLines)" :key="i" class="brief-line">{{ line }}</text>
          </view>
          <view v-if="monitor.active && monitor.scene === 'dispatch'" class="btn ghost reset-view-btn" @tap="resetDispatchView">重置视野</view>
          <view v-if="monitor.active && monitor.scene === 'dispatch' && monitor.routeAvailable" :class="['monitor-point-state', monitor.pointStateCls]">
            <text class="point-state-label">原点位状态</text>
            <text class="point-state-value">{{ monitor.pointState }}</text>
            <text v-if="DISPATCH_STAGE_RANK[monitor.pointState] < 3" class="point-state-reason">满载 / 低电量</text>
          </view>
        </view>

        <view class="panel timeline">
          <view class="block-title">{{ monitor.scene === 'sorting' ? '分拣清洗时间轴' : monitor.active ? '返航补位时间轴' : '清运时间轴' }} <text class="note">{{ monitor.scene === 'sorting' ? '返航桶处理进度' : monitor.active ? '双任务协同执行' : '按停靠顺序展示 ETA' }}</text></view>
          <view v-if="monitor.active" class="monitor-timeline">
            <view v-for="item in monitor.timeline" :key="item.key" :class="['monitor-tl-step', item.state]">
              <text class="monitor-tl-dot"></text><text>{{ item.label }}</text>
            </view>
          </view>
          <scroll-view class="line" scroll-x>
            <view v-if="monitor.active"></view>
            <view v-else-if="!timelineStops.length" class="tl-empty">暂无路线时间轴</view>
            <view
              v-if="!monitor.active"
              v-for="stop in timelineStops"
              :key="'tl-' + stop.order"
              :class="['stop', selectedStopOrder === stop.order ? 'active' : '']"
              @tap="focusStop(stop.order)"
            >
              <text class="stop-o">#{{ stop.order }}</text>
              <text class="stop-n">{{ displayTaskType(stop.name) }}</text>
              <text class="stop-t">ETA {{ fmtTime(stop.eta) }}</text>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- 右列 -->
      <view class="col right">
        <view v-if="monitor.active" class="panel block monitor-task-panel">
          <view class="block-title">{{ monitor.scene === 'sorting' ? '分拣中心任务' : '平台任务流' }} <text class="note">{{ monitor.scene === 'sorting' ? '清洗与备用池' : '3 组并发调度' }}</text></view>
          <scroll-view class="task-flow" scroll-y>
            <view
              v-for="task in monitor.tasks"
              :key="task.id"
              :class="['monitor-task', task.state, { 'is-focused': task.caseId === monitor.activeDispatchCaseId }]"
              @tap="focusDispatchCase(task.caseId)"
            >
              <view class="task-top"><text>{{ task.title }}</text><text class="task-chip">{{ task.status }}</text></view>
              <view class="task-route">{{ task.route }}</view>
              <view class="metric-track"><view class="metric-progress" :class="task.kind" :style="{ width: task.progress + '%' }"></view></view>
              <view class="task-meta"><text>{{ task.device }}</text><text>{{ task.progress.toFixed(0) }}%</text></view>
            </view>
          </scroll-view>
        </view>
        <view v-else :class="['panel', 'block', 'alert-panel', { 'is-empty-state': !alertBins.length }]">
          <view class="block-title">实时告警流 <text class="note">单车处置闭环</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!alertBins.length" class="empty">当前无告警</view>
            <view
              v-for="bin in alertBins"
              :key="'alert-' + bin.id"
              :class="['alert', selectedBinId === String(bin.id) ? 'active' : '']"
              @tap="focusBin(bin.id)"
            >
              <view class="alert-top">
                <text>{{ bin.name }}</text>
                <text :class="['state-chip', handlingByBin.get(String(bin.id)) || 'pending']">
                  {{ handlingLabel(handlingByBin.get(String(bin.id)) || 'pending') }}
                </text>
              </view>
              <view class="alert-sub">
                <text>当前 {{ clampFill(bin.currentFill).toFixed(1) }}%</text>
                <text>预测 {{ n(bin.predictedFillInHorizon, 0).toFixed(1) }}%</text>
              </view>
              <view class="alert-sub">
                <text>{{ countdownToFull(bin.hoursToFull) }}</text>
                <text>{{ sevLabel(bin.currentFill) }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <view v-if="monitor.active" class="panel block monitor-event-panel">
          <view class="block-title">{{ monitor.scene === 'sorting' ? '桶体队列' : '处置事件' }} <text class="note">实时同步</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="monitor.scene === 'sorting'" v-for="event in monitor.sortingQueue" :key="event.id" class="monitor-event">
              <text class="event-time">{{ displayOperationalState(event.state) }}</text>
              <view><text class="event-title">{{ event.title }}</text><text class="event-desc">{{ event.desc }}</text></view>
            </view>
            <view v-if="monitor.scene !== 'sorting'" v-for="event in monitor.events" :key="event.id" class="monitor-event">
              <text class="event-time">{{ event.time }}</text>
              <view><text class="event-title">{{ event.title }}</text><text class="event-desc">{{ event.desc }}</text></view>
            </view>
          </scroll-view>
        </view>
        <view v-else class="panel block dispatch-panel">
          <view class="block-title">车辆调度明细 <text class="note">仅 1 辆清运车</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!dispatchStops.length" class="empty">暂无调度任务</view>
            <view
              v-for="stop in dispatchStops"
              :key="'dispatch-' + stop.order"
              :class="['dispatch', selectedStopOrder === stop.order ? 'active' : '']"
              @tap="focusStop(stop.order)"
            >
              <view class="dispatch-top">
                <text>#{{ stop.order }} {{ displayTaskType(stop.name) }}</text>
                <text>{{ fmtTime(stop.eta) }}</text>
              </view>
              <view class="dispatch-sub">
                <text>满载率 {{ n(stop.currentFill, 0).toFixed(1) }}%</text>
                <view v-if="stop.navUrl" class="nav-btn" @tap.stop="openNav(stop.navUrl)">导航</view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>

    </view><!-- end .main -->

    <view v-show="monitor.active && monitor.scene === 'sorting'" class="sorting-scene">
      <view class="panel sorting-hero">
        <view class="sorting-head">
          <view>
            <view class="telemetry-title">{{ selectedSortingCenter.name }}</view>
            <view class="telemetry-location"><text class="live-dot"></text>分拣清洗实时进度 · 返航桶 {{ monitor.returnBinCode }} · 当前点位 {{ monitor.pointCode }}</view>
          </view>
          <view class="sorting-actions">
            <view class="btn ghost" @tap="backToDispatchMonitor">返回调度监测</view>
            <view class="btn blue" @tap="exitMonitor">退出监测</view>
          </view>
        </view>
        <view class="sorting-body">
          <view class="sorting-twin">
            <view class="twin-toolbar">
              <view>
                <text class="twin-title">分拣中心数字孪生</text>
                <text class="twin-sub">设备与作业分区实时映射</text>
              </view>
              <view class="twin-toolbar-status">
                <view class="twin-state-tabs">
                  <text :class="{ active: sortingVisualState.key === 'intake' }" @tap="jumpToSortingVisualStage('intake')">入站</text>
                  <text :class="{ active: sortingVisualState.key === 'washing' }" @tap="jumpToSortingVisualStage('washing')">清洗</text>
                  <text :class="{ active: sortingVisualState.key === 'inspection' }" @tap="jumpToSortingVisualStage('inspection')">质检</text>
                </view>
                <view class="twin-online"><text></text>{{ sortingVisualState.label }}</view>
              </view>
            </view>
            <view class="twin-canvas">
              <image v-show="!sortingStageVideoActive" webp :class="['twin-image', { active: sortingVisualState.key === 'intake' }]" :src="sortingCenterAssets.intake" mode="aspectFit"></image>
              <image v-show="!sortingStageVideoActive" webp :class="['twin-image', { active: sortingVisualState.key === 'washing' }]" :src="sortingCenterAssets.washing" mode="aspectFit"></image>
              <image v-show="!sortingStageVideoActive" webp :class="['twin-image', { active: sortingVisualState.key === 'inspection' }]" :src="sortingCenterAssets.inspection" mode="aspectFit"></image>
              <view v-if="monitor.active" :class="['sorting-stage-video-layer', { active: sortingStageVideoActive }]">
                <image class="sorting-stage-video-backdrop" :src="CENTER_WORKFLOW_MASTER_VIDEO.poster" mode="aspectFill"></image>
                <video
                  ref="sortingMasterVideoRef"
                  class="sorting-stage-video active"
                  :src="CENTER_WORKFLOW_MASTER_VIDEO.file"
                  :poster="CENTER_WORKFLOW_MASTER_VIDEO.poster"
                  :muted="true"
                  :controls="false"
                  :loop="false"
                  :playback-rate="CENTER_WORKFLOW_MASTER_VIDEO.playbackRate"
                  :show-center-play-btn="false"
                  :show-play-btn="false"
                  :show-fullscreen-btn="false"
                  :enable-progress-gesture="false"
                  object-fit="contain"
                  preload="auto"
                  playsinline
                  webkit-playsinline
                  @loadedmetadata="handleSortingMasterVideoReady"
                  @canplay="handleSortingMasterVideoReady"
                  @ended="handleSortingMasterVideoEnded"
                  @error="handleSortingMasterVideoError"
                ></video>
                <view class="sorting-video-tone"></view>
                <view class="sorting-video-info top-left"><text class="small-text">{{ monitor.sortingStageText }}</text><text class="b-text">{{ monitor.returnBinCode }}</text><text>当前设备</text></view>
                <view class="sorting-video-info bottom-right"><text class="small-text">设备状态</text><text class="b-text">{{ sortingDeviceStatus }}</text><text>阶段进度 {{ sortingOperation.progress.toFixed(0) }}%</text></view>
              </view>
              <view v-show="!sortingStageVideoActive" :class="['operation-layer', 'stage-' + sortingOperation.key]">
                <view class="weigh-operation">
                  <view class="weigh-deck"></view>
                  <text>{{ sortingOperation.key === 'weigh' ? n(monitor.weight, 0).toFixed(1) + ' kg' : 'RFID 识别' }}</text>
                </view>
                <view class="wash-operation"><text></text><text></text><text></text></view>
                <view class="dry-operation"><view></view><text>热风烘干</text></view>
                <view class="charge-operation"><view></view><text>补能充电</text></view>
                <view class="check-operation"><view></view><text>电量 {{ n(monitor.battery, 0).toFixed(0) }}%</text></view>
                <view class="pool-operation"><text>入库</text><view></view></view>
                <view class="workpiece" :style="sortingWorkpieceStyle">
                  <view class="workpiece-bin"><text></text><text></text></view>
                  <text class="b-text">{{ monitor.returnBinCode }}</text>
                </view>
              </view>
              <view v-show="!sortingStageVideoActive" :class="['zone-tag', 'zone-weigh', { active: monitor.sortingStageText.includes('抵达') || monitor.sortingStageText.includes('称重') }]">
                <text class="zone-pulse"></text><text>卸载称重区</text>
              </view>
              <view v-show="!sortingStageVideoActive" :class="['zone-tag', 'zone-wash', { active: monitor.sortingStageText.includes('清洗') || monitor.sortingStageText.includes('烘干') }]">
                <text class="zone-pulse"></text><text>清洗消毒线</text>
              </view>
              <view v-show="!sortingStageVideoActive" :class="['zone-tag', 'zone-check', { active: monitor.sortingStageText.includes('充电') || monitor.sortingStageText.includes('检测') }]">
                <text class="zone-pulse"></text><text>电检质检区</text>
              </view>
              <view v-show="!sortingStageVideoActive" :class="['zone-tag', 'zone-pool', { active: monitor.sortingStageText.includes('投放') }]">
                <text class="zone-pulse"></text><text>备用池</text>
              </view>
              <view class="twin-flow">
                <text>作业进度</text>
                <view class="flow-line">
                  <view class="flow-progress" :style="{ width: monitor.sortingProgress + '%' }"></view>
                  <text class="flow-dot" :style="{ left: 'calc(' + monitor.sortingProgress + '% - 4px)' }"></text>
                </view>
                <text class="b-text">{{ monitor.sortingStageText }} · {{ sortingOperation.progress.toFixed(0) }}%</text>
              </view>
            </view>
          </view>

          <view class="sorting-rail">
            <view class="sorting-summary">
              <view class="waiting"><text>待分拣</text><text class="b-text">{{ monitor.sortingSummary.waiting }}</text></view>
              <view class="cleaning"><text>清洗中</text><text class="b-text">{{ monitor.sortingSummary.cleaning }}</text></view>
              <view class="ready"><text>已清洁待命</text><text class="b-text">{{ monitor.sortingSummary.ready }}</text></view>
              <view class="blocked"><text>异常滞留</text><text class="b-text">{{ monitor.sortingSummary.blocked }}</text></view>
            </view>

            <view class="sorting-progress">
              <view class="block-title">返航桶清洗状态 <text class="note">{{ monitor.returnBinCode }}</text></view>
              <view class="sorting-line">
                <view v-for="(item, index) in monitor.sortingTimeline" :key="item.key" :class="['sorting-step', item.state, 'clickable']" @tap="jumpToSortingStage(item)">
                  <view class="sorting-step-node"><text>{{ index + 1 }}</text></view>
                  <text class="sorting-step-label">{{ item.label }}</text>
                </view>
              </view>
              <view class="sorting-card active">
                <view class="task-top"><text>{{ monitor.returnBinCode }} · {{ monitor.sortingStageText }}</text><text class="task-chip">{{ monitor.sortingStatus }}</text></view>
                <view class="stage-detail">当前进度由分拣中心设备状态实时推演</view>
                <view class="sorting-progress-row"><view class="metric-track"><view class="metric-progress replace" :style="{ width: monitor.sortingProgress + '%' }"></view></view><text class="b-text">{{ monitor.sortingProgress.toFixed(0) }}%</text></view>
              </view>
            </view>

            <view class="sorting-queue">
              <view class="block-title">桶体队列 <text class="note">备用池同步</text></view>
              <scroll-view class="list" scroll-y>
                <view v-for="item in monitor.sortingQueue" :key="'sort-q-' + item.id" :class="['sorting-card', item.kind]">
                  <view class="queue-copy">
                    <view class="task-top"><text>{{ item.title }}</text><text class="task-chip">{{ displayOperationalState(item.state) }}</text></view>
                    <view class="task-route">{{ item.desc }}</view>
                  </view>
                  <view class="queue-arrow"></view>
                </view>
              </scroll-view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="faultCenter.open" class="fault-mask" @tap="closeFaultCenter">
      <view class="panel fault-drawer" @tap.stop>
        <view class="fault-drawer-head">
          <view>
            <view class="fault-drawer-title">故障处理中心</view>
            <view class="fault-drawer-sub">设备执行结果、移动桶返航与分拣中心异常统一处置</view>
          </view>
          <view class="btn ghost" @tap="closeFaultCenter">关闭</view>
        </view>
        <view class="fault-summary">
          <view><text>故障总数</text><text class="b-text">{{ faultCenter.summary.total }}</text></view>
          <view><text>待确认</text><text class="b-text">{{ faultCenter.summary.open }}</text></view>
          <view><text>处理中</text><text class="b-text">{{ faultCenter.summary.processing }}</text></view>
          <view><text>已关闭</text><text class="b-text">{{ faultCenter.summary.resolved }}</text></view>
        </view>
        <scroll-view class="fault-list" scroll-y>
          <view v-if="faultCenter.loading" class="empty">正在同步故障事件...</view>
          <view v-else-if="!faultCenter.items.length" class="empty">当前没有故障事件</view>
          <view v-for="fault in faultCenter.items" :key="fault.id" :class="['fault-card', fault.severity, fault.status]">
            <view class="fault-card-top">
              <view><text :class="['fault-level', fault.severity]">{{ faultSeverityLabel(fault.severity) }}</text><text class="fault-title">{{ fault.title }}</text></view>
              <text class="fault-status">{{ faultStatusLabel(fault.status) }}</text>
            </view>
            <view class="fault-device">{{ fault.deviceName }} · {{ faultComponentLabel(fault.component) }}</view>
            <view class="fault-message">{{ fault.message }}</view>
            <view class="fault-recommend">建议：{{ fault.recommendedAction }}</view>
            <view class="fault-meta"><text>{{ fault.locationName || '位置未上报' }}</text><text>{{ fmtTime(fault.createdAt, true) }}</text></view>
            <view v-if="fault.status !== 'resolved'" class="fault-actions">
              <view v-if="fault.status === 'open'" class="fault-action" @tap="handleFault(fault, 'acknowledge')">确认告警</view>
              <view class="fault-action return" @tap="handleFault(fault, fault.code === 'sorting_center_fault' ? 'switch_sorting_center' : 'dispatch_return')">{{ fault.code === 'sorting_center_fault' ? '切换备用中心' : '派发安全返航' }}</view>
              <view class="fault-action manual" @tap="handleFault(fault, 'manual_service')">转人工检修</view>
              <view class="fault-action resolve" @tap="handleFault(fault, 'resolve')">关闭事件</view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

  </view><!-- end .screen -->
</template>

<script setup>
import {
  ZHONGSHAN_PARK_POINT_NAMES,
  n,
  clamp,
  clampFill,
  pointCode,
  defaultBinCode,
  zhongshanParkPointName,
  withPointIdentity,
  applyDashboardBinNames,
  sev,
  sevRank,
  sevLabel,
  countdownToFull,
  fmtTime,
  fmtKm,
  fmtMin,
  normalizeStrategy,
  strategyLabel,
  handlingLabel,
  getStorage,
  setStorage,
  seededRatio,
  slotStateClass,
  displaySlotState,
  displayTaskType,
  displayOperationalState,
  displayTaskLabel,
  interpolatePoint,
  pointAlongRoute,
  decodeEntryParam
} from './collection-dashboard/format.js'
import { useSortingWorkflow } from './collection-dashboard/sorting-workflow.js'
import { createCollectionMapRenderer } from './collection-dashboard/map-renderer.js'
import { createCollectionKpiHistory } from './collection-dashboard/kpi-history.js'

import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { baseUrl } from '@/api/settings'
import {
  DATABASE_OFFLINE_MESSAGE,
  getDatabaseStatus,
  subscribeDatabaseStatus,
  updateDatabaseStatusFromAvailability
} from '@/api/database-status.mjs'
import { isDatabaseHealthEndpoint } from '@/api/request-utils.mjs'
import { digitalTwinWebpAssetUrl } from '@/utils/digital-twin-assets.js'
import { mapConfig } from '@/api/map-config'
import { CENTER_WORKFLOW_MASTER_VIDEO } from '@/pages-admin/config/center-workflow-video.js'
import { describeApiFailure, redirectIfAccessDenied } from '@/utils/access-guard.js'
import { ensureAdminScreenAccess, jumpToAdminPage } from '@/utils/admin-page-nav'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import AdminScreenHeader from '@/components/AdminScreenHeader.vue'
import CompactMetricCard from '@/components/dashboard/CompactMetricCard.vue'
import RiskAlgorithmWorkbench from '@/pages-admin/components/collection/RiskAlgorithmWorkbench.vue'
import '@/pages-admin/styles/admin-light-theme.css'

const databaseStatusRuntime = Object.freeze({
  getStorageSync: key => uni.getStorageSync(key),
  setStorageSync: (key, value) => uni.setStorageSync(key, value),
  removeStorageSync: key => uni.removeStorageSync(key),
  showToast: options => uni.showToast(options)
})

// ─── 常量 ─────────────────────────────────────────────
const QQ_MAP_KEYS = [mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].filter(Boolean)
const sortingCenterAssets = Object.freeze({
  intake: digitalTwinWebpAssetUrl('sorting-center/facility-intake.webp', 'sorting-center/facility-intake.png'),
  washing: digitalTwinWebpAssetUrl('sorting-center/facility-washing.webp', 'sorting-center/facility-washing.png'),
  inspection: digitalTwinWebpAssetUrl('sorting-center/facility-inspection.webp', 'sorting-center/facility-inspection.png')
})
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 }



// ─── 工具函数 ──────────────────────────────────────────


// ─── 响应式状态 ────────────────────────────────────────
const clockText = ref('--:--:--')
const statusText = ref('准备就绪')
const statusCls = ref('')
const databaseOffline = ref(getDatabaseStatus(databaseStatusRuntime).offline)
const compactStatusText = computed(() => {
  if (databaseOffline.value) return '数据库离线'
  const text = String(statusText.value || '')
  if (statusCls.value === 'err') return '刷新失败'
  if (statusCls.value === 'warn') return text.includes('监测') ? '监测中' : '处理中'
  if (text.includes('准备')) return '已就绪'
  return '已刷新'
})
const isLightTheme = ref(getStorage('app_theme') !== 'dark')
function syncThemeMode() {
  const mode = applyStoredTheme()
  isLightTheme.value = mode === 'light'
}

const strategyOptions = [
  { label: '最短距离', value: 'shortest_distance' },
  { label: '最短时间', value: 'shortest_time' }
]
const routeStrategy = ref(normalizeStrategy(getStorage('collection_route_strategy')))

const metrics = ref({ total: 0, urgent: 0, average: 0, averageStr: '0%', distanceStr: '待规划', durationStr: '待规划', routePlanning: false, routeAvailable: false })
const metricDeltas = ref({ total: [], urgent: [], average: [], distance: [], duration: [] })
const briefLines = ref(['等待数据...'])

const riskBins = ref([])
const forecastBins = ref([])
const alertBins = ref([])
const dispatchStops = ref([])
const timelineStops = ref([])
const pointStatusRows = ref([])
const selectedBinId = ref(null)
const selectedStopOrder = ref(null)
const handlingByBin = ref(new Map())
const riskVisualization = ref({ nodes: [], edges: [], model: {}, thresholds: {} })
const riskHorizon = ref(0)
const riskPlaying = ref(true)

// 地图（小程序端用 <map> 组件）
const mapCenter = ref({ ...DEFAULT_CENTER })
const mapScale = ref(12)
const mapMarkers = ref([])
const mapPolyline = ref([])
const h5MapReady = ref(false)
const h5MapLoading = ref(false)
const h5MapError = ref('')

const selectedSortingCenter = reactive({
  id: 'center-main',
  name: '中山公园分拣中心'
})
const entryTransitioning = ref(false)
const pendingEntry = reactive({
  panel: '',
  view: '',
  centerId: '',
  centerName: ''
})



const monitor = reactive({
  active: false,
  completed: false,
  scene: '',
  previousScene: '',
  riskBins: [],
  binId: null,
  pointCode: 'P005',
  pointName: '樱花大道南段',
  returnBinCode: 'B-M05',
  replacementBinCode: 'B-S03',
  binName: '智能移动桶',
  locationText: '--',
  fill: 72,
  weight: 41,
  weightDelta: 0,
  battery: 31,
  batteryHours: 5.2,
  growth: 4.2,
  fullMinutes: 40,
  fullClock: '--:--',
  alertLevel: 'normal',
  alertTitle: '运行状态正常',
  alertDescription: '遥测数据持续采集中',
  trend: [],
  pointState: '异常告警',
  pointStateCls: 'danger',
  mapBrief: [],
  timeline: [],
  tasks: [],
  events: [],
  dispatchCases: [],
  activeDispatchCaseId: '',
  returnProgress: 0,
  replaceProgress: 0,
  returnPosition: null,
  replacePosition: null,
  sortingCenter: null,
  standbyArea: null,
  targetPoint: null,
  returnRoute: [],
  replaceRoute: [],
  routeAvailable: false,
  sortingProgress: 0,
  sortingStatus: '待接收',
  sortingStageText: '等待返航桶抵达分拣中心',
  sortingTimeline: [],
  sortingQueue: [],
  sortingSummary: { waiting: 1, cleaning: 0, ready: 2, blocked: 0 }
})
const riskMonitorBins = computed(() => monitor.riskBins)
const {
  sortingVisualState,
  SORTING_WORKFLOW_TOTAL_MS,
  masterCueMs,
  SORTING_OPERATION_STEPS,
  sortingOperation,
  sortingWorkpieceStyle,
  sortingMasterVideoRef,
  sortingMasterVideoReady,
  sortingMasterVideoFailed,
  sortingManualPlaybackActive,
  sortingAutomaticPlaybackActive,
  sortingMasterTimelineSeconds,
  sortingWorkflowStarted,
  sortingStageVideoActive,
  sortingDeviceStatus,
  sortingMasterVideoElement,
  pauseSortingMasterVideo,
  seekSortingMasterVideo,
  playSortingMasterVideo,
  syncSortingMasterVideo,
  handleSortingMasterVideoReady,
  handleSortingMasterVideoEnded,
  handleSortingMasterVideoError
} = useSortingWorkflow({ monitor })
const faultCenter = reactive({
  open: false,
  loading: false,
  items: [],
  summary: { total: 0, open: 0, processing: 0, critical: 0, resolved: 0 }
})

// 内部 state（不需要响应式）
const _state = {
  bins: [],
  points: [],
  tasks: [],
  runtime: null,
  plan: null,
  startPoint: null,
  manualStartPoint: null,
  loading: false,
  routePlanning: false,
  mapInstance: null,       // H5 TMap 实例
  mapReady: false,
  iconCache: new Map(),
  lastMapSignature: '',
  infoWindow: null,
  binMarkers: null,
  routePolyline: null,
  sequenceMarkers: null,
  startMarker: null,
  focusPolyline: null,
  monitorMarkers: null,
  monitorPolyline: null,
  kpiSeries: [],
  monitorBackup: null,
  shouldFitMap: false
}
let routePlanRevision = 0
let routePlanController = null
let dashboardActive = false
let dashboardMountRevision = 0
const ROUTE_PLAN_TIMEOUT_MS = 30000

function cancelRoutePlan() {
  if (routePlanController && typeof routePlanController.abort === 'function') {
    try { routePlanController.abort() } catch (_) {}
  }
  routePlanController = null
  if (_state.routePlanning) {
    _state.routePlanning = false
    if (dashboardActive) renderMetrics()
  }
}

function createAbortController() {
  return typeof AbortController === 'function' ? new AbortController() : null
}





// ─── KPI 历史 ──────────────────────────────────────────
const { loadKpiSeries, saveKpiSeries, pushKpi, nearestKpi, deltaTag } = createCollectionKpiHistory({ _state })

// ─── 数据排序 ──────────────────────────────────────────
function sortedRiskBins() {
  return (_state.bins || []).slice().sort((a, b) =>
    sevRank(clampFill(b.currentFill)) - sevRank(clampFill(a.currentFill)) ||
    n(b.priorityScore, 0) - n(a.priorityScore, 0) ||
    n(a.hoursToFull, Infinity) - n(b.hoursToFull, Infinity) ||
    String(a.id).localeCompare(String(b.id))
  )
}
function sortedAlertBins() {
  return sortedRiskBins().filter(item => clampFill(item.currentFill) >= 65).slice(0, 8)
}
function buildHandlingMap(alertBinsArr, routeStops) {
  const map = new Map()
  const route = Array.isArray(routeStops) ? routeStops : []
  const indexed = new Map(route.map(s => [String(s.id), s]))
  const now = Date.now()
  let processingId = null
  const etaSorted = route.slice().sort((a, b) => new Date(a.eta) - new Date(b.eta))
  for (const stop of etaSorted) {
    const eta = new Date(stop.eta).getTime()
    const etd = new Date(stop.etd || stop.eta).getTime()
    if (now >= eta - 5 * 60 * 1000 && now <= etd + 5 * 60 * 1000) { processingId = String(stop.id); break }
  }
  if (!processingId && etaSorted.length) processingId = String(etaSorted[0].id)
  alertBinsArr.forEach(bin => {
    const id = String(bin.id)
    if (processingId && id === processingId) map.set(id, 'processing')
    else if (indexed.has(id)) map.set(id, 'dispatched')
    else map.set(id, 'pending')
  })
  return map
}

// ─── 渲染（更新响应式数据）─────────────────────────────
function renderMetrics() {
  const bins = _state.bins || []
  const route = _state.plan && _state.plan.route
  const routePlanning = _state.routePlanning && !route
  const m = {
    total: bins.length,
    urgent: bins.filter(b => b.isUrgent).length,
    average: bins.length ? bins.reduce((s, b) => s + n(b.currentFill, 0), 0) / bins.length : 0,
    distance: route ? n(route.totalDistanceKm, 0) : 0,
    duration: route ? n(route.totalMinutes, 0) : 0
  }
  metrics.value = {
    total: m.total,
    urgent: m.urgent,
    average: m.average,
    averageStr: `${m.average.toFixed(1)}%`,
    distanceStr: routePlanning ? '规划中' : route ? `${m.distance.toFixed(2)} km` : '待规划',
    durationStr: routePlanning ? '规划中' : route ? `${m.duration.toFixed(1)} min` : '待规划',
    routePlanning,
    routeAvailable: Boolean(route)
  }
  const day = nearestKpi(24, m, 'day')
  metricDeltas.value = {
    total: [deltaTag('较昨日', m.total, day.total, '', false)],
    urgent: [deltaTag('较昨日', m.urgent, day.urgent, '', true)],
    average: [deltaTag('较昨日', m.average, day.average, '%', true)],
    distance: [deltaTag('较昨日', m.distance, day.distance, 'km', true)],
    duration: [deltaTag('较昨日', m.duration, day.duration, 'min', true)]
  }
  if (!monitor.active && !routePlanning) pushKpi(m)
}

function renderBrief() {
  const route = _state.plan && _state.plan.route
  if (!route) {
    briefLines.value = [_state.routePlanning ? '清运数据已加载，正在后台规划路线…' : '尚未生成路线']
    return
  }
  const start = (_state.plan && _state.plan.start) || _state.startPoint || DEFAULT_CENTER
  briefLines.value = [
    `策略：${strategyLabel(routeStrategy.value)} | 车辆：1 台`,
    `起点：${start.name || '清运起点'} | 停靠：${route.stops.length} 个`,
    `总里程：${fmtKm(route.totalDistanceKm)} | 总耗时：${fmtMin(route.totalMinutes)}`,
    `开始：${fmtTime(route.startTime)} | 结束：${fmtTime(route.endTime)}`
  ]
}











function buildPointStatusRows() {
  if (Array.isArray(_state.points) && _state.points.length) {
    return _state.points.map((point, index) => {
      const bin = (_state.bins || []).find(item => String(item.id) === String(point.currentDeviceId))
      const activeTask = (_state.tasks || []).find(task =>
        String(task.pointId || '') === String(point.id) &&
        ['pending', 'dispatched', 'running'].includes(task.status)
      )
      const slotState = point.state || (bin ? 'available' : 'vacant')
      return {
        id: point.id || index,
        pointCode: point.pointCode || `P${String(index + 1).padStart(3, '0')}`,
        pointName: point.name || point.pointCode,
        binCode: bin ? (bin.binCode || bin.name) : '--',
        hasBin: Boolean(point.currentDeviceId),
        slotState,
        slotStateLabel: displaySlotState(slotState),
        taskLabel: activeTask ? displayTaskLabel(activeTask.type, activeTask.status) : '监测中',
        stateCls: slotStateClass(slotState) || 'available'
      }
    })
  }
  return (_state.bins || []).map((bin, index) => {
    const row = withPointIdentity(bin, index)
    const slotState = row.slotState || (row.hasBin ? 'available' : 'vacant')
    return {
      id: row.id,
      pointCode: row.pointCode,
      pointName: row.pointName,
      binCode: row.binCode,
      hasBin: row.hasBin,
        slotState,
        slotStateLabel: displaySlotState(slotState),
        taskLabel: row.taskType || row.taskStatus
          ? displayTaskLabel(row.taskType, row.taskStatus)
          : displayTaskLabel(row.taskLabel),
      stateCls: slotStateClass(slotState)
    }
  })
}
function renderLists() {
  const risk = sortedRiskBins().slice(0, 8)
  riskBins.value = risk

  const seenForecastLandmarks = new Set()
  const forecast = (_state.bins || []).slice()
    .sort((a, b) => n(b.predictedFillInHorizon, 0) - n(a.predictedFillInHorizon, 0))
    .filter((bin) => {
      const name = String(bin.pointName || bin.name || '')
      const landmark = name.includes('樱花大道') ? '樱花大道' : String(bin.pointCode || name)
      if (seenForecastLandmarks.has(landmark)) return false
      seenForecastLandmarks.add(landmark)
      return true
    })
    .slice(0, 6)
  forecastBins.value = forecast

  const alerts = sortedAlertBins()
  alertBins.value = alerts

  const route = _state.plan && _state.plan.route
  const taskStops = (_state.tasks || [])
    .filter(task => ['pending', 'dispatched', 'running'].includes(task.status))
    .map((task, index) => {
      const point = (_state.points || []).find(item => String(item.id) === String(task.pointId))
      const device = (_state.bins || []).find(item => String(item.id) === String(task.deviceId))
      const source = point || device || {}
      if (!Number.isFinite(n(source.latitude, NaN)) || !Number.isFinite(n(source.longitude, NaN))) return null
      return {
        id: task.deviceId || task.id,
        order: index + 1,
        name: task.type,
        pointName: source.name || source.pointCode || task.taskNo,
        latitude: n(source.latitude, 0),
        longitude: n(source.longitude, 0),
        eta: task.startedAt || task.createdAt || new Date().toISOString(),
        etd: task.completedAt || task.updatedAt || task.createdAt || new Date().toISOString(),
        priorityScore: n(task.priority, 0) * 10,
        currentFill: device ? n(device.currentFill, device.currentFillRate || 0) : 0,
        taskStatus: task.status
      }
    })
    .filter(Boolean)
  const stops = taskStops.length ? taskStops : (route && Array.isArray(route.stops) ? route.stops : [])
  dispatchStops.value = stops
  timelineStops.value = stops.slice(0, 12)

  handlingByBin.value = buildHandlingMap(alerts, stops)
  pointStatusRows.value = buildPointStatusRows()
}

function renderAll() {
  renderMetrics()
  renderBrief()
  renderLists()
  // #ifdef H5
  if (_state.mapReady) drawMap(false)
  // #endif
  // #ifndef H5
  buildMpMapData()
  // #endif
}

// ─── 小程序端地图数据 ──────────────────────────────────
const {
  buildMpMapData,
  markerSvg,
  iconSrc,
  mapSignature,
  clearH5Map,
  showInfoWindow,
  drawMap,
  updateH5DispatchLayers,
  focusBin,
  focusStop
} = createCollectionMapRenderer({ _state, monitor, mapMarkers, mapPolyline, mapCenter, mapScale, DEFAULT_CENTER, selectedBinId, selectedStopOrder, routeStrategy, isLightTheme, focusDispatchCase, renderLists })


// ─── API ───────────────────────────────────────────────
function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = token
  return headers
}

function apiRequest(path, options = {}) {
  const requestedTimeout = Number(options.timeout)
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : 0
  return new Promise((resolve, reject) => {
    const url = path.startsWith('/') ? `${baseUrl}${path}` : path
    const method = options.method || 'GET'
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)
    // #ifdef H5
    const requestController = createAbortController()
    let timeoutId = null
    let timedOut = false
    let abortHandler = null
    if (options.signal && requestController) {
      abortHandler = () => requestController.abort()
      if (options.signal.aborted) requestController.abort()
      else if (typeof options.signal.addEventListener === 'function') {
        options.signal.addEventListener('abort', abortHandler, { once: true })
      }
    }

    const requestPromise = fetch(url, {
      method,
      body,
      headers: authHeaders(),
      signal: requestController ? requestController.signal : options.signal
    })
      .then(async (r) => {
        let json = null
        try {
          json = await r.json()
        } catch (_) {}
        updateDatabaseStatusFromAvailability(json, {
          runtime: databaseStatusRuntime,
          source: path,
          allowRecovery: isDatabaseHealthEndpoint(path),
          notify: false
        })
        if (!json || json.code !== 0 || !r.ok) {
          if (redirectIfAccessDenied(json, r)) {
            throw new Error(describeApiFailure(json, r))
          }
          throw new Error(describeApiFailure(json, r))
        }
        return json.data
      })
    const pending = [requestPromise]
    if (timeoutMs) {
      pending.push(new Promise((_, rejectTimeout) => {
        timeoutId = setTimeout(() => {
          timedOut = true
          if (requestController) requestController.abort()
          rejectTimeout(new Error('请求超时，请稍后重试'))
        }, timeoutMs)
      }))
    }

    Promise.race(pending)
      .then(resolve)
      .catch((error) => {
        if (timedOut) {
          reject(new Error('请求超时，请稍后重试'))
        } else if (options.signal?.aborted) {
          reject(new Error('请求已取消'))
        } else {
          reject(error)
        }
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId)
        if (abortHandler && typeof options.signal?.removeEventListener === 'function') {
          options.signal.removeEventListener('abort', abortHandler)
        }
      })
    // #endif
    // #ifndef H5
    let requestTask = null
    let mpTimeoutId = null
    let mpAbortHandler = null
    let settled = false
    const cleanup = () => {
      if (mpTimeoutId) clearTimeout(mpTimeoutId)
      if (mpAbortHandler && typeof options.signal?.removeEventListener === 'function') {
        options.signal.removeEventListener('abort', mpAbortHandler)
      }
    }
    const settle = (callback) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const abortRequest = (message) => {
      if (requestTask && typeof requestTask.abort === 'function') requestTask.abort()
      settle(() => reject(new Error(message)))
    }
    if (options.signal?.aborted) {
      abortRequest('请求已取消')
      return
    }
    if (timeoutMs) {
      mpTimeoutId = setTimeout(() => abortRequest('请求超时，请稍后重试'), timeoutMs)
    }
    if (options.signal && typeof options.signal.addEventListener === 'function') {
      mpAbortHandler = () => abortRequest('请求已取消')
      options.signal.addEventListener('abort', mpAbortHandler, { once: true })
    }
    requestTask = uni.request({
      url, method, data: options.body, header: authHeaders(),
      success: res => {
        const json = res.data
        updateDatabaseStatusFromAvailability(json, {
          runtime: databaseStatusRuntime,
          source: path,
          allowRecovery: isDatabaseHealthEndpoint(path),
          notify: false
        })
        if (!json || json.code !== 0) { settle(() => reject(new Error((json && json.msg) || `HTTP ${res.statusCode}`))); return }
        settle(() => resolve(json.data))
      },
      fail: err => settle(() => reject(new Error(err && err.errMsg ? err.errMsg : String(err))))
    })
    // #endif
  })
}

function setStatus(text, cls) {
  statusText.value = text || ''
  statusCls.value = cls || ''
}

function buildDashboardSnapshotPath() {
  const params = [
    `routeStrategy=${encodeURIComponent(routeStrategy.value)}`,
    'planningHorizonHours=2'
  ]

  if (_state.manualStartPoint) {
    params.push(`startLat=${encodeURIComponent(String(n(_state.manualStartPoint.latitude, 0)))}`)
    params.push(`startLng=${encodeURIComponent(String(n(_state.manualStartPoint.longitude, 0)))}`)
    params.push(
      `startName=${encodeURIComponent(_state.manualStartPoint.name || '地图选择起点')}`
    )
  }

  return `/api/planning/dashboard-snapshot?${params.join('&')}`
}

function syncStartPointFromPlan() {
  if (_state.manualStartPoint) {
    _state.startPoint = { ..._state.manualStartPoint }
    return
  }

  if (_state.plan && _state.plan.start) {
    _state.startPoint = {
      name: _state.plan.start.name || '默认起点',
      latitude: _state.plan.start.latitude,
      longitude: _state.plan.start.longitude
    }
    return
  }

  if (_state.bins.length) {
    const first = _state.bins[0]
    _state.startPoint = { name: '默认起点', latitude: first.latitude, longitude: first.longitude }
    return
  }

  _state.startPoint = null
}

function buildRoutePlanPayload() {
  return {
    bins: _state.bins,
    start: _state.manualStartPoint || _state.startPoint || {},
    options: {
      routeStrategy: routeStrategy.value
    }
  }
}

async function planRouteInBackground({ silent = false } = {}) {
  if (!dashboardActive || monitor.active) return
  cancelRoutePlan()
  const controller = createAbortController()
  routePlanController = controller
  const revision = ++routePlanRevision
  _state.routePlanning = true
  renderAll()
  if (!silent) setStatus('清运数据已加载，正在后台规划路线…', 'warn')

  try {
    const plan = await apiRequest('/api/planning/plan', {
      method: 'POST',
      body: buildRoutePlanPayload(),
      timeout: ROUTE_PLAN_TIMEOUT_MS,
      signal: controller?.signal
    })
    if (revision !== routePlanRevision || monitor.active || !dashboardActive) return

    const namedPlan = applyDashboardBinNames({ bins: _state.bins, plan }).plan
    _state.plan = namedPlan || plan || null
    if (_state.plan?.options?.routeStrategy) {
      routeStrategy.value = normalizeStrategy(_state.plan.options.routeStrategy)
      setStorage('collection_route_strategy', routeStrategy.value)
    }
    syncStartPointFromPlan()
    renderAll()
    const stopCount = _state.plan?.route?.stops?.length || 0
    setStatus(`路线规划完成：${stopCount} 个停靠点，策略 ${strategyLabel(routeStrategy.value)}`, 'ok')
  } catch (error) {
    if (revision !== routePlanRevision || monitor.active || !dashboardActive) return
    _state.plan = null
    renderAll()
    setStatus('清运数据已加载', 'ok')
  } finally {
    if (routePlanController === controller) routePlanController = null
    if (revision === routePlanRevision && dashboardActive) {
      _state.routePlanning = false
      if (!_state.plan) renderAll()
    }
  }
}

async function doRefresh(options) {
  const silent = !!(options && options.silent)
  if (!dashboardActive || monitor.active) return
  if (_state.loading) return
  // Any incoming snapshot supersedes a still-running route calculation.
  // The new snapshot will start its own planner after its data is rendered.
  cancelRoutePlan()
  routePlanRevision += 1
  _state.routePlanning = false
  _state.loading = true
  if (!silent) setStatus(`正在刷新清运数据（${strategyLabel(routeStrategy.value)}）...`, 'warn')
  // 只有健康接口能够确认数据库恢复；失败时保留已有离线标记。
  apiRequest('/api/_db_state', { timeout: 5000 }).catch(() => {})
  try {
    const data = await apiRequest(buildDashboardSnapshotPath())
    if (!dashboardActive || monitor.active) return
    const namedData = applyDashboardBinNames(data)
    _state.bins = namedData.bins
    // Snapshots without a route must not inherit a route generated from an
    // earlier bin set. The planner will repopulate it in the background.
    _state.plan = namedData.plan || null
    _state.points = Array.isArray(data.points) ? data.points : []
    _state.tasks = Array.isArray(data.tasks) ? data.tasks : []
    _state.runtime = data.runtime || null

    if (!_state.bins.length) {
      _state.plan = null; renderAll(); setStatus('暂无可用桶位数据', 'warn'); return
    }
    if (_state.plan && _state.plan.options && _state.plan.options.routeStrategy) {
      routeStrategy.value = normalizeStrategy(_state.plan.options.routeStrategy)
      setStorage('collection_route_strategy', routeStrategy.value)
    }
    syncStartPointFromPlan()

    const routeStops = _state.plan?.route?.stops || []
    if (selectedStopOrder.value !== null && !routeStops.some(s => Number(s.order) === Number(selectedStopOrder.value))) selectedStopOrder.value = null
    if (selectedBinId.value !== null && !_state.bins.some(b => String(b.id) === String(selectedBinId.value))) selectedBinId.value = null

    renderAll()
    // A sorting-center deep link does not need the dashboard's 51-bin route.
    // Starting it here delays the target scene and leaves its KPI in planning.
    if (pendingEntry.view !== 'sorting') planRouteInBackground({ silent })
  } catch (err) {
    console.error('[collection-dashboard] refresh failed:', err)
    setStatus(err && err.message ? err.message : String(err), 'err')
  } finally {
    _state.loading = false
  }
}

// ─── 风险预警与调度监测 ───────────────────────────────
let monitorTimer = null
let riskPlaybackTimer = null
let monitorStartedAt = 0
let monitorLastMapDraw = 0
let monitorAnimationFrame = null
let monitorRequestRevision = 0
let sortingManualAnchorAt = 0
let sortingManualOffsetMs = 0
const MONITOR_TOTAL_MS = 19000
const DISPATCH_STAGE_RANK = { '异常告警': 0, '返航中': 1, '待补位': 2, '可用': 3, '处置完成': 4 }
const PARK_POINTS = {
  abnormal: { id: 'zhongshan-abnormal', name: '樱花大道南段异常点位', latitude: 36.0626, longitude: 120.3476 },
  sortingCenter: { id: 'zhongshan-sorting', name: '樱花大道北段管理站', latitude: 36.0684, longitude: 120.3478 },
  standbyArea: { id: 'zhongshan-standby', name: '小西湖东侧待命区', latitude: 36.0652, longitude: 120.3415 }
}
const DISPATCH_CASE_FALLBACKS = [
  {
    id: 'dispatch-p005', pointCode: 'P005', pointName: '樱花大道南段',
    returnBinCode: 'B-M05', replacementBinCode: 'B-S03', startDelayMs: 0,
    targetPoint: { id: 'dispatch-p005-target', name: '樱花大道南段', latitude: 36.0632, longitude: 120.3505 }
  },
  {
    id: 'dispatch-p010', pointCode: 'P010', pointName: '动物园入口',
    returnBinCode: 'B-M10', replacementBinCode: 'B-S04', startDelayMs: 1200,
    targetPoint: { id: 'dispatch-p010-target', name: '动物园入口', latitude: 36.0673, longitude: 120.3428 }
  },
  {
    id: 'dispatch-p018', pointCode: 'P018', pointName: '中山东门',
    returnBinCode: 'B-M18', replacementBinCode: 'B-S05', startDelayMs: 2400,
    targetPoint: { id: 'dispatch-p018-target', name: '中山东门', latitude: 36.06492, longitude: 120.34702 }
  }
]
function simulatedFaults() {
  const now = Date.now()
  return [
    {
      id: 'sim-mechanical-jam', code: 'mechanical_jam', title: '机械卡滞', severity: 'critical', status: 'open',
      deviceName: '移动桶 M-07', component: 'drop_mechanism', locationName: '樱花大道南段',
      message: '投放完成后机械臂电流超过安全阈值，抓取机构未复位。',
      recommendedAction: '停止机械臂并派发人工检修', createdAt: new Date(now - 2 * 60000).toISOString(), simulated: true
    },
    {
      id: 'sim-return-failure', code: 'auto_return_failure', title: '自动返航失败', severity: 'critical', status: 'processing',
      deviceName: '移动桶 M-03', component: 'navigation', locationName: '小西湖东侧',
      message: '连续三次路径重规划失败，设备已进入安全停车状态。',
      recommendedAction: '派发救援任务并转人工遥控', createdAt: new Date(now - 6 * 60000).toISOString(), simulated: true
    },
    {
      id: 'sim-sorting-center', code: 'sorting_center_fault', title: '分拣中心故障', severity: 'high', status: 'open',
      deviceName: '中山公园分拣中心', component: 'sorting_center', locationName: '樱花大道北段管理站',
      message: '入料输送带停止响应，当前暂停移动桶入站。',
      recommendedAction: '切换备用分拣中心并通知值守人员', createdAt: new Date(now - 9 * 60000).toISOString(), simulated: true
    },
    {
      id: 'sim-position-deviation', code: 'position_deviation', title: '位置偏差', severity: 'medium', status: 'acknowledged',
      deviceName: '备用桶 B-03', component: 'mobile_bin', locationName: '樱花大道南段',
      message: '补位后与目标点位偏差 1.8 米，等待二次定位校准。',
      recommendedAction: '重新定位并校验目标点位', createdAt: new Date(now - 12 * 60000).toISOString(), simulated: true
    }
  ]
}

function setFaultItems(items) {
  faultCenter.items = items
  faultCenter.summary = {
    total: items.length,
    open: items.filter(item => item.status === 'open').length,
    processing: items.filter(item => ['acknowledged', 'processing'].includes(item.status)).length,
    critical: items.filter(item => item.severity === 'critical' && item.status !== 'resolved').length,
    resolved: items.filter(item => item.status === 'resolved').length
  }
}

function clearMonitorTimer() {
  if (monitorTimer) clearInterval(monitorTimer)
  monitorTimer = null
  // #ifdef H5
  if (monitorAnimationFrame !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(monitorAnimationFrame)
  }
  monitorAnimationFrame = null
  // #endif
}

function startDispatchMapAnimation() {
  // #ifdef H5
  if (monitorAnimationFrame !== null || typeof requestAnimationFrame !== 'function') return
  const animate = () => {
    const hasAvailableCase = monitor.dispatchCases.some(item => item.routeAvailable)
    if (!monitor.active || monitor.scene !== 'dispatch' || !hasAvailableCase || monitor.completed) {
      monitorAnimationFrame = null
      return
    }
    const elapsed = Date.now() - monitorStartedAt
    if (_state.mapReady && !updateH5DispatchLayers(elapsed)) {
      drawMap(true)
      if (!updateH5DispatchLayers(elapsed)) {
        monitorAnimationFrame = null
        return
      }
    }
    monitorAnimationFrame = requestAnimationFrame(animate)
  }
  monitorAnimationFrame = requestAnimationFrame(animate)
  // #endif
}

function monitorTime(offsetMs) {
  return fmtTime(new Date(monitorStartedAt + offsetMs), true)
}

function buildMonitorTrend(fill, weight) {
  return Array.from({ length: 18 }, (_, index) => {
    const ratio = index / 17
    const wave = Math.sin(index * 1.4) * 1.6
    return {
      fill: clamp(fill - (1 - ratio) * 34 + wave, 8, 100),
      weight: clamp((weight / 85) * 100 - (1 - ratio) * 38 + wave * 0.7, 8, 100)
    }
  })
}

function faultSeverityLabel(severity) {
  if (severity === 'critical') return '严重'
  if (severity === 'high') return '高'
  if (severity === 'medium') return '中'
  return '提示'
}
function faultStatusLabel(status) {
  if (status === 'acknowledged') return '已确认'
  if (status === 'processing') return '处理中'
  if (status === 'resolved') return '已关闭'
  return '待确认'
}
function faultComponentLabel(component) {
  const labels = { drop_mechanism: '投放机构', mobile_bin: '移动桶', sorting_center: '分拣中心', navigation: '导航系统', communication: '通信模块' }
  return labels[component] || component || '设备'
}
async function loadFaultEvents(silent = false) {
  if (!getStorage('token')) {
    setFaultItems(simulatedFaults())
    if (!silent) setStatus('当前展示故障模拟数据', 'warn')
    return
  }
  if (!silent) faultCenter.loading = true
  try {
    const data = await apiRequest('/api/planning/fault-events?limit=100')
    const items = Array.isArray(data?.items) ? data.items : []
    if (items.length) {
      faultCenter.items = items
      faultCenter.summary = data?.summary || faultCenter.summary
    } else {
      setFaultItems(simulatedFaults())
    }
  } catch (error) {
    setFaultItems(simulatedFaults())
    if (!silent) setStatus('故障接口暂不可用，当前展示模拟数据', 'warn')
  } finally {
    faultCenter.loading = false
  }
}
function openFaultCenter() {
  if (monitor.active) exitMonitor()
  faultCenter.open = true
  loadFaultEvents()
}

function clearRiskPlaybackTimer() {
  if (riskPlaybackTimer) clearInterval(riskPlaybackTimer)
  riskPlaybackTimer = null
}

function armRiskPlayback() {
  clearRiskPlaybackTimer()
  if (!riskPlaying.value || !monitor.active || monitor.scene !== 'telemetry') return
  riskPlaybackTimer = setInterval(() => {
    const horizons = [0, 30, 60, 120]
    const currentIndex = Math.max(0, horizons.indexOf(Number(riskHorizon.value)))
    riskHorizon.value = horizons[(currentIndex + 1) % horizons.length]
  }, 4000)
}
function handleAdminScreenAction(action) {
  if (action === 'openFaultCenter') openFaultCenter()
}
function closeFaultCenter() {
  faultCenter.open = false
}
async function handleFault(fault, action) {
  if (fault.simulated) {
    fault.status = action === 'resolve' ? 'resolved' : action === 'acknowledge' ? 'acknowledged' : 'processing'
    setFaultItems(faultCenter.items.slice())
    setStatus(`故障模拟处置已更新：${fault.title}`, 'ok')
    return
  }
  if (!getStorage('token')) {
    setStatus('故障处置需要管理员登录', 'warn')
    return
  }
  try {
    const data = await apiRequest(`/api/planning/fault-events/${encodeURIComponent(fault.id)}/action`, { method: 'POST', body: { action } })
    const index = faultCenter.items.findIndex(item => item.id === fault.id)
    if (index >= 0 && data?.fault) faultCenter.items[index] = data.fault
    if (data?.summary) faultCenter.summary = data.summary
    setStatus(`故障处置已更新：${fault.title}`, 'ok')
  } catch (error) {
    setStatus(error?.message || '故障处置失败', 'err')
  }
}

function parkFallbackBins() {
  return ZHONGSHAN_PARK_POINT_NAMES.slice(0, 21).map((pointName, index) => {
    const fill = clamp(91 - index * 2.7, 28, 96)
    const growth = clamp(5.4 - index * 0.16, 0.8, 6)
    const predicted = clamp(fill + growth * 2, 0, 100)
    return {
      id: `park-${String(index + 1).padStart(2, '0')}`,
      name: pointCode(index),
      pointCode: pointCode(index),
      pointName,
      binCode: defaultBinCode(index),
      hasBin: true,
      slotState: fill >= 85 ? '满载告警' : '可用',
      taskLabel: fill >= 85 ? '待生成清运任务' : '日常监测',
      latitude: 36.0626 + Math.floor(index / 5) * 0.00125,
      longitude: 120.3415 + (index % 5) * 0.00155,
      currentFill: fill,
      growthRatePctPerHour: growth,
      predictedFillInHorizon: predicted,
      hoursToFull: (100 - fill) / growth,
      priorityScore: clamp(0.96 - index * 0.028, 0.2, 1),
      isUrgent: fill >= 85
    }
  })
}

function ensureMonitorBackup() {
  if (_state.monitorBackup) return
  _state.monitorBackup = {
    bins: JSON.parse(JSON.stringify(_state.bins)),
    plan: JSON.parse(JSON.stringify(_state.plan || null)),
    selectedBinId: selectedBinId.value,
    selectedStopOrder: selectedStopOrder.value
  }
}

function restoreMonitorBase() {
  if (!_state.monitorBackup) return
  _state.bins = JSON.parse(JSON.stringify(_state.monitorBackup.bins))
  _state.plan = JSON.parse(JSON.stringify(_state.monitorBackup.plan))
}

function buildRiskMonitorBins() {
  const source = (_state.bins || []).length ? _state.bins : parkFallbackBins()
  return source.map((bin, index) => {
    const ratio = seededRatio(`${bin.id}-${bin.name}`)
    const fill = clamp(n(bin.currentFill, 40 + ratio * 48), 8, 98)
    const growth = clamp(n(bin.growthRatePctPerHour, 1 + ratio * 4), 0.4, 8)
    const weight = clamp(fill * (0.65 + ratio * 0.18), 8, 86)
    const battery = clamp(88 - fill * 0.58 + ratio * 16, 12, 92)
    const fullMinutes = Math.max(2, Math.round((100 - fill) / growth * 60))
    return {
      ...bin,
      baseFill: fill,
      baseWeight: weight,
      baseBattery: battery,
      fill,
      weight,
      battery,
      growth,
      fullMinutes,
      phase: index * 0.73,
      alertLevel: fill >= 90 || battery < 20 ? 'critical' : fill >= 75 ? 'warning' : 'normal',
      alertTitle: fill >= 90 || battery < 20 ? '红色告警' : fill >= 75 ? '风险预警' : '运行正常'
    }
  }).sort((a, b) => b.fill - a.fill)
}

function syncSelectedRiskMonitor() {
  const selected = monitor.riskBins.find(bin => String(bin.id) === String(monitor.binId))
  if (!selected) return
  monitor.binName = selected.pointCode || selected.name
  monitor.pointCode = selected.pointCode || selected.name
  monitor.pointName = selected.pointName || selected.name
  monitor.returnBinCode = selected.binCode || monitor.returnBinCode
  monitor.locationText = `${selected.pointName || selected.name} · 桶体 ${selected.binCode || '--'}`
  monitor.fill = selected.fill
  monitor.weight = selected.weight
  monitor.weightDelta = Math.max(0, selected.weight - selected.baseWeight)
  monitor.battery = selected.battery
  monitor.batteryHours = Math.max(0.6, selected.battery / 7.2)
  monitor.growth = selected.growth
  monitor.fullMinutes = selected.fullMinutes
  monitor.fullClock = fmtTime(new Date(Date.now() + selected.fullMinutes * 60000))
  monitor.alertLevel = selected.alertLevel
  monitor.alertTitle = selected.alertLevel === 'critical' ? '满载风险预警升级' : selected.alertLevel === 'warning' ? '满载风险预警' : '运行状态正常'
  monitor.alertDescription = selected.alertLevel === 'critical'
    ? '预计短时间内满载，或设备电量低于安全阈值'
    : selected.alertLevel === 'warning'
      ? '增长率持续升高，平台已提前关注该点位'
      : '遥测数据持续采集中'
  monitor.trend = buildMonitorTrend(selected.fill, selected.weight)
  selectedBinId.value = String(selected.id)
}

function selectRiskMonitorBin(binId) {
  monitor.binId = binId
  syncSelectedRiskMonitor()
}

function focusedDispatchCase() {
  return monitor.dispatchCases.find(item => item.id === monitor.activeDispatchCaseId)
    || monitor.dispatchCases[0]
    || null
}

function syncFocusedDispatchCase() {
  const item = focusedDispatchCase()
  if (!item) return
  monitor.binId = item.binId
  monitor.pointCode = item.pointCode
  monitor.pointName = item.pointName
  monitor.returnBinCode = item.returnBinCode
  monitor.replacementBinCode = item.replacementBinCode
  monitor.binName = item.pointCode
  monitor.locationText = `${item.pointCode} · ${item.pointName} · 桶体 ${item.returnBinCode}`
  monitor.pointState = item.pointState
  monitor.pointStateCls = item.pointStateCls
  monitor.returnProgress = item.returnProgress
  monitor.replaceProgress = item.replaceProgress
  monitor.returnPosition = item.returnPosition
  monitor.replacePosition = item.replacePosition
  monitor.targetPoint = item.targetPoint
  monitor.sortingCenter = item.sortingCenter
  monitor.standbyArea = item.standbyArea
  monitor.returnRoute = item.returnRoute
  monitor.replaceRoute = item.replaceRoute
  monitor.routeAvailable = item.routeAvailable
  selectedBinId.value = String(item.binId)
}

function focusDispatchCase(caseId) {
  if (!caseId || !monitor.dispatchCases.some(item => item.id === caseId)) return
  monitor.activeDispatchCaseId = caseId
  syncFocusedDispatchCase()
  updateMonitorTasks(Date.now() - monitorStartedAt)
  // #ifdef H5
  if (_state.mapReady) drawMap(true)
  // #endif
}

function updateMonitorTasks(elapsed) {
  monitor.tasks = monitor.dispatchCases.flatMap((item, caseIndex) => {
    const returnState = item.routeAvailable
      ? item.returnProgress >= 1 ? 'done' : item.returnProgress > 0 ? 'running' : 'pending'
      : 'pending'
    const replaceState = item.routeAvailable
      ? item.replaceProgress >= 1 ? 'done' : item.replaceProgress > 0 ? 'running' : 'pending'
      : 'pending'
    const code = String(caseIndex + 1).padStart(2, '0')
    return [
      {
        id: `${item.id}-return`, caseId: item.id, title: `返航任务 RT-2026-${code}`, kind: 'return', state: returnState,
        status: returnState === 'done' ? '已到达' : returnState === 'running' ? '返航中' : '待执行',
        route: `${item.pointCode} · ${item.pointName} → 智能分拣中心`, device: item.returnBinCode, progress: item.returnProgress * 100
      },
      {
        id: `${item.id}-replace`, caseId: item.id, title: `补位任务 RP-2026-${code}`, kind: 'replace', state: replaceState,
        status: replaceState === 'done' ? '补位完成' : replaceState === 'running' ? '补位中' : '待命',
        route: `备用桶待命区 → ${item.pointCode} · ${item.pointName}`, device: item.replacementBinCode, progress: item.replaceProgress * 100
      }
    ]
  })
  const focused = focusedDispatchCase()
  if (!focused) return
  const returnState = focused.routeAvailable
    ? focused.returnProgress >= 1 ? 'done' : focused.returnProgress > 0 ? 'running' : 'pending'
    : 'pending'
  const replaceState = focused.routeAvailable
    ? focused.replaceProgress >= 1 ? 'done' : focused.replaceProgress > 0 ? 'running' : 'pending'
    : 'pending'
  monitor.timeline = [
    { key: 'alert', label: '异常告警', state: 'done' },
    { key: 'return', label: '移动桶返航', state: returnState },
    { key: 'replace', label: '备用桶补位', state: replaceState },
    { key: 'available', label: '点位恢复可用', state: DISPATCH_STAGE_RANK[focused.pointState] >= 3 ? 'done' : 'pending' },
    { key: 'closed', label: '处置完成', state: focused.pointState === '处置完成' ? 'done' : 'pending' }
  ]
  monitor.events = monitor.dispatchCases.flatMap((item) => {
    const localElapsed = Math.max(0, elapsed - item.startDelayMs)
    const eventDefs = [
      [0, '异常告警', `${item.pointCode} · ${item.pointName} 检测到满载 / 低电量。`],
      [1000, '任务自动生成', `${item.returnBinCode} 返航、${item.replacementBinCode} 补位任务已生成。`],
      [2500, '备用桶出库', `${item.replacementBinCode} 从小西湖东侧待命区出发。`],
      [5000, '原点位待补位', `${item.returnBinCode} 已离开，${item.pointCode} 等待备用桶。`],
      [13500, '补位完成', `${item.replacementBinCode} 到达 ${item.pointCode}，点位恢复可用。`],
      [18500, '返航桶入站', `${item.returnBinCode} 抵达分拣中心，进入清洗流程。`]
    ]
    return eventDefs
      .filter(event => localElapsed >= event[0])
      .map(event => ({
        id: `${item.id}-${event[0]}`,
        sortAt: item.startDelayMs + event[0],
        time: monitorTime(item.startDelayMs + event[0]),
        title: `${item.pointCode} · ${event[1]}`,
        desc: event[2]
      }))
  }).sort((left, right) => right.sortAt - left.sortAt)
  updateSortingCenterState(Math.max(0, elapsed - focused.startDelayMs))
}

function updateSortingCenterState(elapsed) {
  const sortingStart = 18500
  const scheduledElapsed = sortingManualAnchorAt
    ? Math.max(0, sortingManualOffsetMs + Date.now() - sortingManualAnchorAt)
    : Math.max(0, elapsed - sortingStart)
  if (!sortingManualPlaybackActive.value && scheduledElapsed > 0) {
    sortingAutomaticPlaybackActive.value = true
  }

  // Once playback has been requested, the video media clock is authoritative.
  // This keeps the cards, stage rail and queue paused whenever decoding stalls
  // instead of allowing Date.now() to run ahead of the visible animation.
  const media = sortingMasterVideoElement()
  const mediaSeconds = Number(media?.currentTime)
  const hasMediaClock = sortingWorkflowStarted.value
    && sortingMasterVideoReady.value
    && !sortingMasterVideoFailed.value
    && Number.isFinite(mediaSeconds)
  const cleaningElapsed = hasMediaClock
    ? clamp(mediaSeconds * 1000, 0, SORTING_WORKFLOW_TOTAL_MS)
    : scheduledElapsed
  monitor.sortingProgress = clamp(cleaningElapsed / SORTING_WORKFLOW_TOTAL_MS * 100, 0, 100)
  monitor.sortingTimeline = SORTING_OPERATION_STEPS.map((step, index) => {
    const next = SORTING_OPERATION_STEPS[index + 1]
    const state = cleaningElapsed >= step.at
      ? (!next || cleaningElapsed >= next.at ? 'done' : 'running')
      : 'pending'
    return { ...step, state }
  })
  const running = monitor.sortingTimeline.find(step => step.state === 'running')
  const done = monitor.sortingTimeline.filter(step => step.state === 'done').slice(-1)[0]
  monitor.sortingStageText = running?.label || done?.label || '等待返航桶抵达分拣中心'
  monitor.sortingStatus = monitor.sortingProgress >= 100 ? '已清洁待命' : monitor.sortingProgress > 0 ? '处理中' : '待接收'
  const cases = monitor.dispatchCases || []
  const completedReturns = cases.filter(item => item.routeAvailable && item.returnProgress >= 1).length
  const activeReturns = cases.filter(item => item.routeAvailable && item.returnProgress > 0 && item.returnProgress < 1).length
  const unavailableReturns = cases.filter(item => !item.routeAvailable).length
  const focusedCleaning = monitor.sortingProgress > 0 && monitor.sortingProgress < 100 ? 1 : 0
  monitor.sortingSummary = {
    waiting: Math.max(0, cases.length - completedReturns - activeReturns - unavailableReturns),
    cleaning: focusedCleaning,
    ready: Math.max(0, completedReturns + cases.length - focusedCleaning),
    blocked: unavailableReturns
  }
  monitor.sortingQueue = cases.flatMap((item) => {
    const isFocused = item.id === monitor.activeDispatchCaseId
    const returnState = !item.routeAvailable
      ? '等待返航'
      : item.returnProgress >= 1
        ? (isFocused ? monitor.sortingStatus : '已抵达')
        : item.returnProgress > 0 ? '返航中' : '等待返航'
    const replacementState = !item.routeAvailable
      ? '待命'
      : item.replaceProgress >= 1 ? '补位完成' : item.replaceProgress > 0 ? '补位中' : '待命'
    return [
      {
        id: `${item.id}-return-bin`,
        kind: !item.routeAvailable ? 'blocked' : item.returnProgress >= 1 ? 'ready' : 'active',
        title: `${item.returnBinCode} · ${item.pointCode} 返航桶`,
        state: returnState,
        desc: isFocused && item.returnProgress >= 1
          ? `当前阶段：${monitor.sortingStageText}`
          : `${item.pointName} → 分拣中心`
      },
      {
        id: `${item.id}-replacement-bin`,
        kind: item.routeAvailable && item.replaceProgress >= 1 ? 'ready' : 'active',
        title: `${item.replacementBinCode} · ${item.pointCode} 补位桶`,
        state: replacementState,
        desc: `${item.pointName} 点位补位任务`
      }
    ]
  })
}

function jumpToSortingStage(step) {
  if (!monitor.active || monitor.scene !== 'sorting' || !step) return
  pauseSortingMasterVideo()
  seekSortingMasterVideo(step.at / 1000)
  sortingManualOffsetMs = step.at
  sortingManualAnchorAt = Date.now()
  sortingAutomaticPlaybackActive.value = false
  sortingManualPlaybackActive.value = true
  updateSortingCenterState(0)
  ensureSortingProgressTimer()
  nextTick(() => syncSortingMasterVideo(true))
  setStatus(`分拣中心已切换至：${step.label}`, 'ok')
}

function jumpToSortingVisualStage(visualKey) {
  const stageKey = {
    intake: 'arrive',
    washing: 'wash',
    inspection: 'battery'
  }[visualKey]
  const stage = SORTING_OPERATION_STEPS.find(item => item.key === stageKey)
  if (stage) jumpToSortingStage(stage)
}

function setDispatchCaseStage(item, nextStage) {
  if ((DISPATCH_STAGE_RANK[nextStage] ?? -1) <= (DISPATCH_STAGE_RANK[item.pointState] ?? -1)) return false
  item.pointState = nextStage
  item.pointStateCls = DISPATCH_STAGE_RANK[nextStage] >= 3 ? 'available' : nextStage === '待补位' ? 'waiting' : 'danger'
  return true
}

function updateDispatchCaseTargetSlot(item, patch) {
  _state.bins = (_state.bins || []).map(bin => String(bin.id) === String(item.binId)
    ? { ...bin, ...patch }
    : bin)
}

function riskFullTimeLabel(node, generatedAt) {
  const fullAt = new Date(node?.estimatedFullAt || '')
  const base = new Date(generatedAt || Date.now())
  if (Number.isNaN(fullAt.getTime()) || Number.isNaN(base.getTime())) return '预计满载时间待计算'
  const minutes = Math.max(0, Math.round((fullAt - base) / 60000))
  return minutes < 60 ? `预计 ${minutes} 分钟达到满载` : `预计 ${Math.floor(minutes / 60)}h ${minutes % 60}m 达到满载`
}

function riskListItem(node, generatedAt) {
  const probability120 = clamp(n(node?.windows?.[120]?.fullProbability, 0) * 100, 0, 100)
  const predicted120 = clamp(n(node?.windows?.[120]?.p50, 0) * 100, 0, 100)
  const alertLevel = probability120 >= 85 ? 'critical' : probability120 >= 60 ? 'warning' : 'normal'
  const fullAtMs = new Date(node?.estimatedFullAt || '').getTime()
  const generatedAtMs = new Date(generatedAt || Date.now()).getTime()
  return {
    ...node,
    fill: clamp(n(node.currentFill, 0), 0, 100),
    weight: clamp(n(node.weightKg, 0), 0, 100),
    battery: clamp(n(node.batteryPct, 0), 0, 100),
    growth: clamp(n(node.growthRatePctPerHour, 0), 0, 15),
    probability120,
    predicted120,
    confidence: clamp(n(node.confidence, 0) * 100, 0, 100),
    fullMinutes: Number.isFinite(fullAtMs) && Number.isFinite(generatedAtMs)
      ? Math.max(0, Math.round((fullAtMs - generatedAtMs) / 60000))
      : 0,
    fullTimeLabel: riskFullTimeLabel(node, generatedAt),
    alertLevel,
    alertTitle: alertLevel === 'critical' ? '紧急风险' : alertLevel === 'warning' ? '高风险' : probability120 >= 30 ? '中风险' : '低风险'
  }
}

function setRiskHorizon(value) {
  riskHorizon.value = [0, 30, 60, 120].includes(Number(value)) ? Number(value) : 0
  riskPlaying.value = false
  clearRiskPlaybackTimer()
}

function toggleRiskPlayback() {
  riskPlaying.value = !riskPlaying.value
  armRiskPlayback()
}

async function loadRiskVisualization(requestRevision) {
  const data = await apiRequest('/api/planning/risk-visualization')
  if (requestRevision !== monitorRequestRevision || !monitor.active || monitor.scene !== 'telemetry') return
  const nodes = Array.isArray(data?.nodes) ? data.nodes : []
  riskVisualization.value = {
    generatedAt: data?.generatedAt,
    model: data?.model || {},
    thresholds: data?.thresholds || {},
    nodes,
    edges: Array.isArray(data?.edges) ? data.edges : []
  }
  monitor.riskBins = nodes
    .map(node => riskListItem(node, data?.generatedAt))
    .sort((left, right) => right.probability120 - left.probability120 || right.fill - left.fill)
  const currentExists = monitor.riskBins.some(bin => String(bin.id) === String(monitor.binId))
  if (!currentExists) monitor.binId = monitor.riskBins[0]?.id || null
  syncSelectedRiskMonitor()
  riskHorizon.value = 0
  riskPlaying.value = true
  armRiskPlayback()
  setStatus(`STG-Mamba 时空风险分析中：${nodes.length} 个点位 · 30/60/120 分钟预测`, 'warn')
}

function updateDispatchCase(item, elapsed) {
  const localElapsed = Math.max(0, elapsed - item.startDelayMs)
  item.returnProgress = item.routeAvailable ? clamp((localElapsed - 1000) / 17500, 0, 1) : 0
  item.replaceProgress = item.routeAvailable ? clamp((localElapsed - 2500) / 11000, 0, 1) : 0
  item.returnPosition = pointAlongRoute(item.returnRoute, item.returnProgress) || item.targetPoint
  item.replacePosition = pointAlongRoute(item.replaceRoute, item.replaceProgress) || item.standbyArea
  if (!item.routeAvailable) return false

  let changed = false
  if (localElapsed >= 18500) {
    changed = setDispatchCaseStage(item, '处置完成')
  } else if (localElapsed >= 13500) {
    changed = setDispatchCaseStage(item, '可用')
    if (changed) updateDispatchCaseTargetSlot(item, {
      currentFill: 12,
      predictedFillInHorizon: 20,
      isUrgent: false,
      hasBin: true,
      binCode: item.replacementBinCode,
      slotState: '补位完成',
      taskLabel: `${item.replacementBinCode} 已补位`
    })
  } else if (localElapsed >= 5000) {
    changed = setDispatchCaseStage(item, '待补位')
    if (changed) updateDispatchCaseTargetSlot(item, {
      hasBin: false,
      binCode: '',
      slotState: '待补位',
      taskLabel: `${item.returnBinCode} 返航，等待 ${item.replacementBinCode}`
    })
  } else if (localElapsed >= 1000) {
    changed = setDispatchCaseStage(item, '返航中')
    if (changed) updateDispatchCaseTargetSlot(item, {
      hasBin: false,
      binCode: '',
      slotState: '返航中',
      taskLabel: `${item.returnBinCode} 离开点位`
    })
  }
  return changed
}

function updateDispatchMonitor() {
  const elapsed = Date.now() - monitorStartedAt
  let binsChanged = false
  monitor.dispatchCases.forEach((item) => {
    binsChanged = updateDispatchCase(item, elapsed) || binsChanged
  })
  syncFocusedDispatchCase()
  if (monitor.scene === 'sorting') {
    const focused = focusedDispatchCase()
    updateSortingCenterState(Math.max(0, elapsed - n(focused?.startDelayMs, 0)))
  } else {
    updateMonitorTasks(elapsed)
  }
  // The dashboard cards are hidden in the sorting scene. Re-rendering them as
  // the final dispatch cases complete competes with the first seconds of video.
  if (binsChanged && monitor.scene !== 'sorting') {
    renderMetrics()
    renderLists()
  }

  if (Date.now() - monitorLastMapDraw >= 250) {
    monitorLastMapDraw = Date.now()
    // #ifndef H5
    buildMpMapData()
    // #endif
  }

  const allTerminal = monitor.dispatchCases.length > 0 && monitor.dispatchCases.every(item =>
    !item.routeAvailable || elapsed - item.startDelayMs >= MONITOR_TOTAL_MS
  )
  if (allTerminal && !monitor.completed) {
    monitor.completed = true
    monitor.dispatchCases.forEach((item) => {
      if (!item.routeAvailable) return
      item.returnProgress = 1
      item.replaceProgress = 1
      item.returnPosition = pointAlongRoute(item.returnRoute, 1)
      item.replacePosition = pointAlongRoute(item.replaceRoute, 1)
    })
    syncFocusedDispatchCase()
    updateMonitorTasks(elapsed)
    const unavailable = monitor.dispatchCases.filter(item => !item.routeAvailable).length
    setStatus(
      unavailable
        ? '调度监测保持待命'
        : '调度处置完成：三组返航与补位任务已闭环',
      unavailable ? 'warn' : 'ok'
    )
    if (monitor.scene !== 'sorting' || monitor.sortingProgress >= 100) clearMonitorTimer()
    // #ifdef H5
    if (_state.mapReady) updateH5DispatchLayers(elapsed)
    // #endif
  }

  if (monitor.scene === 'sorting' && monitor.completed && monitor.sortingProgress >= 100) {
    clearMonitorTimer()
  }
}

async function startRiskMonitor() {
  cancelRoutePlan()
  routePlanRevision += 1
  const requestRevision = ++monitorRequestRevision
  clearMonitorTimer()
  clearRiskPlaybackTimer()
  ensureMonitorBackup()
  restoreMonitorBase()
  monitor.active = true
  if (!_state.bins.length) {
    _state.bins = parkFallbackBins()
    _state.plan = null
    renderMetrics()
  }
  monitor.completed = false
  monitor.scene = 'telemetry'
  monitor.dispatchCases = []
  monitor.activeDispatchCaseId = ''
  monitor.riskBins = []
  riskVisualization.value = { nodes: [], edges: [], model: {}, thresholds: {} }
  riskHorizon.value = 0
  riskPlaying.value = true
  monitorStartedAt = Date.now()
  setStatus('STG-Mamba 正在构建点位时空图与预测区间...', 'warn')
  try {
    await loadRiskVisualization(requestRevision)
  } catch (error) {
    if (requestRevision !== monitorRequestRevision || !monitor.active || monitor.scene !== 'telemetry') return
    setStatus(error?.message || '风险预测数据加载失败', 'err')
  }
}

function handleRefreshTap() {
  if (monitor.active) {
    setStatus('监测进行中，已暂停刷新清运数据', 'warn')
    uni.showToast({ title: '监测进行中，已暂停刷新', icon: 'none' })
    return
  }
  doRefresh()
}

function toggleRiskMonitor() {
  if (faultCenter.open) closeFaultCenter()
  if (monitor.active && monitor.scene === 'telemetry') {
    exitMonitor()
    return
  }
  startRiskMonitor()
}

async function startDispatchMonitor() {
  cancelRoutePlan()
  routePlanRevision += 1
  const requestRevision = ++monitorRequestRevision
  clearMonitorTimer()
  clearRiskPlaybackTimer()
  ensureMonitorBackup()
  restoreMonitorBase()
  if (!_state.bins.length) _state.bins = parkFallbackBins()
  monitor.active = true
  monitor.completed = false
  monitor.scene = 'dispatch'
  sortingManualAnchorAt = 0
  sortingManualOffsetMs = 0
  sortingAutomaticPlaybackActive.value = false
  sortingManualPlaybackActive.value = false
  monitor.dispatchCases = []
  monitor.activeDispatchCaseId = ''
  _state.plan = null
  _state.startPoint = null
  selectedStopOrder.value = null
  monitor.mapBrief = ['正在获取三组腾讯步行路径规划...', '没有真实腾讯路径时不会启动直线动画']
  monitor.timeline = []
  monitor.tasks = []
  monitor.events = []
  renderAll()
  try {
    const data = await apiRequest('/api/planning/dispatch-monitor-route')
    if (requestRevision !== monitorRequestRevision || !monitor.active || monitor.scene !== 'dispatch') return
    const sourceCases = Array.isArray(data?.cases) && data.cases.length ? data.cases : DISPATCH_CASE_FALLBACKS
    const usedBinIds = new Set()
    monitor.dispatchCases = sourceCases.map((source, index) => {
      const fallback = DISPATCH_CASE_FALLBACKS[index] || DISPATCH_CASE_FALLBACKS[0]
      const pointCode = source.pointCode || fallback.pointCode
      const matchedBin = _state.bins.find(bin =>
        !usedBinIds.has(String(bin.id))
        && (
          String(bin.pointCode || bin.code || '') === String(pointCode)
          || String(bin.pointName || '').includes(source.pointName || fallback.pointName)
        )
      ) || _state.bins.find(bin => !usedBinIds.has(String(bin.id))) || _state.bins[0]
      usedBinIds.add(String(matchedBin.id))
      const targetPoint = { ...(source.targetPoint || fallback.targetPoint) }
      const sortingCenter = { ...(source.sortingCenter || PARK_POINTS.sortingCenter) }
      const standbyArea = { ...(source.standbyArea || PARK_POINTS.standbyArea) }
      const returnRoute = Array.isArray(source.returnRoute?.polyline) ? source.returnRoute.polyline : []
      const replaceRoute = Array.isArray(source.replacementRoute?.polyline) ? source.replacementRoute.polyline : []
      const routeAvailable = source.routeAvailable !== false && returnRoute.length > 1 && replaceRoute.length > 1
      return {
        id: source.id || fallback.id,
        pointCode,
        pointName: source.pointName || fallback.pointName,
        returnBinCode: source.returnBinCode || fallback.returnBinCode,
        replacementBinCode: source.replacementBinCode || fallback.replacementBinCode,
        startDelayMs: n(source.startDelayMs, fallback.startDelayMs),
        binId: matchedBin.id,
        targetPoint,
        sortingCenter,
        standbyArea,
        returnRoute,
        replaceRoute,
        routeAvailable,
        routeProvider: source.routeProvider || null,
        routeErrorCode: source.routeErrorCode || null,
        pointState: routeAvailable ? '异常告警' : '等待调度',
        pointStateCls: routeAvailable ? 'danger' : 'waiting',
        returnProgress: 0,
        replaceProgress: 0,
        returnPosition: { ...targetPoint },
        replacePosition: { ...standbyArea }
      }
    })
    monitor.activeDispatchCaseId = monitor.dispatchCases[0]?.id || ''
    monitor.dispatchCases.forEach((item) => {
      _state.bins = _state.bins.map(bin => String(bin.id) === String(item.binId)
        ? {
            ...bin,
            latitude: item.targetPoint.latitude,
            longitude: item.targetPoint.longitude,
            currentFill: Math.max(n(bin.currentFill, 0), 90),
            predictedFillInHorizon: Math.min(99, Math.max(n(bin.predictedFillInHorizon, 0), 94)),
            isUrgent: true,
            hasBin: true,
            binCode: item.returnBinCode,
            slotState: '满载告警',
            taskLabel: `${item.returnBinCode} 待返航`
          }
        : bin)
    })
    syncFocusedDispatchCase()
    updateSortingCenterState(0)
    const availableCount = monitor.dispatchCases.filter(item => item.routeAvailable).length
    const cachedCount = monitor.dispatchCases.filter(item => item.routeProvider === 'tencent_cache').length
    monitor.mapBrief = [
      `并发案例：${monitor.dispatchCases.length} 组返航与补位任务`,
      cachedCount
        ? `其中 ${cachedCount} 组使用最近 24 小时道路路线`
        : '点位、备用桶与分拣中心同步展示',
      '红色：返航分拣中心 · 青色：备用桶补位',
      availableCount ? '三组任务按独立时序协同运行' : '当前案例保持待命'
    ]
    monitorStartedAt = Date.now()
    _state.shouldFitMap = true
    setStatus(
      availableCount
        ? `调度监测中：${availableCount} 组返航与补位任务并发执行`
        : '调度监测已载入：3 组案例保持待命',
      'warn'
    )
    monitorTimer = setInterval(updateDispatchMonitor, 100)
    updateDispatchMonitor()
    // #ifdef H5
    if (_state.mapReady) drawMap(true)
    startDispatchMapAnimation()
    // #endif
  } catch (error) {
    if (requestRevision !== monitorRequestRevision || !monitor.active || monitor.scene !== 'dispatch') return
    monitor.dispatchCases = DISPATCH_CASE_FALLBACKS.map((source, index) => {
      const matchedBin = _state.bins[index] || _state.bins[0]
      return {
        ...source,
        binId: matchedBin.id,
        sortingCenter: { ...PARK_POINTS.sortingCenter },
        standbyArea: { ...PARK_POINTS.standbyArea },
        returnRoute: [],
        replaceRoute: [],
        routeAvailable: false,
        routeProvider: null,
        routeErrorCode: 'TENCENT_ROUTE_UNAVAILABLE',
        pointState: '等待调度',
        pointStateCls: 'waiting',
        returnProgress: 0,
        replaceProgress: 0,
        returnPosition: { ...source.targetPoint },
        replacePosition: { ...PARK_POINTS.standbyArea }
      }
    })
    monitor.activeDispatchCaseId = monitor.dispatchCases[0].id
    syncFocusedDispatchCase()
    monitor.mapBrief = [
      '并发案例：3 组返航与补位任务',
      '点位、备用桶与分拣中心同步展示',
      '当前案例保持待命'
    ]
    monitorStartedAt = Date.now()
    _state.shouldFitMap = true
    setStatus('调度监测已载入：3 组案例保持待命', 'warn')
    monitorTimer = setInterval(updateDispatchMonitor, 100)
    updateDispatchMonitor()
    // #ifdef H5
    if (_state.mapReady) drawMap(true)
    startDispatchMapAnimation()
    // #endif
  }
}

function exitMonitor() {
  monitorRequestRevision += 1
  clearMonitorTimer()
  clearRiskPlaybackTimer()
  monitor.active = false
  monitor.completed = false
  monitor.scene = ''
  monitor.dispatchCases = []
  monitor.activeDispatchCaseId = ''
  sortingManualAnchorAt = 0
  sortingManualOffsetMs = 0
  sortingAutomaticPlaybackActive.value = false
  sortingManualPlaybackActive.value = false
  if (_state.monitorBackup) {
    _state.bins = JSON.parse(JSON.stringify(_state.monitorBackup.bins))
    _state.plan = JSON.parse(JSON.stringify(_state.monitorBackup.plan))
    selectedBinId.value = _state.monitorBackup.selectedBinId
    selectedStopOrder.value = _state.monitorBackup.selectedStopOrder
    _state.monitorBackup = null
  }
  renderAll()
  setStatus('已返回实时清运总览', 'ok')
}

function toggleDispatchMonitor() {
  if (faultCenter.open) closeFaultCenter()
  if (monitor.active && monitor.scene === 'dispatch') {
    exitMonitor()
    return
  }
  startDispatchMonitor()
}

async function openSortingCenterMonitor() {
  // The sorting view needs a return/replacement task context. Create it when
  // users open the progress view directly, rather than hiding the entry.
  if (!monitor.active || monitor.scene === 'telemetry') {
    await startDispatchMonitor()
  }
  if (!monitor.active) return
  monitor.previousScene = monitor.scene || 'dispatch'
  monitor.scene = 'sorting'
  updateSortingCenterState(Date.now() - monitorStartedAt)
  ensureSortingProgressTimer()
  setStatus('分拣中心进度：返航桶清洗与备用池状态同步中', 'warn')
}

function ensureSortingProgressTimer() {
  if (monitorTimer || monitor.sortingProgress >= 100) return
  monitorTimer = setInterval(() => {
    updateSortingCenterState(Date.now() - monitorStartedAt)
    if (monitor.sortingProgress >= 100) clearMonitorTimer()
  }, 80)
}

function backToDispatchMonitor() {
  if (!monitor.active) return
  monitor.scene = 'dispatch'
  renderMetrics()
  renderLists()
  setStatus('调度监测中：返航与补位任务协同执行', 'warn')
  // #ifdef H5
  if (_state.mapReady) drawMap(true)
  startDispatchMapAnimation()
  // #endif
}

function resetDispatchView() {
  if (!monitor.active || monitor.scene !== 'dispatch') return
  _state.shouldFitMap = true
  // #ifdef H5
  if (_state.mapReady) drawMap(true)
  // #endif
}

// ─── 策略切换 ──────────────────────────────────────────
function onStrategyTap(value) {
  if (monitor.active) return
  const next = normalizeStrategy(value)
  if (next === routeStrategy.value) return
  routeStrategy.value = next
  setStorage('collection_route_strategy', next)
  _state.plan = null
  doRefresh()
}

// ─── 导航 ──────────────────────────────────────────────
function openNav(url) {
  if (!url) return
  // #ifdef H5
  window.open(url, '_blank')
  // #endif
  // #ifndef H5
  uni.navigateTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(url)}` })
  // #endif
}
function goBack() {
  jumpToAdminPage('profile', { mode: 'redirect' })
}
function onMarkerTap(e) {
  // 小程序 <map> 标记点击：e.detail.markerId 即 mapMarkers 中的 id（即 bins 索引）
  const i = e && e.detail && e.detail.markerId
  if (!Number.isFinite(i)) return
  const bin = _state.bins[i]
  if (bin) focusBin(bin.id)
}

// ─── 时钟 ──────────────────────────────────────────────
let clockTimer = null
function tick() { clockText.value = fmtTime(new Date(), true) }

// ─── 定时刷新 ──────────────────────────────────────────
let refreshTimer = null
let faultRefreshTimer = null
let unbindThemeWatcher = null
let unbindDatabaseStatus = null
let storageHandler = null
let h5MapResizeHandler = null
let h5MapResizeFrame = null
let h5MapClickHandler = null
let h5MapInitRevision = 0

// ─── H5 地图初始化 ─────────────────────────────────────
// #ifdef H5
async function loadTMapSdk() {
  if (window.TMap) return window.TMap
  for (const key of QQ_MAP_KEYS) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${key}`
        script.async = true; script.onload = resolve
        script.onerror = () => reject(new Error(`failed key ${key}`))
        document.head.appendChild(script)
      })
      if (window.TMap) return window.TMap
    } catch (e) { console.warn('[dashboard-map] sdk load failed:', e?.message) }
  }
  throw new Error('腾讯地图 SDK 加载失败')
}
async function initH5Map() {
  const initRevision = ++h5MapInitRevision
  await loadTMapSdk()
  if (!dashboardActive || initRevision !== h5MapInitRevision) return false
  _state.mapInstance = new window.TMap.Map('map', {
    center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
    zoom: 12, viewMode: '2D'
  })
  _state.mapReady = true
  h5MapClickHandler = (evt) => {
    const lat = typeof evt?.latLng?.getLat === 'function' ? evt.latLng.getLat() : null
    const lng = typeof evt?.latLng?.getLng === 'function' ? evt.latLng.getLng() : null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    _state.manualStartPoint = { name: '地图选择起点', latitude: lat, longitude: lng }
    _state.startPoint = { ..._state.manualStartPoint }
    _state.plan = null
    doRefresh()
  }
  _state.mapInstance.on('click', h5MapClickHandler)
  h5MapResizeHandler = () => {
    if (h5MapResizeFrame !== null) return
    h5MapResizeFrame = requestAnimationFrame(() => {
      h5MapResizeFrame = null
      if (!dashboardActive || !_state.mapInstance) return
      if (typeof _state.mapInstance.resize === 'function') _state.mapInstance.resize()
      drawMap(true)
    })
  }
  window.addEventListener('resize', h5MapResizeHandler)
  return true
}
// #endif

// ─── 生命周期 ──────────────────────────────────────────
onLoad((options = {}) => {
  pendingEntry.panel = decodeEntryParam(options.panel)
  pendingEntry.view = decodeEntryParam(options.view)
  pendingEntry.centerId = decodeEntryParam(options.centerId)
  pendingEntry.centerName = decodeEntryParam(options.centerName)
  if (pendingEntry.view === 'sorting') {
    selectedSortingCenter.id = pendingEntry.centerId || 'center-main'
    selectedSortingCenter.name = pendingEntry.centerName || '中山公园分拣中心'
    entryTransitioning.value = true
  }
})

async function applyPendingEntry() {
  const entry = {
    panel: pendingEntry.panel,
    view: pendingEntry.view,
    centerId: pendingEntry.centerId,
    centerName: pendingEntry.centerName
  }
  pendingEntry.panel = ''
  pendingEntry.view = ''
  pendingEntry.centerId = ''
  pendingEntry.centerName = ''

  if (entry.view === 'sorting') {
    selectedSortingCenter.id = entry.centerId || 'center-main'
    selectedSortingCenter.name = entry.centerName || '中山公园分拣中心'
    try {
      await openSortingCenterMonitor()
    } finally {
      entryTransitioning.value = false
    }
    return
  }
  entryTransitioning.value = false
  if (entry.panel === 'fault') openFaultCenter()
}

onMounted(async () => {
  const mountRevision = ++dashboardMountRevision
  if (!await ensureAdminScreenAccess('collectionDashboard') || mountRevision !== dashboardMountRevision) return
  dashboardActive = true
  unbindDatabaseStatus = subscribeDatabaseStatus((status) => {
    databaseOffline.value = status.offline
  }, databaseStatusRuntime)
  syncThemeMode()
  unbindThemeWatcher = bindThemeStorageSync()
  // #ifdef H5
  storageHandler = (event) => {
    if (!event || event.key === 'app_theme') {
      isLightTheme.value = getStorage('app_theme') !== 'dark'
    }
  }
  window.addEventListener('storage', storageHandler)
  // #endif

  _state.kpiSeries = loadKpiSeries()
  tick()
  clockTimer = setInterval(tick, 1000)

  const refreshPromise = doRefresh()

  // #ifdef H5
  h5MapLoading.value = true
  h5MapError.value = ''
  initH5Map()
    .then((ready) => {
      if (!ready || !dashboardActive || mountRevision !== dashboardMountRevision) return
      h5MapReady.value = true
      h5MapLoading.value = false
      drawMap(true)
    })
    .catch((error) => {
      if (!dashboardActive || mountRevision !== dashboardMountRevision) return
      h5MapLoading.value = false
      h5MapError.value = error && error.message ? error.message : '地图加载失败'
      console.error('[collection-dashboard] map init failed:', error)
    })
  // #endif

  await refreshPromise
  if (!dashboardActive || mountRevision !== dashboardMountRevision) return
  refreshTimer = setInterval(() => doRefresh({ silent: true }), 60000)
  loadFaultEvents(true)
  faultRefreshTimer = setInterval(() => loadFaultEvents(true), 15000)
  await applyPendingEntry()
})

onShow(() => {
  syncThemeMode()
})

onBeforeUnmount(() => {
  // A slow route request must not recreate its monitor interval after this
  // page has left or after another monitor session has replaced it.
  dashboardActive = false
  dashboardMountRevision += 1
  h5MapInitRevision += 1
  monitorRequestRevision += 1
  cancelRoutePlan()
  routePlanRevision += 1
  monitor.active = false
  monitor.scene = ''
  clearMonitorTimer()
  clearRiskPlaybackTimer()
  pauseSortingMasterVideo(true)
  if (clockTimer) clearInterval(clockTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  if (faultRefreshTimer) clearInterval(faultRefreshTimer)
  clockTimer = null
  refreshTimer = null
  faultRefreshTimer = null
  if (typeof unbindThemeWatcher === 'function') unbindThemeWatcher()
  unbindThemeWatcher = null
  if (typeof unbindDatabaseStatus === 'function') unbindDatabaseStatus()
  unbindDatabaseStatus = null
  // #ifdef H5
  if (storageHandler) {
    window.removeEventListener('storage', storageHandler)
    storageHandler = null
  }
  if (h5MapResizeHandler) {
    window.removeEventListener('resize', h5MapResizeHandler)
    h5MapResizeHandler = null
  }
  if (h5MapResizeFrame !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(h5MapResizeFrame)
  }
  h5MapResizeFrame = null
  if (_state.mapInstance && h5MapClickHandler && typeof _state.mapInstance.off === 'function') {
    try { _state.mapInstance.off('click', h5MapClickHandler) } catch (_) {}
  }
  h5MapClickHandler = null
  clearH5Map()
  if (_state.infoWindow) { _state.infoWindow.setMap(null); _state.infoWindow = null }
  if (_state.mapInstance) { try { _state.mapInstance.destroy() } catch (_) {} _state.mapInstance = null }
  _state.mapReady = false
  // #endif
})
</script>

<style scoped src="./collection-dashboard/collection-dashboard.css"></style>
