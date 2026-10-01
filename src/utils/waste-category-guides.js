// 首页分类弹窗内容；素材路径对应后端 waste_examples/manifest.json。
export const wasteCategoryGuides = {
  "recyclable": {
    "title": "可回收物",
    "icon": "bin_recyclable",
    "color": "#447da8",
    "soft": "#f1f6fb",
    "definition": "适宜回收利用、可再生利用的生活废弃物。",
    "tips": [
      "保持清洁干燥，尽量压扁投放",
      "尖锐边角包裹后再投放"
    ],
    "confusions": [
      [
        "脏纸巾、湿纸巾",
        "属于其他垃圾"
      ],
      [
        "含汞灯管、过期药品",
        "属于有害垃圾"
      ]
    ],
    "examples": [
      {
        "name": "纸箱",
        "file": "01_recyclable/01_cardboard_box.webp"
      },
      {
        "name": "报纸",
        "file": "01_recyclable/02_newspapers.webp"
      },
      {
        "name": "书本",
        "file": "01_recyclable/03_book.webp"
      },
      {
        "name": "纸袋",
        "file": "01_recyclable/04_paper_bag.webp"
      },
      {
        "name": "塑料饮料瓶",
        "file": "01_recyclable/05_plastic_bottle.webp"
      },
      {
        "name": "塑料容器",
        "file": "01_recyclable/06_detergent_bottle.webp"
      },
      {
        "name": "玻璃瓶",
        "file": "01_recyclable/07_glass_bottle.webp"
      },
      {
        "name": "易拉罐",
        "file": "01_recyclable/08_aluminum_can.webp"
      },
      {
        "name": "金属罐",
        "file": "01_recyclable/09_tin_can.webp"
      },
      {
        "name": "饮料纸盒",
        "file": "01_recyclable/10_milk_carton.webp"
      },
      {
        "name": "旧衣物",
        "file": "01_recyclable/11_old_clothes.webp"
      },
      {
        "name": "废金属",
        "file": "01_recyclable/12_scrap_metal.webp"
      }
    ],
    "darkColor": "#7dbaff",
    "legacyDescription": "包括废纸、塑料、玻璃、金属和布料五大类。这些垃圾可以通过综合处理回收利用，减少污染，节省资源。正确分类投放可以大大提高回收效率，为环保事业贡献力量。",
    "legacyDarkDescription": "包括废纸、塑料、玻璃、金属和布料等。可回收物经过分类处理后可再利用，能减少污染并节约资源。",
    "buttonSoft": "#dfedf8",
    "darkButtonSoft": "#30495d"
  },
  "harmful": {
    "title": "有害垃圾",
    "icon": "bin_hazardous",
    "color": "#b26070",
    "soft": "#fcf2f4",
    "definition": "对人体健康或自然环境有直接或潜在危害的废弃物。",
    "tips": [
      "保留原包装，避免泄漏",
      "易破损物包裹好，送至专门收集点"
    ],
    "confusions": [
      [
        "干净玻璃瓶",
        "属于可回收物"
      ],
      [
        "普通无汞干电池",
        "请按当地要求投放"
      ]
    ],
    "examples": [
      {
        "name": "废电池",
        "file": "02_hazardous/01_cylindrical_battery.webp"
      },
      {
        "name": "纽扣电池",
        "file": "02_hazardous/02_button_battery.webp"
      },
      {
        "name": "废荧光灯管",
        "file": "02_hazardous/03_fluorescent_tube.webp"
      },
      {
        "name": "废灯泡",
        "file": "02_hazardous/04_light_bulb.webp"
      },
      {
        "name": "过期药品",
        "file": "02_hazardous/05_expired_medicine_bottle.webp"
      },
      {
        "name": "药品泡罩",
        "file": "02_hazardous/06_medicine_blister_pack.webp"
      },
      {
        "name": "废油漆桶",
        "file": "02_hazardous/07_paint_can.webp"
      },
      {
        "name": "废杀虫剂",
        "file": "02_hazardous/08_pesticide_bottle.webp"
      },
      {
        "name": "废喷雾罐",
        "file": "02_hazardous/09_aerosol_can.webp"
      },
      {
        "name": "废温度计",
        "file": "02_hazardous/10_thermometer.webp"
      },
      {
        "name": "废化学品容器",
        "file": "02_hazardous/11_chemical_bottle.webp"
      },
      {
        "name": "废指甲油",
        "file": "02_hazardous/12_nail_polish.webp"
      }
    ],
    "darkColor": "#ff929c",
    "legacyDescription": "包括废电池、废灯管、废药品、废油漆及其容器等。这些垃圾含有有毒有害物质，需要特殊处理，避免对环境和人体造成危害。请务必投放到专门的有害垃圾收集点。",
    "legacyDarkDescription": "包括废电池、废灯管、废药品、废油漆及其容器等，需投放到有害垃圾回收点进行专门处理。",
    "buttonSoft": "#f7e0e5",
    "darkButtonSoft": "#513946"
  },
  "kitchen": {
    "title": "厨余垃圾",
    "icon": "bin_kitchen",
    "color": "#398466",
    "soft": "#eff8f3",
    "definition": "容易腐烂、可生化处理的有机生活垃圾。",
    "tips": [
      "尽量沥干水分再投放",
      "去除包装袋、塑料盒等非厨余物"
    ],
    "confusions": [
      [
        "大骨头、硬贝壳",
        "属于其他垃圾"
      ],
      [
        "餐巾纸、湿纸巾",
        "属于其他垃圾"
      ]
    ],
    "examples": [
      {
        "name": "剩饭",
        "file": "03_kitchen/01_leftover_rice.webp"
      },
      {
        "name": "菜叶",
        "file": "03_kitchen/02_leafy_vegetables.webp"
      },
      {
        "name": "菜根菜叶",
        "file": "03_kitchen/03_vegetable_scraps.webp"
      },
      {
        "name": "香蕉皮",
        "file": "03_kitchen/04_banana_peel.webp"
      },
      {
        "name": "橙子皮",
        "file": "03_kitchen/05_orange_peel.webp"
      },
      {
        "name": "苹果核",
        "file": "03_kitchen/06_apple_core.webp"
      },
      {
        "name": "蛋壳",
        "file": "03_kitchen/07_eggshells.webp"
      },
      {
        "name": "茶叶渣",
        "file": "03_kitchen/08_tea_leaves.webp"
      },
      {
        "name": "咖啡渣",
        "file": "03_kitchen/09_coffee_grounds.webp"
      },
      {
        "name": "鱼骨",
        "file": "03_kitchen/10_fish_bones.webp"
      },
      {
        "name": "玉米芯",
        "file": "03_kitchen/11_corn_cob.webp"
      },
      {
        "name": "西瓜皮",
        "file": "03_kitchen/12_watermelon_rind.webp"
      }
    ],
    "darkColor": "#66dda6",
    "legacyDescription": "包括剩菜剩饭、骨头、菜根菜叶、果皮等食品类废物。这些有机垃圾可以通过生物技术就地处理堆肥，转化为有机肥料，实现资源循环利用。",
    "legacyDarkDescription": "包括剩菜剩饭、果皮果核、骨头、菜叶等厨余废弃物，可通过堆肥等方式资源化处理。",
    "buttonSoft": "#ddefe5",
    "darkButtonSoft": "#2e4d41"
  },
  "other": {
    "title": "其他垃圾",
    "icon": "bin_other",
    "color": "#657b93",
    "soft": "#f3f5f8",
    "definition": "除可回收物、有害垃圾、厨余垃圾以外的生活废弃物。",
    "tips": [
      "装袋封好，避免散落",
      "尖锐碎片包裹后再投放"
    ],
    "confusions": [
      [
        "干净纸箱、易拉罐",
        "属于可回收物"
      ],
      [
        "果皮、菜叶",
        "属于厨余垃圾"
      ]
    ],
    "examples": [
      {
        "name": "用过的纸巾",
        "file": "04_other/01_used_tissue.webp"
      },
      {
        "name": "湿纸巾",
        "file": "04_other/02_wet_wipe.webp"
      },
      {
        "name": "烟蒂",
        "file": "04_other/03_cigarette_butt.webp"
      },
      {
        "name": "陶瓷碎片",
        "file": "04_other/04_broken_ceramic.webp"
      },
      {
        "name": "一次性纸杯",
        "file": "04_other/05_disposable_cup.webp"
      },
      {
        "name": "外卖餐盒",
        "file": "04_other/06_takeout_container.webp"
      },
      {
        "name": "海绵",
        "file": "04_other/07_sponge.webp"
      },
      {
        "name": "棉签",
        "file": "04_other/08_cotton_swabs.webp"
      },
      {
        "name": "牙签",
        "file": "04_other/09_toothpick.webp"
      },
      {
        "name": "一次性筷子",
        "file": "04_other/10_disposable_chopsticks.webp"
      },
      {
        "name": "灰尘毛发",
        "file": "04_other/11_dust_hair.webp"
      },
      {
        "name": "用过的口罩",
        "file": "04_other/12_used_mask.webp"
      }
    ],
    "darkColor": "#b4c8df",
    "legacyDescription": "包括除上述几类垃圾之外的砖瓦陶瓷、渣土、卫生间废纸、纸巾等难以回收的废弃物。这些垃圾通常采用卫生填埋等方式进行无害化处理。",
    "legacyDarkDescription": "包括砖瓦陶瓷、卫生纸、尘土等难以回收利用的废弃物，一般采用卫生填埋等方式处理。",
    "buttonSoft": "#e5ebf2",
    "darkButtonSoft": "#394956"
  }
}
