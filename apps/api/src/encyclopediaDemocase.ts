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
    summary: '企业型知识服务词条通常先展示身份摘要、核心业务、关键事实，再补充发展节点。',
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
    summary: '当词条强调企业阶段、里程碑和演进过程时，时间线结构优先。',
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
    summary: '知识术语词条优先展示定义、适用范围、关键要点；当包含区别、对比或辨析信号时，可使用对比卡或可展开事实卡。',
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
    summary: '游戏词条常需要展示发行时间、平台、版本更新、玩法和角色关系。',
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
