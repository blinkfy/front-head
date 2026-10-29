<template>
  <view class="green-planet" aria-hidden="true">
    <view class="planet-halo"></view>
    <view class="planet-ring ring-back">
      <view class="ring-half"><view class="ring-band"></view></view>
    </view>
    <view class="planet-body"></view>
    <view class="atmosphere-arc"></view>
    <view class="planet-ring moon-orbit">
      <view class="moon-position"><view class="orbit-moon"></view></view>
    </view>
    <view class="planet-ring ring-front">
      <view class="ring-half"><view class="ring-band"></view></view>
    </view>
  </view>
</template>

<style scoped>
.green-planet {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  isolation: isolate;
}
.planet-halo {
  position: absolute;
  z-index: 0;
  inset: -30%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(94, 234, 189, .14) 32%, rgba(94, 234, 189, .07) 46%, transparent 69%);
  animation: planet-halo-breathe 28s ease-in-out infinite;
}
.planet-body {
  position: absolute;
  z-index: 2;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle closest-side,
    #8de5bf 0%, #68d9ac 46%, #3ec99a 82%,
    rgba(48, 194, 147, .98) 96%, rgba(48, 194, 147, 0) 100%);
}
.planet-body::after {
  content: '';
  position: absolute;
  inset: 2%;
  border-radius: 50%;
  background: linear-gradient(125deg, rgba(207, 255, 229, .13), transparent 48%, rgba(7, 115, 93, .1));
}
.atmosphere-arc {
  position: absolute;
  z-index: 2;
  inset: 1%;
  border-radius: 50%;
  border: 1px solid transparent;
  border-right-color: rgba(188, 255, 229, .42);
  border-bottom-color: rgba(151, 243, 208, .16);
  transform: rotate(-24deg);
}
.moon-orbit {
  z-index: 4;
  animation: moon-depth 32s steps(1, end) -3s infinite;
}
.moon-position {
  position: absolute;
  left: 97%;
  top: 50%;
  animation: moon-revolution 32s linear -3s infinite;
}
.orbit-moon {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transform: translate(-50%, -50%) var(--planet-moon-face, scaleY(2.63158) rotate(-17deg));
  background: #b0f2d6;
  box-shadow: 0 0 0 2px rgba(124, 221, 184, .1);
}
.planet-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 260%;
  height: var(--planet-ring-height, 35%);
  transform: var(--planet-ring-transform, translate(-50%, -50%) rotate(17deg) scaleY(.38));
  pointer-events: none;
}
.ring-back { z-index: 1; opacity: .5; }
.ring-front { z-index: 3; opacity: .8; }
.ring-half {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 50%;
  overflow: hidden;
}
.ring-band {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 200%;
  border-radius: 50%;
  animation: planet-ring-breathe 24s ease-in-out infinite;
  background:
    radial-gradient(ellipse closest-side, transparent 69%, rgba(228, 255, 241, .42) 70%, transparent 72%),
    radial-gradient(ellipse closest-side,
      transparent 38%, rgba(57, 151, 120, .25) 40%,
      rgba(115, 219, 183, .55) 49%, rgba(157, 237, 208, .4) 66%,
      rgba(52, 177, 143, .3) 85%, transparent 100%);
}
.ring-front .ring-half { top: 50%; }
.ring-front .ring-band { top: -100%; }
@keyframes moon-revolution {
  0% { left: 97.000%; top: 50.000%; }
  3.125% { left: 96.097%; top: 59.169%; }
  6.25% { left: 93.422%; top: 67.986%; }
  9.375% { left: 89.079%; top: 76.112%; }
  12.5% { left: 83.234%; top: 83.234%; }
  15.625% { left: 76.112%; top: 89.079%; }
  18.75% { left: 67.986%; top: 93.422%; }
  21.875% { left: 59.169%; top: 96.097%; }
  25% { left: 50.000%; top: 97.000%; }
  28.125% { left: 40.831%; top: 96.097%; }
  31.25% { left: 32.014%; top: 93.422%; }
  34.375% { left: 23.888%; top: 89.079%; }
  37.5% { left: 16.766%; top: 83.234%; }
  40.625% { left: 10.921%; top: 76.112%; }
  43.75% { left: 6.578%; top: 67.986%; }
  46.875% { left: 3.903%; top: 59.169%; }
  50% { left: 3.000%; top: 50.000%; }
  53.125% { left: 3.903%; top: 40.831%; }
  56.25% { left: 6.578%; top: 32.014%; }
  59.375% { left: 10.921%; top: 23.888%; }
  62.5% { left: 16.766%; top: 16.766%; }
  65.625% { left: 23.888%; top: 10.921%; }
  68.75% { left: 32.014%; top: 6.578%; }
  71.875% { left: 40.831%; top: 3.903%; }
  75% { left: 50.000%; top: 3.000%; }
  78.125% { left: 59.169%; top: 3.903%; }
  81.25% { left: 67.986%; top: 6.578%; }
  84.375% { left: 76.112%; top: 10.921%; }
  87.5% { left: 83.234%; top: 16.766%; }
  90.625% { left: 89.079%; top: 23.888%; }
  93.75% { left: 93.422%; top: 32.014%; }
  96.875% { left: 96.097%; top: 40.831%; }
  100% { left: 97.000%; top: 50.000%; }
}
@keyframes moon-depth {
  0%, 100% { z-index: 4; }
  50% { z-index: 1; }
}
@keyframes planet-ring-breathe {
  0%, 100% { opacity: .88; }
  50% { opacity: 1; }
}
@keyframes planet-halo-breathe {
  0%, 100% { opacity: .65; }
  50% { opacity: .9; }
}
@media (prefers-reduced-motion: reduce) {
  .planet-halo, .ring-band, .moon-orbit, .moon-position { animation: none; }
}
</style>
