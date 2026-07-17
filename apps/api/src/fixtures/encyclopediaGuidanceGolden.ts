export type EncyclopediaGuidanceGoldenFixture = {
  id: string
  entry: string
  context: string | null
  expected: {
    taxonomyNodeId: string
    l1: string
    l2: string
    l3: string
    primaryIntent: string
    templatePackIds: string[]
    requiresClarification: boolean
  }
}

type GoldenGroup = Omit<EncyclopediaGuidanceGoldenFixture['expected'], 'requiresClarification'> & {
  id: string
  examples: Array<string | { entry: string; requiresClarification: true }>
}

const groups: GoldenGroup[] = [
  group('history', 'tax_celebrity_historical', '名人', '历史人物', '待细分', 'historical_event_exploration', ['dtp_de_history_person_event_chain', 'dtp_de_history_person_relationship'], ['李白生平重要事件', '王安石变法因果链', '鲁肃人物关系与战略事件', '武则天在位时间线', '奢香夫人与明朝人物关系']),
  group('entertainment', 'tax_celebrity_entertainment', '名人', '娱乐明星', '待细分', 'biography_and_works', ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_summary_card'], ['周杰伦音乐生涯与代表作品', '巩俐电影作品时间线', '易烊千玺演艺经历', '主持人何炅人物百科', { entry: '小王的人物经历', requiresClarification: true }]),
  group('film', 'tax_screen_film', '影视作品', '电影', '待细分', 'cast_and_series_navigation', ['dtp_de_film_cast_role_network', 'dtp_de_film_series_navigation'], ['流浪地球2演员角色关系', '大话西游人物关系与系列作品', '让子弹飞剧情人物图谱', '哪吒之魔童闹海电影百科', { entry: '长安这部作品的人物关系', requiresClarification: true }]),
  group('tv', 'tax_screen_tv', '影视作品', '电视剧', '待细分', 'character_relationship_exploration', ['dtp_de_tv_character_relation', 'dtp_de_tv_episode_chain'], ['庆余年人物关系与剧情脉络', '甄嬛传角色阵营与分集剧情', '琅琊榜人物关系图谱', '繁花电视剧剧情线索', '北上人物关系与剧情解析']),
  group('variety', 'tax_screen_variety', '影视作品', '综艺节目', '待细分', 'format_and_cast_overview', ['dtp_dynamic_encyclopedia_summary_card'], ['奔跑吧节目赛制与嘉宾', '脱口秀大会节目百科', '乘风破浪的姐姐赛制变化', '国家宝藏节目内容结构', '向往的生活节目季数与常驻嘉宾']),
  group('book', 'tax_literature_book', '文学著作', '图书', '待细分', 'chapter_and_work_navigation', ['dtp_dynamic_encyclopedia_expandable_card', 'dtp_dynamic_encyclopedia_timeline_card'], ['红楼梦人物关系与章节脉络', '三体三部曲作品导航', '活着小说人物与主题', '乡土中国章节概要', { entry: '活着的内容介绍', requiresClarification: true }]),
  group('game', 'tax_game_video', '游戏', '电子游戏', '待细分', 'gameplay_and_version_overview', ['dtp_dynamic_encyclopedia_relation_card', 'dtp_dynamic_encyclopedia_timeline_card'], ['原神角色关系与版本更新', '黑神话悟空关卡与角色', '王者荣耀英雄关系百科', '塞尔达传说系列作品导航', '我的世界玩法与版本历史']),
  group('festival', 'tax_culture_festival', '文化活动', '节日庆典', '待细分', 'origin_and_customs', ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_summary_card'], ['春节起源与传统习俗', '中秋节历史与地域习俗', '端午节纪念人物与活动', '泼水节文化来源', '国庆节历史时间线']),
  group('scenic', 'tax_geo_scenic', '地域建筑', '景区景点', '待细分', 'route_and_poi_guidance', ['dtp_de_scenic_spot_route_guide', 'dtp_de_scenic_spot_map_poi'], ['故宫博物院游览路线与重点宫殿', '黄山景区路线推荐', '瘦西湖景点分布与导览', { entry: '中山公园游览顺序', requiresClarification: true }, '北京西山国家森林公园景点地图']),
  group('city', 'tax_geo_city', '地域建筑', '城市', '待细分', 'city_fact_overview', ['dtp_dynamic_encyclopedia_summary_card'], ['北京市城市概况与行政区', '杭州市地理与历史', '成都市人口与文化', '深圳市发展时间线', { entry: '朝阳地区介绍', requiresClarification: true }]),
  group('company', 'tax_organization_company', '机构组织', '企业公司', '待细分', 'company_development_overview', ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_timeline_card'], ['百度公司业务与发展史', '华为公司产品线与里程碑', '比亚迪企业发展时间线', '腾讯核心业务与投资关系', { entry: '苹果发展历史', requiresClarification: true }]),
  group('school', 'tax_organization_school', '机构组织', '学校教育', '待细分', 'campus_and_discipline_overview', ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_relation_card'], ['北京大学院系与校区', '清华大学发展历史', '复旦大学学科结构', '武汉大学校园建筑与院系', '四川大学校区与优势学科']),
  group('natural-science', 'tax_knowledge_natural_science', '知识术语', '自然科学', '待细分', 'concept_and_mechanism_explanation', ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_compare_card'], ['量子纠缠概念解释', '牛顿摆动量传递原理', '相对论核心概念', '光合作用过程百科', { entry: '场的概念是什么', requiresClarification: true }]),
  group('engineering', 'tax_knowledge_engineering', '知识术语', '工程技术', '待细分', 'technical_mechanism_explanation', ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_compare_card'], ['代理模式软件设计百科', 'Transformer模型工作原理', 'HTTP协议请求流程', '区块链共识机制对比', { entry: '代理是什么意思', requiresClarification: true }]),
  group('health', 'tax_knowledge_health', '知识术语', '医学健康', '待细分', 'medical_education_overview', ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['抑郁症症状与治疗方式科普', '流感传播与预防', '高血压风险因素', '阿司匹林药物百科', '糖尿病诊断与日常管理']),
  group('food', 'tax_product_food', '物品产品', '食品', '待细分', 'origin_and_characteristics', ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['龙井茶产区与制作工艺', '北京烤鸭历史与做法', '郫县豆瓣产品百科', '螺蛳粉食材与地域文化', { entry: '苹果的特点', requiresClarification: true }]),
  group('consumer', 'tax_product_consumer', '物品产品', '消费品', '待细分', 'specification_comparison', ['dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_summary_card'], ['特斯拉Model 3参数对比', 'iPhone系列型号差异', '华为Mate手机版本比较', '新能源汽车电池类型对比', { entry: '小米的发展与特点', requiresClarification: true }]),
  group('plant', 'tax_product_plant', '物品产品', '植物', '待细分', 'species_identification', ['dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['银杏树形态与分布', '水稻生长周期', '牡丹花品种辨析', '人参药用植物科普', '龙井的植物特征']),
  group('animal', 'tax_product_animal', '物品产品', '动物', '待细分', 'species_identification', ['dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['大熊猫习性与分布', '金环胡蜂核心特征辨析', '蜂鸟科物种图鉴', '鳡鱼形态与生活环境', '东北虎与华南虎区别']),
  group('music', 'tax_music_work', '音乐作品', '音乐', '待细分', 'music_work_background', ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_summary_card'], ['七里香单曲创作与发行', '青花瓷歌曲背景', '梁祝小提琴协奏曲百科', '昆曲牡丹亭音乐作品', '贝多芬第五交响曲创作时间线']),
]

export const ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES: EncyclopediaGuidanceGoldenFixture[] = groups.flatMap(group =>
  group.examples.map((example, index) => ({
    id: `golden_${group.id}_${String(index + 1).padStart(2, '0')}`,
    entry: typeof example === 'string' ? example : example.entry,
    context: null,
    expected: {
      taxonomyNodeId: group.taxonomyNodeId,
      l1: group.l1,
      l2: group.l2,
      l3: group.l3,
      primaryIntent: group.primaryIntent,
      templatePackIds: [...group.templatePackIds],
      requiresClarification: typeof example === 'string' ? false : example.requiresClarification,
    },
  })),
)

function group(
  id: string,
  taxonomyNodeId: string,
  l1: string,
  l2: string,
  l3: string,
  primaryIntent: string,
  templatePackIds: string[],
  examples: GoldenGroup['examples'],
): GoldenGroup {
  return { id, taxonomyNodeId, l1, l2, l3, primaryIntent, templatePackIds, examples }
}
