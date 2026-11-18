# 用户累计成本表图标

用途：数据库管理页面的 `UserCost` 表入口，图标 ID 为 `user_cost_table`。

设计：绿色累计账本、蓝色用户头像、金色人民币硬币，与现有彩色立体图标保持一致。

使用内置 imagegen 生成，导出为 64×64 透明 WebP，统一以 `.webp.png` 命名。网页、APP 和微信小程序共用 `src/static/icons/user_cost_table_64.webp.png`，实际字节为 WebP；小程序通过既有图标规则放入管理分包。

## 生成提示词

Use case: stylized-concept. Asset type: a single production UI icon for the Chinese environmental app database table '用户累计成本表' (per-user cumulative paid API usage cost). Create a compact, polished 3D clay/plastic miniature icon: an emerald and teal accounting ledger with a simple cyan user-avatar badge on its upper-left cover, and a small stack of two warm gold coins in front at lower-right. The foremost coin has one clear embossed ¥ symbol. A few raised horizontal ledger lines subtly communicate accumulated costs. Friendly rounded edges, restrained blue/green gradients, warm gold accents, soft studio lighting from upper left, shallow isometric perspective. Clear chunky silhouette readable at 32–64 pixels; visually balanced centered object fills 86% of a square canvas, consistent spacing around all edges. Match a set of colorful soft 3D app icons used for users, databases, and green environmental services. Genuinely transparent background. No square app tile behind the objects, no surrounding scene, no chart arrow suggesting growth, no price numerals, no Chinese lettering, no labels, no border, no watermark. Deliver one icon only.
