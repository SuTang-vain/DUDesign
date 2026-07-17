export const ENCYCLOPEDIA_PRIMARY_INTENT_IDS = [
  'historical_event_exploration',
  'biography_and_works',
  'cast_and_series_navigation',
  'character_relationship_exploration',
  'format_and_cast_overview',
  'chapter_and_work_navigation',
  'gameplay_and_version_overview',
  'origin_and_customs',
  'route_and_poi_guidance',
  'city_fact_overview',
  'company_development_overview',
  'campus_and_discipline_overview',
  'concept_and_mechanism_explanation',
  'technical_mechanism_explanation',
  'medical_education_overview',
  'origin_and_characteristics',
  'specification_comparison',
  'species_identification',
  'music_work_background',
] as const

export type EncyclopediaPrimaryIntentId = typeof ENCYCLOPEDIA_PRIMARY_INTENT_IDS[number]

const categoryIntentIds: Record<string, EncyclopediaPrimaryIntentId> = {
  '名人/历史人物': 'historical_event_exploration',
  '名人/娱乐明星': 'biography_and_works',
  '影视作品/电影': 'cast_and_series_navigation',
  '影视作品/电视剧': 'character_relationship_exploration',
  '影视作品/综艺节目': 'format_and_cast_overview',
  '文学著作/图书': 'chapter_and_work_navigation',
  '游戏/电子游戏': 'gameplay_and_version_overview',
  '文化活动/节日庆典': 'origin_and_customs',
  '地域建筑/景区景点': 'route_and_poi_guidance',
  '地域建筑/城市': 'city_fact_overview',
  '机构组织/企业公司': 'company_development_overview',
  '机构组织/学校教育': 'campus_and_discipline_overview',
  '知识术语/自然科学': 'concept_and_mechanism_explanation',
  '知识术语/工程技术': 'technical_mechanism_explanation',
  '知识术语/医学健康': 'medical_education_overview',
  '物品产品/食品': 'origin_and_characteristics',
  '物品产品/消费品': 'specification_comparison',
  '物品产品/植物': 'species_identification',
  '物品产品/动物': 'species_identification',
  '音乐作品/音乐': 'music_work_background',
}

export function primaryIntentIdsForTaxonomyCategory(l1: string, l2: string): EncyclopediaPrimaryIntentId[] {
  const exact = categoryIntentIds[`${l1}/${l2}`]
  if (exact) return [exact]
  if (l1 === '名人') return ['biography_and_works']
  if (l1 === '影视作品') return ['cast_and_series_navigation']
  if (l1 === '文学著作') return ['chapter_and_work_navigation']
  if (l1 === '游戏') return ['gameplay_and_version_overview']
  if (l1 === '文化活动') return ['origin_and_customs']
  if (l1 === '地域建筑') return ['city_fact_overview']
  if (l1 === '机构组织') return ['company_development_overview']
  if (l1 === '知识术语') return ['concept_and_mechanism_explanation']
  if (l1 === '物品产品') return ['specification_comparison']
  if (l1 === '音乐作品') return ['music_work_background']
  return ['concept_and_mechanism_explanation']
}
