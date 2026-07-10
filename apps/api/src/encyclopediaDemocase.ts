export type EncyclopediaDemocase = {
  id: string
  title: string
  aliases: string[]
  primaryCategory: string
  secondaryCategory: string
  interactionParadigmId: string
  preferredTemplateIds: string[]
  keywords: string[]
  summary: string
}

export type EncyclopediaDemocaseMatch = {
  caseId: string
  title: string
  primaryCategory: string
  secondaryCategory: string
  interactionParadigmId: string
  preferredTemplateIds: string[]
  score: number
  matchedKeywords: string[]
  summary: string
}

const democases: EncyclopediaDemocase[] = [
  {
    id: 'demo_baidu_baike_company',
    title: '百度百科',
    aliases: ['baidu baike', '百度百科平台'],
    primaryCategory: '机构组织',
    secondaryCategory: '企业',
    interactionParadigmId: 'ip_entity_summary',
    preferredTemplateIds: ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_timeline_card'],
    keywords: ['百度百科', '搜索', '人工智能', '知识服务', '互联网公司', '企业'],
    summary: '企业型知识词条：身份摘要 + 核心业务 + 关键事实，必要时补充发展节点。',
  },
  {
    id: 'demo_company_history',
    title: '企业发展史',
    aliases: ['公司发展历程', '企业时间线'],
    primaryCategory: '机构组织',
    secondaryCategory: '企业',
    interactionParadigmId: 'ip_timeline_story',
    preferredTemplateIds: ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_summary_card'],
    keywords: ['发展史', '历程', '里程碑', '融资', '上市', '产品线', '阶段'],
    summary: '当词条强调企业阶段、里程碑和演进过程时，优先使用时间线结构。',
  },
  {
    id: 'demo_knowledge_term',
    title: '知识术语',
    aliases: ['概念解释', '理论定义'],
    primaryCategory: '知识',
    secondaryCategory: '知识术语',
    interactionParadigmId: 'ip_fact_compare',
    preferredTemplateIds: ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_expandable_card'],
    keywords: ['概念', '定义', '理论', '技术', '算法', '模型', '协议', '区别', '对比', '辨析'],
    summary: '知识术语词条优先展示定义、适用范围与关键要点；当出现区别、对比或辨析信号时，可使用对比卡或可展开事实卡。',
  },
  {
    id: 'demo_game_release',
    title: '游戏作品',
    aliases: ['游戏条目', '游戏发行'],
    primaryCategory: '作品',
    secondaryCategory: '游戏',
    interactionParadigmId: 'ip_timeline_story',
    preferredTemplateIds: ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_relation_card', 'dtp_dynamic_encyclopedia_summary_card'],
    keywords: ['游戏', '发行', '平台', '角色', '玩法', '版本', '更新', '关系'],
    summary: '游戏词条常需展示发行时间、平台、版本更新、玩法与角色关系。',
  },
  {
    id: 'demo_history_person_relationship',
    title: '历史人物关系',
    aliases: ['人物关系图谱', '历史人物图谱', '帝王关系', '君臣关系', '师承关系'],
    primaryCategory: '名人',
    secondaryCategory: '历史人物',
    interactionParadigmId: 'ip_relation_map',
    preferredTemplateIds: ['dtp_de_history_person_relationship', 'dtp_de_history_person_event_chain', 'dtp_dynamic_encyclopedia_summary_card'],
    keywords: ['历史人物', '关系', '父亲', '儿子', '妻子', '皇帝', '君臣', '对手', '师父', '弟子', '家族', '血缘', '阵营'],
    summary: '历史人物词条优先承接人物关系、亲属/君臣/师承/对手网络，并保留事件链作为深度浏览。',
  },
  {
    id: 'demo_film_work',
    title: '电影作品',
    aliases: ['电影条目', '影片', '院线电影'],
    primaryCategory: '影视作品',
    secondaryCategory: '电影',
    interactionParadigmId: 'ip_relation_map',
    preferredTemplateIds: ['dtp_de_film_cast_role_network', 'dtp_de_film_series_navigation', 'dtp_dynamic_encyclopedia_summary_card'],
    keywords: ['电影', '影片', '上映', '票房', '评分', '导演', '主演', '演员表', '角色', '系列电影', '续集', '前传', '翻拍', '同IP', '相似电影'],
    summary: '电影词条优先承接演员-角色关系、系列/IP 导航和相似推荐，不服务播放/下载资源需求。',
  },
  {
    id: 'demo_tv_work',
    title: '电视剧作品',
    aliases: ['电视剧条目', '剧集', '连续剧', '剧版'],
    primaryCategory: '影视作品',
    secondaryCategory: '电视剧',
    interactionParadigmId: 'ip_relation_map',
    preferredTemplateIds: ['dtp_de_tv_character_relation', 'dtp_de_tv_episode_chain', 'dtp_dynamic_encyclopedia_summary_card'],
    keywords: ['电视剧', '剧集', '连续剧', '播出', '集数', '季数', '分集剧情', '角色关系', '演员表', '角色是谁', '伏笔', '结局', '追剧'],
    summary: '电视剧词条优先承接角色关系图谱、分集剧情因果链、系列/季播导航和角色身份速查。',
  },
  {
    id: 'demo_cultural_phrase',
    title: '文化类词语',
    aliases: ['文化词语', '成语典故', '词语释义', '典故词'],
    primaryCategory: '知识术语',
    secondaryCategory: '文化类词语',
    interactionParadigmId: 'ip_relation_map',
    preferredTemplateIds: ['dtp_de_cultural_phrase_relation_graph', 'dtp_de_cultural_phrase_origin_story', 'dtp_dynamic_encyclopedia_compare_card'],
    keywords: ['成语', '词语', '释义', '意思', '含义', '读音', '拼音', '出处', '典故', '故事', '近义词', '反义词', '辨析', '易混词', '造句'],
    summary: '文化类词语优先承接关联词语图谱和出处/典故深化，典故缺可靠来源时不硬拼。',
  },
  {
    id: 'demo_scenic_spot_route',
    title: '景区景点导览',
    aliases: ['景区导览', '景点路线', '智能导览', '路线推荐', '景点地图'],
    primaryCategory: '地域建筑',
    secondaryCategory: '景区景点',
    interactionParadigmId: 'ip_route_guide',
    preferredTemplateIds: ['dtp_de_scenic_spot_route_guide', 'dtp_de_scenic_spot_map_poi', 'dtp_dynamic_encyclopedia_summary_card'],
    keywords: ['景区', '景点', '公园', '风景区', '旅游区', '导览', '路线', '游览', '坐标', '地图', '推荐路线', '必看景点', 'POI', 'poi'],
    summary: '景区景点词条优先承接智能导览、路线推荐、POI 分布和坐标/位置资料状态，不硬编实时路线或票务信息。',
  },
]

export function lookupEncyclopediaDemocases(query: string, limit = 3): EncyclopediaDemocaseMatch[] {
  const normalized = query.toLowerCase()
  return democases
    .map(democase => {
      const matchedKeywords = [
        ...democase.keywords,
        democase.title,
        ...democase.aliases,
      ].filter(keyword => normalized.includes(keyword.toLowerCase()))
      const score = matchedKeywords.length / Math.max(1, democase.keywords.length)
      return {
        caseId: democase.id,
        title: democase.title,
        primaryCategory: democase.primaryCategory,
        secondaryCategory: democase.secondaryCategory,
        interactionParadigmId: democase.interactionParadigmId,
        preferredTemplateIds: democase.preferredTemplateIds,
        score,
        matchedKeywords: [...new Set(matchedKeywords)],
        summary: democase.summary,
      }
    })
    .filter(match => match.score > 0 || match.matchedKeywords.length > 0)
    .sort((a, b) => b.score - a.score || b.matchedKeywords.length - a.matchedKeywords.length)
    .slice(0, Math.max(1, Math.min(3, Math.trunc(limit))))
}
