# 新用户引导：预置识别场景素材

这组图片用于第一步引导的本地演示，不是用户上传照片或真实识别记录。

- 生成方式：内置 `image_gen`，先生成原图，再以原图为参考生成改造效果。
- 场景：家庭书桌上的旧纸箱、金属茶罐、两个完整玻璃瓶，以及牛皮纸、麻绳、布料等辅材。
- 成品：纸箱分隔收纳盒、茶罐笔筒、玻璃瓶小物容器。保留相同房间、光线和相机角度，便于理解物品的再利用。
- 原图：`src/static/app/images/desk-packaging-before.webp`
- 效果图：`src/static/app/images/desk-packaging-after.webp`
- 两图均为 1200 × 900（4:3）；WebP 合计约 330 KiB。
- App 读取上述本地文件；小程序和网页分别读取后端 `back-end/public/images/desk-packaging-before.webp`、`back-end/public/images/desk-packaging-after.webp`（通过 `${baseUrl}/images/...` 访问）。
- 引导插画 tip1–tip5 与 tip1-upcycling 同样遵循 App 本地、网页及小程序后端加载的规则。
- 两张原始 PNG 保留在生成工具输出目录，WebP 仅做等比缩放与格式压缩。

## 原图生成提示词

Use case: photorealistic-natural. Asset for a Chinese recycling education app's onboarding demonstration. Generate ONE premium realistic editorial photograph in landscape 4:3 format. BEFORE scene: a richly detailed but readable domestic study / home workbench in soft afternoon window light. On a pale warm wooden desk are a used medium corrugated cardboard shipping carton with naturally folded open flaps and a small peeled shipping-label scar (no readable writing), an empty cylindrical deep green metal tea tin with its lid, two empty clear food glass jars of different heights with separate metal screw lids, a flattened brown kraft-paper bag, a loose coil of jute twine, a small folded piece of linen, and a short stack of used clean cardboard offcuts. The clean used packaging is grouped centrally as the subjects to identify; realistic scratches and paper fibers, ordinary reusable household discards, no food contamination, no dangerous items, no batteries, no knives. Include contextual detail around the edges: a small desk lamp, blurred bookshelf and houseplant in the background, a notebook and a few pencils off to one side. The three main materials (carton, tin, jars) must be easy to distinguish and large enough for an app photograph. Natural believable visual texture, mild depth of field, coherent shadows, uncluttered focal hierarchy despite abundant scene details. Camera is a slightly elevated front three-quarter view (about 35 degrees downward), all main objects entirely within frame, no human hands. This is the 'before' half of a before/after DIY desk organizer story, with ample front desk area for the organizer in the later image. No text, badges, logos, typography, graphics, UI, watermark, borders, or collages. Warm inviting photographic realism, not cartoon illustration.

## 效果图生成提示词

Reference image: the generated BEFORE photograph above.

Use case: product-mockup, image transformation for a paired before/after recycling tutorial. Image 1 is the BEFORE reference. Make the corresponding AFTER photograph, in exactly the same realistic room, warm wooden desk, window light, background bookshelf and plant, camera angle and landscape 4:3 framing. Keep visual continuity of materials and surface patina. Transform the central USED CARDBOARD BOX into an elegant practical low desktop organizer with three visible internal corrugated cardboard dividers, neatly wrapped in the reference brown kraft paper and a little of the linen, a simple jute tie around the base. The original deep-green metal tea tin is intact, simply wrapped around its lower half in jute twine and used as a pencil holder; it holds five tasteful pencils and two capped pens, with no cut edges. The original TWO GLASS JARS remain fully intact and clearly recognizable, one holding paper clips and binder clips, the other holding short rulers and washi tape; do not turn jars into cut-glass shapes. Arrange the cardboard organizer in the center-left, green tea-tin pencil holder on its right and both reused jars clustered to the right front, composing ONE coherent desk storage set. In the cardboard compartments place a small notebook, a few folded letters and blank kraft envelopes. The same tin lid and metal screw lids now serve as tiny trays for an eraser and spare clips near the set. All the original objects should have a recognizable purpose in the AFTER, no waste magically disappears into expensive unrelated furniture. The old box is now lower and carefully folded/wrapped, craft workmanship is attractive but achievable; subtle paper grain, linen texture, visible cardboard edges, warm highlights and gentle shadows. Keep contextual room and tools softly blurred around edges, make main re-use changes immediately legible on a phone screen. Do not show people, hands, tools cutting metal/glass, food, living plants inside the reused containers, unrealistic glowing effects, UI, diagrams, arrows, collages, labels, text, logos, watermark or typography. This is an inspiring high-quality realistic AFTER photo in a lived-in study, not a minimal single object render.

## 旧物改造引导插图

- 生成工具：内置 `imagegen`。
- 参考图：`front-head/src/static/app/images/tip1.webp`。
- 生成源 PNG：`C:/Users/29513/.codex/generated_images/01a173dd-d2db-7543-8062-8dd01800d495/exec-5c63ac77-9b6c-4517-8ec4-72b1b954a136.png`（1254 × 1254，RGBA，保留透明通道）。
- 输出 PNG：`front-head/src/static/app/images/tip1-upcycling.png`、`back-end/public/images/tip1-upcycling.png`（均为 1254 × 1254，1,952,659 bytes）。
- 输出 WebP：`front-head/src/static/app/images/tip1-upcycling.webp`、`back-end/public/images/tip1-upcycling.webp`（均为 1000 × 1000，232,336 bytes；从 PNG 等比缩放，quality 88、method 6，保留透明通道）。
- 提示词摘要：与参考图保持同款红帽、蓝背带裤的 3D 小投侠角色；展示纸箱改成收纳盒、茶罐改成笔筒、玻璃罐改成收纳容器；配绿色牌子和黄色“变废为宝”、白色“让旧物焕发新用处”文字；透明背景。

### 完整生成提示词

Use case: stylized-concept. Create a NEW sibling onboarding illustration matching the attached reference artwork closely in character identity, polished colorful toy-like 3D rendering, bevelled Chinese banner and composition density. Reference is STYLE and CHARACTER identity only, do not simply reproduce its recognition pose. Transparent background PNG, square composition, generous tiny safe margin, no backdrop or ground rectangle. Same cute smiling child environmental worker, red safety helmet, white tee, bright blue overalls with yellow buttons, round face and rosy cheeks. New theme: transforming clean waste into beautiful useful desk storage. Worker proudly presents a richly detailed small organizer built from a corrugated cardboard carton wrapped in kraft paper and linen with twine, divided compartments with stationery, a green reused tea tin pencil cup and two intact glass jars with clips and pencils. Add a small happy green recycling bin, a curved green reuse arrow and 2 small sparkle accents, coherent friendly 3D set. Show the organizer prominently at the center/lower center and the redhelmet character at upper center, welcoming presenting hand pose. No phone, no photographing, no scattered trash, no dangerous glass cutting. At bottom a curved thick emerald ribbon plaque like reference, large precise yellow Chinese headline: “变废为宝”. One short white Chinese subtitle: “让旧物焕发新用处”. Fine 3D glossy textures, soft studio lighting, crisp edges, premium playful app onboarding asset; match reference saturation and child design. All space around the subjects and ribbon genuinely transparent, including corners. Do not add extra text.
