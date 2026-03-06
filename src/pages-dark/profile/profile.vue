<template>
  <view class="profile-page">
    <!-- 鍔ㄦ€佺鎶€鑳屾櫙 - 鍥哄畾瀹氫綅锛屼笉褰卞搷婊氬姩 -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 12" :key="n" :style="{ animationDelay: (n * 0.5) + 's' }"></view>
      </view>
      <view class="circuit-lines">
        <view class="line horizontal"></view>
        <view class="line vertical"></view>
        <view class="line diagonal"></view>
      </view>
      <view class="data-streams">
        <view class="stream" v-for="n in 6" :key="n"></view>
      </view>
    </view>
    
    <!-- 鍙粴鍔ㄥ唴瀹瑰尯鍩?-->
    <scroll-view 
      class="profile-scroll-container" 
      scroll-y 
      enable-back-to-top 
      :scroll-with-animation="true"
      :show-scrollbar="false"
      :enhanced="true"
      :bounces="true"
    >
      <view class="profile-container">

    <!-- 澶撮儴鐘舵€佹爮 -->
    <view class="status-bar">
      <!-- 椤堕儴瀹夊叏鍖哄煙鍗犱綅 -->
      <view class="safe-area-top"></view>
      <view class="status-content">
        <view class="eco-indicator">
          <text class="eco-icon">馃尡</text>
          <view class="indicator-pulse"></view>
        </view>
        <text class="title-text">涓汉涓績</text>
        <view class="carbon-display">
          <text class="carbon-text">CO鈧?-{{ calculateCarbonReduction(points || 0) }}</text>
        </view>
      </view>
    </view>

    <!-- 鐢ㄦ埛淇℃伅涓诲崱鐗?-->
    <view class="user-main-card">
      <view class="hologram-border"></view>
      <view class="card-glow"></view>
      
      <!-- 鐢ㄦ埛澶村儚鍖哄煙 -->
      <view class="avatar-section">
        <view class="avatar-ring">
          <view class="avatar-inner">
            <image class="person-avatar" :src="getAvatarUrl(userInfo.avatar || '/static/person.jpeg', baseUrl)" mode="aspectFill"></image>
          </view>
          <!-- 鍥涚鍨冨溇妗跺洿缁?-->
          <view class="trash-bins">
            <view class="trash-bin recyclable">
              <view class="bin-content">
                <text class="bin-icon">鈾伙笍</text>
                <text class="bin-label">鍙洖鏀?</text>
              </view>
            </view>
            <view class="trash-bin harmful">
              <view class="bin-content">
                <text class="bin-icon">鈽笍</text>
                <text class="bin-label">鏈夊鍨冨溇</text>
              </view>
            </view>
            <view class="trash-bin kitchen">
              <view class="bin-content">
                <text class="bin-icon">馃崕</text>
                <text class="bin-label">鍘ㄤ綑鍨冨溇</text>
              </view>
            </view>
            <view class="trash-bin other">
              <view class="bin-content">
                <text class="bin-icon">馃棏锔?</text>
                <text class="bin-label">鍏朵粬鍨冨溇</text>
              </view>
            </view>
          </view>
          <view class="scanning-line"></view>
        </view>
      </view>

      <!-- 鐢ㄦ埛淇℃伅 -->
      <view class="user-info">
        <text class="username-display">{{ userInfo.username || username }}</text>
        <text class="user-id">ECO ID: {{ (userInfo.username || username).toUpperCase() }}</text>
        <text class="access-level">鐜繚杈句汉 路 LEVEL {{ Math.floor((points || 0) / 100) + 1 }}</text>
        <view class="eco-badges">
          <text class="badge" v-if="(points || 0) >= 100">馃尶 鍒嗙被涓撳</text>
          <text class="badge" v-if="(points || 0) >= 300">鈾伙笍 鍥炴敹鐜嬭€?</text>
          <text class="badge" v-if="(points || 0) >= 500">馃實 鍦扮悆瀹堟姢鑰?</text>
        </view>
      </view>
    </view>

    <!-- 绉垎缁熻鍗＄墖 -->
    <view class="stats-card" v-if="points !== undefined || loading">
      <view class="stats-header">
        <text class="stats-title"><text class="earth-icon">馃實</text> 鐜繚璐＄尞</text>
        <text class="refresh-btn" @click="handleRefresh" :class="{ rotating: loading }">鈾伙笍</text>
      </view>
      
      <view class="stats-content" v-if="!loading">
        <view class="stat-item points">
          <view class="stat-icon">
            <text class="icon-text">馃専</text>
            <view class="pulse-ring green"></view>
          </view>
          <view class="stat-info">
            <text class="stat-label">鐜繚绉垎</text>
            <text class="stat-value">{{ points || 0 }}</text>
            <text class="stat-unit">ECO POINTS</text>
          </view>
          <view class="info-icon" @click="showPointsInfo">
            <text class="info-symbol">鈩癸笍</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill eco" :style="{ width: Math.min((points || 0) / 1000 * 100, 100) + '%' }"></view>
          </view>
        </view>

        <view class="stat-item carbon">
          <view class="stat-icon">
            <text class="icon-text">馃崈</text>
            <view class="pulse-ring green"></view>
          </view>
          <view class="stat-info">
            <text class="stat-label">鍑忕⒊閲?</text>
            <text class="stat-value">{{ calculateCarbonReduction(points || 0) }}</text>
            <text class="stat-unit">CO鈧?SAVED</text>
          </view>
          <view class="info-icon" @click="showCarbonInfo">
            <text class="info-symbol">鈩癸笍</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill carbon" :style="{ width: Math.min(calculateCarbonProgress(points || 0), 100) + '%' }"></view>
          </view>
        </view>

        <view class="stat-item recycle">
          <view class="stat-icon">
            <text class="icon-text">鈾伙笍</text>
            <view class="pulse-ring green"></view>
          </view>
          <view class="stat-info">
            <text class="stat-label">鍥炴敹璐＄尞</text>
            <text class="stat-value">{{ Math.floor((points || 0) / 8) }}</text>
            <text class="stat-unit">ITEMS RECYCLED</text>
          </view>
          <view class="progress-bar">
            <view class="progress-fill recycle" style="width: 92%;"></view>
          </view>
        </view>
      </view>

      <view class="loading-display" v-else>
        <view class="loading-spinner eco"></view>
        <text class="loading-text">鐜繚鏁版嵁鍚屾涓?..</text>
      </view>
    </view>

    <!-- 璁惧杩炴帴鐘舵€佸崱鐗?-->
    <view v-if="hasConnection" class="device-status-card">
      <view class="device-status-header">
        <text class="device-status-title">
          <text class="device-icon">馃摫</text> 璁惧杩炴帴
        </text>
        <view class="status-indicator online">
          <view class="status-dot"></view>
          <text class="status-text">鍦ㄧ嚎</text>
        </view>
      </view>
      
      <view class="device-info-section" @click="goToDeviceConnection">
        <view class="device-detail">
          <text class="device-name">{{ connectedDevice?.device_name || '鏅鸿兘鍨冨溇鍒嗙被璁惧' }}</text>
          <text class="device-id">ID: {{ connectedDevice?.device_id || connectedDevice?.id || 'N/A' }}</text>
        </view>
        <view class="device-action">
          <text class="action-text">绠＄悊杩炴帴</text>
          <text class="action-arrow">鈫?</text>
        </view>
      </view>
      
      <view class="device-stats">
        <view class="device-stat-item">
          <text class="stat-label">杩炴帴鏃堕暱</text>
          <text class="stat-value">{{ connectionDuration }}</text>
        </view>
        <view class="device-stat-item">
          <text class="stat-label">鐘舵€?</text>
          <text class="stat-value">姝ｅ父杩愯</text>
        </view>
      </view>
    </view>

    <!-- 鍔熻兘鎿嶄綔鍖?-->
    <view class="function-grid">
      <view class="function-row">
        <view class="function-item" @click="goHistory">
          <view class="function-icon">
            <text class="icon">馃搵</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">璇嗗埆鍘嗗彶</text>
          <text class="function-desc">鏌ョ湅璁板綍</text>
          <view class="hover-effect"></view>
        </view>

        <view class="function-item" @click="goRanking">
          <view class="function-icon">
            <text class="icon">馃弳</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">鐜繚鎺掕姒?</text>
          <text class="function-desc">姣旀嫾绉垎</text>
          <view class="hover-effect"></view>
        </view>

        
                <view class="function-item" @click="goAchievements">
          <view class="function-icon">
            <text class="icon">🏅</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">成就系统</text>
          <text class="function-desc">任务与徽章</text>
          <view class="hover-effect"></view>
        </view>
      </view>

      <view class="function-row">
        <view class="function-item" @click="goGuide">
          <view class="function-icon">
            <text class="icon">馃摎</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">鍒嗙被鎸囧崡</text>
          <text class="function-desc">瀛︿範鐜繚</text>
          <view class="hover-effect"></view>
        </view>

        <view class="function-item" @click="goSettings">
          <view class="function-icon">
            <text class="icon">鈿欙笍</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">鐢ㄦ埛璁剧疆</text>
          <text class="function-desc">淇℃伅鍜屽亸濂?</text>
          <view class="hover-effect"></view>
        </view>

        <view class="function-item" @click="goAbout">
          <view class="function-icon">
            <text class="icon">鈩癸笍</text>
            <view class="icon-glow green"></view>
          </view>
          <text class="function-title">鍏充簬杞欢</text>
          <text class="function-desc">搴旂敤淇℃伅</text>
          <view class="hover-effect"></view>
        </view>
      </view>
    </view>

    <!-- 绠＄悊鍛樹笓灞炲姛鑳?-->
    <view v-if="isAdmin" class="admin-card">
      <view class="admin-header">&nbsp;<text style="font-size:large;"> 馃敡 </text>&nbsp;<text>绠＄悊鍛樺姛鑳?</text></view>
      <view class="admin-buttons">
        <view class="admin-btn" @click="goFileManagement">馃搨 鏂囦欢绠＄悊</view>
        <view class="admin-btn" @click="go2048">馃幉 2048鍚庡彴</view>
        <view class="admin-btn" @click="goDbMonitor">馃搳 鏁版嵁搴撶鐞?</view>
        <view class="admin-btn" @click="goAPITest">鈽?鎺ュ彛娴嬭瘯</view>
      </view>
    </view>

    <!-- 搴曢儴瀵艰埅 -->
    <view class="tech-tabbar">
      <view class="tabbar-bg"></view>
      <view class="tab-item" @click="goHome">
        <view class="tab-icon-container">
          <text class="tab-icon">馃彔</text>
          <view class="tab-indicator"></view>
        </view>
        <text class="tab-label">棣栭〉</text>
      </view>
      <view class="tab-item" @click="goMap">
        <view class="tab-icon-container">
          <text class="tab-icon">馃椇锔?</text>
          <view class="tab-indicator"></view>
        </view>
        <text class="tab-label">鍦板浘</text>
      </view>
      <view class="tab-item" @click="goShop">
        <view class="tab-icon-container">
          <text class="tab-icon">馃泹锔?</text>
          <view class="tab-indicator"></view>
        </view>
        <text class="tab-label">鍟嗗煄</text>
      </view>
      <view class="tab-item active">
        <view class="tab-icon-container">
          <text class="tab-icon">馃懁</text>
          <view class="tab-indicator active"></view>
        </view>
        <text class="tab-label">鎴戠殑</text>
      </view>
    </view>

    <!-- 绉垎淇℃伅寮圭獥 -->
    <!-- 淇℃伅寮圭獥锛氬鍔犲唴閮ㄦ粴鍔ㄤ笌瑙︽懜浜嬩欢鎷︽埅锛岄伩鍏嶈儗鏅〉闈㈡粴鍔?-->
    <view v-if="showInfoModal" class="info-modal-overlay" @click="closePointsInfo" @touchmove.stop.prevent>
      <view class="info-modal" @click.stop @touchmove.stop>
        <view class="info-modal-header">
          <text class="info-modal-title">馃挵 绉垎鑾峰彇璇存槑</text>
          <view class="info-modal-close" @click="closePointsInfo">鉁?</view>
        </view>
        <view class="info-modal-content">
          <view class="info-item">
            <view class="info-icon-wrapper online">
              <text class="info-emoji">馃攳</text>
            </view>
            <view class="info-text">
              <text class="info-title">鍦ㄧ嚎璇嗗埆</text>
              <text class="info-desc">姣忔璇嗗埆鍨冨溇鍙幏寰?绉垎</text>
              <text class="info-limit">姣忔棩涓婇檺锛?绉垎</text>
            </view>
          </view>
          
          <view class="info-item">
            <view class="info-icon-wrapper device">
              <text class="info-emoji">馃棏锔?</text>
            </view>
            <view class="info-text">
              <text class="info-title">鏅鸿兘鍒嗙被瑁呯疆</text>
              <text class="info-desc">浣跨敤鍒嗙被瑁呯疆鎶曟斁鍨冨溇</text>
              <text class="info-limit">姣忔鏍规嵁鍨冨溇绉嶇被鑾峰緱1-3绉垎</text>
            </view>
          </view>

          <view class="info-item bonus">
            <view class="info-icon-wrapper bonus">
              <text class="info-emoji">馃巵</text>
            </view>
            <view class="info-text">
              <text class="info-title">棰濆濂栧姳</text>
              <text class="info-desc">杩炵画鐧诲綍銆佸畬缇庡垎绫荤瓑鍙幏寰楅澶栫Н鍒?</text>
            </view>
          </view>
        </view>
        
        <view class="info-modal-footer">
          <text class="info-footer-text">绉垎鍙湪鍟嗗煄鍏戞崲绮剧編绀煎搧</text>
          <view class="info-footer-btn" @click="goToShop">
            <text class="footer-btn-text">鍓嶅線鍟嗗煄</text>
          </view>
        </view>
        
        <view class="modal-glow-effect"></view>
      </view>
    </view>

    <!-- 鍑忕⒊淇℃伅寮圭獥 -->
    <!-- 鍑忕⒊淇℃伅寮圭獥锛氬悓鏍峰鍔犲唴閮ㄦ粴鍔ㄤ笌瑙︽懜鎷︽埅 -->
    <view v-if="showCarbonModal" class="info-modal-overlay" @click="closeCarbonInfo" @touchmove.stop.prevent>
      <view class="info-modal" @click.stop @touchmove.stop>
        <view class="info-modal-header">
          <text class="info-modal-title">馃崈 鍑忕⒊閲忚绠楄鏄?</text>
          <view class="info-modal-close" @click="closeCarbonInfo">鉁?</view>
        </view>
        <view class="info-modal-content">
          <view class="info-item">
            <view class="info-icon-wrapper online">
              <text class="info-emoji">鈾伙笍</text>
            </view>
            <view class="info-text">
              <text class="info-title">鍙洖鏀跺瀮鍦惧垎绫?</text>
              <text class="info-desc">姣忔姝ｇ‘鍒嗙被鍙洖鏀跺瀮鍦?</text>
              <text class="info-limit">鍑忔帓绾?6g CO鈧傚綋閲?</text>
            </view>
          </view>
          
          <view class="info-item">
            <view class="info-icon-wrapper device">
              <text class="info-emoji">馃崕</text>
            </view>
            <view class="info-text">
              <text class="info-title">鍘ㄤ綑鍨冨溇鍒嗙被</text>
              <text class="info-desc">閬垮厤鍘ㄤ綑鍨冨溇濉煁浜х敓鐢茬兎</text>
              <text class="info-limit">鍑忔帓绾?9g CO鈧傚綋閲?</text>
            </view>
          </view>

          <view class="info-item">
            <view class="info-icon-wrapper hazardous">
              <text class="info-emoji">鈽笍</text>
            </view>
            <view class="info-text">
              <text class="info-title">鏈夊鍨冨溇鍒嗙被</text>
              <text class="info-desc">涓撲笟澶勭悊閬垮厤鐜姹℃煋</text>
              <text class="info-limit">鍑忔帓绾?7g CO鈧傚綋閲?</text>
            </view>
          </view>

          <view class="info-item bonus">
            <view class="info-icon-wrapper bonus">
              <text class="info-emoji">馃實</text>
            </view>
            <view class="info-text">
              <text class="info-title">璁＄畻渚濇嵁</text>
              <text class="info-desc">鍩轰簬鑱斿悎鍥絀PCC鎶ュ憡鍜屽浗鍐呭瀮鍦惧鐞嗘暟鎹紝缁煎悎鑰冭檻鍥炴敹鍒╃敤銆佸爢鑲ュ鐞嗗拰閬垮厤濉煁鐨勭幆澧冩晥鐩?</text>
            </view>
          </view>
        </view>
        
        <view class="info-modal-footer">
          <view class="carbon-equivalents">
            <text class="equivalents-title">鎮ㄧ殑{{ calculateCarbonReduction(points || 0) }}鍑忕⒊閲忕浉褰撲簬:</text>
            <view class="equivalent-item">
              <text class="equivalent-icon">馃尦</text>
              <text class="equivalent-text">绉嶆{{ getCarbonEquivalents(points || 0).trees }}妫垫爲涓€骞寸殑鍚哥⒊閲?</text>
            </view>
            <view class="equivalent-item">
              <text class="equivalent-icon">馃殫</text>
              <text class="equivalent-text">鍑忓皯{{ getCarbonEquivalents(points || 0).carKm }}鍏噷姹借溅琛岄┒</text>
            </view>
            <view class="equivalent-item">
              <text class="equivalent-icon">馃挕</text>
              <text class="equivalent-text">鑺傜渷{{ getCarbonEquivalents(points || 0).electricity }}搴︾數鐨勭⒊鎺掓斁</text>
            </view>
          </view>
        </view>
        
        <view class="modal-glow-effect"></view>
      </view>
    </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { userinfo } from '@/api/user'
import { useDeviceConnection } from '@/composables/useDeviceConnection'
import { baseUrl } from '../../api/settings'
import { getAvatarUrl } from '@/utils/avatar-handler.js'

const username = ref('')
const userInfo = ref({})
const loading = ref(false)
const showInfoModal = ref(false) // 鎺у埗绉垎淇℃伅寮圭獥鏄剧ず
const showCarbonModal = ref(false) // 鎺у埗鍑忕⒊淇℃伅寮圭獥鏄剧ず
const isAdmin = ref(false)

// 绉戝鐨勫噺纰抽噺璁＄畻閫昏緫
const calculateCarbonReduction = (points) => {
  if (!points || points <= 0) return '0g'
  
  // 鍩轰簬绉戝鏁版嵁鐨勫噺鎺掔郴鏁?
  const CARBON_FACTORS = {
    // 鍨冨溇鍒嗙被琛屼负鐨勫钩鍧囧噺鎺掓晥鏋?(kg CO鈧?娆?
    recyclable: 0.036,     // 鍙洖鏀跺瀮鍦惧垎绫伙細閬垮厤鐢熶骇鏂版潗鏂?
    kitchen: 0.019,        // 鍘ㄤ綑鍨冨溇鍒嗙被锛氶伩鍏嶅～鍩嬩骇鐢熺敳鐑?
    hazardous: 0.57,       // 鏈夊鍨冨溇鍒嗙被锛氶伩鍏嶇幆澧冩薄鏌撶殑闂存帴鏁堢泭
    other: 0.0075,          // 鍏朵粬鍨冨溇鍒嗙被锛氬熀纭€鍑忔帓
    base_classification: 0  // 鍩虹鍒嗙被琛屼负鍑忔帓
  }
  
  // 鏍规嵁绉垎浼扮畻鍨冨溇鍒嗙被鍒嗗竷锛堝熀浜庡疄闄呬娇鐢ㄦ暟鎹級
  const distribution = {
    recyclable: 0.40,     // 40% 鍙洖鏀跺瀮鍦?
    kitchen: 0.30,        // 30% 鍘ㄤ綑鍨冨溇
    other: 0.22,          // 20% 鍏朵粬鍨冨溇
    hazardous: 0.08       // 10% 鏈夊鍨冨溇
  }
  
  // 璁＄畻鎬诲噺鎺掗噺
  let totalReduction = 0
  
  // 鍩虹鍒嗙被鍑忔帓
  totalReduction += points * CARBON_FACTORS.base_classification
  
  // 鍒嗙被鍒噺鎺掕绠?
  totalReduction += points * distribution.recyclable * CARBON_FACTORS.recyclable
  totalReduction += points * distribution.kitchen * CARBON_FACTORS.kitchen
  totalReduction += points * distribution.other * CARBON_FACTORS.other
  totalReduction += points * distribution.hazardous * CARBON_FACTORS.hazardous
  
  // 鏍煎紡鍖栨樉绀?
  if (totalReduction < 0.01) {
    return '0g'
  } else if (totalReduction < 1) {
    return `${Math.round(totalReduction * 1000)}g`
  } else if (totalReduction < 1000) {
    return `${Math.round(totalReduction * 100) / 100}kg`
  } else {
    return `${Math.round(totalReduction / 10) / 100}t`
  }
}

// 璁＄畻鍑忕⒊杩涘害鏉＄櫨鍒嗘瘮
const calculateCarbonProgress = (points) => {
  const rawReduction = parseFloat(calculateCarbonReduction(points))
  if (isNaN(rawReduction)) return 0
  
  // 璁惧畾鐩爣涓?00kg鍑忔帓锛岃绠楄繘搴?
  return Math.min((rawReduction / 100) * 100, 100)
}

// 璁＄畻鍑忕⒊褰撻噺锛堜究浜庣悊瑙ｇ殑瀵规瘮锛?
const getCarbonEquivalents = (points) => {
  const carbonText = calculateCarbonReduction(points)
  let carbonKg = 0
  
  // 瑙ｆ瀽鍑忕⒊閲忔暟鍊?
  if (carbonText.includes('kg')) {
    carbonKg = parseFloat(carbonText)
  } else if (carbonText.includes('g')) {
    carbonKg = parseFloat(carbonText) / 1000
  } else if (carbonText.includes('t')) {
    carbonKg = parseFloat(carbonText) * 1000
  }
  
  return {
    trees: Math.round((carbonKg / 22) * 10) / 10, // 涓€妫垫爲骞村惛鏀剁害22kg CO鈧?
    carKm: Math.round(carbonKg / 0.2), // 灏忚娇杞︽瘡鍏噷鎺掓斁绾?.2kg CO鈧?
    electricity: Math.round(carbonKg / 0.85) // 姣忓害鐢电害浜х敓0.85kg CO鈧?
  }
}

// 浣跨敤璁惧杩炴帴鐘舵€佺鐞?
const { hasConnection, connectedDevice, goToDeviceConnection, points } = useDeviceConnection()

// 璁＄畻杩炴帴鏃堕暱
const connectionDuration = computed(() => {
  const connectionTime = uni.getStorageSync('connection')
  if (!connectionTime) return '0鍒嗛挓'
  
  const now = Date.now()
  const diffMinutes = Math.floor((now - connectionTime) / (1000 * 60))
  
  if (diffMinutes < 1) return '鍒氬垰杩炴帴'
  if (diffMinutes < 60) return `${diffMinutes}鍒嗛挓`
  
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  return minutes > 0 ? `${hours}灏忔椂${minutes}鍒嗛挓` : `${hours}灏忔椂`
})

// 鑾峰彇鐢ㄦ埛淇℃伅鍖呮嫭绉垎
const fetchUserInfo = async () => {
  try {
    loading.value = true
    const token = uni.getStorageSync('token')
    if (!token) {
      username.value = '娓稿'
      // 鏃?token 鏃舵竻闄ゆ墍鏈夋潈闄愮浉鍏虫爣璁?
      isAdmin.value = false
      uni.removeStorageSync('isAdmin')
      return false
    }
    const response = await userinfo()
    if (response.code === 0) {
      userInfo.value = response.data
      points.value = response.data.points || 0
      // 鍚屾椂鏇存柊username锛堜互闃叉湰鍦板瓨鍌ㄧ殑涓嶆槸鏈€鏂扮殑锛?
      if (response.data.username) {
        username.value = response.data.username
      }
      // 鍚庣浼氳繑鍥?isAdmin 瀛楁锛屼繚瀛樺埌鏈湴浠ヤ究鍏ㄥ眬璇诲彇
      // 涓ユ牸瀹夊叏妫€鏌ワ細鍙湁鍚庣鏄庣‘杩斿洖 isAdmin=true锛屾墠鑳借祴浜堟潈闄?
      const isAdminFromServer = !!(response.data && response.data.isAdmin === true)
      isAdmin.value = isAdminFromServer&&uni.getStorageSync('isAdmin')
      try {
        if (isAdminFromServer) {
          uni.setStorageSync('isAdmin', true)
        } else {
          // 鑻ュ悗绔繑鍥?isAdmin=false 鎴栫己澶憋紝绔嬪嵆娓呴櫎鏈湴鏍囪
          uni.removeStorageSync('isAdmin')
        }
        return true
      } catch (e) {
        // ignore storage errors
        return false
      }
    } else {
      console.error('鑾峰彇鐢ㄦ埛淇℃伅澶辫触:', response.msg)
      uni.showToast({
        title: response.data.msg || '鑾峰彇鐢ㄦ埛淇℃伅澶辫触',
        icon: 'none'
      })
      return false
    }
  } catch (error) {
    console.error('璇锋眰鐢ㄦ埛淇℃伅鍑洪敊:', error)
    uni.showToast({
      title: error.msg || '缃戠粶閿欒锛岃绋嶅悗閲嶈瘯',
      icon: 'none'
    })
    return false
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const savedUser = uni.getStorageSync('savedUser')?.username
  if (!(savedUser && uni.getStorageSync('autoLogin'))) {
    
  } else {
    username.value = savedUser
  }
  
  // 鑾峰彇瀹屾暣鐨勭敤鎴蜂俊鎭紙鍖呮嫭绉垎鍜屾潈闄愶級
  await fetchUserInfo()
  
  // 瀹夊叏闃叉姢锛氶獙璇佹湰鍦板瓨鍌ㄧ殑 isAdmin 鏄惁涓庢湇鍔＄涓€鑷?  // 鑻ユ湰鍦版湁 isAdmin 浣嗘湇鍔＄杩斿洖鏃犳潈闄愶紝绔嬪嵆娓呴櫎鏈湴鏍囪
  if (uni.getStorageSync('isAdmin') && !isAdmin.value) {
    uni.removeStorageSync('isAdmin')
  }
})

// 鎵嬪姩鍒锋柊鐢ㄦ埛淇℃伅
const handleRefresh = async () => {
  if (await fetchUserInfo()) {
    uni.showToast({
      title: '鍒锋柊鎴愬姛',
      icon: 'success'
    })
  }
}

// 鏄剧ず绉垎淇℃伅寮圭獥
const showPointsInfo = () => {
  showInfoModal.value = true
}

// 鍏抽棴绉垎淇℃伅寮圭獥
const closePointsInfo = () => {
  showInfoModal.value = false
}

// 鏄剧ず鍑忕⒊淇℃伅寮圭獥
const showCarbonInfo = () => {
  showCarbonModal.value = true
}

// 鍏抽棴鍑忕⒊淇℃伅寮圭獥
const closeCarbonInfo = () => {
  showCarbonModal.value = false
}

// 鍓嶅線鍟嗗煄
const goToShop = () => {
  closePointsInfo()
  uni.redirectTo({ url: '/pages-dark/shop/shop' })
}

function goHistory() {uni.navigateTo({ url: '/pages-dark/history/history' })}
function goRanking() {uni.navigateTo({ url: '/pages-dark/ranking/ranking' })}
function goSettings() { uni.navigateTo({ url: '/pages-nonTheme/settings' }) }
function goAbout() {uni.navigateTo({ url: '/pages-nonTheme/about' })}
function goGuide() {uni.navigateTo({ url: '/pages-dark/guide/guide' })}
function goAchievements() {
  const isH5Page = (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    !window.wx &&
    !window.my
  )
  if (isH5Page) {
    window.location.href = '/achievements'
    return
  }
  uni.navigateTo({ url: '/pages-nonTheme/achievements' })
}

// 鏉冮檺楠岃瘉鍑芥暟锛氬湪瀵艰埅鍓嶉獙璇佺敤鎴锋槸鍚︾湡姝ｆ嫢鏈夌鐞嗗憳鏉冮檺
async function verifyAdminPermission() {
  // 1. 鏈湴蹇€熸鏌?
  const localAdminFlag = uni.getStorageSync('isAdmin')
  if (!localAdminFlag) {
    uni.showToast({ title: '无权限访问', icon: 'none' })
    return false
  }
  // 2. 鍚戝悗绔獙璇佹潈闄?
  try {
    const response = await userinfo()
    if (response && response.data && response.data.isAdmin){
      return true
    } else {
      // 鏉冮檺楠岃瘉澶辫触锛屾竻闄ゆ湰鍦颁吉閫犵殑 isAdmin 鏍囪
      uni.removeStorageSync('isAdmin')
      isAdmin.value = false
      uni.showToast({ title: '鏉冮檺宸茶繃鏈熸垨琚挙閿€', icon: 'none' })
      return false
    }
  } catch (err) {
    console.error('鏉冮檺楠岃瘉澶辫触:', err)
    uni.showToast({ title: '鏉冮檺楠岃瘉澶辫触锛岃閲嶆柊鐧诲綍', icon: 'none' })
    return false
  }
}

function goFileManagement() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      // 鍦ㄥ簲鐢ㄥ唴浣跨敤 webview 鎵撳紑鏂囦欢绠＄悊锛岄伩鍏嶆樉绀烘祻瑙堝櫒鍦板潃鏍?
      const target = encodeURIComponent(baseUrl + '/files')
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
    }
  })
}

function goDbMonitor() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      uni.navigateTo({ url: '/pages-nonTheme/database' }).catch(() => {
        uni.showToast({ title: '无权限访问', icon: 'none' })
      })
    }
  })
}

function goAPITest() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      uni.navigateTo({ url: '/pages-nonTheme/test' })
    }
  })
}

function go2048() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      // 鍦ㄥ簲鐢ㄥ唴浣跨敤 webview 鎵撳紑 2048 绠＄悊鍙?
      const target = encodeURIComponent(baseUrl + '/2048/console')
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
    } else {
      uni.showToast({ title: '仅访问用户界面', icon: 'none' })
      setTimeout(() => {
        const target = encodeURIComponent(baseUrl + '/2048')
        uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
      }, 1000)
    }
  })
}
function goHome() {
  uni.redirectTo({ url: '/pages-dark/home/home' })
}
function goMap() {
  uni.navigateTo({ url: '/pages-dark/map/map' })
}
function goShop() {
  uni.redirectTo({ url: '/pages-dark/shop/shop' })
}
</script>

<style scoped>
/* 纭繚椤甸潰鍜宐ody鍙互婊氬姩 */
page {
  height: auto;
  overflow: visible;
  -webkit-overflow-scrolling: touch;
}

/* 閽堝H5鐨刡ody鏍峰紡 */
/* #ifndef APP-PLUS */
body {
  height: auto;
  overflow: visible;
  -webkit-overflow-scrolling: touch;
}
/* #endif */

/* 椤甸潰鏍瑰鍣?*/
.profile-page {
  height: 100vh;
  position: relative;
  overflow: hidden;
}

/* 婊氬姩瀹瑰櫒 - 灏忕▼搴忎娇鐢╯croll-view */
.profile-scroll-container {
  height: 100vh;
  width: 100%;
  position: relative;
}

/* 鍐呭瀹瑰櫒 */
.profile-container {
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #0a1a2f 0%, #051015 70%, #000508 100%);
  position: relative;
  padding: 0; /* 椤堕儴瀹夊叏鍖哄彧鍦ㄨ嚜瀹氫箟瀵艰埅鍐呴儴澶勭悊锛岄伩鍏?iOS 澶氶噸 env(safe-area-inset-top) 鍙犲姞 */
  padding-bottom: max(160rpx, calc(140rpx + env(safe-area-inset-bottom)));
  box-sizing: border-box;
}

/* H5鐜涓嬬殑鍏煎澶勭悊 */
/* #ifdef H5 */
.profile-page {
  height: 100vh;
  overflow: hidden;
}

.profile-scroll-container {
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  touch-action: pan-y pinch-zoom;
}
/* #endif */

/* 鍔ㄦ€佺鎶€鑳屾櫙绯荤粺 */
.tech-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

/* 灏忕▼搴忕幆澧冧笅鐨勮儗鏅畾浣嶈皟鏁?*/
/* #ifdef MP */
.tech-background {
  position: absolute;
}
/* #endif */

.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.12) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(50px, 50px); }
}

/* 娴姩绮掑瓙鏁堟灉 */
.floating-particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: radial-gradient(circle, #40e0ff 0%, transparent 70%);
  border-radius: 50%;
  animation: floatParticle 8s ease-in-out infinite;
}

.particle:nth-child(odd) { animation-direction: alternate; }
.particle:nth-child(2) { top: 20%; left: 10%; animation-duration: 6s; }
.particle:nth-child(3) { top: 60%; left: 80%; animation-duration: 10s; }
.particle:nth-child(4) { top: 80%; left: 20%; animation-duration: 7s; }
.particle:nth-child(5) { top: 40%; left: 70%; animation-duration: 9s; }
.particle:nth-child(6) { top: 10%; left: 60%; animation-duration: 8s; }

@keyframes floatParticle {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
  50% { transform: translateY(-30px) scale(1.5); opacity: 1; }
}

/* 鐢佃矾绾挎潯鏁堟灉 */
.circuit-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.line {
  position: absolute;
  background: linear-gradient(90deg, transparent 0%, #40e0ff 50%, transparent 100%);
  opacity: 0.6;
}

.line.horizontal {
  top: 30%;
  left: 0;
  width: 100%;
  height: 2px;
  animation: lineFlowH 6s ease-in-out infinite;
}

.line.vertical {
  top: 0;
  right: 20%;
  width: 2px;
  height: 100%;
  background: linear-gradient(0deg, transparent 0%, #40e0ff 50%, transparent 100%);
  animation: lineFlowV 8s ease-in-out infinite;
}

.line.diagonal {
  top: 10%;
  left: 10%;
  width: 200px;
  height: 2px;
  transform: rotate(45deg);
  animation: lineFlowD 10s ease-in-out infinite;
}

@keyframes lineFlowH {
  0%, 100% { opacity: 0.3; transform: scaleX(1); }
  50% { opacity: 0.8; transform: scaleX(1.2); }
}

@keyframes lineFlowV {
  0%, 100% { opacity: 0.3; transform: scaleY(1); }
  50% { opacity: 0.8; transform: scaleY(1.2); }
}

@keyframes lineFlowD {
  0%, 100% { opacity: 0.2; transform: rotate(45deg) scale(1); }
  50% { opacity: 0.6; transform: rotate(45deg) scale(1.1); }
}

/* 鏁版嵁娴佹晥鏋?*/
.data-streams {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.stream {
  position: absolute;
  width: 1px;
  height: 100%;
  background: linear-gradient(0deg, 
    transparent 0%, 
    #40e0ff 10%, 
    transparent 20%, 
    transparent 80%, 
    #00ff88 90%, 
    transparent 100%);
  animation: streamFlow 4s linear infinite;
}

.stream:nth-child(1) { left: 15%; animation-delay: 0s; }
.stream:nth-child(2) { left: 35%; animation-delay: 1s; }
.stream:nth-child(3) { left: 55%; animation-delay: 2s; }
.stream:nth-child(4) { left: 75%; animation-delay: 0.5s; }
.stream:nth-child(5) { left: 85%; animation-delay: 1.5s; }
.stream:nth-child(6) { left: 95%; animation-delay: 2.5s; }

@keyframes streamFlow {
  0% { transform: translateY(-100%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}

/* 娣峰悎绉戞妧鐘舵€佹爮 */
.status-bar {
  position: relative;
  z-index: 10;
  background: rgba(0, 25, 45, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(64, 224, 255, 0.4);
  /* 杩欓噷涓嶅啀鍔?env(safe-area-inset-top)锛岀粺涓€鐢?.safe-area-top 鍗犱綅锛岄伩鍏?iOS 椤堕儴绌虹櫧杩囧ぇ */
}

.safe-area-top {
  /* 鍗曚竴瀹夊叏鍖哄崰浣嶏細iOS 鍒樻捣鍖洪珮搴︼紱鍦?Android 閫氬父涓?0 */
  height: env(safe-area-inset-top);
  min-height: 44rpx; /* 鍏滃簳鐨勭姸鎬佹爮瑙嗚楂樺害 */
}

.status-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60rpx 40rpx 20rpx;
  position: relative;
}

.eco-indicator {
  position: absolute;
  left: 40rpx;
}

.eco-indicator {
  position: absolute;
  left: 40rpx;
  display: flex;
  align-items: center;
}

.carbon-display {
  position: absolute;
  right: 40rpx;
  background: rgba(0, 255, 136, 0.2);
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  border: 1px solid rgba(0, 255, 136, 0.4);
}

.eco-icon {
  font-size: 35rpx;
  margin-right: 8rpx;
}

.indicator-pulse {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 20rpx #10b981;
  animation: ecoGlow 2s ease-in-out infinite;
}

@keyframes ecoGlow {
  0%, 100% { opacity: 0.6; transform: scale(1); box-shadow: 0 0 20rpx #00ff88; }
  50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 30rpx #00ff88, 0 0 40rpx rgba(0, 255, 136, 0.5); }
}

.title-text {
  color: #40e0ff;
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  font-family: 'Courier New', monospace;
}
.status-text {
  color: #40e0ff;
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  font-family: 'Courier New', monospace;
}
.carbon-text {
  color: #00ff88;
  font-size: 20rpx;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

/* 鐢ㄦ埛涓诲崱鐗?*/
.user-main-card {
  position: relative;
  z-index: 10;
  margin: 30rpx 40rpx 30rpx;
  background: rgba(0, 35, 65, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 30rpx;
  border: 2px solid rgba(64, 224, 255, 0.5);
  padding: 60rpx 40rpx;
  overflow: hidden;
}

.hologram-border {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  border-radius: 30rpx;
  background: linear-gradient(45deg, 
    transparent 0%, 
    rgba(64, 224, 255, 0.8) 25%, 
    transparent 50%, 
    rgba(0, 255, 136, 0.8) 75%, 
    transparent 100%);
  animation: hologramRotate 4s linear infinite;
  z-index: -1;
}

@keyframes hologramRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.card-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.15) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  animation: glowPulse 3s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.1); }
}

/* 澶村儚鍖哄煙 */
.avatar-section {
  display: flex;
  justify-content: center;
  margin-bottom: 50rpx;
  padding: 15rpx 0;
}

.avatar-ring {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  border: 3px solid rgba(64, 224, 255, 0.7);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-inner {
  width: 150rpx;
  height: 150rpx;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(64, 224, 255, 0.1);
  z-index: 10;
  position: relative;
}

.person-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

/* 鍨冨溇妗跺洿缁曞姩鐢?*/
.trash-bins {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  animation: trashBinsRotate 20s linear infinite;
}

.trash-bin {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60rpx;
  height: 80rpx;
}

.trash-bin:nth-child(1) { /* 鍙洖鏀?*/
  transform: translate(-50%, -50%) rotate(0deg) translateY(-120rpx) rotate(0deg);
}

.trash-bin:nth-child(2) { /* 鏈夊鍨冨溇 */
  transform: translate(-50%, -50%) rotate(90deg) translateY(-120rpx) rotate(-90deg);
}

.trash-bin:nth-child(3) { /* 鍘ㄤ綑鍨冨溇 */
  transform: translate(-50%, -50%) rotate(180deg) translateY(-120rpx) rotate(-180deg);
}

.trash-bin:nth-child(4) { /* 鍏朵粬鍨冨溇 */
  transform: translate(-50%, -50%) rotate(270deg) translateY(-120rpx) rotate(-270deg);
}

.bin-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12rpx;
  border: 2px solid;
  animation: keepUpright 20s linear infinite reverse;
}

.trash-bin.recyclable .bin-content {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.2);
}

.trash-bin.harmful .bin-content {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.2);
}

.trash-bin.kitchen .bin-content {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.2);
}

.trash-bin.other .bin-content {
  border-color: #6b7280;
  background: rgba(107, 114, 128, 0.2);
}

.bin-icon {
  font-size: 24rpx;
  line-height: 1;
  margin-bottom: 4rpx;
}

.bin-label {
  font-size: 14rpx;
  color: #ffffff;
  font-weight: 500;
  text-align: center;
  line-height: 1;
  letter-spacing: 0.5rpx;
}

@keyframes trashBinsRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes keepUpright {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.scanning-line {
  position: absolute;
  top: -3px;
  left: -3px;
  right: -3px;
  bottom: -3px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent, #40e0ff, transparent);
  animation: scanRotate 3s linear infinite;
  z-index: 5;
}

@keyframes scanRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 鐢ㄦ埛淇℃伅 */
.user-info {
  text-align: center;
}

.username-display {
  display: block;
  color: #ffffff;
  font-size: 48rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
  text-shadow: 0 0 20rpx rgba(64, 224, 255, 0.9);
  letter-spacing: 2rpx;
}

.user-id {
  display: block;
  color: #40e0ff;
  font-size: 28rpx;
  font-family: 'Courier New', monospace;
  margin-bottom: 10rpx;
  letter-spacing: 3rpx;
}

.access-level {
  display: block;
  color: #00ff88;
  font-size: 24rpx;
  font-family: 'Courier New', monospace;
  letter-spacing: 2rpx;
  margin-bottom: 15rpx;
}

.eco-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12rpx;
  margin-top: 15rpx;
}

.badge {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
  font-size: 20rpx;
  padding: 6rpx 12rpx;
  border-radius: 16rpx;
  border: 1px solid rgba(0, 255, 136, 0.4);
  font-weight: 500;
}

/* 缁熻鍗＄墖 */
.stats-card {
  position: relative;
  z-index: 10;
  margin: 0 40rpx 24rpx;
  background: rgba(0, 30, 55, 0.95);
  backdrop-filter: blur(15px);
  border-radius: 20rpx;
  border: 1px solid rgba(64, 224, 255, 0.4);
  padding: 28rpx;
  overflow: hidden;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.stats-title {
  color: #40e0ff;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  display: flex;
  align-items: center;
}

.earth-icon {
  font-size: 40rpx;
  margin-right: 12rpx;
}

.refresh-btn {
  color: #00ff88;
  font-size: 36rpx;
  padding: 10rpx;
  border-radius: 50%;
  background: rgba(0, 255, 136, 0.15);
  transition: all 0.3s ease;
}

.refresh-btn.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.stat-item {
  display: flex;
  align-items: center;
  padding: 22rpx;
  background: rgba(34, 197, 94, 0.08);
  border-radius: 16rpx;
  border: 1px solid rgba(34, 197, 94, 0.3);
  position: relative;
  overflow: hidden;
}

.stat-icon {
  position: relative;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}

.icon-text {
  color: #22c55e;
  font-size: 32rpx;
  z-index: 2;
  position: relative;
}

.pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50rpx;
  height: 50rpx;
  border: 2px solid #22c55e;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: pulseRing 2s ease-out infinite;
}

.pulse-ring.green {
  border-color: #16a34a;
}

.stat-unit {
  color: rgba(34, 197, 94, 0.7);
  font-size: 18rpx;
  font-family: 'Courier New', monospace;
  letter-spacing: 1rpx;
  margin-top: 2rpx;
}

@keyframes pulseRing {
  0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}

.stat-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.stat-label {
  color: rgba(255, 255, 255, 0.8);
  font-size: 24rpx;
  margin-bottom: 6rpx;
}

.info-icon {
  position: relative;
  width: 32rpx;
  height: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(64, 224, 255, 0.2);
  border: 1px solid rgba(64, 224, 255, 0.4);
  cursor: pointer;
  transition: all 0.3s ease;
}

.info-icon:active {
  transform: scale(0.9);
  background: rgba(64, 224, 255, 0.3);
}

.info-symbol {
  font-size: 18rpx;
  color: #40e0ff;
  z-index: 2;
}

.info-pulse {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid rgba(64, 224, 255, 0.6);
  animation: infoPulse 2s ease-in-out infinite;
}

@keyframes infoPulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.stat-value {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 700;
  text-shadow: 0 0 15rpx rgba(34, 197, 94, 0.7);
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 6rpx;
  background: rgba(34, 197, 94, 0.25);
}

.progress-fill.eco {
  background: linear-gradient(90deg, #22c55e, #16a34a);
  box-shadow: 0 0 10rpx rgba(34, 197, 94, 0.5);
}

.progress-fill.carbon {
  background: linear-gradient(90deg, #10b981, #059669);
  box-shadow: 0 0 10rpx rgba(16, 185, 129, 0.5);
}

.progress-fill.recycle {
  background: linear-gradient(90deg, #16a34a, #15803d);
  box-shadow: 0 0 10rpx rgba(22, 163, 74, 0.5);
}

@keyframes progressFlow {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

/* 鍔犺浇鐘舵€?*/
.loading-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0;
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20rpx;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-spinner.eco {
  border: 4rpx solid rgba(64, 224, 255, 0.3);
  border-top: 4rpx solid #40e0ff;
}

.loading-text {
  color: #40e0ff;
  font-size: 28rpx;
}

/* 璁惧杩炴帴鐘舵€佸崱鐗?*/
.device-status-card {
  position: relative;
  z-index: 10;
  margin: 0 40rpx 30rpx;
  background: rgba(0, 35, 20, 0.95);
  backdrop-filter: blur(15px);
  border-radius: 24rpx;
  border: 1px solid rgba(16, 185, 129, 0.4);
  padding: 40rpx;
  overflow: hidden;
}

.device-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30rpx;
}

.device-status-title {
  color: #10b981;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  display: flex;
  align-items: center;
}

.device-icon {
  font-size: 40rpx;
  margin-right: 12rpx;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 14rpx;
  border-radius: 20rpx;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 16rpx #10b981;
  animation: statusPulse 2s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.2); }
}

.device-info-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  background: rgba(16, 185, 129, 0.08);
  border-radius: 20rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  margin-bottom: 24rpx;
  transition: all 0.3s ease;
  cursor: pointer;
}

.device-info-section:active {
  transform: scale(0.98);
  background: rgba(16, 185, 129, 0.12);
}

.device-detail {
  flex: 1;
}

.device-name {
  display: block;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}

.device-id {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24rpx;
  font-family: 'Courier New', monospace;
}

.device-action {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.action-text {
  color: #10b981;
  font-size: 28rpx;
  font-weight: 600;
}

.action-arrow {
  color: #10b981;
  font-size: 32rpx;
  font-weight: bold;
}

.device-stats {
  display: flex;
  gap: 32rpx;
}

.device-stat-item {
  flex: 1;
  text-align: center;
  padding: 24rpx 16rpx;
  background: rgba(16, 185, 129, 0.05);
  border-radius: 16rpx;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.device-stat-item .stat-label {
  display: block;
  color: rgba(255, 255, 255, 0.6);
  font-size: 24rpx;
  margin-bottom: 8rpx;
}

.device-stat-item .stat-value {
  display: block;
  color: #10b981;
  font-size: 28rpx;
  font-weight: 600;
}

/* 鍔熻兘缃戞牸 */
.function-grid {
  position: relative;
  z-index: 10;
  margin: 0 40rpx 120rpx;
}

.function-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.function-row:last-child {
  margin-bottom: 0;
}

.function-item {
  flex: 1;
  background: rgba(5, 35, 20, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 16rpx;
  border: 1px solid rgba(34, 197, 94, 0.4);
  padding: 16rpx 20rpx;
  text-align: center;
  position: relative;
  overflow: hidden;
  gap: 16rpx;
  transition: all 0.3s ease;
}

.function-item:active {
  transform: scale(0.95);
}

.function-icon {
  position: relative;
  margin-bottom: 12rpx;
}

.icon {
  font-size: 40rpx;
  display: block;
}

.icon-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60rpx;
  height: 60rpx;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  animation: iconGlow 2s ease-in-out infinite;
}

.icon-glow.green {
  background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 70%);
}

.icon-glow.red {
  background: radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, transparent 70%);
}

@keyframes iconGlow {
  0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
}

.function-title {
  display: block;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 5rpx;
  letter-spacing: 1rpx;
}

.function-desc {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 22rpx;
}

.hover-effect {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.function-item:hover .hover-effect {
  left: 0;
}

/* 绉戞妧搴曢儴瀵艰埅 */
.tech-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: rgba(0, 20, 40, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(64, 224, 255, 0.4);
}

.tabbar-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    rgba(64, 224, 255, 0.08) 0%, 
    rgba(0, 255, 136, 0.08) 50%, 
    rgba(64, 224, 255, 0.08) 100%);
  animation: tabbarFlow 5s ease-in-out infinite;
}

@keyframes tabbarFlow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 20rpx 0;
}

.tab-icon-container {
  position: relative;
  margin-bottom: 8rpx;
}

.tab-icon {
  font-size: 44rpx;
  filter: grayscale(100%);
  transition: all 0.3s ease;
}

.tab-item.active .tab-icon {
  filter: grayscale(0%);
  transform: scale(1.1);
  text-shadow: 0 0 20rpx #40e0ff;
}

.tab-indicator {
  position: absolute;
  bottom: -8rpx;
  left: 50%;
  width: 60rpx;
  height: 6rpx;
  background: transparent;
  transform: translateX(-50%);
  border-radius: 3rpx;
  transition: all 0.3s ease;
}

.tab-indicator.active {
  background: linear-gradient(90deg, #40e0ff, #00ff88);
  box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.8);
}

.tab-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 20rpx;
  font-weight: 500;
  letter-spacing: 1rpx;
  transition: color 0.3s ease;
}

.tab-item.active .tab-label {
  color: #40e0ff;
  text-shadow: 0 0 10rpx rgba(64, 224, 255, 0.7);
}

/* 鑴夊啿鍔ㄧ敾 */
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

/* 绉垎淇℃伅寮圭獥 */
.info-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.info-modal {
  background: rgba(0, 30, 55, 0.98);
  backdrop-filter: blur(25px);
  border-radius: 32rpx;
  border: 2px solid rgba(64, 224, 255, 0.5);
  max-width: 650rpx;
  width: 100%;
  /* 鍦ㄤ笉鍚屽钩鍙颁紭鍏堜娇鐢?80vh锛屽吋瀹归儴鍒嗗皬绋嬪簭瀵?vh 鏀寔宸細鍐嶉檺鍒朵竴涓儚绱犻珮搴?*/
  max-height: min(90vh, 1200rpx);
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 澶栧眰涓嶆粴鍔紝鍐呴儴鍐呭鍖烘粴鍔?*/
  animation: modalSlideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
  box-shadow: 
    0 20rpx 60rpx rgba(0, 0, 0, 0.5),
    0 0 80rpx rgba(64, 224, 255, 0.3);
}

@keyframes modalSlideIn {
  0% { 
    opacity: 0; 
    transform: scale(0.8) translateY(40rpx); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1) translateY(0); 
  }
}

.info-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx 40rpx 20rpx;
  border-bottom: 1px solid rgba(64, 224, 255, 0.2);
}

.info-modal-title {
  color: #40e0ff;
  font-size: 36rpx;
  font-weight: 700;
  text-shadow: 0 0 20rpx rgba(64, 224, 255, 0.6);
}

.info-modal-close {
  width: 48rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.info-modal-close:active {
  transform: scale(0.9);
  background: rgba(255, 255, 255, 0.2);
}

.info-modal-content {
  padding: 10rpx 40rpx 20rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1; /* 鍗犳嵁鍙粴鍔ㄥ尯鍩?*/
  min-height: 0; /* 瑙ｅ喅 flex 瀛愰」鍦ㄩ儴鍒嗗皬绋嬪簭涓棤娉曟敹缂╁鑷翠笉鑳芥粴鍔ㄩ棶棰?*/
}

/* H5鐜涓嬮殣钘忔粴鍔ㄦ潯 */
/* #ifdef H5 */
.info-modal-content::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.info-modal-content {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}
/* #endif */

/* 鍦ㄦ瀬灏忓睆锛堥珮搴?< 600px锛夋椂锛岄€傚綋鍑忓皬鍐呰竟璺濅笌鍦嗚锛屼繚闅滃彲瑙嗗唴瀹?*/
@media screen and (max-height: 600px) {
  .info-modal { border-radius: 24rpx; }
  .info-modal-header { padding: 30rpx 30rpx 16rpx; }
  .info-modal-content { padding: 10rpx 30rpx 16rpx; }
  .info-modal-footer { padding: 16rpx 30rpx 30rpx; }
}

.info-item {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
  padding: 24rpx 0;
  border-bottom: 1px solid rgba(64, 224, 255, 0.1);
}

.info-item:last-child {
  border-bottom: none;
}

.info-item.bonus {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 193, 7, 0.05) 100%);
  border-radius: 16rpx;
  padding: 24rpx 16rpx;
  margin-top: 10rpx;
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.info-icon-wrapper {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.info-icon-wrapper.online {
  background: linear-gradient(135deg, rgba(64, 224, 255, 0.2) 0%, rgba(52, 211, 153, 0.2) 100%);
  border: 2px solid rgba(64, 224, 255, 0.4);
}

.info-icon-wrapper.device {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%);
  border: 2px solid rgba(16, 185, 129, 0.4);
}

.info-icon-wrapper.bonus {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 193, 7, 0.2) 100%);
  border: 2px solid rgba(255, 215, 0, 0.4);
}

.info-icon-wrapper.hazardous {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%);
  border: 2px solid rgba(239, 68, 68, 0.4);
}

.carbon-equivalents {
  text-align: center;
}

.equivalents-title {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24rpx;
  margin-bottom: 20rpx;
}

.equivalent-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding: 12rpx 20rpx;
  background: rgba(0, 255, 136, 0.1);
  border-radius: 20rpx;
  border: 1px solid rgba(0, 255, 136, 0.2);
}

.equivalent-icon {
  font-size: 24rpx;
}

.equivalent-text {
  color: #00ff88;
  font-size: 22rpx;
  font-weight: 500;
}

.info-emoji {
  font-size: 36rpx;
  filter: drop-shadow(0 0 10rpx rgba(64, 224, 255, 0.6));
}

.info-text {
  flex: 1;
}

.info-title {
  display: block;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
  text-shadow: 0 0 15rpx rgba(64, 224, 255, 0.4);
}

.info-desc {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  font-size: 26rpx;
  line-height: 1.5;
  margin-bottom: 6rpx;
}

.info-limit {
  display: block;
  color: #40e0ff;
  font-size: 24rpx;
  font-weight: 500;
  background: rgba(64, 224, 255, 0.1);
  padding: 6rpx 12rpx;
  border-radius: 12rpx;
  display: inline-block;
  border: 1px solid rgba(64, 224, 255, 0.3);
}

.info-modal-footer {
  padding: 20rpx 40rpx 40rpx;
  text-align: center;
  border-top: 1px solid rgba(64, 224, 255, 0.2);
}

.info-footer-text {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24rpx;
  margin-bottom: 20rpx;
}

.info-footer-btn {
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 100%);
  border-radius: 50rpx;
  padding: 24rpx 48rpx;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 8rpx 24rpx rgba(64, 224, 255, 0.3);
  display: inline-block;
}

.info-footer-btn:active {
  transform: scale(0.98) translateY(2rpx);
  box-shadow: 0 4rpx 12rpx rgba(64, 224, 255, 0.4);
}

.footer-btn-text {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  text-shadow: 0 0 10rpx rgba(0, 0, 0, 0.5);
}

.modal-glow-effect {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.1) 0%, transparent 70%);
  animation: modalGlow 3s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes modalGlow {
  0%, 100% { 
    opacity: 0.3; 
    transform: scale(1) rotate(0deg); 
  }
  50% { 
    opacity: 0.6; 
    transform: scale(1.1) rotate(180deg); 
  }
}

/* 绠＄悊鍛橀潰鏉挎牱寮忥紝澧炲姞闂磋窛涓庤Е鎺у弸濂藉尯鍩?*/
.admin-card {
  position: relative;
  z-index: 10;
  margin: 20rpx 40rpx 0rpx;
  background: rgba(5, 20, 40, 0.92);
  backdrop-filter: blur(8px);
  padding: 20rpx;
  border-radius: 16rpx;
  border: 1px solid rgba(64, 224, 255, 0.08);
}
.admin-header {
  text-align: left;
  color: #40e0ff;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}
.admin-buttons {
  display: flex;
  gap: 14rpx;
  flex-wrap: wrap;
  justify-content: space-between;
}
.admin-btn {
  flex: 1 1 calc(50% - 7rpx);
  min-width: 160rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 18rpx 12rpx;
  background: linear-gradient(1deg, rgba(64, 223, 255, 0.182), rgba(0, 255, 136, 0.023));
  border-radius: 12rpx;
  border: 1px solid rgba(64, 224, 255, 0.08);
  font-size: 28rpx;
  color: #ffffff;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  text-align: center;
}
.admin-btn text {
  font-size: 26rpx;
}
.admin-btn:active {
  transform: translateY(2rpx) scale(0.99);
  box-shadow: inset 0 0 8rpx rgba(0, 0, 0, 0.12);
}

@media screen and (max-width: 768px) {
  .function-grid {
    margin: 0 20rpx 120rpx;
  }

  .function-row {
    gap: 12rpx;
    margin-bottom: 12rpx;
  }

  .function-item {
    padding: 14rpx 12rpx;
  }

  .function-title {
    font-size: 24rpx;
  }

  .function-desc {
    font-size: 20rpx;
  }

  .tab-item {
    padding: 16rpx 0;
  }

  .tab-icon {
    font-size: 40rpx;
  }

  .tab-label {
    font-size: 20rpx;
  }

  .info-modal {
    width: calc(100vw - 40rpx);
  }

  .info-modal-header {
    padding: 26rpx 24rpx 16rpx;
  }

  .info-modal-content {
    padding: 10rpx 24rpx 14rpx;
  }

  .info-modal-footer {
    padding: 14rpx 24rpx 24rpx;
  }

  .admin-card {
    margin: 16rpx 20rpx 0;
    padding: 18rpx;
  }

  .admin-btn {
    padding: 16rpx 10rpx;
    font-size: 24rpx;
  }

  .admin-btn text {
    font-size: 22rpx;
  }
}

@media screen and (max-width: 420px) {
  .function-grid {
    margin-left: 16rpx;
    margin-right: 16rpx;
  }

  .function-row {
    flex-wrap: wrap;
  }

  .function-item {
    flex: 1 1 calc(50% - 6rpx);
    min-width: 0;
  }

  .info-modal {
    width: calc(100vw - 28rpx);
  }

  .admin-btn {
    flex: 1 1 100%;
    min-width: 0;
  }
}
</style>


