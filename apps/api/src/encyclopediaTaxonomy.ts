import type { EncyclopediaGuidanceTaxonomyCandidate } from '@dudesign/contracts'
import { primaryIntentIdsForTaxonomyCategory } from './encyclopediaGuidanceIntents.js'

export const ENCYCLOPEDIA_TAXONOMY_VERSION = '2026-07-15.kedu-taxonomy.v1'
export const ENCYCLOPEDIA_TAXONOMY_DECLARED_L1_COUNT = 11
export const ENCYCLOPEDIA_TAXONOMY_DECLARED_L2_COUNT = 44

export type EncyclopediaTaxonomyNode = EncyclopediaGuidanceTaxonomyCandidate & {
  level: 'L2' | 'L3'
  priority: number
}

export type EncyclopediaTaxonomyLintFinding = {
  code: 'l1_count_mismatch' | 'l2_count_mismatch' | 'duplicate_node_id' | 'missing_parent_category'
  severity: 'warning' | 'error'
  message: string
}

const SUMMARY_TEMPLATES = ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_expandable_card']
const SUMMARY_PARADIGMS = ['ip_entity_summary', 'ip_expandable_facts']
const TIMELINE_TEMPLATES = ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_summary_card']
const TIMELINE_PARADIGMS = ['ip_timeline_story', 'ip_entity_summary']

const taxonomyNodes: EncyclopediaTaxonomyNode[] = [
  l2('celebrity_entertainment', '名人', '娱乐明星', ['演员', '歌手', '偶像', '主持人', '艺人', '明星'], ['主演', '专辑', '演唱会', '综艺'], TIMELINE_TEMPLATES, ['ip_timeline_story', 'ip_relation_map'], []),
  l2('celebrity_political', '名人', '政治人物', ['政治家', '官员', '公务员', '领导人'], ['任期', '政策', '政府'], TIMELINE_TEMPLATES, TIMELINE_PARADIGMS, ['political_neutrality_required']),
  l2('celebrity_cultural', '名人', '文化人物', ['作家', '艺术家', '学者', '教育家', '诗人', '画家'], ['作品', '学术', '文学'], TIMELINE_TEMPLATES, TIMELINE_PARADIGMS, ['works_source_required']),
  l2('celebrity_historical', '名人', '历史人物', ['历史人物', '皇帝', '帝王', '名臣', '武将', '古代人物'], ['朝代', '变法', '战役', '君臣', '师承'], ['dtp_de_history_person_relationship', 'dtp_de_history_person_event_chain', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_relation_map', 'ip_causal_event_chain'], ['relationship_hallucination_risk', 'event_causality_source_required']),
  l2('celebrity_business', '名人', '企业人物', ['企业家', '创始人', '高管', 'CEO', 'ceo'], ['创业', '公司', '商业'], TIMELINE_TEMPLATES, TIMELINE_PARADIGMS, ['business_claim_source_required']),
  l2('celebrity_sports', '名人', '体育人物', ['运动员', '教练', '裁判', '球员'], ['比赛', '冠军', '纪录'], TIMELINE_TEMPLATES, TIMELINE_PARADIGMS, ['record_source_required']),

  l2('screen_film', '影视作品', '电影', ['电影', '影片', '院线电影', '网络电影'], ['上映', '票房', '导演', '主演', '续集', '前传'], ['dtp_de_film_cast_role_network', 'dtp_de_film_series_navigation', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_relation_map', 'ip_series_navigation'], ['media_resource_link_blocked', 'plot_hallucination_risk']),
  l2('screen_tv', '影视作品', '电视剧', ['电视剧', '剧集', '连续剧', '网络剧'], ['分集剧情', '角色关系', '季数', '集数', '伏笔'], ['dtp_de_tv_character_relation', 'dtp_de_tv_episode_chain', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_relation_map', 'ip_causal_event_chain'], ['plot_hallucination_risk', 'spoiler_control_required']),
  l2('screen_variety', '影视作品', '综艺节目', ['综艺', '综艺节目', '真人秀', '脱口秀'], ['嘉宾', '赛制', '节目单'], SUMMARY_TEMPLATES, ['ip_entity_summary', 'ip_relation_map'], ['episode_source_required']),
  l2('screen_documentary', '影视作品', '纪录片', ['纪录片', '纪录长片', '纪录短片'], ['拍摄', '主题', '出品'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['claim_source_required']),
  l2('screen_animation', '影视作品', '动画作品', ['动画', '动漫', '动画电影', '动画剧集'], ['角色', '声优', '制作公司'], ['dtp_dynamic_encyclopedia_relation_card', ...SUMMARY_TEMPLATES], ['ip_relation_map', 'ip_entity_summary'], ['plot_hallucination_risk']),

  l2('literature_book', '文学著作', '图书', ['图书', '书籍', '小说', '教材', '专著'], ['作者', '出版', '章节', '出版社'], ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_expandable_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_timeline_story', 'ip_expandable_facts'], ['copyright_excerpt_risk']),
  l2('literature_periodical', '文学著作', '期刊杂志', ['期刊', '杂志', '学报'], ['刊号', '出版周期', '主办单位'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['publication_status_source_required']),
  l2('literature_comic', '文学著作', '漫画作品', ['漫画', '连载漫画', '漫画单行本'], ['作者', '连载', '卷数'], ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_relation_card'], ['ip_timeline_story', 'ip_relation_map'], ['copyright_excerpt_risk']),

  l2('game_video', '游戏', '电子游戏', ['电子游戏', '网络游戏', '手游', '单机游戏', '主机游戏'], ['玩法', '关卡', '角色', '发行平台', '版本更新'], ['dtp_dynamic_encyclopedia_relation_card', 'dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_relation_map', 'ip_timeline_story'], ['version_status_source_required']),
  l2('game_board', '游戏', '桌游棋牌', ['桌游', '棋牌', '棋类', '牌类'], ['规则', '回合', '棋子', '牌组'], ['dtp_dynamic_encyclopedia_expandable_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_expandable_facts', 'ip_entity_summary'], ['rule_accuracy_required']),

  l2('culture_festival', '文化活动', '节日庆典', ['节日', '庆典', '纪念日', '春节', '中秋节'], ['习俗', '日期', '起源'], TIMELINE_TEMPLATES, TIMELINE_PARADIGMS, ['origin_source_required']),
  l2('culture_event', '文化活动', '赛事活动', ['赛事', '比赛', '体育赛事', '文化赛事', '商业赛事'], ['赛程', '冠军', '举办地'], ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_compare_card'], ['ip_timeline_story', 'ip_fact_compare'], ['realtime_status_risk']),
  l2('culture_exhibition', '文化活动', '展会展览', ['展会', '展览', '博览会', '艺术展'], ['展期', '展馆', '参展'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['realtime_status_risk']),

  l2('geo_city', '地域建筑', '城市', ['城市', '直辖市', '地级市', '县级市'], ['人口', '行政区', '地理位置'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['population_source_required']),
  l2('geo_scenic', '地域建筑', '景区景点', ['景区', '景点', '公园', '遗址', '旅游区', '风景区'], ['导览', '路线', 'POI', 'poi', '坐标'], ['dtp_de_scenic_spot_route_guide', 'dtp_de_scenic_spot_map_poi', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_route_guide', 'ip_entity_summary'], ['coordinate_source_required', 'travel_realtime_hallucination_risk']),
  l2('geo_building', '地域建筑', '建筑', ['建筑', '地标', '著名建筑'], ['建筑师', '建成', '高度', '风格'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['spec_source_required']),
  l2('geo_administrative', '地域建筑', '行政区划', ['行政区划', '省', '市', '区', '县', '乡镇', '街道'], ['区划代码', '下辖', '面积'], ['dtp_dynamic_encyclopedia_relation_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_relation_map', 'ip_entity_summary'], ['administrative_status_source_required']),
  l2('geo_natural', '地域建筑', '自然地理', ['山脉', '河流', '湖泊', '岛屿', '自然地理'], ['海拔', '流域', '面积', '地貌'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['geographic_data_source_required']),

  l2('organization_company', '机构组织', '企业公司', ['企业', '公司', '集团', '上市公司'], ['融资', '上市', '创始人', '产品线'], ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_relation_card'], ['ip_entity_summary', 'ip_timeline_story', 'ip_relation_map'], ['business_claim_source_required']),
  l2('organization_government', '机构组织', '政府机构', ['政府机构', '政府机关', '事业单位', '公共机构'], ['职责', '隶属', '内设机构'], ['dtp_dynamic_encyclopedia_relation_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_relation_map', 'ip_entity_summary'], ['official_status_source_required']),
  l2('organization_social', '机构组织', '社会团体', ['协会', '学会', '基金会', '社会团体'], ['会员', '宗旨', '组织架构'], SUMMARY_TEMPLATES, ['ip_entity_summary', 'ip_relation_map'], ['organization_status_source_required']),
  l2('organization_school', '机构组织', '学校教育', ['大学', '学院', '学校', '中学', '小学', '幼儿园'], ['校区', '学科', '院系', '办学'], ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_relation_card'], ['ip_entity_summary', 'ip_relation_map'], ['education_status_source_required']),

  l2('knowledge_natural_science', '知识术语', '自然科学', ['数学', '物理', '化学', '生物', '天文', '自然科学'], ['定理', '实验', '公式', '现象'], ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['ip_entity_summary', 'ip_fact_compare', 'ip_expandable_facts'], ['scientific_claim_source_required']),
  l2('knowledge_engineering', '知识术语', '工程技术', ['工程技术', '信息技术', '工业技术', '建筑工程', '算法', '协议', '软件'], ['原理', '架构', '标准', '模型'], ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_compare_card'], ['ip_entity_summary', 'ip_fact_compare'], ['technical_version_source_required']),
  l2('knowledge_social_science', '知识术语', '社会科学', ['经济学', '法学', '心理学', '社会学', '社会科学'], ['理论', '学派', '研究'], ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_compare_card'], ['ip_entity_summary', 'ip_fact_compare'], ['social_science_claim_source_required']),
  l2('knowledge_health', '知识术语', '医学健康', ['疾病', '症状', '药物', '治疗方法', '医学', '健康'], ['诊断', '治疗', '病因', '用药'], ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['ip_entity_summary', 'ip_expandable_facts'], ['medical_safety_required', 'medical_advice_blocked']),

  l2('product_food', '物品产品', '食品', ['食品', '美食', '特产', '食材', '调味品'], ['做法', '产地', '营养'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['nutrition_source_required']),
  l2('product_consumer', '物品产品', '消费品', ['消费品', '日用品', '电子产品', '服装', '手机', '汽车'], ['型号', '参数', '价格', '发布'], ['dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_fact_compare', 'ip_entity_summary'], ['price_realtime_risk']),
  l2('product_antique', '物品产品', '文物古董', ['文物', '古董', '艺术品', '书画', '碑帖'], ['年代', '馆藏', '出土', '作者'], ['dtp_dynamic_encyclopedia_expandable_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_expandable_facts', 'ip_entity_summary'], ['provenance_source_required']),
  l2('product_plant', '物品产品', '植物', ['植物', '花卉', '树木', '农作物', '中草药'], ['科属', '分布', '形态', '药用'], ['dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['ip_fact_compare', 'ip_expandable_facts'], ['medical_claim_risk']),
  l2('product_animal', '物品产品', '动物', ['动物', '哺乳动物', '鸟类', '昆虫', '鱼类', '水生动物'], ['科属', '习性', '分布', '特征'], ['dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_expandable_card'], ['ip_fact_compare', 'ip_expandable_facts'], ['species_claim_source_required']),

  l2('society_lifestyle', '社会生活', '生活方式', ['生活方式', '习俗', '礼仪', '民间艺术'], ['传统', '地域', '仪式'], SUMMARY_TEMPLATES, SUMMARY_PARADIGMS, ['cultural_context_required']),
  l2('society_event', '社会生活', '事件', ['社会事件', '突发事件', '新闻事件', '事件'], ['发生', '调查', '影响'], TIMELINE_TEMPLATES, TIMELINE_PARADIGMS, ['breaking_news_risk', 'neutrality_required']),
  l2('society_brand', '社会生活', '品牌', ['品牌', '消费品牌', '企业品牌'], ['创立', '产品', '定位'], ['dtp_dynamic_encyclopedia_summary_card', 'dtp_dynamic_encyclopedia_timeline_card'], ['ip_entity_summary', 'ip_timeline_story'], ['brand_trade_dress_risk']),

  l2('music_work', '音乐作品', '音乐', ['音乐', '歌曲', '单曲', '专辑', '戏曲'], ['演唱', '作词', '作曲', '发行'], ['dtp_dynamic_encyclopedia_timeline_card', 'dtp_dynamic_encyclopedia_summary_card'], ['ip_timeline_story', 'ip_entity_summary'], ['lyrics_copyright_risk']),

  l3('history_emperor', '名人', '历史人物', '帝王君主', ['皇帝', '帝王', '君主'], ['在位', '年号', '继位'], ['dtp_de_history_person_relationship', 'dtp_de_history_person_event_chain'], ['ip_relation_map', 'ip_causal_event_chain'], ['relationship_hallucination_risk']),
  l3('film_scifi', '影视作品', '电影', '科幻奇幻片', ['科幻电影', '奇幻电影'], ['科幻', '奇幻'], ['dtp_de_film_cast_role_network', 'dtp_de_film_series_navigation'], ['ip_relation_map', 'ip_series_navigation'], ['plot_hallucination_risk']),
  l3('tv_historical', '影视作品', '电视剧', '古装历史剧', ['古装剧', '历史剧', '权谋剧'], ['古装', '历史', '权谋'], ['dtp_de_tv_character_relation', 'dtp_de_tv_episode_chain'], ['ip_relation_map', 'ip_causal_event_chain'], ['plot_hallucination_risk', 'spoiler_control_required']),
  l3('cultural_phrase', '知识术语', '社会科学', '文化类词语', ['成语', '典故', '文化词语', '汉字词语'], ['释义', '出处', '近义词', '反义词', '造句'], ['dtp_de_cultural_phrase_relation_graph', 'dtp_de_cultural_phrase_origin_story', 'dtp_dynamic_encyclopedia_compare_card'], ['ip_relation_map', 'ip_causal_event_chain', 'ip_fact_compare'], ['origin_source_required']),
  l3('scenic_route', '地域建筑', '景区景点', '导览路线', ['景区导览', '景点路线'], ['导览', '路线', '游览顺序'], ['dtp_de_scenic_spot_route_guide', 'dtp_de_scenic_spot_map_poi'], ['ip_route_guide'], ['coordinate_source_required']),
]

export function listEncyclopediaTaxonomyNodes(): EncyclopediaTaxonomyNode[] {
  return taxonomyNodes.map(node => ({
    ...node,
    aliases: [...node.aliases],
    positiveSignals: [...node.positiveSignals],
    negativeSignals: [...node.negativeSignals],
    compatibleTemplatePackIds: [...node.compatibleTemplatePackIds],
    compatibleInteractionParadigmIds: [...node.compatibleInteractionParadigmIds],
    compatiblePrimaryIntentIds: [...(node.compatiblePrimaryIntentIds ?? [])],
    riskFlags: [...node.riskFlags],
  }))
}

export function findEncyclopediaTaxonomyNode(primaryCategory: string, secondaryCategory: string, tertiaryCategory?: string | null): EncyclopediaTaxonomyNode | null {
  const exactL3 = tertiaryCategory
    ? taxonomyNodes.find(node => node.level === 'L3' && node.l1 === primaryCategory && node.l2 === secondaryCategory && node.l3 === tertiaryCategory)
    : null
  return exactL3
    ?? taxonomyNodes.find(node => node.level === 'L2' && node.l1 === primaryCategory && node.l2 === secondaryCategory)
    ?? null
}

export function resolveEncyclopediaTaxonomyCandidates(input: {
  query: string
  categoryHints?: Array<{ primaryCategory: string; secondaryCategory: string }>
  limit?: number
}): EncyclopediaGuidanceTaxonomyCandidate[] {
  const normalized = normalize(input.query)
  const hints = new Set((input.categoryHints ?? []).map(item => `${item.primaryCategory}/${item.secondaryCategory}`))
  const scored = taxonomyNodes.map(node => {
    const aliasMatches = node.aliases.filter(value => normalized.includes(normalize(value)))
    const signalMatches = node.positiveSignals.filter(value => normalized.includes(normalize(value)))
    const negativeMatches = node.negativeSignals.filter(value => normalized.includes(normalize(value)))
    const hintBoost = hints.has(`${node.l1}/${node.l2}`) ? 8 : 0
    const levelBoost = node.level === 'L3' ? 0.5 : 0
    return {
      node,
      score: hintBoost + aliasMatches.length * 4 + signalMatches.length * 2 - negativeMatches.length * 4 + levelBoost + node.priority / 100,
    }
  })
  const max = Math.max(1, Math.min(taxonomyNodes.length, Math.trunc(input.limit ?? 24)))
  return scored
    .sort((a, b) => b.score - a.score || b.node.priority - a.node.priority || a.node.taxonomyNodeId.localeCompare(b.node.taxonomyNodeId))
    .slice(0, max)
    .map(({ node }) => taxonomyCandidate(node))
}

export function lintEncyclopediaTaxonomy(): EncyclopediaTaxonomyLintFinding[] {
  const findings: EncyclopediaTaxonomyLintFinding[] = []
  const l1Count = new Set(taxonomyNodes.filter(node => node.level === 'L2').map(node => node.l1)).size
  const l2Count = taxonomyNodes.filter(node => node.level === 'L2').length
  if (l1Count !== ENCYCLOPEDIA_TAXONOMY_DECLARED_L1_COUNT) {
    findings.push({
      code: 'l1_count_mismatch',
      severity: 'error',
      message: `Taxonomy declares ${ENCYCLOPEDIA_TAXONOMY_DECLARED_L1_COUNT} L1 categories but registers ${l1Count}.`,
    })
  }
  if (l2Count !== ENCYCLOPEDIA_TAXONOMY_DECLARED_L2_COUNT) {
    findings.push({
      code: 'l2_count_mismatch',
      severity: 'warning',
      message: `Source document declares ${ENCYCLOPEDIA_TAXONOMY_DECLARED_L2_COUNT} L2 categories but its tables register ${l2Count}; reconcile the missing three categories before marking CAP-12 complete.`,
    })
  }
  const ids = new Set<string>()
  for (const node of taxonomyNodes) {
    if (ids.has(node.taxonomyNodeId)) {
      findings.push({ code: 'duplicate_node_id', severity: 'error', message: `Duplicate taxonomy node id: ${node.taxonomyNodeId}.` })
    }
    ids.add(node.taxonomyNodeId)
    if (node.level === 'L3' && !taxonomyNodes.some(parent => parent.level === 'L2' && parent.l1 === node.l1 && parent.l2 === node.l2)) {
      findings.push({ code: 'missing_parent_category', severity: 'error', message: `L3 taxonomy node ${node.taxonomyNodeId} has no L2 parent.` })
    }
  }
  return findings
}

function l2(
  id: string,
  l1: string,
  l2Name: string,
  aliases: string[],
  signals: string[],
  templates: string[],
  paradigms: string[],
  risks: string[],
): EncyclopediaTaxonomyNode {
  return taxonomyNode(id, 'L2', l1, l2Name, '待细分', aliases, signals, templates, paradigms, risks, 50)
}

function l3(
  id: string,
  l1: string,
  l2Name: string,
  l3Name: string,
  aliases: string[],
  signals: string[],
  templates: string[],
  paradigms: string[],
  risks: string[],
): EncyclopediaTaxonomyNode {
  return taxonomyNode(id, 'L3', l1, l2Name, l3Name, aliases, signals, templates, paradigms, risks, 60)
}

function taxonomyNode(
  id: string,
  level: 'L2' | 'L3',
  l1: string,
  l2Name: string,
  l3Name: string,
  aliases: string[],
  signals: string[],
  templates: string[],
  paradigms: string[],
  risks: string[],
  priority: number,
): EncyclopediaTaxonomyNode {
  return {
    taxonomyNodeId: `tax_${id}`,
    level,
    l1,
    l2: l2Name,
    l3: l3Name,
    aliases,
    positiveSignals: signals,
    negativeSignals: [],
    compatibleTemplatePackIds: templates,
    compatibleInteractionParadigmIds: paradigms,
    compatiblePrimaryIntentIds: primaryIntentIdsForTaxonomyCategory(l1, l2Name),
    riskFlags: risks,
    priority,
  }
}

function taxonomyCandidate(node: EncyclopediaTaxonomyNode): EncyclopediaGuidanceTaxonomyCandidate {
  const { level: _level, priority: _priority, ...candidate } = node
  return {
    ...candidate,
    aliases: [...candidate.aliases],
    positiveSignals: [...candidate.positiveSignals],
    negativeSignals: [...candidate.negativeSignals],
    compatibleTemplatePackIds: [...candidate.compatibleTemplatePackIds],
    compatibleInteractionParadigmIds: [...candidate.compatibleInteractionParadigmIds],
    compatiblePrimaryIntentIds: [...(candidate.compatiblePrimaryIntentIds ?? [])],
    riskFlags: [...candidate.riskFlags],
  }
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}
