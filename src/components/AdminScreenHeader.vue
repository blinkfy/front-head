<template>
  <view :class="['admin-screen-header', `admin-screen-header--${tone}`]">
    <view class="admin-screen-header__business-actions">
      <slot />
    </view>
    <view class="admin-screen-header__navigation-actions">
      <AdminScreenSwitcher
        :screen-key="screenKey"
        :tone="tone"
        @screen-action="emit('screen-action', $event)"
      />
      <view
        class="admin-screen-header__back"
        role="button"
        :aria-label="backLabel"
        @tap="emit('back')"
      >
        <text class="admin-screen-header__back-icon">←</text>
        <text>{{ backLabel }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import AdminScreenSwitcher from './AdminScreenSwitcher.vue'

const props = defineProps({
  screenKey: {
    type: String,
    required: true
  },
  tone: {
    type: String,
    default: 'dark',
    validator: (value) => ['dark', 'light'].includes(value)
  },
  backLabel: {
    type: String,
    default: '返回'
  }
})

const emit = defineEmits(['back', 'screen-action'])
</script>

<style scoped>
.admin-screen-header {
  --admin-screen-control-height: 36px;
  --admin-screen-control-radius: 8px;
  --admin-screen-control-font-size: 13px;
  --admin-screen-control-font-weight: 650;
  position: relative;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.admin-screen-header__business-actions,
.admin-screen-header__navigation-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.admin-screen-header__business-actions {
  flex: 1 1 auto;
  flex-wrap: nowrap;
}

.admin-screen-header__navigation-actions {
  flex: 0 0 auto;
  position: relative;
  z-index: 1001;
}

.admin-screen-header__back {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 70px;
  height: var(--admin-screen-control-height);
  padding: 0 11px;
  border: 1px solid rgba(144, 198, 219, 0.3);
  border-radius: var(--admin-screen-control-radius);
  color: #d1e5ed;
  background: rgba(26, 66, 85, 0.42);
  font-size: var(--admin-screen-control-font-size);
  font-weight: var(--admin-screen-control-font-weight);
  line-height: 1;
  transition: border-color .18s ease, background .18s ease, color .18s ease;
  white-space: nowrap;
}

.admin-screen-header__back:active {
  border-color: rgba(122, 220, 255, 0.75);
  color: #fff;
  background: rgba(51, 115, 143, 0.58);
}

.admin-screen-header__back-icon {
  color: #9edcf0;
  font-size: 16px;
  line-height: 1;
}

.admin-screen-header--light .admin-screen-header__back {
  border-color: #d1dfea;
  color: #45607b;
  background: #fff;
  box-shadow: 0 4px 12px rgba(37, 84, 126, 0.06);
}

.admin-screen-header--light .admin-screen-header__back:active {
  border-color: #82aee0;
  color: #20588f;
  background: #f0f7ff;
}

.admin-screen-header--light .admin-screen-header__back-icon {
  color: #3f82c9;
}

@media screen and (max-width: 1440px) {
  .admin-screen-header,
  .admin-screen-header__business-actions,
  .admin-screen-header__navigation-actions {
    gap: 8px;
  }
}

@media screen and (max-width: 900px) {
  .admin-screen-header {
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .admin-screen-header__business-actions {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }

  .admin-screen-header__navigation-actions {
    margin-left: auto;
  }
}

@media screen and (max-width: 600px) {
  .admin-screen-header,
  .admin-screen-header__business-actions,
  .admin-screen-header__navigation-actions {
    width: 100%;
  }

  .admin-screen-header__business-actions,
  .admin-screen-header__navigation-actions {
    justify-content: stretch;
    flex-wrap: wrap;
  }

  .admin-screen-header__navigation-actions {
    align-items: stretch;
  }

  .admin-screen-header__back {
    flex: 1 1 70px;
  }
}
</style>
