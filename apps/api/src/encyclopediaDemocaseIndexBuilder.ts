import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'parse5'
import type {
  EncyclopediaDemocaseDominantStage,
  EncyclopediaDemocaseExperienceProfile,
} from '@dudesign/contracts'
import {
  ENCYCLOPEDIA_DEMOCASE_INDEX_SCHEMA_VERSION,
  type EncyclopediaDemocaseIndex,
  type EncyclopediaIndexedDemocase,
} from './encyclopediaDemocaseIndex.js'
import { findEncyclopediaTaxonomyNode } from './encyclopediaTaxonomy.js'

type HtmlNode = {
  tagName?: string
  nodeName?: string
  value?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: HtmlNode[]
}

export async function buildEncyclopediaDemocaseIndex(rootDir: string): Promise<EncyclopediaDemocaseIndex> {
  const absoluteRoot = resolve(rootDir)
  const files = await walkFiles(absoluteRoot)
  const htmlFiles = files.filter(file => /\.html?$/i.test(file)).sort()
  const records: EncyclopediaIndexedDemocase[] = []
  for (const htmlFile of htmlFiles) {
    records.push(await buildRecord(absoluteRoot, htmlFile))
  }
  const indexHash = createHash('sha256')
    .update(JSON.stringify(records))
    .digest('hex')
    .slice(0, 16)
  return {
    schemaVersion: ENCYCLOPEDIA_DEMOCASE_INDEX_SCHEMA_VERSION,
    indexVersion: `2026-07-16.real-case.${indexHash}`,
    sourceLabel: 'case垂类分类',
    records,
  }
}

export async function writeEncyclopediaDemocaseIndexModule(index: EncyclopediaDemocaseIndex, outputFile: string): Promise<void> {
  const source = [
    "import type { EncyclopediaDemocaseIndex } from '../encyclopediaDemocaseIndex.js'",
    '',
    `export const REAL_ENCYCLOPEDIA_DEMOCASE_INDEX: EncyclopediaDemocaseIndex = ${JSON.stringify(index, null, 2)}`,
    '',
  ].join('\n')
  await writeFile(outputFile, source, 'utf8')
}

async function buildRecord(rootDir: string, htmlFile: string): Promise<EncyclopediaIndexedDemocase> {
  const html = await readFile(htmlFile, 'utf8')
  const document = parse(html) as unknown as HtmlNode
  const relativeHtmlPath = portablePath(relative(rootDir, htmlFile))
  const sourceCategory = relativeHtmlPath.split('/')[0] ?? '未分类'
  const title = extractTitle(document) || cleanEntryTitle(basename(dirname(htmlFile)))
  const entryTitle = cleanEntryTitle(basename(dirname(htmlFile)) === '代理模式' || basename(dirname(htmlFile)) === '龙井茶'
    ? basename(dirname(htmlFile))
    : basename(dirname(htmlFile)))
  const classNames = extractClassNames(document)
  const textHints = `${sourceCategory} ${title} ${entryTitle} ${classNames.join(' ')}`
  const taxonomy = classifyCase(sourceCategory, textHints)
  const structuralFeatures = detectStructuralFeatures(sourceCategory, html, classNames)
  const experienceProfile = buildExperienceProfile(sourceCategory, structuralFeatures)
  const interactionParadigmIds = interactionParadigms(structuralFeatures, taxonomy.secondaryCategory)
  const preferredTemplatePackIds = templatePackIds(taxonomy.taxonomyNodeId, structuralFeatures)
  const caseFiles = await walkFiles(dirname(htmlFile))
  const assetSummary = summarizeAssets(caseFiles)
  const keywords = caseKeywords(sourceCategory, title, entryTitle, structuralFeatures, caseFiles)
  return {
    schemaVersion: ENCYCLOPEDIA_DEMOCASE_INDEX_SCHEMA_VERSION,
    caseId: `case_${createHash('sha256').update(relativeHtmlPath).digest('hex').slice(0, 16)}`,
    sourceCategory,
    title,
    entryTitle,
    relativeHtmlPath,
    taxonomyNodeId: taxonomy.taxonomyNodeId,
    primaryCategory: taxonomy.primaryCategory,
    secondaryCategory: taxonomy.secondaryCategory,
    tertiaryCategory: taxonomy.tertiaryCategory,
    interactionParadigmIds,
    preferredTemplatePackIds,
    keywords,
    structuralFeatures,
    experienceProfile,
    assetSummary,
    structuralSummary: `${sourceCategory} case；主舞台：${experienceProfile.dominantStage}；首屏：${experienceProfile.firstViewPromise}；交互结构：${structuralFeatures.join('、') || '摘要展示'}；资产：${assetSummary.imageCount} 张图片、${assetSummary.documentCount} 个文档、${assetSummary.dataFileCount} 个数据文件。`,
    contentHash: createHash('sha256').update(html).digest('hex'),
  }
}

function buildExperienceProfile(
  sourceCategory: string,
  features: string[],
): EncyclopediaDemocaseExperienceProfile {
  const dominantStage = dominantStageForCase(sourceCategory, features)
  const commonForbidden = [
    'dashboard or KPI composition',
    'equal-weight module grid',
    'simultaneous summary, timeline, relation, and comparison surfaces',
    'duplicate controls for the same action',
    'secondary metadata competing with the primary interaction',
  ]
  if (dominantStage === 'relation_map') {
    return {
      dominantStage,
      firstViewPromise: 'Show the topic identity, one bounded relationship map, and one selected relationship detail.',
      primaryInteraction: 'Select a visible node or one relationship filter and update the same bounded detail surface.',
      secondaryReveal: 'Move biographies, sources, additional nodes, and long relationship explanations behind node selection or one local detail reveal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 12, maxVisibleItems: 6 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 5, maxPrimaryTabs: 3, maxVisibleItems: 3, maxTextCharacters: 320 },
      },
      preserveAt300x360: ['topic title', 'one compact relationship selector with up to three choices', 'selected relationship label', 'one short selected detail'],
      deferAt300x360: ['remaining nodes', 'source list', 'long biography', 'secondary filters', 'decorative legends', 'a second relationship navigation row'],
      forbiddenPatterns: [...commonForbidden, 'relationship graph plus a separate fact-card dashboard', 'tab row and node row both acting as primary navigation', 'a second toolbar below the graph'],
    }
  }
  if (dominantStage === 'timeline_story') {
    return {
      dominantStage,
      firstViewPromise: 'Show the topic identity, one active phase, and a compact phase-switching path.',
      primaryInteraction: 'Switch the active phase or unlock the next milestone while keeping one event detail in focus.',
      secondaryReveal: 'Keep causes, outcomes, sources, and later milestones behind the phase switcher or one detail reveal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 8, maxVisibleItems: 5 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 2, maxTextCharacters: 300 },
      },
      preserveAt300x360: ['topic title', 'active phase label', 'one core event fact', 'one compact phase switcher with up to three choices'],
      deferAt300x360: ['inactive event bodies', 'full chronology', 'source notes', 'relationship sidebars', 'repeated phase summaries', 'a duplicate phase toolbar'],
      forbiddenPatterns: [...commonForbidden, 'all milestones expanded at once', 'duplicate phase navigation in multiple regions'],
    }
  }
  if (dominantStage === 'fact_compare') {
    return {
      dominantStage,
      firstViewPromise: 'Show one comparison question, one active dimension, and the clearest shared or differing observation.',
      primaryInteraction: 'Switch one comparison dimension and update the same two-sided or staged comparison surface.',
      secondaryReveal: 'Keep definitions, examples, sources, and additional dimensions behind the dimension selector or one detail reveal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 8, maxVisibleItems: 3 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 2, maxTextCharacters: 300 },
      },
      preserveAt300x360: ['comparison title', 'two compared entities', 'one active dimension', 'one concise conclusion', 'one compact dimension selector'],
      deferAt300x360: ['additional dimensions', 'long examples', 'source notes', 'fact-tile rows', 'repeated conclusions', 'separate target and view tab rows'],
      forbiddenPatterns: [...commonForbidden, 'comparison dashboard made of equal-weight fact tiles', 'independent action button on every comparison side'],
    }
  }
  if (dominantStage === 'route_guide') {
    return {
      dominantStage,
      firstViewPromise: 'Show the place identity, one bounded route or map stage, and the currently selected stop or POI.',
      primaryInteraction: 'Select a stop or POI and update one shared detail surface without leaving the card.',
      secondaryReveal: 'Keep remaining stops, route notes, coordinate status, and supporting descriptions behind paging or local detail states.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 12, maxVisibleItems: 6 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 5, maxPrimaryTabs: 3, maxVisibleItems: 3, maxTextCharacters: 320 },
      },
      preserveAt300x360: ['place title', 'up to three stops or POIs', 'selected location name', 'one short visit cue'],
      deferAt300x360: ['remaining locations', 'coordinate metadata', 'long route description', 'secondary route modes', 'decorative map labels'],
      forbiddenPatterns: [...commonForbidden, 'route stage plus a separate attraction-card grid', 'external navigation as the primary action'],
    }
  }
  if (dominantStage === 'progressive_disclosure') {
    return {
      dominantStage,
      firstViewPromise: 'Show one concise topic answer and one visibly expanded fact group.',
      primaryInteraction: 'Open one fact group at a time or switch one compact fact category.',
      secondaryReveal: 'Keep examples, sources, and related facts inside collapsed local sections or one bounded modal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 7, maxVisibleItems: 4 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 1, maxTextCharacters: 320 },
      },
      preserveAt300x360: ['topic title', 'one-sentence answer', 'one expanded fact', 'one clear next disclosure control'],
      deferAt300x360: ['inactive fact bodies', 'related links', 'source list', 'long examples', 'article-style prose', 'duplicate accordion and tab navigation'],
      forbiddenPatterns: [...commonForbidden, 'accordion toggles and tabs duplicating the same choices', 'all accordion bodies expanded together', 'FAQ wall or long article composition'],
    }
  }
  return {
    dominantStage: 'entity_summary',
    firstViewPromise: 'Show one topic identity, one neutral summary, and one selected fact group.',
    primaryInteraction: 'Switch a compact fact group or reveal one bounded supporting detail.',
    secondaryReveal: 'Keep additional facts, sources, and related material behind the selected fact group.',
    attentionBudget: {
      desktop: { maxControlGroups: 2, maxVisibleControls: 6, maxVisibleItems: 3 },
      extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 2, maxTextCharacters: 300 },
    },
    preserveAt300x360: ['topic title', 'one neutral summary', 'up to two core facts', 'one compact fact-group switcher'],
    deferAt300x360: ['remaining facts', 'source rows', 'related topics', 'metadata chips', 'decorative labels'],
    forbiddenPatterns: commonForbidden,
  }
}

function dominantStageForCase(
  sourceCategory: string,
  features: string[],
): EncyclopediaDemocaseDominantStage {
  if (sourceCategory === '景区景点' || features.includes('route_guide')) return 'route_guide'
  if (sourceCategory === '对比辨析参考' || features.includes('comparison')) return 'fact_compare'
  if (sourceCategory === '关系图谱参考') return 'relation_map'
  if (sourceCategory === '时间线参考' || sourceCategory === '历史人物') return 'timeline_story'
  if (sourceCategory === '展开事实参考' || features.includes('expandable_facts')) return 'progressive_disclosure'
  if (features.includes('relation_graph')) return 'relation_map'
  if (features.includes('timeline')) return 'timeline_story'
  return 'entity_summary'
}

function classifyCase(sourceCategory: string, text: string): {
  taxonomyNodeId: string
  primaryCategory: string
  secondaryCategory: string
  tertiaryCategory: string
} {
  const normalized = text.toLowerCase()
  let categories: [string, string, string]
  if (sourceCategory === '历史人物' || sourceCategory === '时间线参考' || /奢香夫人|孙綝|鲁肃|黄月英|郭松龄|王皇后|岑参/.test(text)) {
    categories = ['名人', '历史人物', '历史人物概况']
  } else if (sourceCategory === '文化类词语' || /关联词|诗词解析|明修栈道|纸上谈兵|管中窥豹|高处不胜寒|挟天子/.test(text)) {
    categories = ['知识术语', '社会科学', '文化类词语']
  } else if (sourceCategory === '景区景点') {
    categories = ['地域建筑', '景区景点', '导览路线']
  } else if (sourceCategory === '电影电视剧' || /剧情|角色|大话西游|国色芳华/.test(text)) {
    categories = /影片|院线|电影版|大话西游/.test(text.replace(sourceCategory, ''))
      ? ['影视作品', '电影', '电影作品概况']
      : ['影视作品', '电视剧', '古装历史剧']
  } else if (sourceCategory === '对比辨析参考' && /蜂|鸟|鱼|猫|鳡|物种|科/.test(text)) {
    categories = ['物品产品', '动物', '动物物种']
  } else if (/龙井|茶/.test(text)) {
    categories = ['物品产品', '食品', '地方特产']
  } else if (/代理模式|proxy|软件|模式/.test(normalized)) {
    categories = ['知识术语', '工程技术', '软件设计模式']
  } else {
    categories = ['知识术语', '工程技术', '待细分']
  }
  const node = findEncyclopediaTaxonomyNode(categories[0], categories[1], categories[2])
    ?? findEncyclopediaTaxonomyNode(categories[0], categories[1])
  return {
    taxonomyNodeId: node?.taxonomyNodeId ?? 'tax_knowledge_engineering',
    primaryCategory: categories[0],
    secondaryCategory: categories[1],
    tertiaryCategory: categories[2],
  }
}

function detectStructuralFeatures(sourceCategory: string, html: string, classes: string[]): string[] {
  const classHaystack = classes.join(' ').toLowerCase()
  const semanticHaystack = `${sourceCategory} ${html.slice(0, 3000)}`.toLowerCase()
  const features: string[] = []
  addFeature(features, 'timeline', sourceCategory === '时间线参考' || sourceCategory === '历史人物' || /timeline/.test(classHaystack) || /时间线|因果链/.test(semanticHaystack))
  addFeature(features, 'relation_graph', sourceCategory === '关系图谱参考' || /relation|graph/.test(classHaystack) || /人物关系|关系图谱|关系网/.test(semanticHaystack))
  addFeature(features, 'comparison', sourceCategory === '对比辨析参考' || /compare|comparison|pose-tab/.test(classHaystack) || /对比|辨析/.test(semanticHaystack))
  addFeature(features, 'tabs', /tab-bar|tab-nav|tab-btn|tab-item|module-tabs|pose-tabs|works-tabs/.test(classHaystack))
  addFeature(features, 'modal', /modal-overlay|modal-content|whatif-modal/.test(classHaystack))
  addFeature(features, 'route_guide', sourceCategory === '景区景点' || /route(?:-|_)|poi|map-schematic/.test(classHaystack))
  addFeature(features, 'expandable_facts', sourceCategory === '展开事实参考' || /accordion|expand|details-panel/.test(classHaystack) || /<details\b/i.test(html.slice(0, 120000)))
  addFeature(features, 'image_hotspots', /hotspot|map-marker|poi-marker/.test(classHaystack))
  return features
}

function interactionParadigms(features: string[], secondaryCategory: string): string[] {
  const ids: string[] = []
  if (features.includes('route_guide')) ids.push('ip_route_guide')
  if (features.includes('relation_graph')) ids.push('ip_relation_map')
  if (features.includes('timeline')) ids.push(secondaryCategory === '电视剧' ? 'ip_causal_event_chain' : 'ip_timeline_story')
  if (features.includes('comparison')) ids.push('ip_fact_compare')
  if (features.includes('expandable_facts') || features.includes('modal')) ids.push('ip_expandable_facts')
  if (ids.length === 0) ids.push('ip_entity_summary')
  return [...new Set(ids)]
}

function templatePackIds(taxonomyNodeId: string, features: string[]): string[] {
  if (taxonomyNodeId === 'tax_celebrity_historical') return ['dtp_de_history_person_event_chain', 'dtp_de_history_person_relationship', 'dtp_dynamic_encyclopedia_summary_card']
  if (taxonomyNodeId === 'tax_screen_tv' || taxonomyNodeId === 'tax_tv_historical') return ['dtp_de_tv_character_relation', 'dtp_de_tv_episode_chain', 'dtp_dynamic_encyclopedia_summary_card']
  if (taxonomyNodeId === 'tax_screen_film') return ['dtp_de_film_cast_role_network', 'dtp_de_film_series_navigation', 'dtp_dynamic_encyclopedia_summary_card']
  if (taxonomyNodeId === 'tax_cultural_phrase') return ['dtp_de_cultural_phrase_relation_graph', 'dtp_de_cultural_phrase_origin_story', 'dtp_dynamic_encyclopedia_compare_card']
  if (taxonomyNodeId === 'tax_geo_scenic' || taxonomyNodeId === 'tax_scenic_route') return ['dtp_de_scenic_spot_route_guide', 'dtp_de_scenic_spot_map_poi', 'dtp_dynamic_encyclopedia_summary_card']
  if (features.includes('comparison')) return ['dtp_dynamic_encyclopedia_compare_card', 'dtp_dynamic_encyclopedia_expandable_card']
  if (features.includes('expandable_facts')) return ['dtp_dynamic_encyclopedia_expandable_card', 'dtp_dynamic_encyclopedia_summary_card']
  return ['dtp_dynamic_encyclopedia_summary_card']
}

function summarizeAssets(files: string[]) {
  const extensions: Record<string, number> = {}
  const namedGroups = new Set<string>()
  let imageCount = 0
  let documentCount = 0
  let dataFileCount = 0
  for (const file of files) {
    const extension = extname(file).toLowerCase() || '[no-ext]'
    extensions[extension] = (extensions[extension] ?? 0) + 1
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(extension)) imageCount += 1
    if (/\.(docx?|pdf|md)$/i.test(extension)) documentCount += 1
    if (/\.(json|txt|csv|ya?ml)$/i.test(extension)) dataFileCount += 1
    const group = basename(file).split(/[_\-]/)[0]?.replace(/\.[^.]+$/, '').trim()
    if (group && group.length <= 12 && !/^index(?:\s*\d+)?$/i.test(group)) namedGroups.add(group)
  }
  return {
    totalFiles: files.length,
    imageCount,
    documentCount,
    dataFileCount,
    extensions: Object.fromEntries(Object.entries(extensions).sort(([a], [b]) => a.localeCompare(b))),
    namedGroups: [...namedGroups].sort().slice(0, 20),
  }
}

function caseKeywords(sourceCategory: string, title: string, entryTitle: string, features: string[], files: string[]): string[] {
  const values = [sourceCategory, title, entryTitle, ...features]
  for (const file of files) {
    const stem = basename(file).replace(/\.[^.]+$/, '')
    const group = stem.split(/[_\-]/)[0]?.trim()
    if (group && group.length <= 16) values.push(group)
  }
  return [...new Set(values.map(value => value.normalize('NFKC').trim()).filter(Boolean))].slice(0, 40)
}

function extractTitle(document: HtmlNode): string {
  const titleNode = findNode(document, node => node.tagName === 'title')
  return textContent(titleNode).replace(/\s+/g, ' ').trim()
}

function extractClassNames(document: HtmlNode): string[] {
  const classes = new Set<string>()
  visit(document, node => {
    const value = node.attrs?.find(attribute => attribute.name === 'class')?.value
    value?.split(/\s+/).filter(Boolean).forEach(name => classes.add(name))
  })
  return [...classes]
}

function cleanEntryTitle(value: string): string {
  const quotedTitle = value.match(/^《([^》]+)》/u)?.[1]
  if (quotedTitle) return quotedTitle.trim()
  return value
    .replace(/_v\d+$/i, '')
    .replace(/^点击解锁/, '')
    .replace(/[：:_・].*?(人物关系|剧情|核心事件|五大事件|关联词|诗词解析|导览|路线|因果链).*$/u, '')
    .replace(/(人物图谱|人物关系与剧情|核心事件因果链|五大事件与人物关系).*$/u, '')
    .replace(/(关联词详解|导览及路线推荐|因果链)$/u, '')
    .trim()
}

function findNode(node: HtmlNode | undefined, predicate: (candidate: HtmlNode) => boolean): HtmlNode | undefined {
  if (!node) return undefined
  if (predicate(node)) return node
  for (const child of node.childNodes ?? []) {
    const result = findNode(child, predicate)
    if (result) return result
  }
  return undefined
}

function visit(node: HtmlNode, visitor: (candidate: HtmlNode) => void): void {
  visitor(node)
  for (const child of node.childNodes ?? []) visit(child, visitor)
}

function textContent(node: HtmlNode | undefined): string {
  if (!node) return ''
  return `${node.value ?? ''}${(node.childNodes ?? []).map(textContent).join('')}`
}

function addFeature(features: string[], feature: string, enabled: boolean): void {
  if (enabled && !features.includes(feature)) features.push(feature)
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function portablePath(value: string): string {
  return sep === '/' ? value : value.split(sep).join('/')
}

async function main(): Promise<void> {
  const rootDir = process.argv[2] ?? process.env.DUDESIGN_ENCYCLOPEDIA_CASE_ROOT
  const outputFile = process.argv[3]
    ?? process.env.DUDESIGN_ENCYCLOPEDIA_CASE_INDEX_OUTPUT
    ?? resolve(dirname(fileURLToPath(import.meta.url)), '../src/fixtures/encyclopediaDemocaseIndex.generated.ts')
  if (!rootDir) throw new Error('Pass the case root as argv[2] or DUDESIGN_ENCYCLOPEDIA_CASE_ROOT.')
  const index = await buildEncyclopediaDemocaseIndex(rootDir)
  await writeEncyclopediaDemocaseIndexModule(index, outputFile)
  process.stdout.write(`${index.records.length} cases -> ${outputFile} (${index.indexVersion})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
