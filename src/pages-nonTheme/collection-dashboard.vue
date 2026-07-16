<template>
  <view :class="['screen', isLightTheme ? 'light-theme' : 'dark-theme', { 'admin-light-theme': isLightTheme }]">

    <!-- ===== 顶部 panel ===== -->
    <view class="top panel">
      <view class="row">
        <view>
          <view class="title">垃圾清运可视化大屏</view>
          <view class="sub">
            <text class="sub-copy">Tencent Map + 清运路径实时调度</text>
            <text :class="['compact-status', statusCls]">{{ compactStatusText }}</text>
          </view>
        </view>
        <AdminScreenHeader
          screen-key="collectionDashboard"
          :tone="isLightTheme ? 'light' : 'dark'"
          @back="goBack"
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
            <view :class="['btn', 'monitor-chip', monitor.scene === 'telemetry' ? 'active' : '']" @tap="toggleRiskMonitor">
              <text class="feature-icon">!</text><text>{{ monitor.active && monitor.scene === 'telemetry' ? '退出预警' : '风险预警' }}</text>
            </view>
            <view :class="['btn', 'monitor-chip', monitor.scene === 'dispatch' ? 'active' : '']" @tap="toggleDispatchMonitor">
              <text class="feature-icon">↗</text><text>{{ monitor.active && monitor.scene === 'dispatch' ? '退出监测' : '调度监测' }}</text>
            </view>
            <view class="btn fault-btn" @tap="openFaultCenter">
              <text class="feature-icon">!</text><text>故障处理</text>
              <text :class="['fault-badge', faultCenter.summary.open ? '' : 'is-placeholder']">{{ faultCenter.summary.open || 0 }}</text>
            </view>
            <view class="btn ghost" @tap="openSortingCenterMonitor">分拣中心进度</view>
          </view>
        </AdminScreenHeader>
      </view>

      <!-- 指标卡片 -->
      <view class="cards">
        <view class="card">
          <view class="k">桶位总数</view>
          <view class="v">{{ metrics.total }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.total" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">紧急桶位</view>
          <view class="v">{{ metrics.urgent }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.urgent" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">平均满载率</view>
          <view class="v">{{ metrics.averageStr }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.average" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">本次路线里程</view>
          <view class="v">{{ metrics.distanceStr }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.distance" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
        <view class="card">
          <view class="k">预计完工时长</view>
          <view class="v">{{ metrics.durationStr }}</view>
          <view class="delta">
            <text v-for="(tag, i) in metricDeltas.duration" :key="i" :class="['tag', tag.cls]">{{ tag.label }}</text>
          </view>
        </view>
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
            <view class="subline"><text>填充率 {{ bin.fill.toFixed(1) }}%</text><text>重量 {{ bin.weight.toFixed(1) }} kg</text></view>
            <view class="subline"><text>电量 {{ bin.battery.toFixed(0) }}%</text><text>增长 {{ bin.growth.toFixed(2) }}%/h</text></view>
            <view class="risk-mini-track"><view :class="['risk-mini-fill', bin.alertLevel]" :style="{ width: bin.fill + '%' }"></view></view>
            <view class="risk-prediction">预计 {{ bin.fullMinutes }} 分钟达到满载阈值</view>
          </view>
        </scroll-view>
      </view>
      <view class="panel telemetry-hero">
        <view class="scene-kicker">风险预警 · 智能桶实时遥测</view>
        <view class="telemetry-head">
          <view>
            <view class="telemetry-title">{{ monitor.binName }}</view>
            <view class="telemetry-location">位置 · {{ monitor.locationText }}</view>
          </view>
          <view :class="['warning-banner', monitor.alertLevel]">
            <text class="warning-dot"></text>
            <view>
              <view class="warning-title">{{ monitor.alertTitle }}</view>
              <view class="warning-sub">{{ monitor.alertDescription }}</view>
            </view>
          </view>
        </view>

        <view class="telemetry-grid">
          <view class="gauge-card primary">
            <view class="gauge-ring" :style="{ '--gauge-value': monitor.fill.toFixed(1) + '%' }">
              <view class="gauge-core">
                <text class="gauge-value">{{ monitor.fill.toFixed(1) }}%</text>
                <text class="gauge-label">内部填充率</text>
              </view>
            </view>
            <view class="trend-line"><text>近 1 小时</text><text class="trend-up">↑ {{ monitor.growth.toFixed(2) }}%/h</text></view>
          </view>
          <view class="gauge-card">
            <view class="metric-icon">kg</view>
            <view class="metric-big">{{ monitor.weight.toFixed(1) }}</view>
            <view class="metric-unit">当前重量 / kg</view>
            <view class="metric-track"><view class="metric-progress weight" :style="{ width: clamp(monitor.weight / 1.2, 0, 100) + '%' }"></view></view>
            <view class="trend-line"><text>重量变化</text><text class="trend-up">+{{ monitor.weightDelta.toFixed(1) }} kg</text></view>
          </view>
          <view class="gauge-card">
            <view class="metric-icon battery">BAT</view>
            <view class="metric-big">{{ monitor.battery.toFixed(0) }}%</view>
            <view class="metric-unit">设备剩余电量</view>
            <view class="metric-track"><view :class="['metric-progress', monitor.battery < 20 ? 'danger' : 'battery']" :style="{ width: monitor.battery + '%' }"></view></view>
            <view class="trend-line"><text>预计续航</text><text>{{ monitor.batteryHours.toFixed(1) }} h</text></view>
          </view>
          <view class="gauge-card prediction">
            <view class="prediction-label">AI 满载预测</view>
            <view class="prediction-time">{{ monitor.fullMinutes }}<text> 分钟</text></view>
            <view class="prediction-copy">预计 {{ monitor.fullClock }} 达到满载阈值</view>
            <view class="prediction-grid">
              <view><text>增长率</text><b>{{ monitor.growth.toFixed(2) }}%/h</b></view>
              <view><text>增长率模型</text><b>{{ monitor.growthModelLabel }}</b></view>
              <view><text>预测置信度</text><b>{{ (monitor.growthModelConfidence * 100).toFixed(1) }}%</b></view>
            </view>
          </view>
        </view>

        <view class="telemetry-chart">
          <view class="chart-head"><text>填充率与重量变化趋势</text><text>实时采样 · 5 秒</text></view>
          <view class="chart-bars">
            <view v-for="(point, index) in monitor.trend" :key="'trend-' + index" class="chart-column">
              <view class="chart-fill" :style="{ height: point.fill + '%' }"></view>
              <view class="chart-weight" :style="{ height: point.weight + '%' }"></view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- ===== 主体三列 ===== -->
    <view v-show="!(monitor.active && (monitor.scene === 'telemetry' || monitor.scene === 'sorting'))" class="main">

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
          <view class="block-title">点位有桶状态表 <text class="note">是否有桶 / 当前桶体</text></view>
          <scroll-view class="list" scroll-y>
            <view v-if="!pointStatusRows.length" class="empty">暂无点位状态</view>
            <view v-for="row in pointStatusRows" :key="'slot-' + row.id" :class="['slot-row', row.stateCls]">
              <view class="slot-row-top">
                <text class="slot-code">{{ row.pointCode }}</text>
                <text class="slot-state">{{ row.slotStateLabel }}</text>
              </view>
              <view class="slot-row-sub"><text>{{ row.pointName }}</text><text>桶体 {{ row.hasBin ? row.binCode : '--' }}</text></view>
              <view class="slot-row-sub"><text>{{ row.taskLabel }}</text><text :class="['slot-presence', row.hasBin ? 'has' : 'empty-slot']">是否有桶：{{ row.hasBin ? '有桶' : '无桶' }}</text></view>
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
          <view v-if="monitor.active && monitor.scene === 'dispatch'" :class="['monitor-point-state', monitor.pointStateCls]">
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
          <view class="block-title">{{ monitor.scene === 'sorting' ? '分拣中心任务' : '平台任务流' }} <text class="note">{{ monitor.scene === 'sorting' ? '清洗与备用池' : '自动生成' }}</text></view>
          <view class="task-flow">
            <view v-for="task in monitor.tasks" :key="task.id" :class="['monitor-task', task.state]">
              <view class="task-top"><text>{{ task.title }}</text><text class="task-chip">{{ task.status }}</text></view>
              <view class="task-route">{{ task.route }}</view>
              <view class="metric-track"><view class="metric-progress" :class="task.kind" :style="{ width: task.progress + '%' }"></view></view>
              <view class="task-meta"><text>{{ task.device }}</text><text>{{ task.progress.toFixed(0) }}%</text></view>
            </view>
          </view>
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
                <text>{{ fmtKm(stop.travelKm) }} / {{ fmtMin(stop.travelMinutes) }}</text>
                <text>满载率 {{ n(stop.currentFill, 0).toFixed(1) }}%</text>
              </view>
              <view class="dispatch-sub">
                <text>优先级 {{ n(stop.priorityScore, 0).toFixed(3) }}</text>
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
            <view class="telemetry-title">中山公园分拣中心</view>
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
              <image :class="['twin-image', { active: sortingVisualState.key === 'intake' }]" src="/static/sorting-center/facility-intake.png" mode="aspectFit"></image>
              <image :class="['twin-image', { active: sortingVisualState.key === 'washing' }]" src="/static/sorting-center/facility-washing.png" mode="aspectFit"></image>
              <image :class="['twin-image', { active: sortingVisualState.key === 'inspection' }]" src="/static/sorting-center/facility-inspection.png" mode="aspectFit"></image>
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
                <view class="sorting-video-info top-left"><small>{{ monitor.sortingStageText }}</small><b>{{ monitor.returnBinCode }}</b><text>当前设备</text></view>
                <view class="sorting-video-info bottom-right"><small>设备状态</small><b>{{ sortingDeviceStatus }}</b><text>阶段进度 {{ sortingOperation.progress.toFixed(0) }}%</text></view>
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
                  <b>{{ monitor.returnBinCode }}</b>
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
                <b>{{ monitor.sortingStageText }} · {{ sortingOperation.progress.toFixed(0) }}%</b>
              </view>
            </view>
          </view>

          <view class="sorting-rail">
            <view class="sorting-summary">
              <view class="waiting"><text>待分拣</text><b>{{ monitor.sortingSummary.waiting }}</b></view>
              <view class="cleaning"><text>清洗中</text><b>{{ monitor.sortingSummary.cleaning }}</b></view>
              <view class="ready"><text>已清洁待命</text><b>{{ monitor.sortingSummary.ready }}</b></view>
              <view class="blocked"><text>异常滞留</text><b>{{ monitor.sortingSummary.blocked }}</b></view>
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
                <view class="sorting-progress-row"><view class="metric-track"><view class="metric-progress replace" :style="{ width: monitor.sortingProgress + '%' }"></view></view><b>{{ monitor.sortingProgress.toFixed(0) }}%</b></view>
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
          <view><text>故障总数</text><b>{{ faultCenter.summary.total }}</b></view>
          <view><text>待确认</text><b>{{ faultCenter.summary.open }}</b></view>
          <view><text>处理中</text><b>{{ faultCenter.summary.processing }}</b></view>
          <view><text>已关闭</text><b>{{ faultCenter.summary.resolved }}</b></view>
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
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { baseUrl } from '@/api/settings'
import { mapConfig } from '@/api/map-config'
import { CENTER_WORKFLOW_MASTER_VIDEO } from '@/config/center-workflow-video.js'
import { describeApiFailure, redirectIfAccessDenied } from '@/utils/access-guard.js'
import { ensureAdminScreenAccess, goBackFromAdminPage } from '@/utils/admin-page-nav'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import AdminScreenHeader from '@/components/AdminScreenHeader.vue'
import '@/styles/admin-light-theme.css'

// ─── 常量 ─────────────────────────────────────────────
const QQ_MAP_KEYS = [mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].filter(Boolean)
const DEFAULT_CENTER = { latitude: 36.0671, longitude: 120.3826 }
const KPI_HISTORY_KEY = 'collection_dashboard_kpi_history_v2'
const ZHONGSHAN_PARK_POINT_NAMES = [
  '中山北门', '中山北门东侧', '中山南门', '中山南门西侧', '樱花大道南段',
  '小西湖东岸', '小西湖西岸', '孙文莲池', '会前村遗址', '动物园入口',
  '观象亭', '太平山索道口', '公园广场', '儿童乐园', '桂花园',
  '牡丹园', '玉兰园', '中山东门', '中山西门', '林荫步道',
  '湖畔休息区', '迎宾广场', '花卉园', '休闲长廊'
]

// ─── 工具函数 ──────────────────────────────────────────
function n(v, fallback = 0) {
  const value = Number(v)
  return Number.isFinite(value) ? value : fallback
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, n(v, min))) }
function clampFill(v) { return clamp(v, 0, 100) }
function pointCode(index) {
  return `P${String(index + 1).padStart(3, '0')}`
}
function defaultBinCode(index) {
  return `B-M${String(index + 1).padStart(2, '0')}`
}
function zhongshanParkPointName(index) {
  const base = ZHONGSHAN_PARK_POINT_NAMES[index % ZHONGSHAN_PARK_POINT_NAMES.length]
  const group = Math.floor(index / ZHONGSHAN_PARK_POINT_NAMES.length)
  return group === 0 ? base : `${base}-${group + 1}`
}
function withPointIdentity(bin, index) {
  const code = bin.pointCode || pointCode(index)
  const pointName = bin.pointName || zhongshanParkPointName(index)
  return {
    ...bin,
    name: code,
    pointCode: code,
    pointName,
    binCode: bin.binCode || defaultBinCode(index),
    hasBin: bin.hasBin !== false,
    slotState: bin.slotState || (bin.isUrgent ? '满载告警' : '可用'),
    taskLabel: bin.taskLabel || '日常监测'
  }
}
function applyDashboardBinNames(data) {
  const bins = Array.isArray(data?.bins)
    ? data.bins.map((bin, index) => withPointIdentity(bin, index))
    : []
  const binsById = new Map(bins.map(bin => [String(bin.id), bin]))
  const plan = data?.plan ? { ...data.plan } : null

  if (plan && Array.isArray(plan.bins)) {
    plan.bins = plan.bins.map(bin => ({ ...bin, ...(binsById.get(String(bin.id)) || {}) }))
  }
  if (plan?.route && Array.isArray(plan.route.stops)) {
    plan.route = {
      ...plan.route,
      stops: plan.route.stops.map(stop => {
        const mapped = binsById.get(String(stop.id))
        return mapped ? { ...stop, ...mapped, name: mapped.pointCode } : stop
      })
    }
  }
  return { bins, plan }
}

function sev(fill) {
  const f = clampFill(fill)
  if (f >= 90) return 'red'; if (f >= 80) return 'orange'
  if (f >= 65) return 'amber'; return 'green'
}
function sevRank(fill) {
  const f = clampFill(fill)
  if (f >= 90) return 3; if (f >= 80) return 2; if (f >= 65) return 1; return 0
}
function sevLabel(fill) {
  const f = clampFill(fill)
  if (f >= 90) return '紧急'; if (f >= 80) return '高负载'; if (f >= 65) return '临界'; return '正常'
}
function countdownToFull(hoursToFull) {
  const h = n(hoursToFull, NaN)
  if (!Number.isFinite(h)) return '预计满载时间未知'
  const mins = Math.max(0, Math.round(h * 60))
  const hh = Math.floor(mins / 60); const mm = mins % 60
  if (hh === 0) return `预计 ${mm} 分钟满载`
  return `预计 ${hh}h ${mm}m 满载`
}
function fmtTime(value, withSeconds = false) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return withSeconds ? '--:--:--' : '--:--'
  return d.toLocaleTimeString('zh-CN', {
    hour12: false, hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined
  })
}
function fmtKm(v) { return `${n(v, 0).toFixed(2)} km` }
function fmtMin(v) { return `${n(v, 0).toFixed(1)} min` }

function normalizeStrategy(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'shortest_distance') return 'shortest_distance'
  return 'shortest_time'
}
function strategyLabel(strategy) {
  if (strategy === 'shortest_distance') return '最短距离'
  return '最短时间'
}
function handlingLabel(status) {
  if (status === 'processing') return '处理中'
  if (status === 'dispatched') return '已派单'
  return '未处理'
}

function getStorage(key) {
  // #ifdef H5
  return localStorage.getItem(key)
  // #endif
  // #ifndef H5
  const result = uni.getStorageSync(key)
  return result || null
  // #endif
}
function setStorage(key, value) {
  // #ifdef H5
  localStorage.setItem(key, value)
  // #endif
  // #ifndef H5
  uni.setStorageSync(key, value)
  // #endif
}

function seededRatio(seed) {
  const text = String(seed || 'seed'); let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return (hash % 1000) / 1000
}

// ─── 响应式状态 ────────────────────────────────────────
const clockText = ref('--:--:--')
const statusText = ref('准备就绪')
const statusCls = ref('')
const compactStatusText = computed(() => {
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

const metrics = ref({ total: 0, urgent: 0, averageStr: '0%', distanceStr: '0 km', durationStr: '0 min' })
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

// 地图（小程序端用 <map> 组件）
const mapCenter = ref({ ...DEFAULT_CENTER })
const mapScale = ref(12)
const mapMarkers = ref([])
const mapPolyline = ref([])
const h5MapReady = ref(false)
const h5MapLoading = ref(false)
const h5MapError = ref('')

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
  growthModelLabel: '近期区间',
  growthModelConfidence: 0.64,
  sortingProgress: 0,
  sortingStatus: '待接收',
  sortingStageText: '等待返航桶抵达分拣中心',
  sortingTimeline: [],
  sortingQueue: [],
  sortingSummary: { waiting: 1, cleaning: 0, ready: 2, blocked: 0 }
})
const riskMonitorBins = computed(() => monitor.riskBins)
const sortingVisualState = computed(() => {
  const stage = String(monitor.sortingStageText || '')
  if (stage.includes('清洗') || stage.includes('烘干')) {
    return { key: 'washing', label: '清洗消毒运行' }
  }
  if (stage.includes('充电') || stage.includes('电量') || stage.includes('检测') || stage.includes('投放') || monitor.sortingProgress >= 70) {
    return { key: 'inspection', label: '电检质检运行' }
  }
  return { key: 'intake', label: '入站称重运行' }
})
const SORTING_WORKFLOW_TOTAL_MS = Math.round(CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds * 1000)
const masterCueMs = key => Math.round((CENTER_WORKFLOW_MASTER_VIDEO.cuePoints[key]?.startSeconds || 0) * 1000)
const SORTING_OPERATION_STEPS = [
  { key: 'arrive', label: '抵达分拣中心', at: masterCueMs('arrive'), nextAt: masterCueMs('weigh'), x: 18, y: 57 },
  { key: 'weigh', label: '倾倒称重', at: masterCueMs('weigh'), nextAt: masterCueMs('wash'), x: 24, y: 55 },
  { key: 'wash', label: '内壁清洗', at: masterCueMs('wash'), nextAt: masterCueMs('dry'), x: 43, y: 52 },
  { key: 'dry', label: '消毒烘干', at: masterCueMs('dry'), nextAt: masterCueMs('battery'), x: 56, y: 61 },
  { key: 'battery', label: '状态检测', at: masterCueMs('battery'), nextAt: masterCueMs('charge'), x: 68, y: 60 },
  { key: 'charge', label: '补能充电', at: masterCueMs('charge'), nextAt: masterCueMs('ready'), x: 76, y: 63 },
  { key: 'ready', label: '可再次投放', at: masterCueMs('ready'), nextAt: SORTING_WORKFLOW_TOTAL_MS, x: 82, y: 66 }
]
const sortingOperation = computed(() => {
  const elapsed = clamp(monitor.sortingProgress / 100 * SORTING_WORKFLOW_TOTAL_MS, 0, SORTING_WORKFLOW_TOTAL_MS)
  let current = SORTING_OPERATION_STEPS[0]
  SORTING_OPERATION_STEPS.forEach(step => {
    if (elapsed >= step.at) current = step
  })
  const duration = Math.max(1, current.nextAt - current.at)
  return {
    ...current,
    progress: current.key === 'ready' ? 100 : clamp((elapsed - current.at) / duration * 100, 0, 100)
  }
})
const sortingWorkpieceStyle = computed(() => ({
  left: `${sortingOperation.value.x}%`,
  top: `${sortingOperation.value.y}%`
}))
const sortingMasterVideoRef = ref(null)
const sortingMasterVideoReady = ref(false)
const sortingMasterVideoFailed = ref(false)
const sortingManualPlaybackActive = ref(false)
const sortingMasterTimelineSeconds = computed(() => clamp(
  monitor.sortingProgress / 100 * CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds,
  0,
  CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds
))
const sortingWorkflowStarted = computed(() => Boolean(
  monitor.sortingProgress > 0 || sortingManualPlaybackActive.value
))
const sortingStageVideoActive = computed(() => Boolean(
  monitor.active && monitor.scene === 'sorting' && sortingWorkflowStarted.value && sortingMasterVideoReady.value && !sortingMasterVideoFailed.value
))
const sortingDeviceStatus = computed(() => ({
  weigh: '卸料称重中', wash: '清洗消毒中', charge: '补能连接中', battery: '状态检测中'
}[sortingOperation.value.key] || monitor.sortingStatus))

function sortingMasterVideoElement() {
  const target = sortingMasterVideoRef.value
  if (!target) return null
  if (typeof target.play === 'function') return target
  const root = target.$el || target
  if (typeof root?.play === 'function') return root
  return root?.querySelector?.('video') || null
}

function pauseSortingMasterVideo(resetTime = false) {
  const media = sortingMasterVideoElement()
  if (!media) return
  try { media.pause?.() } catch (_) {}
  if (resetTime) {
    try { media.currentTime = 0 } catch (_) {}
  }
}

function seekSortingMasterVideo(seconds) {
  const media = sortingMasterVideoElement()
  if (!media) return
  const target = clamp(seconds, 0, Math.max(0, CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds - 0.04))
  try {
    if (typeof media.fastSeek === 'function') media.fastSeek(target)
    else media.currentTime = target
  } catch (_) {}
}

async function playSortingMasterVideo() {
  if (!sortingStageVideoActive.value) return
  await nextTick()
  const media = sortingMasterVideoElement()
  if (!media) return
  try { media.playbackRate = CENTER_WORKFLOW_MASTER_VIDEO.playbackRate } catch (_) {}
  try {
    const promise = media.play?.()
    if (promise?.catch) promise.catch(() => {})
  } catch (_) {}
}

function syncSortingMasterVideo(forceSeek = false) {
  if (!monitor.active || monitor.scene !== 'sorting' || !sortingMasterVideoReady.value || sortingMasterVideoFailed.value) return
  if (!sortingWorkflowStarted.value) {
    pauseSortingMasterVideo(true)
    return
  }
  const desiredTime = sortingMasterTimelineSeconds.value
  // 自动推进期间不再触碰 currentTime，主视频由浏览器连续解码播放。
  // 仅进入分拣页或用户手动点击阶段时才定位到对应时间点。
  if (forceSeek) seekSortingMasterVideo(desiredTime)
  playSortingMasterVideo()
}

function handleSortingMasterVideoReady() {
  const firstReady = !sortingMasterVideoReady.value
  sortingMasterVideoReady.value = true
  sortingMasterVideoFailed.value = false
  // `canplay` 在缓冲恢复时也可能再次触发；只处理首次就绪，避免干预连续播放。
  if (firstReady) syncSortingMasterVideo(true)
}

function handleSortingMasterVideoEnded() {
  // 母带尾部本身就是待命画面，结束后保留最后一帧。
  pauseSortingMasterVideo()
}

function handleSortingMasterVideoError() {
  sortingMasterVideoFailed.value = true
  pauseSortingMasterVideo()
}

watch(sortingWorkflowStarted, started => {
  if (started) {
    nextTick(() => syncSortingMasterVideo(true))
    return
  }
  pauseSortingMasterVideo(true)
}, { flush: 'post' })

watch(() => [monitor.active, monitor.scene], ([active, scene]) => {
  if (active && scene === 'sorting') {
    nextTick(() => syncSortingMasterVideo(true))
    return
  }
  pauseSortingMasterVideo(true)
  if (!active) {
    sortingMasterVideoReady.value = false
    sortingMasterVideoFailed.value = false
  }
}, { flush: 'post' })
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

function interpolatePoint(from, to, progress) {
  const p = clamp(progress, 0, 1)
  return {
    latitude: n(from && from.latitude, 0) + (n(to && to.latitude, 0) - n(from && from.latitude, 0)) * p,
    longitude: n(from && from.longitude, 0) + (n(to && to.longitude, 0) - n(from && from.longitude, 0)) * p
  }
}

function pointAlongRoute(route, progress) {
  if (!Array.isArray(route) || route.length < 2) return null
  const p = clamp(progress, 0, 1)
  const segmentLengths = []
  let totalLength = 0
  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index]
    const to = route[index + 1]
    const avgLatRad = ((n(from[0], 0) + n(to[0], 0)) / 2) * Math.PI / 180
    const latMeters = (n(to[0], 0) - n(from[0], 0)) * 111320
    const lngMeters = (n(to[1], 0) - n(from[1], 0)) * 111320 * Math.cos(avgLatRad)
    const length = Math.max(Math.hypot(latMeters, lngMeters), 0.001)
    segmentLengths.push(length)
    totalLength += length
  }
  let remaining = totalLength * p
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]
    if (remaining <= length || index === segmentLengths.length - 1) {
      return interpolatePoint(
        { latitude: route[index][0], longitude: route[index][1] },
        { latitude: route[index + 1][0], longitude: route[index + 1][1] },
        clamp(remaining / length, 0, 1)
      )
    }
    remaining -= length
  }
  return { latitude: route[route.length - 1][0], longitude: route[route.length - 1][1] }
}

// ─── KPI 历史 ──────────────────────────────────────────
function loadKpiSeries() {
  try {
    const raw = getStorage(KPI_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) { return [] }
}
function saveKpiSeries(list) {
  try { setStorage(KPI_HISTORY_KEY, JSON.stringify(list)) } catch (_) {}
}
function pushKpi(snapshot) {
  const now = Date.now()
  const range = 35 * 24 * 60 * 60 * 1000
  const next = _state.kpiSeries.filter(item => now - Number(item.ts) < range)
  next.push({ ts: now, ...snapshot })
  _state.kpiSeries = next.slice(-800)
  saveKpiSeries(_state.kpiSeries)
}
function nearestKpi(hoursAgo, current, seedTag) {
  const target = Date.now() - hoursAgo * 3600 * 1000
  let best = null; let bestDiff = Infinity
  for (const item of _state.kpiSeries) {
    const diff = Math.abs(Number(item.ts) - target)
    if (diff < bestDiff) { best = item; bestDiff = diff }
  }
  if (best) return best
  const ratio = 0.92 + seededRatio(`${seedTag}-${new Date().toDateString()}`) * 0.16
  return {
    total: Math.max(0, current.total / ratio),
    urgent: Math.max(0, current.urgent / ratio),
    average: clamp(current.average / ratio, 0, 100),
    distance: Math.max(0, current.distance / ratio),
    duration: Math.max(0, current.duration / ratio)
  }
}

// ─── delta 标签 ────────────────────────────────────────
function deltaTag(label, current, base, unit, lowerBetter) {
  const c = n(current, NaN); const b = n(base, NaN)
  if (!Number.isFinite(c) || !Number.isFinite(b)) return { label: `${label} --`, cls: 'flat' }
  const delta = c - b; const abs = Math.abs(delta)
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
  let cls = 'flat'
  if (delta !== 0) cls = lowerBetter ? (delta < 0 ? 'up' : 'down') : (delta > 0 ? 'up' : 'down')
  return { label: `${label} ${arrow}${abs.toFixed(1)}${unit || ''}`, cls }
}

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
    averageStr: `${m.average.toFixed(1)}%`,
    distanceStr: `${m.distance.toFixed(2)} km`,
    durationStr: `${m.duration.toFixed(1)} min`
  }
  const day = nearestKpi(24, m, 'day')
  const week = nearestKpi(24 * 7, m, 'week')
  const target = {
    total: Math.max(12, Math.round(m.total * 0.9)),
    urgent: Math.max(1, Math.round(m.total * 0.12)),
    average: 72, distance: 9.5, duration: 42
  }
  metricDeltas.value = {
    total: [deltaTag('较昨日', m.total, day.total, '', false), deltaTag('较上周', m.total, week.total, '', false), deltaTag('目标差', m.total, target.total, '', false)],
    urgent: [deltaTag('较昨日', m.urgent, day.urgent, '', true), deltaTag('较上周', m.urgent, week.urgent, '', true), deltaTag('目标差', m.urgent, target.urgent, '', true)],
    average: [deltaTag('较昨日', m.average, day.average, '%', true), deltaTag('较上周', m.average, week.average, '%', true), deltaTag('目标差', m.average, target.average, '%', true)],
    distance: [deltaTag('较昨日', m.distance, day.distance, 'km', true), deltaTag('较上周', m.distance, week.distance, 'km', true), deltaTag('目标差', m.distance, target.distance, 'km', true)],
    duration: [deltaTag('较昨日', m.duration, day.duration, 'min', true), deltaTag('较上周', m.duration, week.duration, 'min', true), deltaTag('目标差', m.duration, target.duration, 'min', true)]
  }
  if (!monitor.active) pushKpi(m)
}

function renderBrief() {
  const route = _state.plan && _state.plan.route
  if (!route) { briefLines.value = ['尚未生成路线']; return }
  const start = (_state.plan && _state.plan.start) || _state.startPoint || DEFAULT_CENTER
  const providerLine = route.provider === 'tencent'
    ? '路线来源：腾讯道路'
    : '路线来源：降级直线（当前未拿到腾讯道路）'
  briefLines.value = [
    `策略：${strategyLabel(routeStrategy.value)} | 车辆：1 台`,
    `起点：${start.name || '清运起点'} | 停靠：${route.stops.length} 个`,
    `总里程：${fmtKm(route.totalDistanceKm)} | 总耗时：${fmtMin(route.totalMinutes)}`,
    `开始：${fmtTime(route.startTime)} | 结束：${fmtTime(route.endTime)}`,
    providerLine
  ]
}

function slotStateClass(state) {
  const value = String(state || '').toLowerCase()
  if (['满载告警', '返航中', 'abnormal', 'maintenance', 'returning'].includes(value)) return 'danger'
  if (['待补位', '空位', 'pending_replacement', 'vacant', 'replacement'].includes(value)) return 'waiting'
  if (['补位完成', '可用', 'available', 'ready'].includes(value)) return 'available'
  return ''
}

function displaySlotState(state) {
  const value = String(state || '').trim().toLowerCase()
  const labels = {
    available: '可用',
    vacant: '空位',
    pending_replacement: '待补位',
    replacement: '补位中',
    returning: '返航中',
    abnormal: '异常',
    maintenance: '维护中',
    ready: '可用'
  }
  return labels[value] || String(state || '状态未知')
}

function displayTaskType(type) {
  const typeLabels = {
    return: '返航任务',
    replacement: '补位任务',
    dispatch: '调度任务',
    monitoring: '监测中'
  }
  return typeLabels[String(type || '').toLowerCase()] || String(type || '任务')
}

function displayOperationalState(status) {
  const statusLabels = {
    pending: '待处理',
    dispatched: '已派发',
    running: '执行中',
    processing: '处理中',
    completed: '已完成',
    done: '已完成',
    active: '处理中',
    ready: '已就绪',
    waiting: '待处理',
    available: '可用'
  }
  return statusLabels[String(status || '').toLowerCase()] || String(status || '状态未知')
}

function displayTaskLabel(type, status) {
  const taskText = displayTaskType(type)
  const statusText = status ? displayOperationalState(status) : ''
  return [taskText, statusText].filter(Boolean).join(' · ') || '监测中'
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
function buildMpMapData() {
  const bins = _state.bins || []
  const colorMap = { green: '#16c57c', amber: '#f5b648', orange: '#ff8b3d', red: '#ff5d66' }
  const markers = bins.map((bin, i) => ({
    id: i,
    latitude: n(bin.latitude, 0),
    longitude: n(bin.longitude, 0),
    title: bin.name,
    iconPath: '',
    label: { content: String(bin.name || '').slice(0, 4), color: '#fff', fontSize: 10, bgColor: colorMap[sev(bin.currentFill)] || '#2c8fff', padding: 3, borderRadius: 4 },
    width: 24, height: 24,
    callout: { content: `${bin.name}\n满载率 ${clampFill(bin.currentFill).toFixed(1)}%`, display: 'BYCLICK', color: '#17324a', fontSize: 12, borderRadius: 6, bgColor: '#fff', padding: 6 }
  }))

  const route = _state.plan && _state.plan.route
  const polylineArr = []
  if (route && Array.isArray(route.polyline) && route.polyline.length > 1) {
    polylineArr.push({
      points: route.polyline.map(p => ({ latitude: p[0], longitude: p[1] })),
      color: '#2dc6ffcc', width: 6
    })
  }

  mapMarkers.value = markers
  mapPolyline.value = polylineArr

  if (_state.startPoint) {
    mapCenter.value = { latitude: _state.startPoint.latitude, longitude: _state.startPoint.longitude }
  } else if (bins.length) {
    mapCenter.value = { latitude: n(bins[0].latitude, DEFAULT_CENTER.latitude), longitude: n(bins[0].longitude, DEFAULT_CENTER.longitude) }
  }
}

// ─── H5 腾讯地图 ───────────────────────────────────────
// #ifdef H5
function markerSvg(fillColor, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="14" fill="${fillColor}" stroke="#fff" stroke-width="3"></circle><text x="22" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial">${label}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
function iconSrc(key, fillColor, label) {
  if (_state.iconCache.has(key)) return _state.iconCache.get(key)
  const src = markerSvg(fillColor, label)
  _state.iconCache.set(key, src); return src
}
function mapSignature() {
  const bins = (_state.bins || []).map(b => `${b.id}:${Math.round(n(b.currentFill, 0) * 10) / 10}`).join('|')
  const route = _state.plan && _state.plan.route
  const stops = route && Array.isArray(route.stops) ? route.stops.map(s => `${s.order}:${s.id}`).join('|') : 'none'
  const polyline = route && Array.isArray(route.polyline) ? route.polyline : []
  const polylineMeta = polyline.length
    ? `${polyline.length}:${polyline[0][0]},${polyline[0][1]}:${polyline[polyline.length - 1][0]},${polyline[polyline.length - 1][1]}`
    : 'none'
  const segmentMeta = route && Array.isArray(route.segments)
    ? route.segments.map(segment => Array.isArray(segment && segment.polyline) ? segment.polyline.length : 0).join(',')
    : 'none'
  const startMeta = _state.startPoint
    ? `${n(_state.startPoint.latitude, 0)},${n(_state.startPoint.longitude, 0)}`
    : 'none'
  const generatedAt = _state.plan && _state.plan.generatedAt ? String(_state.plan.generatedAt) : 'none'
  const monitorMeta = monitor.active
    ? `${monitor.scene}:${monitor.pointState}:${Math.round(monitor.returnProgress * 100)}:${Math.round(monitor.replaceProgress * 100)}`
    : 'off'
  return `${bins}::${stops}::poly-${polylineMeta}::seg-${segmentMeta}::start-${startMeta}::gen-${generatedAt}::sel-${selectedBinId.value || ''}-${selectedStopOrder.value || ''}-${routeStrategy.value}::monitor-${monitorMeta}`
}
function clearH5Map() {
  const s = _state
  if (s.binMarkers) { s.binMarkers.setMap(null); s.binMarkers = null }
  if (s.routePolyline) { s.routePolyline.setMap(null); s.routePolyline = null }
  if (s.sequenceMarkers) { s.sequenceMarkers.setMap(null); s.sequenceMarkers = null }
  if (s.startMarker) { s.startMarker.setMap(null); s.startMarker = null }
  if (s.focusPolyline) { s.focusPolyline.setMap(null); s.focusPolyline = null }
  if (s.monitorMarkers) { s.monitorMarkers.setMap(null); s.monitorMarkers = null }
  if (s.monitorPolyline) { s.monitorPolyline.setMap(null); s.monitorPolyline = null }
}
function showInfoWindow(lat, lng, html) {
  if (!window.TMap || !_state.mapInstance) return
  const point = new window.TMap.LatLng(lat, lng)
  if (!_state.infoWindow) {
    _state.infoWindow = new window.TMap.InfoWindow({ map: _state.mapInstance, position: point, content: html }); return
  }
  _state.infoWindow.setMap(_state.mapInstance)
  _state.infoWindow.setPosition(point)
  _state.infoWindow.setContent(html)
}
function drawMap(force) {
  if (!_state.mapInstance || !window.TMap) return
  const sig = mapSignature()
  if (!force && sig === _state.lastMapSignature) return
  _state.lastMapSignature = sig
  clearH5Map()

  const TMap = window.TMap
  const bins = _state.bins || []
  const bounds = new TMap.LatLngBounds()
  let hasBounds = false
  const colorMap = { green: '#16c57c', amber: '#f5b648', orange: '#ff8b3d', red: '#ff5d66', selected: '#2c8fff' }
  const styles = {}
  Object.entries(colorMap).forEach(([k, c]) => {
    styles[k] = new TMap.MarkerStyle({ width: k === 'selected' ? 30 : 24, height: k === 'selected' ? 30 : 24, anchor: { x: k === 'selected' ? 15 : 12, y: k === 'selected' ? 15 : 12 }, src: iconSrc(k, c, k === 'selected' ? 'X' : '') })
  })

  const geometries = bins.map((bin, i) => {
    const pos = new TMap.LatLng(n(bin.latitude, 0), n(bin.longitude, 0))
    bounds.extend(pos); hasBounds = true
    const isMonitorTarget = monitor.active && ['dispatch', 'sorting'].includes(monitor.scene) && String(monitor.binId) === String(bin.id)
    const styleId = isMonitorTarget
      ? (monitor.pointStateCls === 'available' ? 'green' : 'red')
      : selectedBinId.value && String(selectedBinId.value) === String(bin.id)
        ? 'selected'
        : sev(clampFill(bin.currentFill))
    return { id: `bin-${bin.id}-${i}`, styleId, position: pos, properties: { i } }
  })
  if (geometries.length) {
    _state.binMarkers = new TMap.MultiMarker({ id: 'db-bins', map: _state.mapInstance, styles, geometries })
    _state.binMarkers.on('click', evt => {
      const i = evt?.geometry?.properties?.i
      if (!Number.isFinite(i) || !bins[i]) return
      focusBin(bins[i].id, true)
    })
  }

  if (_state.startPoint) {
    const sp = new TMap.LatLng(_state.startPoint.latitude, _state.startPoint.longitude)
    _state.startMarker = new TMap.MultiMarker({ id: 'db-start', map: _state.mapInstance, styles: { s: new TMap.MarkerStyle({ width: 28, height: 28, anchor: { x: 14, y: 14 }, src: iconSrc('start', '#2c8fff', 'S') }) }, geometries: [{ id: 'start-1', styleId: 's', position: sp }] })
    bounds.extend(sp); hasBounds = true
  }

  const route = _state.plan && _state.plan.route
  if (!monitor.active && route && Array.isArray(route.polyline) && route.polyline.length > 1) {
    const polyline = route.polyline.map(p => new TMap.LatLng(p[0], p[1]))
    _state.routePolyline = new TMap.MultiPolyline({ id: 'db-route', map: _state.mapInstance, styles: { route: new TMap.PolylineStyle({ color: isLightTheme.value ? '#18a77c' : '#2dc6ff', width: 6, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) }, geometries: [{ id: 'main', styleId: 'route', paths: polyline }] })
    polyline.forEach(p => { bounds.extend(p); hasBounds = true })

    const stopStyles = {}
    const stopGeos = (route.stops || []).map((stop, idx) => {
      const focused = selectedStopOrder.value === Number(stop.order)
      const sid = focused ? `focus-${stop.order}` : `stop-${stop.order}`
      if (!stopStyles[sid]) stopStyles[sid] = new TMap.MarkerStyle({ width: focused ? 28 : 24, height: focused ? 28 : 24, anchor: { x: focused ? 14 : 12, y: focused ? 14 : 12 }, src: iconSrc(sid, focused ? '#ff9f42' : '#1f7eff', String(stop.order)) })
      return { id: `stop-${idx}`, styleId: sid, position: new TMap.LatLng(stop.latitude, stop.longitude), properties: { order: stop.order } }
    })
    if (stopGeos.length) {
      _state.sequenceMarkers = new TMap.MultiMarker({ id: 'db-seq', map: _state.mapInstance, styles: stopStyles, geometries: stopGeos })
      _state.sequenceMarkers.on('click', evt => {
        const order = evt?.geometry?.properties?.order
        if (!Number.isFinite(order)) return
        focusStop(order, true)
      })
    }

    if (selectedStopOrder.value !== null) {
      const idx = (route.stops || []).findIndex(s => Number(s.order) === Number(selectedStopOrder.value))
      if (idx >= 0) {
        const stop = route.stops[idx]
        const segmentPoints = Array.isArray(stop.segmentPolyline) && stop.segmentPolyline.length > 1
          ? stop.segmentPolyline
          : (route.segments && Array.isArray(route.segments[idx] && route.segments[idx].polyline) && route.segments[idx].polyline.length > 1
            ? route.segments[idx].polyline
            : null)
        if (segmentPoints) {
          _state.focusPolyline = new TMap.MultiPolyline({
            id: 'db-focus',
            map: _state.mapInstance,
            styles: { focus: new TMap.PolylineStyle({ color: '#ffb04a', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) },
            geometries: [{ id: 'focus', styleId: 'focus', paths: segmentPoints.map(p => new TMap.LatLng(p[0], p[1])) }]
          })
        }
      }
    }
  }
  if (monitor.active && monitor.scene === 'dispatch' && monitor.targetPoint) {
    const monitorStyles = {
      sorting: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: iconSrc('monitor-sorting', '#8859ff', '分') }),
      standby: new TMap.MarkerStyle({ width: 32, height: 32, anchor: { x: 16, y: 16 }, src: iconSrc('monitor-standby', '#2c8fff', '备') }),
      returning: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: iconSrc('monitor-returning', '#ff5d66', '返') }),
      replacing: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: iconSrc('monitor-replacing', '#16c57c', '补') })
    }
    const monitorGeometries = [
      { id: 'sorting-center', styleId: 'sorting', position: new TMap.LatLng(monitor.sortingCenter.latitude, monitor.sortingCenter.longitude) },
      { id: 'standby-area', styleId: 'standby', position: new TMap.LatLng(monitor.standbyArea.latitude, monitor.standbyArea.longitude) }
    ]
    if (monitor.returnProgress < 1 && monitor.returnPosition) {
      monitorGeometries.push({ id: 'returning-bin', styleId: 'returning', position: new TMap.LatLng(monitor.returnPosition.latitude, monitor.returnPosition.longitude) })
    }
    if (monitor.replacePosition) {
      monitorGeometries.push({ id: 'replacement-bin', styleId: 'replacing', position: new TMap.LatLng(monitor.replacePosition.latitude, monitor.replacePosition.longitude) })
    }
    _state.monitorMarkers = new TMap.MultiMarker({
      id: 'monitor-special-markers', map: _state.mapInstance, styles: monitorStyles, geometries: monitorGeometries
    })
    const routeStyles = {
      returning: new TMap.PolylineStyle({ color: '#ff5d66', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }),
      replacing: new TMap.PolylineStyle({ color: '#24d9ff', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' })
    }
    const routeGeometries = []
    if (monitor.returnRoute.length > 1) routeGeometries.push({ id: 'return-route', styleId: 'returning', paths: monitor.returnRoute.map(p => new TMap.LatLng(p[0], p[1])) })
    if (monitor.replaceRoute.length > 1) routeGeometries.push({ id: 'replace-route', styleId: 'replacing', paths: monitor.replaceRoute.map(p => new TMap.LatLng(p[0], p[1])) })
    if (routeGeometries.length) {
      _state.monitorPolyline = new TMap.MultiPolyline({
        id: 'monitor-routes',
        map: _state.mapInstance,
        styles: routeStyles,
        geometries: routeGeometries
      })
    }
    ;[monitor.targetPoint, monitor.sortingCenter, monitor.standbyArea].forEach(point => {
      bounds.extend(new TMap.LatLng(point.latitude, point.longitude))
      hasBounds = true
    })
  }
  if (hasBounds && _state.mapInstance.fitBounds && (!monitor.active || _state.shouldFitMap)) {
    _state.mapInstance.fitBounds(bounds, { padding: 70 })
    _state.shouldFitMap = false
  }
}

function updateH5DispatchLayers(elapsed) {
  if (!_state.mapInstance || !window.TMap || !_state.monitorMarkers || !monitor.routeAvailable) return false
  const TMap = window.TMap
  const returnProgress = clamp((elapsed - 1000) / 17500, 0, 1)
  const replaceProgress = clamp((elapsed - 2500) / 11000, 0, 1)
  const returnPosition = pointAlongRoute(monitor.returnRoute, returnProgress)
  const replacePosition = pointAlongRoute(monitor.replaceRoute, replaceProgress)
  const geometries = [
    { id: 'sorting-center', styleId: 'sorting', position: new TMap.LatLng(monitor.sortingCenter.latitude, monitor.sortingCenter.longitude) },
    { id: 'standby-area', styleId: 'standby', position: new TMap.LatLng(monitor.standbyArea.latitude, monitor.standbyArea.longitude) }
  ]
  if (returnProgress < 1 && returnPosition) {
    geometries.push({ id: 'returning-bin', styleId: 'returning', position: new TMap.LatLng(returnPosition.latitude, returnPosition.longitude) })
  }
  if (replacePosition) {
    geometries.push({ id: 'replacement-bin', styleId: 'replacing', position: new TMap.LatLng(replacePosition.latitude, replacePosition.longitude) })
  }

  if (typeof _state.monitorMarkers.setGeometries === 'function') {
    _state.monitorMarkers.setGeometries(geometries)
  } else if (typeof _state.monitorMarkers.updateGeometries === 'function') {
    _state.monitorMarkers.updateGeometries(geometries)
  } else {
    return false
  }

  const targetIndex = (_state.bins || []).findIndex(bin => String(bin.id) === String(monitor.binId))
  if (targetIndex >= 0 && _state.binMarkers && typeof _state.binMarkers.updateGeometries === 'function') {
    const bin = _state.bins[targetIndex]
    _state.binMarkers.updateGeometries([{
      id: `bin-${bin.id}-${targetIndex}`,
      styleId: monitor.pointStateCls === 'available' ? 'green' : 'red',
      position: new TMap.LatLng(n(bin.latitude, 0), n(bin.longitude, 0)),
      properties: { i: targetIndex }
    }])
  }
  return true
}
// #endif

// ─── 交互：聚焦 bin / stop ────────────────────────────
function focusBin(binId, forceMap) {
  const bin = (_state.bins || []).find(item => String(item.id) === String(binId))
  if (!bin) return
  selectedBinId.value = String(bin.id)
  selectedStopOrder.value = null
  renderLists()
  // #ifdef H5
  if (_state.mapReady && _state.mapInstance) {
    _state.mapInstance.setCenter(new window.TMap.LatLng(bin.latitude, bin.longitude))
    showInfoWindow(bin.latitude, bin.longitude, `<div style="min-width:190px;padding:2px 4px"><div style="font-size:13px;font-weight:700;color:#17324a">${bin.pointCode || bin.name} · ${bin.pointName || ''}</div><div style="margin-top:4px;font-size:12px;color:#365066">桶体 ${bin.hasBin === false ? '无桶' : (bin.binCode || '--')} · ${displaySlotState(bin.slotState || '可用')}</div><div style="margin-top:2px;font-size:12px;color:#60778b">满载率 ${n(bin.currentFill, 0).toFixed(1)}% · 预测 ${n(bin.predictedFillInHorizon, 0).toFixed(1)}%</div></div>`)
  }
  drawMap(!!forceMap)
  // #endif
  // #ifndef H5
  mapCenter.value = { latitude: n(bin.latitude, DEFAULT_CENTER.latitude), longitude: n(bin.longitude, DEFAULT_CENTER.longitude) }
  mapScale.value = 14
  buildMpMapData()
  // #endif
}
function focusStop(order, forceMap) {
  const route = _state.plan && _state.plan.route
  if (!route || !Array.isArray(route.stops)) return
  const stop = route.stops.find(item => Number(item.order) === Number(order))
  if (!stop) return
  selectedStopOrder.value = Number(stop.order)
  selectedBinId.value = String(stop.id)
  renderLists()
  // #ifdef H5
  if (_state.mapReady && _state.mapInstance) {
    _state.mapInstance.setCenter(new window.TMap.LatLng(stop.latitude, stop.longitude))
    showInfoWindow(stop.latitude, stop.longitude, `<div style="min-width:185px;padding:2px 4px"><div style="font-size:13px;font-weight:700;color:#17324a">#${stop.order} ${stop.pointCode || stop.name}</div><div style="margin-top:4px;font-size:12px;color:#365066">${stop.pointName || ''} · ETA ${fmtTime(stop.eta)}</div><div style="margin-top:2px;font-size:12px;color:#60778b">桶体 ${stop.binCode || '--'} · 满载率 ${n(stop.currentFill, 0).toFixed(1)}%</div></div>`)
  }
  drawMap(!!forceMap)
  // #endif
  // #ifndef H5
  mapCenter.value = { latitude: n(stop.latitude, DEFAULT_CENTER.latitude), longitude: n(stop.longitude, DEFAULT_CENTER.longitude) }
  mapScale.value = 14
  buildMpMapData()
  // #endif
}

// ─── API ───────────────────────────────────────────────
function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = token
  return headers
}

function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = path.startsWith('/') ? `${baseUrl}${path}` : path
    const method = options.method || 'GET'
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)
    // #ifdef H5
    fetch(url, { method, body, headers: authHeaders() })
      .then(async (r) => {
        let json = null
        try {
          json = await r.json()
        } catch (_) {}
        if (!json || json.code !== 0 || !r.ok) {
          if (redirectIfAccessDenied(json, r)) {
            throw new Error(describeApiFailure(json, r))
          }
          throw new Error(describeApiFailure(json, r))
        }
        resolve(json.data)
      })
      .catch(reject)
    // #endif
    // #ifndef H5
    uni.request({
      url, method, data: options.body, header: authHeaders(),
      success: res => {
        const json = res.data
        if (!json || json.code !== 0) { reject(new Error((json && json.msg) || `HTTP ${res.statusCode}`)); return }
        resolve(json.data)
      },
      fail: err => reject(new Error(err && err.errMsg ? err.errMsg : String(err)))
    })
    // #endif
  })
}

function setStatus(text, cls) {
  statusText.value = text || ''
  statusCls.value = cls || ''
}

function buildDashboardSnapshotPath() {
  const params = [`routeStrategy=${encodeURIComponent(routeStrategy.value)}`]

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

async function doRefresh(options) {
  const silent = !!(options && options.silent)
  if (monitor.active) return
  if (_state.loading) return
  _state.loading = true
  if (!silent) setStatus(`正在刷新清运数据（${strategyLabel(routeStrategy.value)}）...`, 'warn')
  try {
    const data = await apiRequest(buildDashboardSnapshotPath())
    if (monitor.active) return
    const namedData = applyDashboardBinNames(data)
    _state.bins = namedData.bins
    _state.plan = namedData.plan
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
    setStatus(`刷新成功：${_state.bins.length} 个桶位，${routeStops.length} 个停靠点，策略 ${strategyLabel(routeStrategy.value)}`, 'ok')
  } catch (err) {
    console.error('[collection-dashboard] refresh failed:', err)
    setStatus(err && err.message ? err.message : String(err), 'err')
  } finally {
    _state.loading = false
  }
}

// ─── 风险预警与调度监测 ───────────────────────────────
let monitorTimer = null
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
const TENCENT_ROUTE_SNAPSHOT = {
  returnRoute: {
    provider: 'tencent_cache', mode: 'walking', distanceMeters: 1045,
    polyline: [[36.062515,120.347597],[36.062614,120.34705],[36.063006,120.346033],[36.063368,120.345384],[36.063228,120.344863],[36.063633,120.344594],[36.064393,120.345041],[36.064953,120.345525],[36.065502,120.346059],[36.066101,120.346573],[36.066788,120.346875],[36.06717,120.346835],[36.067947,120.346562],[36.068078,120.347148],[36.068085,120.347385],[36.068068,120.34777],[36.0684,120.347792]]
  },
  replacementRoute: {
    provider: 'tencent_cache', mode: 'walking', distanceMeters: 718,
    polyline: [[36.064993,120.34149],[36.064874,120.341483],[36.064711,120.341968],[36.06474,120.342183],[36.064449,120.3426],[36.064219,120.343142],[36.064139,120.343565],[36.064039,120.344086],[36.063904,120.344328],[36.063633,120.344594],[36.063228,120.344863],[36.063368,120.345384],[36.063043,120.34595],[36.062782,120.346553],[36.062614,120.34705],[36.062515,120.347597]]
  }
}

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
    if (!monitor.active || monitor.scene !== 'dispatch' || !monitor.routeAvailable || monitor.completed) {
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
  faultCenter.open = true
  loadFaultEvents()
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
  monitor.growthModelLabel = selected.growthModelUsed
    ? 'Mamba 多特征'
    : selected.growthModelCandidate === 'mamba_selective_ssm'
      ? 'Mamba 候选 / 区间降级'
      : '近期区间'
  monitor.growthModelConfidence = clamp(n(selected.growthModelConfidence, 0.64), 0, 1)
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

function updateMonitorTasks(elapsed) {
  const returnState = monitor.returnProgress >= 1 ? 'done' : monitor.returnProgress > 0 ? 'running' : 'pending'
  const replaceState = monitor.replaceProgress >= 1 ? 'done' : monitor.replaceProgress > 0 ? 'running' : 'pending'
  monitor.tasks = [
    {
      id: 'return', title: '返航任务 RT-2026-0614', kind: 'return', state: returnState,
      status: returnState === 'done' ? '已到达' : returnState === 'running' ? '返航中' : '待执行',
      route: `${monitor.pointCode} · ${monitor.pointName} → 智能分拣中心`, device: monitor.returnBinCode, progress: monitor.returnProgress * 100
    },
    {
      id: 'replace', title: '补位任务 RP-2026-0614', kind: 'replace', state: replaceState,
      status: replaceState === 'done' ? '补位完成' : replaceState === 'running' ? '补位中' : '待命',
      route: `备用桶待命区 → ${monitor.pointCode} · ${monitor.pointName}`, device: monitor.replacementBinCode, progress: monitor.replaceProgress * 100
    }
  ]
  monitor.timeline = [
    { key: 'alert', label: '异常告警', state: 'done' },
    { key: 'return', label: '移动桶返航', state: returnState },
    { key: 'replace', label: '备用桶补位', state: replaceState },
    { key: 'available', label: '点位恢复可用', state: DISPATCH_STAGE_RANK[monitor.pointState] >= 3 ? 'done' : 'pending' },
    { key: 'closed', label: '处置完成', state: monitor.pointState === '处置完成' ? 'done' : 'pending' }
  ]
  const eventDefs = [
    [0, '异常告警', `${monitor.pointCode} · ${monitor.pointName} 检测到满载 / 低电量。`],
    [1000, '任务自动生成', '平台生成返航与备用桶补位任务。'],
    [2500, '备用桶出库', `${monitor.replacementBinCode} 从小西湖东侧待命区出发。`],
    [5000, '原点位待补位', `${monitor.returnBinCode} 已离开，${monitor.pointCode} 等待备用桶。`],
    [13500, '补位完成', `${monitor.replacementBinCode} 到达 ${monitor.pointCode}，点位恢复可用。`],
    [18500, '返航桶入站', `${monitor.returnBinCode} 抵达分拣中心，进入清洗流程。`]
  ]
  monitor.events = eventDefs
    .filter(item => elapsed >= item[0])
    .reverse()
    .map((item, index) => ({ id: `${item[0]}-${index}`, time: monitorTime(item[0]), title: item[1], desc: item[2] }))
  updateSortingCenterState(elapsed)
}

function updateSortingCenterState(elapsed) {
  const sortingStart = 18500
  const cleaningElapsed = sortingManualAnchorAt
    ? Math.max(0, sortingManualOffsetMs + Date.now() - sortingManualAnchorAt)
    : Math.max(0, elapsed - sortingStart)
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
  monitor.sortingSummary = {
    waiting: monitor.sortingProgress > 0 ? 0 : 1,
    cleaning: monitor.sortingProgress > 0 && monitor.sortingProgress < 100 ? 1 : 0,
    ready: monitor.sortingProgress >= 100 ? 3 : 2,
    blocked: 0
  }
  monitor.sortingQueue = [
    {
      id: 'return-bin',
      kind: monitor.sortingProgress >= 100 ? 'ready' : 'active',
      title: `${monitor.returnBinCode} · 返航桶`,
      state: monitor.sortingStatus,
      desc: monitor.sortingProgress > 0 ? `当前阶段：${monitor.sortingStageText}` : '等待进入分拣中心清洗线'
    },
    {
      id: 'replacement-bin',
      kind: 'ready',
      title: `${monitor.replacementBinCode} · 在点位服役`,
      state: monitor.pointState,
      desc: `${monitor.pointCode} 当前桶体，承担原点位投放任务`
    },
    {
      id: 'standby-bin',
      kind: 'ready',
      title: 'B-S04 · 已清洁备用桶',
      state: '已清洁待命',
      desc: '备用池可调度，满足下一次补位任务'
    }
  ]
}

function jumpToSortingStage(step) {
  if (!monitor.active || monitor.scene !== 'sorting' || !step) return
  sortingManualOffsetMs = step.at
  sortingManualAnchorAt = Date.now()
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

function setDispatchStage(nextStage) {
  if ((DISPATCH_STAGE_RANK[nextStage] ?? -1) <= (DISPATCH_STAGE_RANK[monitor.pointState] ?? -1)) return
  monitor.pointState = nextStage
  monitor.pointStateCls = DISPATCH_STAGE_RANK[nextStage] >= 3 ? 'available' : nextStage === '待补位' ? 'waiting' : 'danger'
}

function updateDispatchTargetSlot(patch) {
  _state.bins = (_state.bins || []).map(bin => String(bin.id) === String(monitor.binId)
    ? { ...bin, ...patch }
    : bin)
}

function updateRiskMonitor() {
  const elapsed = Date.now() - monitorStartedAt
  monitor.riskBins.forEach((bin, index) => {
    const minutes = elapsed / 60000
    const pulse = Math.sin(elapsed / 2400 + bin.phase) * 0.35
    bin.fill = clamp(bin.baseFill + bin.growth * minutes + pulse, 0, 100)
    bin.weight = clamp(bin.baseWeight + bin.growth * 0.72 * minutes + pulse * 0.4, 0, 95)
    bin.battery = clamp(bin.baseBattery - (0.12 + index * 0.015) * minutes, 5, 100)
    bin.fullMinutes = Math.max(0, Math.round((100 - bin.fill) / Math.max(bin.growth, 0.1) * 60))
    bin.alertLevel = bin.fill >= 90 || bin.battery < 20 ? 'critical' : bin.fill >= 75 ? 'warning' : 'normal'
    bin.alertTitle = bin.alertLevel === 'critical' ? '红色告警' : bin.alertLevel === 'warning' ? '风险预警' : '运行正常'
  })
  syncSelectedRiskMonitor()
}

function updateDispatchMonitor() {
  const elapsed = Date.now() - monitorStartedAt
  monitor.returnProgress = monitor.routeAvailable ? clamp((elapsed - 1000) / 17500, 0, 1) : 0
  monitor.replaceProgress = monitor.routeAvailable ? clamp((elapsed - 2500) / 11000, 0, 1) : 0
  monitor.returnPosition = pointAlongRoute(monitor.returnRoute, monitor.returnProgress)
  monitor.replacePosition = pointAlongRoute(monitor.replaceRoute, monitor.replaceProgress)

  if (elapsed >= 18500) setDispatchStage('处置完成')
  else if (elapsed >= 13500) {
    setDispatchStage('可用')
    updateDispatchTargetSlot({
      currentFill: 12,
      predictedFillInHorizon: 20,
      isUrgent: false,
      hasBin: true,
      binCode: monitor.replacementBinCode,
      slotState: '补位完成',
      taskLabel: `${monitor.replacementBinCode} 已补位`
    })
    renderMetrics()
    renderLists()
  } else if (elapsed >= 5000) {
    setDispatchStage('待补位')
    updateDispatchTargetSlot({
      hasBin: false,
      binCode: '',
      slotState: '待补位',
      taskLabel: `${monitor.returnBinCode} 返航，等待 ${monitor.replacementBinCode}`
    })
    renderLists()
  } else if (elapsed >= 1000) {
    setDispatchStage('返航中')
    updateDispatchTargetSlot({
      hasBin: false,
      binCode: '',
      slotState: '返航中',
      taskLabel: `${monitor.returnBinCode} 离开点位`
    })
    renderLists()
  }
  updateMonitorTasks(elapsed)

  if (Date.now() - monitorLastMapDraw >= 250) {
    monitorLastMapDraw = Date.now()
    // #ifndef H5
    buildMpMapData()
    // #endif
  }

  if (elapsed >= MONITOR_TOTAL_MS) {
    monitor.completed = true
    monitor.returnProgress = 1
    monitor.replaceProgress = 1
    monitor.returnPosition = pointAlongRoute(monitor.returnRoute, 1)
    monitor.replacePosition = pointAlongRoute(monitor.replaceRoute, 1)
    updateMonitorTasks(elapsed)
    setStatus('调度处置完成：返航与补位任务已闭环', 'ok')
    if (monitor.scene !== 'sorting' || monitor.sortingProgress >= 100) clearMonitorTimer()
    // #ifdef H5
    if (_state.mapReady) updateH5DispatchLayers(elapsed)
    // #endif
  }
}

function startRiskMonitor() {
  clearMonitorTimer()
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
  monitor.riskBins = buildRiskMonitorBins()
  monitor.binId = monitor.riskBins[0]?.id || null
  syncSelectedRiskMonitor()
  monitorStartedAt = Date.now()
  setStatus(`风险预警监测中：正在分析 ${monitor.riskBins.length} 个桶位`, 'warn')
  monitorTimer = setInterval(updateRiskMonitor, 250)
  updateRiskMonitor()
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
  if (monitor.active && monitor.scene === 'telemetry') {
    exitMonitor()
    return
  }
  startRiskMonitor()
}

async function startDispatchMonitor() {
  const requestRevision = ++monitorRequestRevision
  clearMonitorTimer()
  ensureMonitorBackup()
  restoreMonitorBase()
  if (!_state.bins.length) _state.bins = parkFallbackBins()
  const dispatchTarget = _state.bins.find(bin => String(bin.pointName || '').includes('樱花大道')) || _state.bins[0]
  monitor.active = true
  monitor.completed = false
  monitor.scene = 'dispatch'
  sortingManualAnchorAt = 0
  sortingManualOffsetMs = 0
  sortingManualPlaybackActive.value = false
  monitor.binId = dispatchTarget.id
  monitor.pointCode = dispatchTarget.pointCode || dispatchTarget.name
  monitor.pointName = dispatchTarget.pointName || dispatchTarget.name
  monitor.returnBinCode = dispatchTarget.binCode || 'B-M05'
  monitor.replacementBinCode = 'B-S03'
  monitor.binName = monitor.pointCode
  monitor.pointState = '异常告警'
  monitor.pointStateCls = 'danger'
  monitor.returnProgress = 0
  monitor.replaceProgress = 0
  monitor.targetPoint = { ...PARK_POINTS.abnormal }
  monitor.sortingCenter = { ...PARK_POINTS.sortingCenter }
  monitor.standbyArea = { ...PARK_POINTS.standbyArea }
  monitor.returnPosition = { ...monitor.targetPoint }
  monitor.replacePosition = { ...monitor.standbyArea }
  monitor.returnRoute = []
  monitor.replaceRoute = []
  monitor.routeAvailable = false
  _state.bins = _state.bins.map(bin => String(bin.id) === String(dispatchTarget.id)
    ? {
        ...bin,
        latitude: PARK_POINTS.abnormal.latitude,
        longitude: PARK_POINTS.abnormal.longitude,
        currentFill: Math.max(n(bin.currentFill, 0), 96),
        predictedFillInHorizon: 100,
        isUrgent: true,
        hasBin: true,
        binCode: monitor.returnBinCode,
        slotState: '满载告警',
        taskLabel: `${monitor.returnBinCode} 待返航`
      }
    : bin)
  _state.plan = null
  _state.startPoint = null
  selectedBinId.value = String(monitor.binId)
  selectedStopOrder.value = null
  monitor.mapBrief = ['正在获取腾讯步行路径规划...', '异常原因：满载 / 低电量']
  monitor.timeline = []
  monitor.tasks = []
  monitor.events = []
  updateSortingCenterState(0)
  renderAll()
  try {
    const data = await apiRequest('/api/planning/dispatch-monitor-route')
    if (requestRevision !== monitorRequestRevision || !monitor.active || monitor.scene !== 'dispatch') return
    const points = data?.points || PARK_POINTS
    monitor.targetPoint = { ...(points.abnormal || PARK_POINTS.abnormal) }
    monitor.sortingCenter = { ...(points.sortingCenter || PARK_POINTS.sortingCenter) }
    monitor.standbyArea = { ...(points.standbyArea || PARK_POINTS.standbyArea) }
    monitor.returnRoute = Array.isArray(data?.returnRoute?.polyline) ? data.returnRoute.polyline : []
    monitor.replaceRoute = Array.isArray(data?.replacementRoute?.polyline) ? data.replacementRoute.polyline : []
    monitor.routeAvailable = monitor.returnRoute.length > 1 && monitor.replaceRoute.length > 1
    if (!monitor.routeAvailable) throw new Error('腾讯步行路径为空')
    monitor.mapBrief = [
      `异常点位：${monitor.targetPoint.name}`,
      `返航：${fmtKm(n(data.returnRoute.distanceMeters, 0) / 1000)} · 腾讯步行路径`,
      `补位：${fmtKm(n(data.replacementRoute.distanceMeters, 0) / 1000)} · 腾讯步行路径`,
      '红色路线：返航分拣中心 · 青色路线：备用桶补位'
    ]
    monitorStartedAt = Date.now()
    _state.shouldFitMap = true
    setStatus('调度监测中：返航与补位任务协同执行', 'warn')
    monitorTimer = setInterval(updateDispatchMonitor, 100)
    updateDispatchMonitor()
    // #ifdef H5
    if (_state.mapReady) drawMap(true)
    startDispatchMapAnimation()
    // #endif
  } catch (error) {
    if (requestRevision !== monitorRequestRevision || !monitor.active || monitor.scene !== 'dispatch') return
    monitor.returnRoute = TENCENT_ROUTE_SNAPSHOT.returnRoute.polyline
    monitor.replaceRoute = TENCENT_ROUTE_SNAPSHOT.replacementRoute.polyline
    monitor.routeAvailable = true
    monitor.mapBrief = [
      `异常点位：${monitor.targetPoint.name}`,
      `返航：${fmtKm(TENCENT_ROUTE_SNAPSHOT.returnRoute.distanceMeters / 1000)} · 腾讯步行路径快照`,
      `补位：${fmtKm(TENCENT_ROUTE_SNAPSHOT.replacementRoute.distanceMeters / 1000)} · 腾讯步行路径快照`,
      '路径服务连接恢复后将自动切换实时规划'
    ]
    monitorStartedAt = Date.now()
    _state.shouldFitMap = true
    setStatus('调度监测中：当前使用腾讯步行路径快照', 'warn')
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
  monitor.active = false
  monitor.completed = false
  monitor.scene = ''
  sortingManualAnchorAt = 0
  sortingManualOffsetMs = 0
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
  goBackFromAdminPage('collectionDashboard')
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
let storageHandler = null

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
  await loadTMapSdk()
  _state.mapInstance = new window.TMap.Map('map', {
    center: new window.TMap.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
    zoom: 12, viewMode: '2D'
  })
  _state.mapReady = true
  _state.mapInstance.on('click', evt => {
    const lat = typeof evt?.latLng?.getLat === 'function' ? evt.latLng.getLat() : null
    const lng = typeof evt?.latLng?.getLng === 'function' ? evt.latLng.getLng() : null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    _state.manualStartPoint = { name: '地图选择起点', latitude: lat, longitude: lng }
    _state.startPoint = { ..._state.manualStartPoint }
    doRefresh()
  })
  window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
      if (_state.mapInstance && typeof _state.mapInstance.resize === 'function') _state.mapInstance.resize()
      drawMap(true)
    })
  })
}
// #endif

// ─── 生命周期 ──────────────────────────────────────────
onMounted(async () => {
  if (!await ensureAdminScreenAccess('collectionDashboard')) return
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
    .then(() => {
      h5MapReady.value = true
      h5MapLoading.value = false
      drawMap(true)
    })
    .catch((error) => {
      h5MapLoading.value = false
      h5MapError.value = error && error.message ? error.message : '地图加载失败'
      console.error('[collection-dashboard] map init failed:', error)
    })
  // #endif

  await refreshPromise
  refreshTimer = setInterval(() => doRefresh({ silent: true }), 60000)
  loadFaultEvents(true)
  faultRefreshTimer = setInterval(() => loadFaultEvents(true), 15000)
})

onShow(() => {
  syncThemeMode()
})

onBeforeUnmount(() => {
  // A slow route request must not recreate its monitor interval after this
  // page has left or after another monitor session has replaced it.
  monitorRequestRevision += 1
  monitor.active = false
  monitor.scene = ''
  clearMonitorTimer()
  pauseSortingMasterVideo(true)
  if (clockTimer) clearInterval(clockTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  if (faultRefreshTimer) clearInterval(faultRefreshTimer)
  if (typeof unbindThemeWatcher === 'function') unbindThemeWatcher()
  // #ifdef H5
  if (storageHandler) {
    window.removeEventListener('storage', storageHandler)
    storageHandler = null
  }
  // #endif
  // #ifdef H5
  clearH5Map()
  if (_state.infoWindow) { _state.infoWindow.setMap(null); _state.infoWindow = null }
  if (_state.mapInstance) { try { _state.mapInstance.destroy() } catch (_) {} _state.mapInstance = null }
  // #endif
})
</script>

<style scoped>
/* ===== CSS 变量（深色主题为默认，匹配原版） ===== */
page { background: linear-gradient(160deg, #071726, #0c2840); }
.screen {
  --bg: #071726; --bg2: #0c2840; --panel: rgba(7,27,43,.78); --line: rgba(116,197,255,.28);
  --text: #e8f8ff; --muted: #8fb1c4; --blue: #2c8fff; --cyan: #24d9ff;
  --green: #16c57c; --amber: #f5b648; --orange: #ff8b3d; --red: #ff5d66;

  min-height: 100vh;
  height: 100vh;
  width: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text);
  font-family: "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  background:
    radial-gradient(900px 500px at -20% 20%, rgba(44,143,255,.22), transparent 55%),
    linear-gradient(160deg, var(--bg), var(--bg2));
  box-sizing: border-box;
  overflow: hidden;
}
.screen.light-theme {
  --bg: #f4f8fb;
  --bg2: #e9f2f7;
  --panel: rgba(255,255,255,.94);
  --line: rgba(93,143,171,.28);
  --text: #17364a;
  --muted: #617f92;
  --blue: #2875d9;
  --cyan: #079fbe;
  --green: #0d9b68;
  --amber: #d98b12;
  --orange: #dd6f2a;
  --red: #d64d59;
  background:
    radial-gradient(900px 500px at -20% 20%, rgba(39,127,211,.1), transparent 55%),
    linear-gradient(160deg, var(--bg), var(--bg2));
}

/* ===== panel ===== */
.screen .panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  backdrop-filter: blur(6px);
}

/* ===== 顶部 ===== */
.screen .top { position: relative; z-index: 100; overflow: visible; padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.screen .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: nowrap; }
.screen .title { font-size: clamp(20px, 1.35vw, 26px); font-weight: 700; letter-spacing: 1px; text-shadow: 0 0 18px rgba(36,217,255,.4); }
.screen .sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.screen .compact-status { display: none; }
.screen .actions { display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; min-width: 0; }
.screen .actions > view { flex-shrink: 0; }

@media (max-width: 1600px) {
  .screen .title { white-space: nowrap; }

  .screen .sub {
    font-size: 11px;
    white-space: nowrap;
  }
}

@media (max-width: 1440px) {
  .screen .row > view:first-child {
    flex: 0 0 210px;
    min-width: 0;
  }

  .screen .sub { display: flex; align-items: center; gap: 5px; overflow: visible; }
  .screen .sub-copy { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .screen .compact-status { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; color: #a7c9d8; font-size: 10px; white-space: nowrap; }
  .screen .compact-status::before { width: 5px; height: 5px; border-radius: 50%; background: #79a6b9; content: ''; }
  .screen .compact-status.ok { color: #9cf8cf; }.screen .compact-status.ok::before { background: #28cd89; }
  .screen .compact-status.warn { color: #ffe6a7; }.screen .compact-status.warn::before { background: #f5b548; }
  .screen .compact-status.err { color: #ffd0d2; }.screen .compact-status.err::before { background: #ff6971; }
  .screen .status { display: none; }
  .screen .clock { min-width: 120px; padding: 5px 8px; font-size: 18px; }
  .screen .strategy-btn { padding: 5px 6px; font-size: 11px; }
  .screen .btn { padding: 7px 8px; font-size: 11px; }
}
.screen .clock {
  font-size: 20px; min-width: 150px; text-align: center;
  padding: 6px 10px; border: 1px solid rgba(132,212,255,.4);
  border-radius: 10px; background: rgba(6,35,54,.7);
}
.screen .status {
  width: 220px; min-width: 220px; font-size: 12px; text-align: center;
  padding: 7px 11px; border-radius: 999px;
  border: 1px solid rgba(151,217,255,.3);
  background: rgba(12,44,69,.7); color: #bde8ff;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.screen .status.ok { color: #9cf8cf; border-color: rgba(25,198,127,.5); background: rgba(13,64,46,.52); }
.screen .status.warn { color: #ffe6a7; border-color: rgba(245,181,66,.45); background: rgba(94,62,13,.5); }
.screen .status.err { color: #ffd0d2; border-color: rgba(255,93,102,.5); background: rgba(94,18,24,.5); }

/* ===== 策略按钮 ===== */
.screen .strategy {
  display: flex; gap: 4px; padding: 4px;
  border: 1px solid rgba(132,212,255,.3); border-radius: 11px;
  background: rgba(5,33,52,.7);
}
.screen .strategy-btn {
  border-radius: 8px; color: #9ec9db; font-size: 12px;
  padding: 5px 9px; white-space: nowrap;
}
.screen .strategy-btn.active {
  background: linear-gradient(135deg, #2378e7, #41a9ff); color: #fff;
}

/* ===== 按钮 ===== */
.screen .btn {
  box-sizing: border-box; min-height: var(--admin-screen-control-height, 36px); height: var(--admin-screen-control-height, 36px);
  border-radius: var(--admin-screen-control-radius, 8px); padding: 0 12px; color: #d9eff9;
  font-size: var(--admin-screen-control-font-size, 13px); font-weight: var(--admin-screen-control-font-weight, 650); display: inline-flex; align-items: center; justify-content: center;
  flex-wrap: nowrap; white-space: nowrap;
}
.screen .btn.blue { border: 1px solid rgba(91, 178, 255, .9); background: linear-gradient(135deg, #2479e8, #42abff); color: #fff; box-shadow: 0 5px 14px rgba(44,143,255,.28); }
.screen .btn.blue.is-disabled { cursor: not-allowed; opacity: .52; filter: saturate(.55); box-shadow: none; }
.screen .btn.ghost { border: 1px solid rgba(151,217,255,.38); background: rgba(8,39,58,.42); }
.screen .btn.monitor-chip { min-height: 32px; height: 32px; padding: 0 10px; border: 1px solid rgba(93, 203, 231, .42); border-radius: 999px; background: rgba(18, 77, 96, .55); color: #bfeaf7; box-shadow: none; gap: 6px; }
.screen .btn.monitor-chip.active { border-color: rgba(77, 185, 255, .9); background: rgba(33, 110, 184, .52); color: #fff; box-shadow: inset 0 0 0 1px rgba(108, 210, 255, .12); }
.screen .feature-icon {
  width: 17px; height: 17px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,.16); font-size: 11px; font-weight: 700;
}
.screen .fault-btn {
  position: relative; gap: 6px;
  border: 1px solid rgba(255,126,105,.55);
  background: rgba(116, 46, 52, .52);
}
.screen .fault-badge {
  min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; background: #ff3344; font-size: 9px; font-weight: 700;
  box-shadow: 0 0 10px rgba(255,51,68,.55);
}
.screen .fault-badge.is-placeholder { visibility: hidden; }

/* ===== 指标卡片 ===== */
.screen .cards { height: 100px; flex: 0 0 100px; display: flex; gap: 7px; flex-wrap: nowrap; }
.screen .card {
  flex: 1; min-width: 130px; height: 100px; box-sizing: border-box; overflow: hidden;
  border: 1px solid rgba(134,206,255,.22); border-radius: 12px;
  padding: 6px 9px;
  background: linear-gradient(180deg, rgba(13,40,63,.7), rgba(10,28,44,.86));
}
.screen .card .k { font-size: 12px; color: #9ec9db; }
.screen .card .v { font-size: 24px; line-height: 1; margin-top: 5px; }
.screen .delta { min-height: 18px; font-size: 11px; color: #83afc5; display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.screen .delta .tag {
  display: inline-flex; align-items: center;
  padding: 1px 6px; border-radius: 999px;
  border: 1px solid rgba(144,211,255,.2);
  background: rgba(8,35,54,.65);
}
.screen .delta .tag.up { color: #86f7c3; border-color: rgba(22,197,124,.45); background: rgba(11,66,45,.45); }
.screen .delta .tag.down { color: #ffd3d5; border-color: rgba(255,93,102,.45); background: rgba(88,22,28,.45); }
.screen .delta .tag.flat { color: #c8dff0; }

/* ===== 风险预警遥测 ===== */
.screen .telemetry-scene { flex: 1; min-height: 0; display: flex; gap: 10px; }
.screen .telemetry-selector {
  width: clamp(240px, 24vw, 300px); flex: 0 1 clamp(240px, 24vw, 300px); min-height: 0; padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.screen .risk-monitor-item {
  padding: 10px; margin-bottom: 8px; border-radius: 11px;
  border: 1px solid rgba(124,198,244,.2); background: rgba(10,33,51,.74);
}
.screen .risk-monitor-item.active {
  border-color: rgba(36,217,255,.86); box-shadow: 0 0 18px rgba(36,217,255,.16);
}
.screen .risk-mini-track {
  height: 5px; margin-top: 8px; overflow: hidden; border-radius: 99px; background: rgba(104,159,187,.18);
}
.screen .risk-mini-fill { height: 100%; border-radius: inherit; background: var(--green); transition: width .25s linear; }
.screen .risk-mini-fill.warning { background: linear-gradient(90deg, var(--amber), var(--orange)); }
.screen .risk-mini-fill.critical { background: linear-gradient(90deg, var(--orange), var(--red)); }
.screen .risk-prediction { color: #96bed0; font-size: 10px; margin-top: 6px; }
.screen .telemetry-hero {
  flex: 1; min-height: 0; padding: 18px 22px; display: flex; flex-direction: column; gap: 14px;
  background:
    radial-gradient(700px 380px at 18% 42%, rgba(36,217,255,.12), transparent 64%),
    linear-gradient(150deg, rgba(7,28,45,.94), rgba(8,39,59,.92));
}
.screen .scene-kicker { color: #69dfff; font-size: 11px; letter-spacing: 2px; }
.screen .telemetry-head { display: flex; justify-content: space-between; align-items: center; gap: 18px; }
.screen .telemetry-title { font-size: 28px; font-weight: 700; letter-spacing: 1px; }
.screen .telemetry-location { color: var(--muted); font-size: 12px; margin-top: 5px; }
.screen .warning-banner {
  min-width: 330px; padding: 12px 15px; border-radius: 12px;
  display: flex; align-items: center; gap: 10px;
  border: 1px solid rgba(56,204,255,.35); background: rgba(19,83,110,.38);
  transition: all .35s ease;
}
.screen .warning-banner.warning { border-color: rgba(245,182,72,.76); background: rgba(105,71,15,.52); box-shadow: 0 0 22px rgba(245,182,72,.18); }
.screen .warning-banner.critical { border-color: rgba(255,93,102,.82); background: rgba(112,24,31,.62); box-shadow: 0 0 28px rgba(255,93,102,.28); animation: warning-pulse 1s ease-in-out infinite; }
.screen .warning-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 12px currentColor; flex-shrink: 0; }
.screen .warning .warning-dot { background: var(--amber); }
.screen .critical .warning-dot { background: var(--red); }
.screen .warning-title { font-size: 14px; font-weight: 700; }
.screen .warning-sub { font-size: 11px; color: #b9d5df; margin-top: 3px; }
.screen .telemetry-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.25fr 1fr 1fr 1.2fr; gap: 12px; }
.screen .gauge-card {
  min-height: 0; padding: 16px; border-radius: 15px; border: 1px solid rgba(123,202,255,.22);
  background: linear-gradient(180deg, rgba(14,48,70,.75), rgba(8,28,44,.9));
  display: flex; flex-direction: column; justify-content: center; align-items: center;
}
.screen .gauge-card.primary { border-color: rgba(36,217,255,.42); }
.screen .gauge-ring {
  width: min(18vw, 210px); height: min(18vw, 210px); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: conic-gradient(var(--cyan) var(--gauge-value), rgba(88,145,174,.18) 0);
  box-shadow: 0 0 35px rgba(36,217,255,.16);
  position: relative;
}
.screen .gauge-ring::before {
  content: ''; position: absolute; inset: 14px; border-radius: 50%;
  background: radial-gradient(circle, rgba(15,54,75,.98), rgba(6,25,39,.98));
}
.screen .gauge-core { z-index: 1; display: flex; flex-direction: column; align-items: center; }
.screen .gauge-value { font-size: 34px; font-weight: 700; text-shadow: 0 0 20px rgba(36,217,255,.35); }
.screen .gauge-label { color: var(--muted); font-size: 12px; margin-top: 5px; }
.screen .metric-icon {
  min-width: 42px; height: 28px; border-radius: 8px; padding: 0 7px;
  display: flex; align-items: center; justify-content: center;
  color: #8de9ff; border: 1px solid rgba(93,214,255,.35); background: rgba(31,126,255,.18);
  font-size: 11px; font-weight: 700;
}
.screen .metric-icon.battery { color: #8df4c4; border-color: rgba(22,197,124,.42); }
.screen .metric-big { font-size: 38px; font-weight: 700; margin-top: 14px; }
.screen .metric-unit { color: var(--muted); font-size: 12px; margin: 3px 0 16px; }
.screen .metric-track { width: 100%; height: 7px; border-radius: 99px; background: rgba(104,159,187,.18); overflow: hidden; }
.screen .metric-progress { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2479ed, #24d9ff); transition: width .25s linear; }
.screen .metric-progress.weight { background: linear-gradient(90deg, #7664f5, #c17cff); }
.screen .metric-progress.battery, .screen .metric-progress.replace { background: linear-gradient(90deg, #0a9c68, #24dda0); }
.screen .metric-progress.return, .screen .metric-progress.danger { background: linear-gradient(90deg, #ff9a47, #ff5d66); }
.screen .trend-line { width: 100%; display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 10px; }
.screen .trend-up { color: #ffbd70; }
.screen .gauge-card.prediction { align-items: stretch; justify-content: center; }
.screen .prediction-label { color: #8de9ff; font-size: 13px; letter-spacing: 1px; }
.screen .prediction-time { color: #fff; font-size: 50px; font-weight: 700; margin: 10px 0 2px; text-shadow: 0 0 22px rgba(255,93,102,.28); }
.screen .prediction-time text { font-size: 15px; color: var(--muted); }
.screen .prediction-copy { color: #ffd5aa; font-size: 12px; }
.screen .prediction-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 20px; }
.screen .prediction-grid view { padding: 8px; border: 1px solid rgba(126,198,241,.18); border-radius: 9px; background: rgba(8,29,44,.64); }
.screen .prediction-grid text, .screen .prediction-grid b { display: block; }
.screen .prediction-grid text { color: var(--muted); font-size: 10px; }
.screen .prediction-grid b { color: #c9efff; font-size: 13px; margin-top: 4px; }
.screen .telemetry-chart { height: 130px; padding: 12px 14px; border-radius: 13px; border: 1px solid rgba(123,202,255,.2); background: rgba(7,26,41,.72); }
.screen .chart-head { display: flex; justify-content: space-between; color: #a7d1e2; font-size: 11px; }
.screen .chart-bars { height: 92px; display: flex; align-items: flex-end; gap: 8px; border-bottom: 1px solid rgba(123,202,255,.18); }
.screen .chart-column { flex: 1; height: 76px; position: relative; display: flex; align-items: flex-end; gap: 2px; }
.screen .chart-fill, .screen .chart-weight { flex: 1; min-height: 3px; border-radius: 3px 3px 0 0; transition: height .25s linear; }
.screen .chart-fill { background: linear-gradient(180deg, #24d9ff, #2479ed); }
.screen .chart-weight { background: linear-gradient(180deg, #ca83ff, #725cf0); opacity: .72; }
@keyframes warning-pulse { 50% { transform: scale(1.012); box-shadow: 0 0 36px rgba(255,93,102,.4); } }

/* ===== 主体三列 ===== */
.screen .main { flex: 1; min-height: 0; display: flex; gap: 10px; }
.screen .col { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.screen .col.left { width: 22%; flex: 0 1 22%; min-width: 0; }
.screen .col.center { flex: 1; min-width: 0; }
.screen .col.right { width: 22%; flex: 0 1 22%; min-width: 0; }

/* ===== block ===== */
.screen .block {
  min-height: 0; padding: 10px;
  display: flex; flex-direction: column; gap: 8px; flex: 1;
}
.screen .block-title {
  font-size: 13px; font-weight: 600; letter-spacing: .8px;
  display: flex; justify-content: space-between; align-items: center;
}
.screen .note { font-size: 11px; color: #7ea8bb; }

/* ===== list ===== */
.screen .list {
  flex: 1; min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(63,169,233,.72) rgba(6,28,44,.58);
}
.screen .list::-webkit-scrollbar { width: 6px; }
.screen .list::-webkit-scrollbar-track {
  background: rgba(6,28,44,.58);
  border-radius: 999px;
}
.screen .list::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(105,197,238,.82), rgba(44,132,213,.86));
  border: 1px solid rgba(98,198,238,.26);
  border-radius: 999px;
}
.screen .list::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.screen .risk, .screen .dispatch, .screen .alert {
  border: 1px solid rgba(124,198,244,.2); border-radius: 10px;
  background: rgba(10,33,51,.74); padding: 8px 9px; margin-bottom: 7px;
}
.screen .risk.active, .screen .dispatch.active, .screen .alert.active {
  border-color: rgba(38,170,255,.9);
  box-shadow: 0 0 0 2px rgba(47,146,235,.35);
}
.screen .risk-top { display: flex; gap: 7px; align-items: center; }
.screen .rank {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
  background: linear-gradient(135deg, rgba(45,126,230,.85), rgba(37,216,255,.85));
  flex-shrink: 0;
}
.screen .name { font-size: 13px; flex: 1; overflow: hidden; }
.screen .chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(174,208,233,.22); flex-shrink: 0; }
.screen .green { background: rgba(12,110,72,.75); }
.screen .amber { background: rgba(124,82,8,.75); }
.screen .orange { background: rgba(122,62,18,.77); }
.screen .red { background: rgba(128,32,38,.8); }
.screen .subline { font-size: 11px; color: #87adc2; display: flex; justify-content: space-between; margin-top: 5px; }
.screen .empty {
  display: flex; align-items: center; justify-content: center;
  min-height: 60px; font-size: 12px; color: #7090a5;
  border: 1px dashed rgba(123,191,235,.25); border-radius: 10px;
  background: rgba(10,30,45,.48); padding: 12px; text-align: center;
}

/* ===== 预测柱状图 ===== */
.screen .bars { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; align-items: end; flex: 1; min-height: 100px; min-width: 0; overflow: hidden; }
.screen .bar { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
.screen .bar-shell {
  width: 100%; max-width: 34px; height: 100px;
  border: 1px solid rgba(129,197,242,.26); border-radius: 8px;
  background: linear-gradient(180deg, rgba(14,39,59,.84), rgba(8,25,41,.94));
  position: relative; overflow: hidden;
}
.screen .bar-fill {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, #24d9ff, #1f7eff);
  border-radius: 6px 6px 0 0;
  transition: height .4s ease;
}
.screen .bar-fill.alert { background: linear-gradient(180deg, #ff8f41, #ff5d66); }
.screen .bar-val { font-size: 12px; }
.screen .bar-name { font-size: 10px; color: #84acbf; max-width: 100%; overflow: hidden; text-align: center; white-space: nowrap; text-overflow: ellipsis; }

/* ===== 点位状态表 ===== */
.screen .slot-status-panel { flex: 1.05; }
.screen .slot-row {
  padding: 8px 9px; margin-bottom: 7px; border-radius: 10px;
  border: 1px solid rgba(124,198,244,.2); background: rgba(8,30,47,.72);
}
.screen .slot-row.danger { border-color: rgba(255,93,102,.55); background: rgba(69,20,28,.58); }
.screen .slot-row.waiting { border-color: rgba(245,182,72,.55); background: rgba(70,49,14,.52); }
.screen .slot-row.available { border-color: rgba(22,197,124,.42); }
.screen .slot-row-top, .screen .slot-row-sub {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
}
.screen .slot-code { color: #8de9ff; font-size: 14px; font-weight: 700; }
.screen .slot-state { padding: 2px 7px; border-radius: 999px; color: #dff6ff; background: rgba(255,255,255,.13); font-size: 10px; }
.screen .slot-row-sub { color: #88afc2; font-size: 10px; margin-top: 5px; }
.screen .slot-presence {
  padding: 2px 7px; border-radius: 999px; border: 1px solid rgba(255,255,255,.16);
  color: #dff6ff; background: rgba(255,255,255,.1);
}
.screen .slot-presence.has { color: #a8f2cf; border-color: rgba(22,197,124,.38); background: rgba(22,197,124,.16); }
.screen .slot-presence.empty-slot { color: #ffd69c; border-color: rgba(245,182,72,.45); background: rgba(245,182,72,.16); }

/* ===== 地图区 ===== */
.screen .map-wrap {
  flex: 1; min-height: 0; padding: 10px;
  position: relative; display: flex; flex-direction: column;
}
/* #ifdef H5 */
.screen .map-stage { position: relative; flex: 1; min-height: 0; }
#map {
  flex: 1; min-height: 0; height: 100%;
  border-radius: 12px; border: 1px solid rgba(122,202,255,.32); overflow: hidden;
  opacity: 0; transition: opacity .24s ease;
}
#map.is-ready { opacity: 1; }
.screen .map-placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 20px;
  border: 1px dashed rgba(122,202,255,.28);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(10, 29, 47, .82), rgba(8, 24, 38, .92));
  text-align: center;
}
.screen.light-theme .map-placeholder {
  background: linear-gradient(180deg, rgba(241, 248, 255, .96), rgba(233, 244, 255, .92));
  border-color: rgba(44, 143, 255, .18);
}
.screen .map-placeholder-title {
  font-size: 15px; font-weight: 700; color: var(--text);
}
.screen .map-placeholder-desc {
  max-width: 320px; font-size: 12px; line-height: 1.6; color: var(--muted);
}
/* #endif */
.screen .mp-map { flex: 1; min-height: 300px; border-radius: 12px; }
.screen .brief {
  position: absolute; left: 22px; top: 20px; z-index: 8;
  min-width: 200px; max-width: 72%;
  padding: 9px 10px; border-radius: 10px;
  border: 1px solid rgba(144,211,255,.36);
  background: rgba(5,22,35,.76);
  font-size: 12px; display: flex; flex-direction: column; gap: 4px;
  pointer-events: none;
}
.screen .brief-title { color: #8ce6ff; font-size: 13px; font-weight: 600; }
.screen .brief-line { color: var(--text); font-size: 12px; line-height: 1.5; }
.screen .monitor-point-state {
  position: absolute; right: 22px; top: 20px; z-index: 8; min-width: 130px;
  padding: 9px 12px; border-radius: 10px; display: flex; flex-direction: column; gap: 3px;
  border: 1px solid rgba(255,93,102,.58); background: rgba(93,19,26,.8);
}
.screen .monitor-point-state.waiting { border-color: rgba(245,182,72,.65); background: rgba(92,62,12,.82); }
.screen .monitor-point-state.available { border-color: rgba(22,197,124,.65); background: rgba(10,70,48,.82); }
.screen .reset-view-btn {
  position: absolute; right: 22px; bottom: 20px; z-index: 9;
  background: rgba(5,34,54,.86);
}
.screen .point-state-label { color: #bdd2dc; font-size: 10px; }
.screen .point-state-value { color: #fff; font-size: 17px; font-weight: 700; }
.screen .point-state-reason { color: #ffd1d4; font-size: 10px; }

/* ===== 时间轴 ===== */
.screen .timeline {
  padding: 8px; display: flex; flex-direction: column; gap: 6px;
  min-height: 100px; flex: 0 0 auto;
}
.screen .line {
  flex: 1; white-space: nowrap; overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(63,169,233,.72) rgba(6,28,44,.58);
}
.screen .line::-webkit-scrollbar { height: 6px; }
.screen .line::-webkit-scrollbar-track {
  background: rgba(6,28,44,.58);
  border-radius: 999px;
}
.screen .line::-webkit-scrollbar-thumb {
  background: linear-gradient(90deg, rgba(105,197,238,.82), rgba(44,132,213,.86));
  border: 1px solid rgba(98,198,238,.26);
  border-radius: 999px;
}
.screen .line::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.screen .stop {
  display: inline-flex; flex-direction: column; gap: 4px;
  min-width: 140px; min-height: 62px;
  border: 1px solid rgba(129,197,242,.28);
  background: rgba(9,31,48,.86); border-radius: 10px;
  padding: 6px 7px; margin-right: 6px; vertical-align: top;
}
.screen .stop.active { border-color: rgba(38,170,255,.9); box-shadow: 0 0 0 2px rgba(47,146,235,.35); }
.screen .stop-o { font-size: 14px; color: #9ddcff; }
.screen .stop-n { font-size: 11px; overflow: hidden; }
.screen .stop-t { font-size: 11px; color: #86adbf; }
.screen .tl-empty {
  display: inline-flex; align-items: center; font-size: 12px; color: #7090a5; padding: 12px;
}
.screen .monitor-timeline { display: flex; align-items: center; min-height: 62px; overflow-x: auto; }
.screen .monitor-tl-step {
  min-width: 128px; flex: 1; display: flex; align-items: center; gap: 6px; color: #789cad; font-size: 11px;
  position: relative;
}
.screen .monitor-tl-step::after { content: ''; height: 2px; flex: 1; background: rgba(116,197,255,.18); }
.screen .monitor-tl-step:last-child::after { display: none; }
.screen .monitor-tl-dot { width: 10px; height: 10px; border-radius: 50%; background: #667f8c; flex-shrink: 0; }
.screen .monitor-tl-step.running { color: #8de9ff; }
.screen .monitor-tl-step.running .monitor-tl-dot { background: var(--cyan); box-shadow: 0 0 12px var(--cyan); }
.screen .monitor-tl-step.done { color: #a8f2cf; }
.screen .monitor-tl-step.done .monitor-tl-dot { background: var(--green); }

/* ===== 告警 / 调度 ===== */
.screen .alert { border-color: rgba(255,113,96,.3); background: linear-gradient(180deg, rgba(65,19,24,.66), rgba(33,12,17,.74)); }
.screen .alert-top { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; color: #ffd4d7; }
.screen .alert-sub { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: #ffd4d7; margin-top: 5px; }
.screen .dispatch-top { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; }
.screen .dispatch-sub { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: #88afc2; margin-top: 5px; }
.screen .state-chip {
  font-size: 10px; padding: 2px 7px;
  border-radius: 999px; border: 1px solid rgba(255,255,255,.22);
}
.screen .state-chip.pending { background: rgba(105,120,132,.7); }
.screen .state-chip.processing { background: rgba(255,144,61,.75); }
.screen .state-chip.dispatched { background: rgba(49,139,255,.72); }
.screen .nav-btn {
  border: 1px solid rgba(88,165,255,.45); background: rgba(28,96,191,.45);
  color: #d5ecff; font-size: 11px; padding: 2px 7px; border-radius: 999px;
}
.screen .task-flow { display: flex; flex-direction: column; gap: 10px; }
.screen .monitor-task { padding: 11px; border: 1px solid rgba(125,199,242,.22); border-radius: 11px; background: rgba(9,31,48,.82); }
.screen .monitor-task.running { border-color: rgba(36,217,255,.52); box-shadow: 0 0 18px rgba(36,217,255,.1); }
.screen .monitor-task.done { border-color: rgba(22,197,124,.48); }
.screen .task-top, .screen .task-meta { display: flex; justify-content: space-between; gap: 6px; }
.screen .task-top { font-size: 12px; font-weight: 600; }
.screen .task-chip { padding: 2px 7px; border-radius: 999px; color: #b9d5df; background: rgba(99,126,141,.38); font-size: 10px; }
.screen .monitor-task.running .task-chip { color: #9cecff; background: rgba(31,126,255,.32); }
.screen .monitor-task.done .task-chip { color: #a5f2cf; background: rgba(22,197,124,.28); }
.screen .task-route { color: #88afc2; font-size: 10px; margin: 8px 0; }
.screen .task-meta { color: #86adbf; font-size: 10px; margin-top: 7px; }
.screen .monitor-event { display: grid; grid-template-columns: 62px 1fr; gap: 8px; padding: 9px 4px; border-bottom: 1px solid rgba(125,199,242,.15); }
.screen .event-time { color: #73cfe8; font-size: 10px; }
.screen .event-title, .screen .event-desc { display: block; }
.screen .event-title { font-size: 11px; color: #dff6ff; }
.screen .event-desc { font-size: 10px; color: #82a7b9; line-height: 1.45; margin-top: 3px; }

/* ===== 分拣中心进度 ===== */
.screen .sorting-scene { flex: 1; min-height: 0; display: flex; }
.screen .sorting-hero {
  flex: 1; min-height: 0; padding: 15px 18px 18px; display: flex; flex-direction: column; gap: 13px;
  border-color: rgba(80,173,225,.3);
  background: linear-gradient(145deg, rgba(5,24,39,.98), rgba(6,32,50,.97));
  box-shadow: inset 0 1px rgba(178,229,255,.04), 0 18px 46px rgba(0,8,18,.2);
}
.screen .sorting-head { min-height: 48px; display: flex; justify-content: space-between; align-items: center; gap: 18px; }
.screen .sorting-head .telemetry-title { font-size: 24px; letter-spacing: -.3px; }
.screen .sorting-head .telemetry-location { margin-top: 5px; display: flex; align-items: center; gap: 7px; }
.screen .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #2de6a6; box-shadow: 0 0 0 4px rgba(45,230,166,.1), 0 0 12px rgba(45,230,166,.7); }
.screen .sorting-actions { display: flex; gap: 8px; align-items: center; }
.screen .sorting-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.48fr) minmax(460px, 1fr); gap: 13px; }

.screen .sorting-twin {
  min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid rgba(77,170,220,.3); border-radius: 15px; background: #061a2a;
  box-shadow: inset 0 0 42px rgba(18,118,170,.07);
}
.screen .twin-toolbar { height: 48px; padding: 0 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(88,174,220,.2); background: rgba(8,31,48,.86); }
.screen .twin-title, .screen .twin-sub { display: block; }
.screen .twin-title { font-size: 13px; font-weight: 760; color: #e9f8ff; }
.screen .twin-sub { margin-top: 3px; font-size: 9px; color: #7195a9; }
.screen .twin-toolbar-status { display: flex; align-items: center; gap: 13px; }
.screen .twin-state-tabs { display: flex; align-items: center; gap: 3px; padding: 3px; border: 1px solid rgba(89,172,214,.2); border-radius: 7px; background: rgba(4,20,32,.68); }
.screen .twin-state-tabs text { padding: 3px 7px; border-radius: 5px; color: #66899b; font-size: 8px; cursor: pointer; transition: color .2s, background .2s, box-shadow .2s, transform .2s; }
.screen .twin-state-tabs text:hover { color: #c9f8ff; background: rgba(40,204,235,.1); }
.screen .twin-state-tabs text:active { transform: scale(.94); }
.screen .twin-state-tabs text.active { color: #eaffff; background: rgba(40,204,235,.18); box-shadow: inset 0 0 0 1px rgba(53,221,255,.26); }
.screen .twin-online { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #66e9c0; }
.screen .twin-online text { width: 6px; height: 6px; border-radius: 50%; background: #2de6a6; box-shadow: 0 0 9px rgba(45,230,166,.8); }
.screen .twin-canvas { position: relative; flex: 1; min-height: 0; overflow: hidden; background: radial-gradient(circle at 50% 48%, rgba(18,93,130,.12), transparent 58%), #041522; }
.screen .twin-image { position: absolute; inset: 2% 2% 5%; width: 96%; height: 93%; opacity: 0; transform: scale(1.018); filter: saturate(.9) brightness(.84); transition: opacity .8s ease, filter .8s ease; will-change: opacity, filter; }
.screen .twin-image.active { opacity: 1; filter: saturate(1.05) brightness(1); }
.screen .sorting-stage-video-layer { position: absolute; z-index: 4; inset: 0; overflow: hidden; opacity: 0; transition: opacity .5s cubic-bezier(.22,.8,.24,1); pointer-events: none; will-change: opacity; }
.screen .sorting-stage-video-layer.active { opacity: 1; }
.screen .sorting-stage-video-backdrop { position: absolute; inset: -7%; width: 114%; height: 114%; opacity: .7; filter: blur(22px) saturate(.9) brightness(.38); transform: scale(1.04); }
.screen .sorting-stage-video { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; opacity: 0; background: transparent; object-fit: contain; transition: opacity .22s ease-in-out; will-change: opacity; }
.screen .sorting-stage-video.active { opacity: 1; }
.screen .sorting-stage-video video { object-fit: contain !important; }
.screen .sorting-video-tone { position: absolute; z-index: 2; inset: 0; background: linear-gradient(90deg, rgba(2,17,29,.48), transparent 18%, transparent 82%, rgba(2,16,27,.48)), linear-gradient(0deg, rgba(2,16,27,.58), transparent 27%, rgba(3,20,32,.14)); box-shadow: inset 0 0 48px rgba(0,10,18,.5); }
.screen .sorting-video-info { position: absolute; z-index: 3; width: 34%; min-width: 180px; padding: 9px 11px; box-sizing: border-box; border: 1px solid rgba(83,219,255,.58); border-radius: 9px; color: #eafaff; background: linear-gradient(135deg, rgba(4,31,47,.98), rgba(5,51,66,.96)); box-shadow: 0 8px 22px rgba(0,8,15,.42), inset 3px 0 #37d8f4; backdrop-filter: blur(8px); }
.screen .sorting-video-info.top-left { left: 6%; top: 5%; }
.screen .sorting-video-info.bottom-right { right: 6%; bottom: 8%; border-color: rgba(84,231,177,.52); box-shadow: 0 8px 22px rgba(0,8,15,.42), inset 3px 0 #4ee5aa; }
.screen .sorting-video-info small, .screen .sorting-video-info b, .screen .sorting-video-info text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.screen .sorting-video-info small { color: #69dff7; font-size: 8px; }
.screen .sorting-video-info b { margin-top: 4px; color: #fff; font-size: 12px; }
.screen .sorting-video-info text { margin-top: 4px; color: #9fc6d5; font-size: 8px; }
.screen .sorting-video-info.bottom-right small { color: #71eab9; }
.screen .operation-layer { position: absolute; z-index: 2; inset: 0; pointer-events: none; }
.screen .workpiece { position: absolute; display: flex; align-items: center; gap: 6px; transform: translate(-50%, -50%); transition: left .8s cubic-bezier(.22,.8,.24,1), top .8s cubic-bezier(.22,.8,.24,1); }
.screen .workpiece b { padding: 3px 6px; border: 1px solid rgba(100,229,255,.72); border-radius: 5px; color: #e8fbff; font-size: 8px; font-weight: 700; background: rgba(3,25,39,.9); box-shadow: 0 0 13px rgba(42,212,245,.24); }
.screen .workpiece-bin { position: relative; width: 15px; height: 18px; border: 1px solid #92ecff; border-radius: 3px 3px 5px 5px; background: rgba(27,185,214,.55); box-shadow: 0 0 11px rgba(47,224,255,.58); }
.screen .workpiece-bin::before { content: ''; position: absolute; left: 1px; right: 1px; top: -4px; height: 3px; border: 1px solid #92ecff; border-radius: 2px; }
.screen .workpiece-bin text { position: absolute; bottom: -4px; width: 4px; height: 4px; border-radius: 50%; background: #b5f5ff; }
.screen .workpiece-bin text:first-child { left: 1px; }
.screen .workpiece-bin text:last-child { right: 1px; }
.screen .weigh-operation, .screen .wash-operation, .screen .dry-operation, .screen .charge-operation, .screen .check-operation, .screen .pool-operation { position: absolute; opacity: 0; transition: opacity .25s; }
.screen .weigh-operation { left: 14%; top: 65%; width: 19%; height: 7%; text-align: center; }
.screen .weigh-deck { height: 3px; border-radius: 50%; background: #42dfff; box-shadow: 0 0 13px rgba(66,223,255,.8); }
.screen .weigh-operation text { display: inline-block; margin-top: 5px; padding: 2px 5px; border-radius: 4px; color: #bff5ff; font-size: 8px; background: rgba(3,24,38,.86); }
.screen .stage-arrive .weigh-operation, .screen .stage-weigh .weigh-operation { opacity: 1; }
.screen .stage-weigh .weigh-deck { animation: weighDeck 1.2s ease-in-out infinite; }
.screen .wash-operation { left: 37%; top: 35%; width: 12%; height: 27%; display: flex; justify-content: space-around; overflow: hidden; }
.screen .wash-operation text { width: 2px; height: 32%; border-radius: 0 0 4px 4px; background: linear-gradient(#a9f7ff, rgba(62,218,255,.05)); box-shadow: 0 0 7px rgba(78,225,255,.8); transform-origin: top; }
.screen .stage-wash .wash-operation { opacity: 1; }
.screen .stage-wash .wash-operation text { animation: washJet .7s ease-in-out infinite alternate; }
.screen .stage-wash .wash-operation text:nth-child(2) { animation-delay: -.22s; }
.screen .stage-wash .wash-operation text:nth-child(3) { animation-delay: -.44s; }
.screen .dry-operation { left: 50%; top: 48%; width: 14%; height: 17%; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.screen .dry-operation view { width: 23px; height: 23px; border: 2px dashed rgba(255,184,91,.9); border-radius: 50%; box-shadow: 0 0 12px rgba(255,155,61,.42); }
.screen .dry-operation text { color: #ffd39b; font-size: 8px; }
.screen .stage-dry .dry-operation { opacity: 1; }
.screen .stage-dry .dry-operation view { animation: dryFan .75s linear infinite; }
.screen .charge-operation { left: 61%; top: 49%; width: 16%; height: 16%; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.screen .charge-operation view { width: 31px; height: 15px; border: 2px solid rgba(85,240,183,.82); border-radius: 4px; box-shadow: inset 0 0 0 4px rgba(85,240,183,.16), 0 0 12px rgba(85,240,183,.36); }
.screen .charge-operation text { color: #aef7d7; font-size: 8px; }
.screen .stage-charge .charge-operation { opacity: 1; }
.screen .stage-charge .charge-operation view { animation: chargePulse 1.1s ease-in-out infinite alternate; }
.screen .check-operation { left: 64%; top: 45%; width: 14%; height: 24%; overflow: hidden; border: 1px solid rgba(74,236,178,.36); border-radius: 5px; }
.screen .check-operation view { position: absolute; left: 5%; right: 5%; top: 0; height: 2px; background: #55f0b7; box-shadow: 0 0 9px rgba(85,240,183,.9); }
.screen .check-operation text { position: absolute; right: 4px; bottom: 3px; color: #aef7d7; font-size: 8px; }
.screen .stage-battery .check-operation { opacity: 1; }
.screen .stage-battery .check-operation view { animation: checkScan 1.5s ease-in-out infinite; }
.screen .pool-operation { right: 9%; top: 58%; display: flex; align-items: center; gap: 5px; color: #9af4c8; font-size: 8px; }
.screen .pool-operation view { width: 18px; height: 1px; background: #49e7a5; }
.screen .pool-operation view::after { content: ''; display: block; width: 5px; height: 5px; margin-left: 12px; margin-top: -3px; border-top: 1px solid #49e7a5; border-right: 1px solid #49e7a5; transform: rotate(45deg); }
.screen .stage-ready .pool-operation { opacity: 1; animation: poolRelease .8s ease-out both; }
.screen .zone-tag { position: absolute; z-index: 3; display: flex; align-items: center; gap: 6px; padding: 7px 9px; border: 1px solid rgba(77,191,238,.34); border-radius: 7px; color: #9fc3d4; font-size: 9px; font-weight: 650; background: rgba(5,24,38,.84); box-shadow: 0 7px 18px rgba(0,10,20,.25); transition: border-color .25s, color .25s, box-shadow .25s, transform .25s; }
.screen .zone-tag::after { content: ''; position: absolute; left: 18px; top: 100%; width: 1px; height: 30px; background: linear-gradient(rgba(60,214,255,.55), transparent); }
.screen .zone-tag.active { color: #e8fbff; border-color: #35dfff; box-shadow: 0 0 20px rgba(29,202,242,.2); transform: translateY(-2px); }
.screen .zone-pulse { width: 7px; height: 7px; border-radius: 50%; background: #5a7c8d; }
.screen .zone-tag.active .zone-pulse { background: #35ddff; box-shadow: 0 0 0 5px rgba(53,221,255,.12), 0 0 12px rgba(53,221,255,.8); animation: zonePulse 1.8s ease-in-out infinite; }
.screen .zone-weigh { left: 8%; top: 29%; }
.screen .zone-wash { left: 35%; top: 32%; }
.screen .zone-check { left: 64%; top: 38%; }
.screen .zone-pool { right: 5%; top: 57%; }
.screen .twin-flow { position: absolute; z-index: 8; left: 16px; right: 16px; bottom: 13px; height: 35px; padding: 0 11px; display: flex; align-items: center; gap: 10px; border: 1px solid rgba(77,174,218,.24); border-radius: 8px; background: rgba(4,21,34,.92); color: #759bad; font-size: 9px; }
.screen .twin-flow b { color: #d5f6ff; font-size: 10px; font-weight: 650; white-space: nowrap; }
.screen .flow-line { position: relative; flex: 1; height: 2px; overflow: visible; border-radius: 2px; background: rgba(61,116,139,.35); }
.screen .flow-progress { position: absolute; inset: 0 auto 0 0; max-width: 100%; border-radius: inherit; background: #35dfff; box-shadow: 0 0 8px rgba(53,223,255,.55); transition: width .25s linear; }
.screen .flow-dot { position: absolute; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #53e9ff; box-shadow: 0 0 0 3px rgba(83,233,255,.13), 0 0 12px rgba(83,233,255,.9); transition: left .25s linear; }

.screen .sorting-rail { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(225px, .94fr) minmax(210px, 1.06fr); gap: 10px; }
.screen .sorting-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.screen .sorting-summary view {
  min-width: 0; padding: 10px 11px 9px; border-radius: 10px; border: 1px solid rgba(124,198,244,.2); background: rgba(8,29,45,.82);
}
.screen .sorting-summary text, .screen .sorting-summary b { display: block; }
.screen .sorting-summary text { color: var(--muted); font-size: 9px; white-space: nowrap; }
.screen .sorting-summary b { font-size: 24px; line-height: 1; margin-top: 7px; }
.screen .sorting-summary .cleaning b { color: #47ddff; }
.screen .sorting-summary .ready { border-color: rgba(34,205,139,.28); }
.screen .sorting-summary .ready b { color: #45dfa5; }
.screen .sorting-summary .blocked b { color: #ff6b71; }
.screen .sorting-progress, .screen .sorting-queue {
  min-height: 0; padding: 13px; border-radius: 13px; border: 1px solid rgba(123,202,255,.2); background: rgba(6,24,38,.78); display: flex; flex-direction: column; gap: 11px;
}
.screen .sorting-line { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0; padding: 7px 1px 2px; }
.screen .sorting-step { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 7px; color: #668798; }
.screen .sorting-step.clickable { cursor: pointer; }
.screen .sorting-step.clickable:hover .sorting-step-node { border-color: #62e7ff; box-shadow: 0 0 0 4px #061826, 0 0 15px rgba(79,221,255,.32); }
.screen .sorting-step.clickable:active { transform: translateY(1px); }
.screen .sorting-step:not(:last-child)::after { content: ''; position: absolute; top: 13px; left: calc(50% + 13px); right: calc(-50% + 13px); height: 1px; background: #29495b; }
.screen .sorting-step.done:not(:last-child)::after { background: #24c9e8; }
.screen .sorting-step-node { position: relative; z-index: 2; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border: 1px solid #35596c; border-radius: 50%; background: #0a2638; box-shadow: 0 0 0 4px #061826; }
.screen .sorting-step-node text { font-size: 9px; font-weight: 750; }
.screen .sorting-step.done .sorting-step-node { color: #052431; border-color: #35dfff; background: #35dfff; }
.screen .sorting-step.running .sorting-step-node { color: #eafeff; border-color: #35dfff; box-shadow: 0 0 0 4px #061826, 0 0 17px rgba(53,223,255,.5); }
.screen .sorting-step-label { max-width: 58px; text-align: center; font-size: 8px; line-height: 1.25; }
.screen .sorting-step.done .sorting-step-label, .screen .sorting-step.running .sorting-step-label { color: #cceff8; }
.screen .sorting-card {
  padding: 11px 12px; margin-bottom: 8px; border-radius: 10px; border: 1px solid rgba(125,199,242,.22); background: rgba(8,27,43,.84);
}
.screen .sorting-progress .sorting-card { margin: 0; }
.screen .sorting-card.active { border-color: rgba(36,217,255,.56); box-shadow: inset 3px 0 #27cde9, 0 0 18px rgba(36,217,255,.08); }
.screen .sorting-card.ready { border-color: rgba(22,197,124,.42); }
.screen .stage-detail { margin-top: 6px; color: #779cad; font-size: 9px; }
.screen .sorting-progress-row { margin-top: 10px; display: flex; align-items: center; gap: 9px; }
.screen .sorting-progress-row .metric-track { flex: 1; }
.screen .sorting-progress-row b { width: 34px; text-align: right; color: #dff8ff; font-size: 10px; }
.screen .sorting-queue .list { flex: 1; min-height: 0; }
.screen .sorting-queue .sorting-card { display: flex; align-items: center; gap: 10px; }
.screen .queue-copy { flex: 1; min-width: 0; }
.screen .queue-arrow { width: 7px; height: 7px; border-top: 1px solid #7295a7; border-right: 1px solid #7295a7; transform: rotate(45deg); }

@keyframes zonePulse { 0%,100% { opacity: .72; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.08); } }
@keyframes weighDeck { 0%,100% { transform: translateY(0); } 50% { transform: translateY(2px); } }
@keyframes washJet { from { transform: scaleY(.72); opacity: .58; } to { transform: scaleY(1); opacity: 1; } }
@keyframes dryFan { to { transform: rotate(360deg); } }
@keyframes chargePulse { from { filter: brightness(.72); transform: scale(.96); } to { filter: brightness(1.18); transform: scale(1.03); } }
@keyframes checkScan { 0%,100% { top: 2%; opacity: .45; } 50% { top: calc(100% - 3px); opacity: 1; } }
@keyframes poolRelease { from { transform: translateX(-10px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

@media (max-width: 1180px) {
  .screen .sorting-body { grid-template-columns: minmax(0, 1.15fr) minmax(430px, 1fr); }
  .screen .zone-tag { padding: 5px 7px; font-size: 8px; }
  .screen .sorting-step-label { font-size: 7px; }
}

@media (prefers-reduced-motion: reduce) {
  .screen .zone-tag.active .zone-pulse, .screen .stage-weigh .weigh-deck, .screen .stage-wash .wash-operation text, .screen .stage-dry .dry-operation view, .screen .stage-charge .charge-operation view, .screen .stage-battery .check-operation view, .screen .stage-ready .pool-operation { animation: none; }
}

/* ===== 故障处理抽屉 ===== */
.screen .fault-mask {
  position: fixed; inset: 0; z-index: 100;
  display: flex; justify-content: flex-end;
  background: rgba(2,12,20,.66); backdrop-filter: blur(4px);
}
.screen .fault-drawer {
  width: min(560px, 92vw); height: 100%; padding: 16px;
  border-radius: 18px 0 0 18px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 12px;
  background: linear-gradient(160deg, rgba(8,29,46,.98), rgba(11,43,63,.98));
}
.screen .fault-drawer-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.screen .fault-drawer-title { font-size: 20px; font-weight: 700; }
.screen .fault-drawer-sub { color: var(--muted); font-size: 11px; margin-top: 4px; }
.screen .fault-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.screen .fault-summary view {
  padding: 10px; border-radius: 10px; border: 1px solid rgba(124,198,244,.2);
  background: rgba(9,31,48,.78);
}
.screen .fault-summary text, .screen .fault-summary b { display: block; }
.screen .fault-summary text { color: var(--muted); font-size: 10px; }
.screen .fault-summary b { font-size: 22px; margin-top: 3px; }
.screen .danger-text { color: #ff7e86; }
.screen .fault-list { flex: 1; min-height: 0; }
.screen .fault-card {
  padding: 12px; margin-bottom: 9px; border-radius: 12px;
  border: 1px solid rgba(125,199,242,.22); background: rgba(8,27,43,.84);
}
.screen .fault-card.critical { border-color: rgba(255,75,86,.65); box-shadow: inset 3px 0 #ff4b56; }
.screen .fault-card.high { border-color: rgba(255,143,71,.55); box-shadow: inset 3px 0 #ff8f47; }
.screen .fault-card.medium { border-color: rgba(245,182,72,.48); box-shadow: inset 3px 0 #f5b648; }
.screen .fault-card.resolved { opacity: .62; }
.screen .fault-card-top, .screen .fault-meta, .screen .fault-actions { display: flex; align-items: center; justify-content: space-between; gap: 7px; }
.screen .fault-level { padding: 2px 6px; margin-right: 7px; border-radius: 999px; font-size: 9px; background: rgba(255,255,255,.12); }
.screen .fault-level.critical { color: #ffd0d4; background: rgba(255,75,86,.3); }
.screen .fault-level.high { color: #ffe0c7; background: rgba(255,143,71,.28); }
.screen .fault-title { font-size: 13px; font-weight: 700; }
.screen .fault-status { color: #9edfff; font-size: 10px; }
.screen .fault-device { color: #a6d3e6; font-size: 11px; margin-top: 8px; }
.screen .fault-message { color: #eefaff; font-size: 11px; line-height: 1.55; margin-top: 5px; }
.screen .fault-recommend { color: #ffd69c; font-size: 10px; margin-top: 7px; }
.screen .fault-meta { color: #779eaf; font-size: 9px; margin-top: 8px; }
.screen .fault-actions { justify-content: flex-start; flex-wrap: wrap; margin-top: 10px; }
.screen .fault-action { padding: 5px 8px; border-radius: 7px; font-size: 10px; color: #dff6ff; background: rgba(35,112,182,.45); border: 1px solid rgba(78,173,239,.32); }
.screen .fault-action.return { background: rgba(190,104,32,.4); border-color: rgba(255,166,74,.4); }
.screen .fault-action.manual { background: rgba(123,74,180,.4); border-color: rgba(188,125,246,.4); }
.screen .fault-action.resolve { background: rgba(25,139,95,.4); border-color: rgba(47,209,143,.4); }

/* ===== 亮色主题 ===== */
.screen.light-theme .panel {
  box-shadow: 0 8px 24px rgba(35, 78, 105, .08);
  backdrop-filter: blur(10px);
}
.screen.light-theme .title { text-shadow: none; }
.screen.light-theme .clock,
.screen.light-theme .strategy,
.screen.light-theme .field {
  color: var(--text);
  border-color: rgba(72, 132, 169, .3);
  background: rgba(247, 251, 254, .96);
}
.screen.light-theme .status { color: #41657c; border-color: #bfd3df; background: #f3f8fb; }
.screen.light-theme .status.ok { color: #087b54; border-color: #9bd7bf; background: #eaf8f1; }
.screen.light-theme .status.warn { color: #9b650a; border-color: #e8cb8f; background: #fff8e8; }
.screen.light-theme .status.err { color: #b33f49; border-color: #edb6bc; background: #fff0f1; }
.screen.light-theme .strategy-btn { color: #58788d; }
.screen.light-theme .btn.ghost,
.screen.light-theme .btn.monitor-chip {
  color: #315f78;
  border-color: #b9d2e0;
  background: rgba(240, 247, 251, .96);
}
.screen.light-theme .btn.monitor-chip.active { color: #fff; border-color: #3d83d9; background: #367ecf; }
.screen.light-theme .fault-btn { color: #a63c46; border-color: #e3a6ad; background: #fff0f1; }
.screen.light-theme .card {
  border-color: #cbdde7;
  background: linear-gradient(180deg, #fff, #f5f9fc);
  box-shadow: 0 5px 14px rgba(35, 78, 105, .06);
}
.screen.light-theme .card .k,
.screen.light-theme .delta,
.screen.light-theme .note,
.screen.light-theme .subline,
.screen.light-theme .dispatch-sub,
.screen.light-theme .task-route,
.screen.light-theme .task-meta,
.screen.light-theme .event-desc,
.screen.light-theme .stop-t,
.screen.light-theme .slot-row-sub,
.screen.light-theme .risk-prediction { color: var(--muted); }
.screen.light-theme .delta .tag { color: #526f82; border-color: #d3e1e9; background: #f2f7fa; }
.screen.light-theme .delta .tag.up { color: #087b54; border-color: #a8d9c4; background: #edf8f2; }
.screen.light-theme .delta .tag.down { color: #b33f49; border-color: #e9b6bc; background: #fff1f2; }
.screen.light-theme .telemetry-hero {
  background: radial-gradient(700px 380px at 18% 42%, rgba(9,159,190,.1), transparent 64%), linear-gradient(150deg, #fafdff, #eef6fa);
}
.screen.light-theme .warning-banner { border-color: #acd4e1; background: #edf8fb; }
.screen.light-theme .warning-banner.warning { color: #8a5b0b; border-color: #e6c57f; background: #fff8e7; }
.screen.light-theme .warning-banner.critical { color: #ad3944; border-color: #e8a8af; background: #fff0f1; }
.screen.light-theme .warning-sub { color: var(--muted); }
.screen.light-theme .gauge-card,
.screen.light-theme .prediction-grid view,
.screen.light-theme .telemetry-chart,
.screen.light-theme .risk-monitor-item,
.screen.light-theme .risk,
.screen.light-theme .dispatch,
.screen.light-theme .slot-row,
.screen.light-theme .stop,
.screen.light-theme .monitor-task,
.screen.light-theme .sorting-summary view,
.screen.light-theme .sorting-progress,
.screen.light-theme .sorting-queue,
.screen.light-theme .sorting-card {
  color: var(--text);
  border-color: #cbdde7;
  background: rgba(255,255,255,.9);
}
.screen.light-theme .gauge-ring::before { background: radial-gradient(circle, #fff, #edf5f8); }
.screen.light-theme .prediction-time,
.screen.light-theme .prediction-grid b,
.screen.light-theme .event-title,
.screen.light-theme .sorting-progress-row b { color: var(--text); }
.screen.light-theme .prediction-label,
.screen.light-theme .scene-kicker,
.screen.light-theme .brief-title,
.screen.light-theme .slot-code,
.screen.light-theme .stop-o,
.screen.light-theme .event-time { color: #087f9c; }
.screen.light-theme .prediction-copy { color: #a36012; }
.screen.light-theme .empty { color: #728b9b; border-color: #c7d9e3; background: rgba(247,250,252,.9); }
.screen.light-theme,
.screen.light-theme .list,
.screen.light-theme .line,
.screen.light-theme .monitor-timeline,
.screen.light-theme .bars {
  scrollbar-width: thin;
  scrollbar-color: #55a9cf #e6eff4;
}
.screen.light-theme::-webkit-scrollbar,
.screen.light-theme .list::-webkit-scrollbar,
.screen.light-theme .monitor-timeline::-webkit-scrollbar,
.screen.light-theme .bars::-webkit-scrollbar { width: 6px; height: 6px; }
.screen.light-theme .line::-webkit-scrollbar { height: 6px; }
.screen.light-theme::-webkit-scrollbar-track,
.screen.light-theme .list::-webkit-scrollbar-track,
.screen.light-theme .line::-webkit-scrollbar-track,
.screen.light-theme .monitor-timeline::-webkit-scrollbar-track,
.screen.light-theme .bars::-webkit-scrollbar-track {
  border-radius: 999px;
  background: #e6eff4;
}
.screen.light-theme::-webkit-scrollbar-thumb,
.screen.light-theme .list::-webkit-scrollbar-thumb,
.screen.light-theme .line::-webkit-scrollbar-thumb,
.screen.light-theme .monitor-timeline::-webkit-scrollbar-thumb,
.screen.light-theme .bars::-webkit-scrollbar-thumb {
  border: 1px solid #d8e7ef;
  border-radius: 999px;
  background: linear-gradient(180deg, #70bdd8, #3d95c5);
}
.screen.light-theme::-webkit-scrollbar-button,
.screen.light-theme .list::-webkit-scrollbar-button,
.screen.light-theme .line::-webkit-scrollbar-button,
.screen.light-theme .monitor-timeline::-webkit-scrollbar-button,
.screen.light-theme .bars::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.screen.light-theme .bar-shell { border-color: #c8dbe6; background: linear-gradient(180deg, #f8fbfd, #edf4f8); }
.screen.light-theme .brief { border-color: #bdd5e1; background: rgba(255,255,255,.92); box-shadow: 0 6px 16px rgba(35,78,105,.1); }
.screen.light-theme .reset-view-btn { color: #315f78; background: rgba(255,255,255,.94); }
.screen.light-theme .slot-row.danger,
.screen.light-theme .alert { color: #9f3540; border-color: #e8b0b6; background: #fff2f3; }
.screen.light-theme .slot-row.waiting { color: #8b5c0b; border-color: #e6c88c; background: #fff8e9; }
.screen.light-theme .slot-state,
.screen.light-theme .slot-presence { color: #46677b; border-color: #c9dbe4; background: #eef5f8; }
.screen.light-theme .alert-top,
.screen.light-theme .alert-sub { color: #a13c46; }
.screen.light-theme .task-chip { color: #536f80; background: #e9f1f5; }
.screen.light-theme .sorting-step { color: #718a99; }
.screen.light-theme .sorting-step-node { border-color: #abc5d3; background: #f5f9fb; box-shadow: 0 0 0 4px #e9f2f6; }
.screen.light-theme .sorting-step:not(:last-child)::after { background: #c5d7e1; }
.screen.light-theme .sorting-step.done .sorting-step-label,
.screen.light-theme .sorting-step.running .sorting-step-label { color: #23637a; }
.screen.light-theme .fault-mask { background: rgba(28, 47, 61, .38); }
.screen.light-theme .fault-drawer { color: var(--text); background: linear-gradient(160deg, #fff, #edf5f9); box-shadow: -14px 0 32px rgba(29,65,88,.16); }
.screen.light-theme .fault-summary view,
.screen.light-theme .fault-card { border-color: #cbdde7; background: rgba(255,255,255,.92); }
.screen.light-theme .fault-message { color: #294c61; }
.screen.light-theme .fault-device,
.screen.light-theme .fault-meta { color: var(--muted); }
.screen.light-theme .fault-action { color: #245f91; background: #eaf3fb; border-color: #bdd5e8; }

@media (max-width: 900px) and (min-width: 769px) {
  .screen .row { flex-wrap: wrap; align-items: flex-start; }
  .screen .row > view:first-child { flex: 1 0 100%; }
}

/* ===== 手机端适配（≤768px） ===== */
@media (max-width: 768px) {
  .screen {
    height: auto;
    min-height: 100vh;
    overflow: auto;
    padding: 8px;
    gap: 8px;
  }
  .screen .top { padding: 8px 10px; }
  .screen .row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .screen .row > view:first-child { flex: none; width: 100%; }
  .screen .title { font-size: 18px; letter-spacing: 0.5px; }
  .screen .actions { width: 100%; gap: 6px; flex-wrap: wrap; }
  .screen .clock { font-size: 14px; min-width: unset; flex: 1; padding: 5px 8px; }
  .screen .status { font-size: 11px; min-width: unset; flex: 1; padding: 5px 8px; }
  .screen .strategy { padding: 3px; }
  .screen .strategy-btn { font-size: 11px; padding: 4px 7px; }
  .screen .btn { font-size: 11px; padding: 6px 10px; }
  .screen .cards { height: auto; flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .screen .card { min-width: unset; height: auto; overflow: visible; }
  .screen .card .v { font-size: 18px; }
  .screen .delta { font-size: 10px; gap: 4px; }
  .screen .main { flex-direction: column; flex: none; gap: 8px; }
  .screen .telemetry-scene { flex: none; }
  .screen .telemetry-selector { width: auto; flex: none; height: 280px; }
  .screen .telemetry-hero { padding: 12px; }
  .screen .telemetry-head { flex-direction: column; align-items: stretch; }
  .screen .warning-banner { min-width: unset; }
  .screen .telemetry-grid { grid-template-columns: 1fr 1fr; }
  .screen .gauge-ring { width: 150px; height: 150px; }
  .screen .telemetry-chart { display: none; }
  .screen .col.left, .screen .col.center, .screen .col.right { width: 100%; min-width: unset; }
  .screen .map-wrap { flex: none; height: 300px; }
  .screen .mp-map { min-height: 240px; height: 240px; }
  .screen .brief { max-width: 90%; left: 10px; top: 10px; font-size: 11px; padding: 6px 8px; }
  .screen .timeline { flex: none; }
  .screen .block { flex: none; }
  .screen .list { height: 220px; }
  .screen .bars { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; scrollbar-width: thin; scrollbar-color: rgba(63,169,233,.72) rgba(6,28,44,.58); }
  .screen .bar { min-width: 48px; flex: 0 0 auto; }
  .screen .fault-drawer { width: 100%; border-radius: 0; }
  .screen .fault-summary { grid-template-columns: 1fr 1fr; }
}

/* ===== 超小屏（≤480px） ===== */
@media (max-width: 480px) {
  .screen { padding: 6px; }
  .screen .cards { grid-template-columns: 1fr 1fr; gap: 5px; }
  .screen .card .v { font-size: 16px; }
  .screen .title { font-size: 16px; }
  .screen .list { height: 180px; }
  .screen .map-wrap { height: 260px; }
  .screen .mp-map { height: 200px; min-height: 200px; }
}

/* ===== 浅色智慧清运运营大屏 ===== */
.screen.light-theme.admin-light-theme {
  --bg: var(--admin-light-bg);
  --bg2: var(--admin-light-bg);
  --panel: var(--admin-light-surface);
  --line: var(--admin-light-border);
  --text: var(--admin-light-text);
  --muted: var(--admin-light-text-secondary);
  --blue: var(--admin-light-primary);
  --cyan: #258db9;
  --green: var(--admin-light-success);
  --amber: var(--admin-light-warning);
  --orange: #d8782c;
  --red: var(--admin-light-danger);
  padding: 10px;
  gap: 9px;
  background: var(--admin-light-bg);
}
.screen.light-theme.admin-light-theme .panel {
  border: 1px solid var(--admin-light-border);
  border-radius: var(--admin-light-radius-panel);
  background: var(--admin-light-surface);
  box-shadow: none;
  backdrop-filter: none;
}
.screen.light-theme.admin-light-theme .top {
  padding: 7px 10px 8px;
  gap: 7px;
  box-shadow: var(--admin-light-shadow);
}
.screen.light-theme.admin-light-theme .title {
  color: var(--admin-light-text);
  font-size: clamp(20px, 1.25vw, 24px);
  font-weight: 740;
  letter-spacing: 0;
}
.screen.light-theme.admin-light-theme .sub { margin-top: 2px; color: var(--admin-light-text-secondary); }
.screen.light-theme.admin-light-theme :deep(.admin-screen-header) {
  --admin-screen-control-height: 32px;
  --admin-screen-control-font-size: 12px;
  gap: 6px;
}
.screen.light-theme.admin-light-theme :deep(.admin-screen-header__business-actions),
.screen.light-theme.admin-light-theme :deep(.admin-screen-header__navigation-actions) { gap: 6px; }
.screen.light-theme.admin-light-theme .actions { gap: 6px; }
.screen.light-theme.admin-light-theme .clock,
.screen.light-theme.admin-light-theme .strategy {
  min-height: 32px;
  box-sizing: border-box;
  border-color: var(--admin-light-border-strong);
  border-radius: var(--admin-light-radius-control);
  background: var(--admin-light-surface);
}
.screen.light-theme.admin-light-theme .clock {
  min-width: 132px;
  height: 32px;
  padding: 4px 8px;
  color: var(--admin-light-text);
  font-size: 18px;
  line-height: 22px;
}
.screen.light-theme.admin-light-theme .status {
  min-width: 170px;
  width: 170px;
  min-height: 32px;
  box-sizing: border-box;
  padding: 6px 9px;
  border-color: var(--admin-light-border-strong);
  border-radius: var(--admin-light-radius-control);
  color: var(--admin-light-text-secondary);
  background: var(--admin-light-surface-soft);
}
.screen.light-theme.admin-light-theme .status.ok { color: #117b5d; border-color: #a7d9c8; background: var(--admin-light-success-soft); }
.screen.light-theme.admin-light-theme .status.warn { color: #9b6314; border-color: #ebcb9b; background: var(--admin-light-warning-soft); }
.screen.light-theme.admin-light-theme .status.err { color: #aa3f47; border-color: #edb9bd; background: var(--admin-light-danger-soft); }
.screen.light-theme.admin-light-theme .strategy { padding: 3px; }
.screen.light-theme.admin-light-theme .strategy-btn { padding: 4px 8px; color: var(--admin-light-text-secondary); }
.screen.light-theme.admin-light-theme .strategy-btn.active {
  color: #fff;
  background: var(--admin-light-primary);
}
.screen.light-theme.admin-light-theme .btn {
  border-radius: var(--admin-light-radius-control);
  box-shadow: none;
}
.screen.light-theme.admin-light-theme .btn.blue {
  border-color: var(--admin-light-primary);
  background: var(--admin-light-primary);
  box-shadow: 0 3px 8px rgba(24, 167, 124, .2);
}
.screen.light-theme.admin-light-theme .btn.ghost,
.screen.light-theme.admin-light-theme .btn.monitor-chip {
  color: var(--admin-light-text-secondary);
  border-color: var(--admin-light-border-strong);
  background: var(--admin-light-surface);
}
.screen.light-theme.admin-light-theme .btn.monitor-chip { height: 32px; border-radius: var(--admin-light-radius-control); }
.screen.light-theme.admin-light-theme .btn.monitor-chip.active { color: #fff; border-color: var(--admin-light-primary); background: var(--admin-light-primary); }
.screen.light-theme.admin-light-theme .fault-btn { color: #aa3f47; border-color: #edb9bd; background: var(--admin-light-danger-soft); }
.screen.light-theme.admin-light-theme .fault-badge { box-shadow: none; background: var(--admin-light-danger); }
.screen.light-theme.admin-light-theme .cards {
  height: 76px;
  flex-basis: 76px;
  gap: 6px;
}
.screen.light-theme.admin-light-theme .card {
  height: 76px;
  min-width: 118px;
  padding: 7px 9px;
  border: 1px solid var(--admin-light-border);
  border-radius: 10px;
  background: var(--admin-light-surface-soft);
  box-shadow: none;
}
.screen.light-theme.admin-light-theme .card .k { color: var(--admin-light-text-secondary); }
.screen.light-theme.admin-light-theme .card .v { margin-top: 3px; color: var(--admin-light-text); font-size: 23px; }
.screen.light-theme.admin-light-theme .delta {
  min-height: 16px;
  margin-top: 2px;
  gap: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
  color: var(--admin-light-text-muted);
  font-size: 10px;
}
.screen.light-theme.admin-light-theme .delta .tag {
  padding: 1px 5px;
  color: var(--admin-light-text-secondary);
  border-color: var(--admin-light-border);
  background: var(--admin-light-surface);
  white-space: nowrap;
}
.screen.light-theme.admin-light-theme .delta .tag.up { color: #117b5d; border-color: #b7dfd1; background: var(--admin-light-success-soft); }
.screen.light-theme.admin-light-theme .delta .tag.down { color: #aa3f47; border-color: #edc6c9; background: var(--admin-light-danger-soft); }
.screen.light-theme.admin-light-theme .main { gap: 9px; }
.screen.light-theme.admin-light-theme .col { gap: 9px; }
.screen.light-theme.admin-light-theme .col.left { width: 20%; flex-basis: 20%; }
.screen.light-theme.admin-light-theme .col.right { width: 20%; flex-basis: 20%; }
.screen.light-theme.admin-light-theme .block { padding: 9px; gap: 7px; }
.screen.light-theme.admin-light-theme .block-title {
  position: relative;
  min-height: 21px;
  padding: 0 0 7px 10px;
  border-bottom: 1px solid var(--admin-light-border);
  color: var(--admin-light-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}
.screen.light-theme.admin-light-theme .block-title::before {
  position: absolute;
  top: 2px;
  bottom: 8px;
  left: 0;
  width: 3px;
  border-radius: 2px;
  background: var(--admin-light-primary);
  content: '';
}
.screen.light-theme.admin-light-theme .note { color: var(--admin-light-text-muted); }
.screen.light-theme.admin-light-theme .risk,
.screen.light-theme.admin-light-theme .dispatch,
.screen.light-theme.admin-light-theme .slot-row,
.screen.light-theme.admin-light-theme .stop,
.screen.light-theme.admin-light-theme .monitor-task,
.screen.light-theme.admin-light-theme .risk-monitor-item {
  color: var(--admin-light-text);
  border-color: var(--admin-light-border);
  background: var(--admin-light-surface-soft);
  box-shadow: none;
}
.screen.light-theme.admin-light-theme .risk,
.screen.light-theme.admin-light-theme .dispatch,
.screen.light-theme.admin-light-theme .slot-row {
  padding: 6px 7px;
  margin-bottom: 5px;
  border-radius: 8px;
}
.screen.light-theme.admin-light-theme .risk.active,
.screen.light-theme.admin-light-theme .dispatch.active,
.screen.light-theme.admin-light-theme .alert.active,
.screen.light-theme.admin-light-theme .stop.active {
  border-color: #8fb9eb;
  box-shadow: inset 3px 0 var(--admin-light-primary);
}
.screen.light-theme.admin-light-theme .rank {
  color: #fff;
  background: var(--admin-light-primary);
}
.screen.light-theme.admin-light-theme .subline,
.screen.light-theme.admin-light-theme .dispatch-sub,
.screen.light-theme.admin-light-theme .slot-row-sub,
.screen.light-theme.admin-light-theme .stop-t,
.screen.light-theme.admin-light-theme .risk-prediction { color: var(--admin-light-text-secondary); }
.screen.light-theme.admin-light-theme .chip,
.screen.light-theme.admin-light-theme .state-chip,
.screen.light-theme.admin-light-theme .slot-state,
.screen.light-theme.admin-light-theme .slot-presence {
  color: var(--admin-light-text-secondary);
  border-color: var(--admin-light-border);
  background: #edf2f6;
}
.screen.light-theme.admin-light-theme .chip.green { color: #117b5d; border-color: #b7dfd1; background: var(--admin-light-success-soft); }
.screen.light-theme.admin-light-theme .chip.amber,
.screen.light-theme.admin-light-theme .chip.orange { color: #986017; border-color: #f0d7b2; background: var(--admin-light-warning-soft); }
.screen.light-theme.admin-light-theme .chip.red { color: #aa3f47; border-color: #edc6c9; background: var(--admin-light-danger-soft); }
.screen.light-theme.admin-light-theme .slot-row.danger,
.screen.light-theme.admin-light-theme .alert { color: #a64047; border-color: #efc5c8; background: var(--admin-light-danger-soft); }
.screen.light-theme.admin-light-theme .slot-row.waiting { color: #986017; border-color: #f0d7b2; background: var(--admin-light-warning-soft); }
.screen.light-theme.admin-light-theme .bars { min-height: 82px; }
.screen.light-theme.admin-light-theme .bar-shell {
  height: 82px;
  border-color: var(--admin-light-border);
  background: #edf3f7;
}
.screen.light-theme.admin-light-theme .bar-fill { background: linear-gradient(180deg, #71d9b2, var(--admin-light-primary)); }
.screen.light-theme.admin-light-theme .bar-fill.alert { background: linear-gradient(180deg, #ef9e6a, var(--admin-light-danger)); }
.screen.light-theme.admin-light-theme .bar-name { color: var(--admin-light-text-muted); }
.screen.light-theme.admin-light-theme .map-wrap {
  padding: 8px;
  border-color: var(--admin-light-border-strong);
  box-shadow: var(--admin-light-shadow-map);
}
.screen.light-theme.admin-light-theme #map,
.screen.light-theme.admin-light-theme .mp-map {
  border: 1px solid var(--admin-light-border-strong);
  border-radius: 10px;
}
.screen.light-theme.admin-light-theme .brief {
  border-color: #c6d8e5;
  border-radius: 9px;
  color: var(--admin-light-text);
  background: rgba(255, 255, 255, .95);
  box-shadow: 0 4px 12px rgba(31, 58, 82, .12);
}
.screen.light-theme.admin-light-theme .brief-title { color: var(--admin-light-primary); }
.screen.light-theme.admin-light-theme .brief-line { color: var(--admin-light-text); }
.screen.light-theme.admin-light-theme .timeline {
  min-height: 88px;
  padding: 7px 8px;
  gap: 5px;
}
.screen.light-theme.admin-light-theme .stop {
  min-width: 128px;
  min-height: 52px;
  padding: 5px 7px;
}
.screen.light-theme.admin-light-theme .stop-o,
.screen.light-theme.admin-light-theme .event-time,
.screen.light-theme.admin-light-theme .slot-code { color: var(--admin-light-primary); }
.screen.light-theme.admin-light-theme .alert-panel.is-empty-state { flex: 0 0 112px; }
.screen.light-theme.admin-light-theme .alert-panel.is-empty-state .list { flex: 0 0 auto; }
.screen.light-theme.admin-light-theme .alert-panel.is-empty-state .empty {
  min-height: 58px;
  flex-direction: column;
  gap: 5px;
}
.screen.light-theme.admin-light-theme .alert-panel.is-empty-state .empty::before {
  content: '✓';
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--admin-light-success);
  background: var(--admin-light-success-soft);
  font-weight: 800;
}
.screen.light-theme.admin-light-theme .dispatch-panel { flex: 1 1 auto; }
.screen.light-theme.admin-light-theme .empty {
  min-height: 58px;
  padding: 10px;
  border: 0;
  border-radius: 8px;
  color: var(--admin-light-text-secondary);
  background: var(--admin-light-surface-soft);
}
.screen.light-theme.admin-light-theme .telemetry-hero {
  background: var(--admin-light-surface);
  box-shadow: var(--admin-light-shadow-map);
}
.screen.light-theme.admin-light-theme .gauge-card,
.screen.light-theme.admin-light-theme .prediction-grid view,
.screen.light-theme.admin-light-theme .telemetry-chart,
.screen.light-theme.admin-light-theme .sorting-summary view,
.screen.light-theme.admin-light-theme .sorting-progress,
.screen.light-theme.admin-light-theme .sorting-queue,
.screen.light-theme.admin-light-theme .sorting-card {
  border-color: var(--admin-light-border);
  background: var(--admin-light-surface-soft);
  box-shadow: none;
}
.screen.light-theme.admin-light-theme .warning-banner { border-color: #bfd7e6; background: #eff7fb; }
.screen.light-theme.admin-light-theme .warning-banner.warning { color: #986017; border-color: #f0d7b2; background: var(--admin-light-warning-soft); box-shadow: none; }
.screen.light-theme.admin-light-theme .warning-banner.critical { color: #a64047; border-color: #efc5c8; background: var(--admin-light-danger-soft); box-shadow: none; animation: none; }
.screen.light-theme.admin-light-theme .fault-mask { background: rgba(24, 50, 71, .28); backdrop-filter: none; }
.screen.light-theme.admin-light-theme .fault-drawer { border-radius: 12px 0 0 12px; background: var(--admin-light-surface); box-shadow: -10px 0 28px rgba(31, 58, 82, .16); }
.screen.light-theme.admin-light-theme .fault-summary view,
.screen.light-theme.admin-light-theme .fault-card { border-color: var(--admin-light-border); background: var(--admin-light-surface-soft); box-shadow: none; }
.screen.light-theme.admin-light-theme,
.screen.light-theme.admin-light-theme .list,
.screen.light-theme.admin-light-theme .line,
.screen.light-theme.admin-light-theme .monitor-timeline,
.screen.light-theme.admin-light-theme .bars {
  scrollbar-color: var(--admin-light-scroll-thumb) var(--admin-light-scroll-track);
}
.screen.light-theme.admin-light-theme::-webkit-scrollbar-track,
.screen.light-theme.admin-light-theme .list::-webkit-scrollbar-track,
.screen.light-theme.admin-light-theme .line::-webkit-scrollbar-track,
.screen.light-theme.admin-light-theme .monitor-timeline::-webkit-scrollbar-track,
.screen.light-theme.admin-light-theme .bars::-webkit-scrollbar-track { background: var(--admin-light-scroll-track); }
.screen.light-theme.admin-light-theme::-webkit-scrollbar-thumb,
.screen.light-theme.admin-light-theme .list::-webkit-scrollbar-thumb,
.screen.light-theme.admin-light-theme .line::-webkit-scrollbar-thumb,
.screen.light-theme.admin-light-theme .monitor-timeline::-webkit-scrollbar-thumb,
.screen.light-theme.admin-light-theme .bars::-webkit-scrollbar-thumb {
  border-color: var(--admin-light-scroll-track);
  background: var(--admin-light-scroll-thumb);
}

@media (max-width: 1280px) and (min-width: 769px) {
  .screen.light-theme.admin-light-theme .col.left { width: 22%; flex-basis: 22%; }
  .screen.light-theme.admin-light-theme .col.right { width: 22%; flex-basis: 22%; }
  .screen.light-theme.admin-light-theme .card .v { font-size: 20px; }
  .screen.light-theme.admin-light-theme .delta .tag:nth-child(n + 3) { display: none; }
}

@media (max-width: 768px) {
  .screen.light-theme.admin-light-theme { height: auto; min-height: 100vh; overflow: auto; }
  .screen.light-theme.admin-light-theme .cards { height: auto; grid-template-columns: 1fr 1fr; }
  .screen.light-theme.admin-light-theme .card { height: auto; min-height: 72px; }
  .screen.light-theme.admin-light-theme .main { flex-direction: column; }
  .screen.light-theme.admin-light-theme .col.left,
  .screen.light-theme.admin-light-theme .col.right { width: 100%; }
  .screen.light-theme.admin-light-theme .alert-panel.is-empty-state { flex-basis: auto; }
}
</style>
