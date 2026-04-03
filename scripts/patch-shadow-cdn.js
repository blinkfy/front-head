const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist', 'build', 'mp-weixin');
// 微信小程序 WXSS 不支持本地资源图片，只能用网络图片
const CDN_URL = 'https://cdn1.dcloud.net.cn/4d4549774f544e4351773d3d/img/shadow-grey.png';
const LOCAL_URL = '/static/shadow-grey.png';

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (entry.name.endsWith('.wxss') || entry.name === 'app.wxss') {
      replaceInFile(full);
    }
  }
}

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // 编译后的 WXSS 包含本地路径 /static/shadow-grey.png
  // 需要替换为 CDN 网络地址，微信才能正常加载
  if (!content.includes(LOCAL_URL)) return;
  const updated = content.split(LOCAL_URL).join(CDN_URL);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`[postbuild] Patched: ${path.relative(__dirname, filePath)}`);
}

walkDir(DIST_DIR);
console.log('[postbuild] Done.');
