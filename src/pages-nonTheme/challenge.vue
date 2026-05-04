<template>
  <view class="challenge-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-circle c1"></view>
      <view class="bg-circle c2"></view>
      <view class="bg-circle c3"></view>
      <view class="floating-icons">
        <text v-for="n in 6" :key="n" class="float-icon" :style="getFloatStyle(n)">🌿</text>
      </view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar" :class="{ 'navbar-dark': !isDark }">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill">
            <text>🏆</text>
          </view>
          <text class="nav-title">挑战赛中心</text>
        </view>
        <view class="nav-right">
          <view class="action-icon-btn" :class="{ spinning: loading }" @click="refreshAll">
            <text>↻</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 主内容 -->
    <scroll-view class="main-scroll" scroll-y>
      <view class="content-wrapper">

        <!-- 每日进度卡片 -->
        <view class="daily-progress-card">
          <view class="progress-header">
            <text class="progress-title">📅 今日挑战进度</text>
            <text class="progress-status" :class="{ completed: dailyCompleted }">
              {{ dailyCompleted ? '✅ 已完成' : '进行中' }}
            </text>
          </view>
          <view class="progress-bar-wrap">
            <view class="progress-bar">
              <view class="progress-fill" :style="{ width: progressPercent + '%' }"></view>
            </view>
            <text class="progress-text">{{ correctCount }}/{{ totalCount }} 题</text>
          </view>
          <view class="progress-reward">
            <text class="reward-icon">🎁</text>
            <text class="reward-text">完成挑战可获得 +{{ totalCount }} 积分</text>
          </view>
        </view>

        <!-- 统计数据 -->
        <view class="stats-row">
          <view class="stat-card">
            <text class="stat-value">{{ stats.totalScore || 0 }}</text>
            <text class="stat-label">总积分</text>
          </view>
          <view class="stat-card">
            <text class="stat-value">{{ stats.totalAccuracy || 0 }}%</text>
            <text class="stat-label">正确率</text>
          </view>
          <view class="stat-card">
            <text class="stat-value">{{ stats.dailyCompleted || 0 }}</text>
            <text class="stat-label">已挑战</text>
          </view>
        </view>

        <!-- 模式选择 -->
        <view class="mode-section">
          <text class="section-title">🎮 挑战模式</text>
          <view class="mode-grid">
            <view class="mode-card daily" :class="{ active: currentMode === 'daily' }" @click="selectMode('daily')">
              <text class="mode-icon">📝</text>
              <text class="mode-name">每日答题</text>
              <text class="mode-desc">10题挑战</text>
              <text class="mode-reward">每题+1分</text>
            </view>
            <view class="mode-card" :class="{ active: currentMode === 'speed' }" @click="selectMode('speed')">
              <text class="mode-icon">⚡</text>
              <text class="mode-name">速度挑战</text>
              <text class="mode-desc">限时60秒</text>
              <text class="mode-reward">每题+1分</text>
            </view>
            <view class="mode-card" :class="{ active: currentMode === 'combo' }" @click="selectMode('combo')">
              <text class="mode-icon">🔥</text>
              <text class="mode-name">连击模式</text>
              <text class="mode-desc">连续答对</text>
              <text class="mode-reward">连击×2分</text>
            </view>
          </view>
        </view>

        <!-- 本周日历 -->
        <view class="calendar-section">
          <text class="section-title">📆 本周挑战日历</text>
          <view class="calendar-card">
            <view class="week-days">
              <view v-for="day in weeklyDays" :key="day.date" class="day-item" :class="{ completed: day.completed, today: day.isToday }">
                <text class="day-name">{{ day.dayName }}</text>
                <view class="day-dot" :class="{ done: day.completed }">
                  <text v-if="day.completed">✓</text>
                  <text v-else-if="day.isToday">今</text>
                  <text v-else>○</text>
                </view>
                <text class="day-score" v-if="day.score > 0">{{ day.score }}分</text>
              </view>
            </view>
            <view class="week-summary">
              <text class="summary-text">本周完成: {{ completedDays }}/7 天</text>
              <text class="reward-hint" v-if="completedDays === 7">🏅 连续7天额外奖励 +20积分!</text>
            </view>
          </view>
        </view>

        <!-- 开始挑战按钮 -->
        <view class="start-btn-wrap" v-if="!dailyCompleted || showRetry">
          <view class="start-btn" @click="startChallenge" v-if="!showResult">
            <text class="btn-icon">▶️</text>
            <text class="btn-text">{{ dailyCompleted ? '重新挑战' : '开始挑战' }}</text>
          </view>
        </view>

        <!-- 结果展示 -->
        <view class="result-section" v-if="showResult">
          <view class="result-card">
            <text class="result-icon">{{ challengeResult.correctCount === challengeResult.totalCount ? '🏆' : '🎉' }}</text>
            <text class="result-title">{{ challengeResult.correctCount === challengeResult.totalCount ? '全部正确！' : '挑战完成!' }}</text>
            <view class="result-stats">
              <view class="result-item">
                <text class="result-value">{{ challengeResult.correctCount || 0 }}/{{ challengeResult.totalCount || 0 }}</text>
                <text class="result-label">正确</text>
              </view>
              <view class="result-item">
                <text class="result-value">+{{ challengeResult.pointsEarned || 0 }}</text>
                <text class="result-label">获得积分</text>
              </view>
            </view>

            <!-- 错题回顾 -->
            <view class="wrong-answers" v-if="wrongAnswers.length > 0">
              <view class="wrong-header" @click="showWrongDetail = !showWrongDetail">
                <text class="wrong-title">📋 错题回顾 ({{ wrongAnswers.length }}题)</text>
                <text class="wrong-arrow" :class="{ open: showWrongDetail }">▼</text>
              </view>
              <view class="wrong-list" v-if="showWrongDetail">
                <view v-for="(item, idx) in wrongAnswers" :key="idx" class="wrong-item">
                  <view class="wrong-question">
                    <text class="wrong-q-num">{{ idx + 1 }}.</text>
                    <text class="wrong-q-text">{{ item.question }}</text>
                  </view>
                  <view class="wrong-answer-row">
                    <text class="wrong-label">你的答案：</text>
                    <text class="wrong-your">{{ item.yourAnswer }}</text>
                    <text class="wrong-mark">✗</text>
                  </view>
                  <view class="wrong-answer-row correct-row">
                    <text class="wrong-label">正确答案：</text>
                    <text class="wrong-correct">{{ item.correctAnswer }}</text>
                    <text class="wrong-mark correct-mark">✓</text>
                  </view>
                  <view class="wrong-explain" v-if="item.explanation">
                    <text class="explain-icon">💡</text>
                    <text class="explain-text">{{ item.explanation }}</text>
                  </view>
                </view>
              </view>
            </view>

            <view class="result-actions">
              <view class="action-btn retry" @click="showRetry = true; showResult = false; showWrongDetail = false;">
                <text>重新挑战</text>
              </view>
              <view class="action-btn close" @click="showResult = false; showRetry = false; showWrongDetail = false; loadData();">
                <text>返回</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 排行榜 -->
        <view class="leaderboard-section">
          <view class="section-header">
            <text class="section-title">🥇 挑战排行榜</text>
            <view class="tab-switch">
              <view class="tab-item" :class="{ active: rankType === 'all' }" @click="rankType = 'all'; loadLeaderboard()">
                <text>总榜</text>
              </view>
              <view class="tab-item" :class="{ active: rankType === 'weekly' }" @click="rankType = 'weekly'; loadLeaderboard()">
                <text>本周</text>
              </view>
              <view class="tab-item" :class="{ active: rankType === 'monthly' }" @click="rankType = 'monthly'; loadLeaderboard()">
                <text>本月</text>
              </view>
            </view>
          </view>
          <view class="leaderboard-list" v-if="leaderboard.length > 0">
            <view v-for="(item, index) in leaderboard.slice(0, 10)" :key="item.userId" class="rank-item" :class="`rank-${index + 1}`">
              <view class="rank-badge">
                <text v-if="index === 0" class="rank-medal">🥇</text>
                <text v-else-if="index === 1" class="rank-medal">🥈</text>
                <text v-else-if="index === 2" class="rank-medal">🥉</text>
                <text v-else class="rank-num">{{ index + 1 }}</text>
              </view>
              <image class="rank-avatar" :src="getAvatarUrl(item.avatar)" mode="aspectFill"></image>
              <view class="rank-info">
                <text class="rank-name">{{ item.username }}</text>
                <text class="rank-accuracy">{{ item.accuracy }}%正确率</text>
              </view>
              <text class="rank-score">{{ item.totalScore }}分</text>
            </view>
          </view>
          <view class="empty-list" v-else>
            <text class="empty-icon">📊</text>
            <text class="empty-text">暂无排行数据</text>
          </view>
        </view>

      </view>
    </scroll-view>

    <!-- 挑战答题弹窗 -->
    <view class="quiz-modal" v-if="showQuiz" @click.stop>
      <view class="quiz-container">
        <view class="quiz-header">
          <text class="quiz-progress" v-if="currentMode !== 'combo'">第 {{ currentQuestionIndex + 1 }}/{{ questions.length }} 题</text>
          <text class="quiz-progress combo-progress" v-else>🔥 连击 ×{{ comboCount }}</text>
          <text class="quiz-timer" v-if="currentMode === 'speed'">⏱️ {{ timeLeft }}s</text>
        </view>
        <view class="quiz-progress-bar" v-if="currentMode !== 'combo'">
          <view class="quiz-progress-fill" :style="{ width: ((currentQuestionIndex) / questions.length * 100) + '%' }"></view>
        </view>

        <view class="quiz-question">
          <text class="question-text">{{ currentQuestion.question }}</text>
        </view>

        <view class="quiz-options">
          <view v-for="option in currentQuestion.options" :key="option.value"
            class="quiz-option" :class="getOptionClass(option.value)"
            @click="selectAnswer(option.value)">
            <text class="option-label">{{ option.label }}</text>
          </view>
        </view>

        <view class="quiz-actions">
          <view class="quiz-btn skip" @click="nextQuestion()" v-if="currentMode === 'daily'">
            <text>跳过</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 加载状态 -->
    <view class="loading-overlay" v-if="quizLoading">
      <view class="loading-spinner"></view>
      <text class="loading-text">加载题目中...</text>
    </view>
  </view>
</template>

<script>
import { getDailyChallenge, submitChallenge, getChallengeStats, getChallengeLeaderboard, getWeeklyCalendar, getModeQuestions } from '@/api/challenge.js';
import { baseUrl } from '@/api/settings.js';
import { getAvatarUrl as resolveAvatarUrl } from '@/utils/avatar-handler.js';

export default {
  data() {
    return {
      loading: false,
      quizLoading: false,
      showQuiz: false,
      showResult: false,
      showRetry: false,
      dailyCompleted: false,
      correctCount: 0,
      totalCount: 0,
      currentMode: 'daily',
      questions: [],
      currentQuestionIndex: 0,
      answers: [],
      timeLeft: 60,
      timer: null,
      stats: {},
      weeklyDays: [],
      completedDays: 0,
      leaderboard: [],
      rankType: 'all',
      challengeResult: {},
      isDark: false,
      // 连击模式
      comboCount: 0,
      comboActive: false,
      comboQuestion: null,
      comboAnswering: false,
      showWrongDetail: false
    };
  },
  computed: {
    progressPercent() {
      return this.totalCount > 0 ? Math.round((this.correctCount / this.totalCount) * 100) : 0;
    },
    currentQuestion() {
      return this.questions[this.currentQuestionIndex] || {};
    },
    wrongAnswers() {
      const results = this.challengeResult.results || [];
      return results.filter(r => !r.isCorrect);
    }
  },
  onLoad() {
    this.checkTheme();
    this.loadData();
  },
  onShow() {
    this.checkTheme();
  },
  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },
  methods: {
    extractData(res) {
      return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
    },
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        if (this.isDark) {
          uni.reLaunch({url: '/pages-dark/home/home'})
        } else {
          uni.reLaunch({url: '/pages/home/home'})
        }
      }
    },
    async refreshAll() {
      await this.loadData();
    },
    async loadData() {
      this.loading = true;
      try {
        await Promise.all([
          this.loadDailyChallenge(),
          this.loadStats(),
          this.loadWeeklyCalendar(),
          this.loadLeaderboard()
        ]);
      } catch (e) {
        console.error('加载失败:', e);
      }
      this.loading = false;
    },
    async loadDailyChallenge() {
      try {
        const res = await getDailyChallenge();
        const data = this.extractData(res) || {};
        this.questions = data.questions || [];
        this.dailyCompleted = !!data.completed;
        this.correctCount = data.correctCount || 0;
        this.totalCount = data.totalCount || 0;
      } catch (e) {
        console.error('加载每日挑战失败:', e);
      }
    },
    async loadStats() {
      try {
        const res = await getChallengeStats();
        this.stats = this.extractData(res) || {};
      } catch (e) {
        console.error('加载统计失败:', e);
      }
    },
    async loadWeeklyCalendar() {
      try {
        const res = await getWeeklyCalendar();
        const data = this.extractData(res) || {};
        this.weeklyDays = data.days || [];
        this.completedDays = data.completedDays || 0;
      } catch (e) {
        console.error('加载日历失败:', e);
      }
    },
    async loadLeaderboard() {
      try {
        const res = await getChallengeLeaderboard(this.rankType);
        this.leaderboard = this.extractData(res) || [];
      } catch (e) {
        console.error('加载排行榜失败:', e);
      }
    },
    selectMode(mode) {
      this.currentMode = mode;
      this.showResult = false;
      this.showRetry = false;
    },
    async startChallenge() {
      this.showResult = false;
      this.showRetry = false;
      this.quizLoading = true;

      try {
        if (this.currentMode === 'daily') {
          // 每日模式：使用已加载的题目
          if (this.questions.length === 0) {
            uni.showToast({ title: '暂无题目', icon: 'none' });
            this.quizLoading = false;
            return;
          }
          this.currentQuestionIndex = 0;
          this.answers = [];
          this.showQuiz = true;
        } else if (this.currentMode === 'speed') {
          // 速度模式：获取20题，限时60秒
          const res = await getModeQuestions('speed');
          const data = this.extractData(res) || {};
          if (data.completed) {
            uni.showToast({ title: '今日速度挑战已完成', icon: 'none' });
            this.quizLoading = false;
            return;
          }
          this.questions = data.questions || [];
          if (this.questions.length === 0) {
            uni.showToast({ title: '暂无题目', icon: 'none' });
            this.quizLoading = false;
            return;
          }
          this.currentQuestionIndex = 0;
          this.answers = [];
          this.timeLeft = 60;
          this.showQuiz = true;
          this.startTimer();
        } else if (this.currentMode === 'combo') {
          // 连击模式：逐题挑战
          const res = await getModeQuestions('combo');
          const data = this.extractData(res) || {};
          if (data.completed) {
            uni.showToast({ title: '今日连击挑战已完成', icon: 'none' });
            this.quizLoading = false;
            return;
          }
          this.questions = data.questions || [];
          if (this.questions.length === 0) {
            uni.showToast({ title: '暂无题目', icon: 'none' });
            this.quizLoading = false;
            return;
          }
          this.comboCount = 0;
          this.comboActive = true;
          this.comboAnswering = false;
          this.answers = [];
          this.currentQuestionIndex = 0;
          this.showQuiz = true;
        }
      } catch (e) {
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
      }
      this.quizLoading = false;
    },
    startTimer() {
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.timeLeft--;
        if (this.timeLeft <= 0) {
          clearInterval(this.timer);
          this.submitQuiz();
        }
      }, 1000);
    },
    selectAnswer(value) {
      // 连击模式特殊处理
      if (this.currentMode === 'combo' && this.comboActive) {
        if (this.comboAnswering) return;
        this.comboAnswering = true;
        const q = this.currentQuestion;
        const isCorrect = q.correctAnswer === value;
        this.answers.push({ questionId: q.id, answer: value });

        if (isCorrect) {
          this.comboCount++;
          uni.vibrateShort && uni.vibrateShort();
          uni.showToast({ title: `✅ 连击 ×${this.comboCount}`, icon: 'none', duration: 600 });
          setTimeout(() => {
            this.comboAnswering = false;
            this.nextComboQuestion();
          }, 700);
        } else {
          uni.vibrateShort && uni.vibrateShort();
          uni.showToast({ title: '❌ 答错了！', icon: 'none', duration: 1000 });
          setTimeout(() => {
            this.submitQuiz();
          }, 1000);
        }
        return;
      }

      // 每日/速度模式
      if (this.answers[this.currentQuestionIndex] !== undefined) return;
      const q = this.currentQuestion;
      this.answers.push({ questionId: q.id, answer: value });
      uni.vibrateShort && uni.vibrateShort();
      setTimeout(() => {
        this.nextQuestion();
      }, 500);
    },
    nextComboQuestion() {
      if (this.currentQuestionIndex < this.questions.length - 1) {
        this.currentQuestionIndex++;
      } else {
        // 题目用完，提交
        this.submitQuiz();
      }
    },
    getOptionClass(value) {
      if (this.currentMode === 'combo' && this.comboActive) {
        const ans = this.answers[this.currentQuestionIndex];
        if (!ans) return '';
        if (ans.answer === value) {
          const q = this.currentQuestion;
          return q.correctAnswer === value ? 'correct' : 'wrong';
        }
        return '';
      }
      const ans = this.answers[this.currentQuestionIndex];
      if (ans === undefined) return '';
      return ans.answer === value ? 'selected' : '';
    },
    nextQuestion() {
      if (this.currentQuestionIndex < this.questions.length - 1) {
        this.currentQuestionIndex++;
      } else {
        this.submitQuiz();
      }
    },
    async submitQuiz() {
      if (this.timer) clearInterval(this.timer);
      this.showQuiz = false;
      this.comboActive = false;
      this.quizLoading = true;
      try {
        const validAnswers = this.answers.filter(a => a.questionId);
        const res = await submitChallenge({
          challengeType: this.currentMode,
          answers: validAnswers,
          timeSpent: this.currentMode === 'speed' ? 60 - this.timeLeft : 0
        });
        const data = this.extractData(res) || {};
        this.challengeResult = data;
        this.showResult = true;
        if (this.currentMode === 'daily') {
          this.dailyCompleted = true;
          this.correctCount = data.correctCount || 0;
          this.totalCount = data.totalCount || 0;
        }
        const msg = this.currentMode === 'combo'
          ? `连击 ${this.comboCount} 题！获得 ${data.pointsEarned || 0} 积分`
          : `获得 ${data.pointsEarned || 0} 积分!`;
        uni.showToast({ title: msg, icon: 'success', duration: 2000 });
      } catch (e) {
        uni.showToast({ title: e.message || '提交失败', icon: 'none' });
      }
      this.quizLoading = false;
    },
    getFloatStyle(n) {
      const positions = [
        { left: '5%', top: '10%', delay: '0s' },
        { left: '80%', top: '15%', delay: '1s' },
        { left: '15%', top: '60%', delay: '2s' },
        { left: '75%', top: '55%', delay: '0.5s' },
        { left: '45%', top: '8%', delay: '1.5s' },
        { left: '60%', top: '75%', delay: '2.5s' }
      ];
      const p = positions[n - 1] || positions[0];
      return { left: p.left, top: p.top, animationDelay: p.delay };
    },
    getAvatarUrl(avatar) {
      if (!avatar) return '/static/person.webp.png';
      if (typeof avatar !== 'string') return '/static/person.webp.png';
      if (avatar.startsWith('blob:')) return '/static/person.webp.png';
      const resolved = resolveAvatarUrl(avatar, baseUrl);
      if (resolved !== '/static/person.webp.png') return resolved;
      if (avatar.startsWith('/')) return `${baseUrl}${avatar}`;
      return `${baseUrl}/${avatar}`;
    }
  }
};
</script>

<style scoped>
/* ===== 主容器（对齐 about/home） ===== */
.challenge-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.challenge-page.dark-mode {
  background:
    radial-gradient(circle at 16% 8%, rgba(16, 185, 129, 0.22) 0%, transparent 34%),
    radial-gradient(circle at 88% 18%, rgba(56, 189, 248, 0.16) 0%, transparent 32%),
    radial-gradient(circle at 72% 78%, rgba(245, 158, 11, 0.12) 0%, transparent 34%),
    linear-gradient(180deg, #07111f 0%, #0f172a 46%, #101827 100%);
}

/* ===== 背景效果 ===== */
.bg-effects {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}
.challenge-page.dark-mode .bg-effects::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.055) 1rpx, transparent 1rpx),
    linear-gradient(90deg, rgba(148, 163, 184, 0.045) 1rpx, transparent 1rpx);
  background-size: 64rpx 64rpx;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.12));
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.12));
}
.challenge-page.dark-mode .bg-effects::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(7, 17, 31, 0) 0%, rgba(7, 17, 31, 0.28) 100%),
    radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.05), transparent 48%);
}
.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.08;
  transition: all 0.3s ease;
}
.challenge-page:not(.dark-mode) .bg-circle {
  background: #10b981;
}
.challenge-page.dark-mode .bg-circle {
  opacity: 0.18;
  filter: blur(10rpx);
}
.challenge-page.dark-mode .c1 {
  background: rgba(16, 185, 129, 0.52);
}
.challenge-page.dark-mode .c2 {
  background: rgba(56, 189, 248, 0.34);
}
.challenge-page.dark-mode .c3 {
  background: rgba(245, 158, 11, 0.28);
}
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 10%; left: -200rpx; }
.c3 { width: 300rpx; height: 300rpx; top: 40%; right: -100rpx; }
.floating-icons { position: absolute; inset: 0; }
.float-icon {
  position: absolute;
  font-size: 40rpx;
  opacity: 0.25;
  animation: floatUp 8s ease-in-out infinite;
  filter: drop-shadow(0 4rpx 8rpx rgba(0,0,0,0.1));
}
.challenge-page.dark-mode .float-icon {
  opacity: 0.16;
  filter: drop-shadow(0 0 12rpx rgba(16, 185, 129, 0.32));
}
@keyframes floatUp {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-50rpx) rotate(15deg); }
}

/* ===== 导航栏（对齐 about panel header 风格） ===== */
.navbar {
  position: relative;
  z-index: 10;
}
.navbar-dark { color: #1f2937; }
.dark-mode .navbar { color: #fff; }
.safe-area-top {
  height: env(safe-area-inset-top);
  min-height: 88rpx;
}
.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  height: 88rpx;
  box-sizing: content-box;
}
.back-icon { font-size: 48rpx; font-weight: 600; padding: 8rpx; }
.nav-title-wrap {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: 1;
  justify-content: center;
}
.title-icon-pill {
  width: 56rpx; height: 56rpx;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
}
.nav-title {
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}
.dark-mode .nav-title { color: #fff; }
.action-icon-btn {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  transition: all 0.3s;
}
.dark-mode .action-icon-btn { background: rgba(255, 255, 255, 0.15); color: #fff; }
.action-icon-btn:active { transform: scale(0.92); }
.action-icon-btn.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== 主内容区 ===== */
.main-scroll { position: relative; z-index: 10; height: calc(100vh - env(safe-area-inset-top) - 88rpx); }
.content-wrapper { padding: 32rpx; padding-bottom: 120rpx; }

/* ===== 进度卡片（对齐 about info-card） ===== */
.daily-progress-card {
  background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.1);
  border: 1rpx solid rgba(16, 185, 129, 0.08);
}
.dark-mode .daily-progress-card {
  background: linear-gradient(135deg, rgba(40, 40, 95, 0.8) 0%, rgba(50, 45, 135, 0.9) 100%);
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.3);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.progress-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #1f2937;
}
.dark-mode .progress-title { color: #fff; }
.progress-status {
  font-size: 24rpx;
  color: #f59e0b;
  font-weight: 600;
}
.progress-status.completed { color: #10b981; }
.progress-bar-wrap {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 16rpx;
}
.progress-bar {
  flex: 1;
  height: 12rpx;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 6rpx;
  overflow: hidden;
}
.dark-mode .progress-bar { background: rgba(255, 255, 255, 0.15); }
.progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  border-radius: 6rpx;
  transition: width 0.4s ease;
  box-shadow: 0 0 12rpx rgba(16, 185, 129, 0.4);
}
.progress-text {
  color: #6b7280;
  font-size: 24rpx;
  white-space: nowrap;
  font-weight: 500;
}
.dark-mode .progress-text { color: rgba(255, 255, 255, 0.7); }
.progress-reward {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 8rpx;
}
.reward-icon { font-size: 24rpx; }
.reward-text {
  color: #f59e0b;
  font-size: 24rpx;
  font-weight: 600;
}
.dark-mode .reward-text { color: #fbbf24; }

/* ===== 统计数据行 ===== */
.stats-row {
  display: flex;
  gap: 24rpx;
  margin-bottom: 32rpx;
}
.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx 16rpx;
  text-align: center;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.stat-card:active { transform: scale(0.97); }
.dark-mode .stat-card {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.2);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.stat-value {
  display: block;
  color: #10b981;
  font-size: 36rpx;
  font-weight: 800;
  margin-bottom: 6rpx;
}
.dark-mode .stat-value { color: #34d399; }
.stat-label {
  display: block;
  color: #9ca3af;
  font-size: 22rpx;
  font-weight: 500;
}
.dark-mode .stat-label { color: rgba(255, 255, 255, 0.6); }

/* ===== 区块与标题（统一 section 风格） ===== */
.mode-section, .calendar-section, .leaderboard-section { margin-bottom: 32rpx; }
.section-title {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 20rpx;
}
.dark-mode .section-title { color: #fff; }
.section-title::before {
  content: '';
  width: 6rpx;
  height: 28rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 3rpx;
}

/* 模式选择网格 */
.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20rpx;
}
.mode-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx 12rpx;
  text-align: center;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 2rpx solid transparent;
  transition: all 0.3s;
}
.mode-card:active { transform: scale(0.96); }
.mode-card.active {
  border-color: #10b981;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  box-shadow: 0 4rpx 20rpx rgba(16, 185, 129, 0.2);
}
.dark-mode .mode-card { background: rgba(255, 255, 255, 0.08); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.dark-mode .mode-card.active { background: rgba(16, 185, 129, 0.2); border-color: #34d399; }
.mode-icon { display: block; font-size: 40rpx; margin-bottom: 10rpx; }
.mode-name { display: block; color: #1f2937; font-size: 24rpx; font-weight: 700; margin-bottom: 6rpx; }
.dark-mode .mode-name { color: #fff; }
.mode-desc { display: block; color: #9ca3af; font-size: 20rpx; margin: 6rpx 0; }
.dark-mode .mode-desc { color: rgba(255, 255, 255, 0.6); }
.mode-reward { display: block; color: #f59e0b; font-size: 20rpx; font-weight: 700; }
.dark-mode .mode-reward { color: #fbbf24; }

/* 日历卡片 */
.calendar-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
}
.dark-mode .calendar-card { background: rgba(255, 255, 255, 0.08); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.week-days { display: flex; justify-content: space-between; margin-bottom: 20rpx; }
.day-item { display: flex; flex-direction: column; align-items: center; gap: 10rpx; flex: 1; }
.day-name { color: #6b7280; font-size: 22rpx; font-weight: 500; }
.dark-mode .day-name { color: rgba(255, 255, 255, 0.7); }
.day-dot {
  width: 52rpx; height: 52rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 22rpx;
  color: rgba(16, 185, 129, 0.5);
  transition: all 0.3s;
}
.day-dot.done { background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.3); }
.day-item.today .day-dot { border: 2rpx solid #f59e0b; }
.dark-mode .day-dot { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.4); }
.day-score { color: #f59e0b; font-size: 18rpx; font-weight: 600; }
.dark-mode .day-score { color: #fbbf24; }
.week-summary { text-align: center; padding-top: 16rpx; border-top: 1rpx dashed rgba(16, 185, 129, 0.15); }
.summary-text { color: #6b7280; font-size: 24rpx; font-weight: 500; }
.dark-mode .summary-text { color: rgba(255, 255, 255, 0.7); }
.reward-hint {
  display: block;
  color: #f59e0b;
  font-size: 22rpx;
  margin-top: 8rpx;
  font-weight: 600;
  animation: pulse 2s infinite;
}
.dark-mode .reward-hint { color: #fbbf24; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

/* ===== 主 CTA 按钮（对齐 home 绿渐变） ===== */
.start-btn-wrap { margin-bottom: 32rpx; }
.start-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  color: #fff;
  padding: 28rpx;
  border-radius: 20rpx;
  font-size: 32rpx;
  font-weight: 700;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.35);
  letter-spacing: 2rpx;
  transition: all 0.3s;
}
.start-btn:active { transform: scale(0.98); box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.25); }
.btn-icon { font-size: 32rpx; }

/* ===== 结果展示卡片 ===== */
.result-section { margin-bottom: 32rpx; }
.result-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 48rpx 32rpx;
  text-align: center;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.1);
  border: 1rpx solid rgba(16, 185, 129, 0.08);
}
.dark-mode .result-card {
  background: rgba(255, 255, 255, 0.1);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.result-icon { font-size: 72rpx; display: block; margin-bottom: 12rpx; }
.result-title { display: block; color: #1f2937; font-size: 36rpx; font-weight: 800; margin-bottom: 32rpx; }
.dark-mode .result-title { color: #fff; }
.result-stats { display: flex; justify-content: center; gap: 64rpx; margin-bottom: 36rpx; }
.result-item { text-align: center; }
.result-value { display: block; color: #10b981; font-size: 48rpx; font-weight: 800; margin-bottom: 6rpx; }
.dark-mode .result-value { color: #34d399; }
.result-label { display: block; color: #9ca3af; font-size: 24rpx; }
.dark-mode .result-label { color: rgba(255, 255, 255, 0.6); }
.result-actions { display: flex; gap: 24rpx; justify-content: center; }
.action-btn {
  padding: 20rpx 40rpx;
  border-radius: 40rpx;
  font-size: 26rpx;
  font-weight: 600;
  transition: all 0.3s;
}
.action-btn.retry {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.3);
}
.action-btn.close {
  background: rgba(0, 0, 0, 0.06);
  color: #6b7280;
}
.dark-mode .action-btn.close { background: rgba(255, 255, 255, 0.15); color: rgba(255, 255, 255, 0.8); }
.action-btn:active { transform: scale(0.95); }

/* ===== 错题回顾 ===== */
.wrong-answers {
  margin-top: 24rpx;
  border-top: 1rpx solid rgba(0, 0, 0, 0.06);
  padding-top: 24rpx;
}
.dark-mode .wrong-answers { border-color: rgba(255, 255, 255, 0.1); }
.wrong-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  cursor: pointer;
}
.wrong-title { color: #ef4444; font-size: 28rpx; font-weight: 700; }
.dark-mode .wrong-title { color: #f87171; }
.wrong-arrow { color: #9ca3af; font-size: 22rpx; transition: transform 0.3s; }
.wrong-arrow.open { transform: rotate(180deg); }
.wrong-list { margin-top: 16rpx; }
.wrong-item {
  background: rgba(239, 68, 68, 0.04);
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  text-align: left;
  border-left: 6rpx solid #ef4444;
}
.dark-mode .wrong-item { background: rgba(239, 68, 68, 0.1); }
.wrong-question {
  display: flex;
  gap: 8rpx;
  margin-bottom: 12rpx;
}
.wrong-q-num { color: #ef4444; font-size: 26rpx; font-weight: 700; flex-shrink: 0; }
.wrong-q-text { color: #1f2937; font-size: 26rpx; font-weight: 600; line-height: 1.5; }
.dark-mode .wrong-q-text { color: #e5e7eb; }
.wrong-answer-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 6rpx;
  padding-left: 32rpx;
}
.wrong-label { color: #9ca3af; font-size: 22rpx; }
.wrong-your { color: #ef4444; font-size: 24rpx; font-weight: 600; text-decoration: line-through; }
.wrong-correct { color: #10b981; font-size: 24rpx; font-weight: 600; }
.wrong-mark { font-size: 20rpx; }
.wrong-mark.correct-mark { color: #10b981; }
.wrong-explain {
  display: flex;
  gap: 8rpx;
  margin-top: 10rpx;
  padding: 12rpx 16rpx;
  background: rgba(16, 185, 129, 0.06);
  border-radius: 12rpx;
  margin-left: 32rpx;
}
.dark-mode .wrong-explain { background: rgba(16, 185, 129, 0.1); }
.explain-icon { font-size: 22rpx; flex-shrink: 0; }
.explain-text { color: #4b5563; font-size: 22rpx; line-height: 1.6; }
.dark-mode .explain-text { color: rgba(255, 255, 255, 0.7); }

/* ===== 排行榜（对齐 community 排行榜） ===== */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.tab-switch { display: flex; gap: 12rpx; }
.tab-item {
  padding: 10rpx 24rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #6b7280;
  background: rgba(0, 0, 0, 0.04);
  transition: all 0.3s;
}
.dark-mode .tab-item { color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.1); }
.tab-item.active {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.3);
}
.leaderboard-list {
  background: #fff;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
}
.dark-mode .leaderboard-list { background: rgba(255, 255, 255, 0.08); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.rank-item {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
  transition: background 0.2s;
}
.rank-item:last-child { border-bottom: none; }
.dark-mode .rank-item { border-bottom-color: rgba(255, 255, 255, 0.06); }
.rank-item:active { background: rgba(16, 185, 129, 0.04); }
.rank-item.rank-1 { background: rgba(250, 204, 21, 0.08); }
.rank-item.rank-2 { background: rgba(156, 163, 175, 0.08); }
.rank-item.rank-3 { background: rgba(217, 119, 6, 0.08); }
.rank-badge { width: 56rpx; text-align: center; }
.rank-medal { font-size: 36rpx; }
.rank-num {
  color: #9ca3af;
  font-size: 26rpx;
  font-weight: 700;
}
.dark-mode .rank-num { color: rgba(255, 255, 255, 0.5); }
.rank-avatar {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  margin: 0 20rpx;
  border: 2rpx solid rgba(16, 185, 129, 0.2);
}
.rank-info { flex: 1; }
.rank-name { display: block; color: #1f2937; font-size: 26rpx; font-weight: 600; margin-bottom: 4rpx; }
.dark-mode .rank-name { color: #fff; }
.rank-accuracy { display: block; color: #9ca3af; font-size: 20rpx; }
.dark-mode .rank-accuracy { color: rgba(255, 255, 255, 0.5); }
.rank-score { color: #10b981; font-size: 26rpx; font-weight: 800; }
.dark-mode .rank-score { color: #34d399; }
.empty-list { text-align: center; padding: 60rpx; }
.empty-icon { font-size: 64rpx; display: block; margin-bottom: 16rpx; opacity: 0.5; }
.empty-text { color: #9ca3af; font-size: 26rpx; }
.dark-mode .empty-text { color: rgba(255, 255, 255, 0.5); }

/* ===== 答题弹窗（暗色沉浸，跨主题一致） ===== */
.quiz-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 40rpx;
  backdrop-filter: blur(4px);
}
.quiz-container {
  background: linear-gradient(160deg, #1a5f4a 0%, #2d8a6e 50%, #1a5f4a 100%);
  border-radius: 32rpx;
  width: 100%;
  max-width: 680rpx;
  padding: 48rpx 40rpx;
  box-shadow: 0 24rpx 80rpx rgba(0, 0, 0, 0.4);
  position: relative;
  overflow: hidden;
}
.quiz-container::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.05) 0%, transparent 60%);
  pointer-events: none;
}
.quiz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  position: relative;
  z-index: 1;
}
.quiz-progress { color: rgba(255, 255, 255, 0.9); font-size: 26rpx; font-weight: 600; }
.combo-progress { color: #fbbf24; font-size: 32rpx; font-weight: 800; animation: pulse 1s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.quiz-timer { color: #fbbf24; font-size: 30rpx; font-weight: 800; }
.quiz-progress-bar {
  height: 8rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4rpx;
  margin-bottom: 36rpx;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
.quiz-progress-fill {
  height: 100%;
  background: #10b981;
  border-radius: 4rpx;
  transition: width 0.3s ease;
  box-shadow: 0 0 12rpx rgba(16, 185, 129, 0.5);
}
.quiz-question { margin-bottom: 32rpx; text-align: center; position: relative; z-index: 1; }
.question-text { color: #fff; font-size: 32rpx; font-weight: 700; line-height: 1.7; }
.quiz-options { display: flex; flex-direction: column; gap: 20rpx; position: relative; z-index: 1; }
.quiz-option {
  background: rgba(255, 255, 255, 0.12);
  border: 2rpx solid rgba(255, 255, 255, 0.2);
  border-radius: 20rpx;
  padding: 28rpx 32rpx;
  transition: all 0.3s;
}
.quiz-option:active { background: rgba(255, 255, 255, 0.2); transform: scale(0.98); }
.quiz-option.correct { background: rgba(16, 185, 129, 0.4); border-color: #10b981; }
.quiz-option.wrong { background: rgba(239, 68, 68, 0.4); border-color: #ef4444; }
.quiz-option.missed { background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.5); }
.quiz-option.selected { background: rgba(16, 185, 129, 0.18); border-color: #10b981; }
.option-label { color: #fff; font-size: 28rpx; font-weight: 600; }
.quiz-actions { margin-top: 24rpx; display: flex; justify-content: center; position: relative; z-index: 1; }
.quiz-btn.skip {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  padding: 16rpx 40rpx;
  border-radius: 40rpx;
  font-size: 24rpx;
  font-weight: 600;
  transition: all 0.3s;
}
.quiz-btn.skip:active { transform: scale(0.95); }

/* ===== 加载态 ===== */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 999;
  backdrop-filter: blur(2px);
}
.loading-spinner {
  width: 72rpx; height: 72rpx;
  border: 4rpx solid rgba(16, 185, 129, 0.3);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 24rpx;
}
.loading-text { color: #fff; font-size: 26rpx; }
</style>
