import type { EncyclopediaClassificationVector } from '@dudesign/contracts'
import type { EntryContentLanguage } from '@dudesign/domain'

/**
 * 动态百科规范审查。
 *
 * 责任边界：仅做静态 + 模板规则层面的事实检查（HTML 结构、模板契约）。
 * 不做 LLM 风格审查（Phase 2，see dynamic-encyclopedia-card-business-logic-plan §12.3）。
 *
 * "硬性归束"两阶段发布策略（2026-07-08+）：
 *   - Stage 1 (warning)：新规则先以 warning 形态产出，status 仍可能为 pass/warn。
 *     目的：收集真实分布，避免误伤存量生成结果。
 *   - Stage 2 (error)  ：规则成熟后升级为 error，触发 loop repair。
 *     入口：调整 `ENFORCEMENT` 表中的 severity 即可，调用方无需改代码。
 *
 * 当前阶段（2026-07-08）：所有"硬性归束"新规则以 warning 形态生效，
 * 旧的 10 条规则保持原 severity 不变。
 */

export type EncyclopediaSpecFinding = {
  id: string
  source: 'static_rule' | 'template_rule' | 'pixel_gate'
  severity: 'error' | 'warning'
  message: string
  repairHint: string
}

export type EncyclopediaSpecReviewInput = {
  html: string
  templatePackIds: string[]
  interactionParadigmId?: string | null
  /** 词条名，用于"专有名词保留原文"的判定豁免。 */
  entryTitle?: string | null
  /** 是否为语言类词条。true 时豁免"中文优先"硬约束。 */
  isLanguageCategory?: boolean
  /** 词条正文预期语种，仅用于诊断日志，不影响判定。 */
  entryContentLanguage?: EntryContentLanguage
  /** 词条分类向量，用于垂类规范审查。 */
  classificationVector?: EncyclopediaClassificationVector | null
}

export type EncyclopediaSpecReviewReport = {
  status: 'pass' | 'warn' | 'fail'
  findings: EncyclopediaSpecFinding[]
}

/**
 * 规则登记表。每个 finding 的 id 决定其归属类别，severity 由本表统一控制。
 * 升级到 Stage 2 时，只需把对应 id 的 severity 从 'warning' 改为 'error'。
 */
const ENFORCEMENT: Record<string, 'error' | 'warning' | 'disabled'> = {
  // 既有规则：保留原 severity（Stage 0）
  'encyclopedia.viewport_meta_missing': 'error',
  'encyclopedia.external_script_blocked': 'error',
  'encyclopedia.scroll_container_missing': 'error', // 旧"无 scroll-container 报错"——Stage 1 调整见下
  'encyclopedia.global_touch_blocked': 'error',
  'encyclopedia.touch_intercept_risk': 'warning',
  'encyclopedia.required_content_missing': 'warning',
  'encyclopedia.primary_interaction_missing': 'warning',
  'encyclopedia.marketing_pattern_risk': 'warning',
  'encyclopedia.neutral_tone_risk': 'warning',
  'encyclopedia.timeline_template_mismatch': 'error',
  'encyclopedia.member_template_mismatch': 'warning',
  'encyclopedia.relation_template_mismatch': 'warning',
  'encyclopedia.compare_template_mismatch': 'warning',
  'encyclopedia.expandable_template_mismatch': 'warning',

  // Stage 1 新增（warning 形态）：禁内部滚动（取代旧的 scroll_container_missing）
  'encyclopedia.no_scroll_frame_required': 'warning',
  'encyclopedia.overflow_scroll_blocked': 'warning',
  'encyclopedia.scroll_container_class_blocked': 'warning',

  // Stage 1 新增（warning 形态）：中文优先 + 限制英文 UI 短语
  'encyclopedia.chinese_only_required': 'warning',
  'encyclopedia.english_ui_phrase_blocked': 'warning',
  'encyclopedia.excessive_english_phrases': 'warning',
  'encyclopedia.unsupported_script_blocked': 'warning',
  'encyclopedia.fake_tab_interaction': 'warning',
  'encyclopedia.fake_page_switcher_interaction': 'warning',
  'encyclopedia.fake_modal_interaction': 'warning',

  // Stage 1 新增（warning 形态）：垂类业务规则
  'encyclopedia.media_resource_link_blocked': 'warning',
  'encyclopedia.media_fact_source_required': 'warning',
  'encyclopedia.tv_episode_fabrication_risk': 'warning',
  'encyclopedia.spoiler_control_required': 'warning',
  'encyclopedia.history_relation_source_required': 'warning',
  'encyclopedia.history_event_chain_required': 'warning',
  'encyclopedia.cultural_origin_source_required': 'warning',
  'encyclopedia.related_phrase_type_required': 'warning',
}

export function reviewDynamicEncyclopediaSpec(input: EncyclopediaSpecReviewInput): EncyclopediaSpecReviewReport {
  const html = input.html
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html
  const text = stripHtml(body)
  const entryTitle = input.entryTitle ?? null
  const isLanguageCategory = input.isLanguageCategory === true
  const findings: EncyclopediaSpecFinding[] = []

  // -------- Stage 0: 既有规则（保留原语义） --------
  addFindingIf(findings, !/<meta\b[^>]*name=["']viewport["']/i.test(html), {
    id: 'encyclopedia.viewport_meta_missing',
    source: 'static_rule',
    severity: severityOf('encyclopedia.viewport_meta_missing'),
    message: 'Dynamic encyclopedia cards must include a viewport meta tag for mobile iframe rendering.',
    repairHint: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> in the document head.',
  })
  addFindingIf(findings, /<script\b[^>]*\bsrc=["'][^"']+["']/i.test(html), {
    id: 'encyclopedia.external_script_blocked',
    source: 'static_rule',
    severity: severityOf('encyclopedia.external_script_blocked'),
    message: 'Dynamic encyclopedia cards cannot rely on external script files.',
    repairHint: 'Remove external script tags and implement any small interaction with inline, self-contained JavaScript or CSS-only states.',
  })

  // Stage 1: 旧的 "scroll_container_missing" 升级为 "no_scroll_frame_required"。
  // 旧规则要求存在 .scroll-container；新硬约束要求存在 overflow:hidden / no-scroll-frame。
  // 旧规则的 id 保留但修复条件翻转，避免历史 audit 数据与新规则混淆。
  addFindingIf(findings, !/overflow\s*:\s*hidden|class=["'][^"']*no-scroll-frame/i.test(html), {
    id: 'encyclopedia.no_scroll_frame_required',
    source: 'static_rule',
    severity: severityOf('encyclopedia.no_scroll_frame_required'),
    message: 'Dynamic encyclopedia cards must declare a non-scrolling frame (overflow:hidden / .no-scroll-frame) and route overflow content through tab bars, page switchers, or modal dialogs.',
    repairHint: 'Set html, body { height: <PC 788×492 or WISE 380×456>; overflow: hidden; } and wrap content in .no-scroll-frame. Use tab-bar / page-switcher / modal for overflow.',
  })
  // 旧 id 保留但默认 disabled（保持历史记录可读）
  if (!isDisabled('encyclopedia.scroll_container_missing')) {
    addFindingIf(findings, false, {
      id: 'encyclopedia.scroll_container_missing',
      source: 'static_rule',
      severity: severityOf('encyclopedia.scroll_container_missing'),
      message: '[legacy] Replaced by encyclopedia.no_scroll_frame_required.',
      repairHint: 'No action required; this rule was retired when no-scroll-frame became the contract.',
    })
  }

  addFindingIf(findings, hasGlobalTouchActionNone(html), {
    id: 'encyclopedia.global_touch_blocked',
    source: 'template_rule',
    severity: severityOf('encyclopedia.global_touch_blocked'),
    message: 'Dynamic encyclopedia cards must not globally disable touch gestures.',
    repairHint: 'Remove global touch-action:none and use touch-action:pan-x pan-y or local control-specific touch handling only.',
  })
  const scriptSourceForTouchRules = stripCommentsFromScriptBlocks(html)
  addFindingIf(findings, /\bpreventDefault\s*\([^)]*\)|\bstopPropagation\s*\([^)]*\)/i.test(scriptSourceForTouchRules) && /\btouch(move|start|end)\b/i.test(scriptSourceForTouchRules), {
    id: 'encyclopedia.touch_intercept_risk',
    source: 'template_rule',
    severity: severityOf('encyclopedia.touch_intercept_risk'),
    message: 'Touch event interception can break iframe scrolling and native page gestures.',
    repairHint: 'Allow normal touch scrolling; if event handling is needed, scope it to precise controls and do not intercept .scroll-container gestures.',
  })
  const hasTopicIdentity = /<h1\b|data-(?:topic|entry)-title|class=["'][^"']*(?:topic|entry)-(?:title|name)/i.test(body)
  const hasCuratedContent = /<(section|article)\b|class=["'][^"']*(?:timeline|relation|member|fact|compare|detail|story)/i.test(body)
  addFindingIf(findings, !hasTopicIdentity || !hasCuratedContent, {
    id: 'encyclopedia.required_content_missing',
    source: 'template_rule',
    severity: severityOf('encyclopedia.required_content_missing'),
    message: 'The artifact does not expose a recognizable topic identity and curated content structure.',
    repairHint: 'Add a clear topic title plus the selected template\'s primary timeline, relation, member, comparison, or progressive-detail surface. Do not fall back to a long encyclopedia article.',
  })
  addFindingIf(findings, !/<button\b|role=["'](?:button|tab)["']|<input\b|<select\b|<details\b/i.test(body), {
    id: 'encyclopedia.primary_interaction_missing',
    source: 'template_rule',
    severity: severityOf('encyclopedia.primary_interaction_missing'),
    message: 'The topic card does not expose a visible primary local interaction.',
    repairHint: 'Add one meaningful local interaction suited to the assigned template, such as member selection, phase switching, relation filtering, comparison switching, or progressive reveal.',
  })
  addFindingIf(findings, /class=["'][^"']*(?:proof-(?:row|block|pill)|testimonial|pricing|cta(?:-|_))/i.test(body)
    || /(客户见证|社会证明|立即注册|免费试用|价格方案|转化率)/i.test(text), {
    id: 'encyclopedia.marketing_pattern_risk',
    source: 'template_rule',
    severity: severityOf('encyclopedia.marketing_pattern_risk'),
    message: 'The topic card contains landing-page marketing or conversion patterns.',
    repairHint: 'Remove proof blocks, testimonials, CTA rhythms, pricing, signup, and conversion language. Use the space for the topic-specific primary interaction.',
  })
  const hasFactBoundary = /来源|官方|公开资料|待核实|待补充|资料不足|以.*为准/i.test(text)
  const strongPromotionalClaim = /全球第一|行业第一|国内第一|最佳|最强|顶级|领先全球|革命性|颠覆|震撼|必看|完美|无敌|权威认证/i.test(text)
  const unsupportedUniqueClaim = !hasFactBoundary && /唯一|首个/i.test(text)
  addFindingIf(findings, strongPromotionalClaim || unsupportedUniqueClaim, {
    id: 'encyclopedia.neutral_tone_risk',
    source: 'static_rule',
    severity: severityOf('encyclopedia.neutral_tone_risk'),
    message: 'Dynamic encyclopedia copy should avoid promotional or unverifiable superlative language.',
    repairHint: 'Rewrite marketing-like claims into neutral, attributable facts; keep subjective conclusions out of the card unless the source is shown.',
  })

  if (input.templatePackIds.includes('dtp_dynamic_encyclopedia_timeline_card')) {
    addFindingIf(findings, !/(时间线|发展|历程|阶段|里程碑|年份|上线|发布|成立)/i.test(text), {
      id: 'encyclopedia.timeline_template_mismatch',
      source: 'template_rule',
      severity: severityOf('encyclopedia.timeline_template_mismatch'),
      message: 'The selected timeline child template needs visible timeline or milestone content.',
      repairHint: 'Add a timeline section with dated or phased milestones; group sparse dates into phases rather than inventing exact dates.',
    })
  }

  if (input.templatePackIds.includes('dtp_de_star_group_member_map')) {
    addFindingIf(findings, !/(成员|member|组合|团体|关系)/i.test(text) || countMatches(body, /<button\b|role=["']button["']/gi) < 2, {
      id: 'encyclopedia.member_template_mismatch',
      source: 'template_rule',
      severity: severityOf('encyclopedia.member_template_mismatch'),
      message: 'The member-map child template needs a visible member selection surface with relationship context.',
      repairHint: 'Add at least two local member selectors and a bounded detail panel that explains the selected member\'s role in the group or relationship map.',
    })
  }

  if (input.templatePackIds.includes('dtp_dynamic_encyclopedia_relation_card')) {
    addFindingIf(findings, !/(关系|关联|关系图|网络|节点|relation|network)/i.test(text), {
      id: 'encyclopedia.relation_template_mismatch',
      source: 'template_rule',
      severity: severityOf('encyclopedia.relation_template_mismatch'),
      message: 'The relation child template needs visible relationship or network content.',
      repairHint: 'Add labeled relationship nodes or edges and one local relation filter/selection interaction; do not replace the graph with unrelated summary sections.',
    })
  }

  if (input.templatePackIds.includes('dtp_dynamic_encyclopedia_compare_card')) {
    addFindingIf(findings, !/(对比|比较|差异|相同|维度|矩阵|compare)/i.test(text), {
      id: 'encyclopedia.compare_template_mismatch',
      source: 'template_rule',
      severity: severityOf('encyclopedia.compare_template_mismatch'),
      message: 'The comparison child template needs a visible comparison dimension or difference surface.',
      repairHint: 'Add two or more comparable entities and explicit labeled dimensions or differences with a local switch/highlight interaction.',
    })
  }

  if (input.templatePackIds.includes('dtp_dynamic_encyclopedia_expandable_card')) {
    addFindingIf(findings, !/(展开|收起|详情|更多|事实|accordion|aria-expanded)/i.test(text), {
      id: 'encyclopedia.expandable_template_mismatch',
      source: 'template_rule',
      severity: severityOf('encyclopedia.expandable_template_mismatch'),
      message: 'The expandable child template needs a visible bounded progressive-disclosure surface.',
      repairHint: 'Add concise expandable fact sections with a local expanded state; keep the expanded content inside the fixed card without scrolling.',
    })
  }

  // -------- Stage 1: 新增硬性归束规则（首期 warning 形态） --------
  applyStage1NoScrollRules(findings, html)
  applyStage1InteractionRules(findings, html)
  applyStage1ChineseOnlyRules(findings, text, body, entryTitle, isLanguageCategory)
  applyStage1VerticalRules(findings, text, input.templatePackIds, input.classificationVector ?? null)

  const status = findings.some(finding => finding.severity === 'error')
    ? 'fail'
    : findings.length > 0
      ? 'warn'
      : 'pass'
  return { status, findings }
}

// ---------- Stage 1: 垂类业务规则 ----------
function applyStage1VerticalRules(
  findings: EncyclopediaSpecFinding[],
  text: string,
  templatePackIds: string[],
  classificationVector: EncyclopediaClassificationVector | null,
): void {
  const categoryText = classificationVector
    ? `${classificationVector.l1} ${classificationVector.l2} ${classificationVector.l3}`
    : ''
  const isMedia = categoryText.includes('影视作品')
    || categoryText.includes('电影')
    || categoryText.includes('电视剧')
    || templatePackIds.some(id => id.startsWith('dtp_de_film_') || id.startsWith('dtp_de_tv_'))
  const isTv = categoryText.includes('电视剧') || templatePackIds.some(id => id.startsWith('dtp_de_tv_'))
  const isHistoryPerson = categoryText.includes('历史人物') || templatePackIds.some(id => id.startsWith('dtp_de_history_person_'))
  const isCulturalPhrase = categoryText.includes('文化类词语') || templatePackIds.some(id => id.startsWith('dtp_de_cultural_phrase_'))
  const isScenicSpot = categoryText.includes('景区景点') || templatePackIds.some(id => id.startsWith('dtp_de_scenic_spot_'))

  if (isMedia) {
    addFindingIf(findings, hasMediaResourceEntryIntent(text), {
      id: 'encyclopedia.media_resource_link_blocked',
      source: 'template_rule',
      severity: severityOf('encyclopedia.media_resource_link_blocked'),
      message: 'Film/TV dynamic encyclopedia cards must not provide playback, download, netdisk, magnet, leak, or piracy-oriented resource entry points.',
      repairHint: 'Remove playback/download/resource-seeking copy. Keep the card focused on encyclopedia information such as cast, roles, series relation, plot structure, and lawful context.',
    })
    addFindingIf(findings, /(票房|评分|豆瓣|猫眼|上映|播出)/.test(text) && !/(来源|据|资料|公开信息|待核实|暂无|未知|资料不足)/.test(text), {
      id: 'encyclopedia.media_fact_source_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.media_fact_source_required'),
      message: 'Film/TV rating, box office, release, or broadcast facts need source or uncertainty wording.',
      repairHint: 'Add source/uncertainty hints such as "据公开资料 / 暂无可靠数据 / 资料不足"; do not invent rating, box office, release, or broadcast facts.',
    })
  }

  if (isTv) {
    addFindingIf(findings, /(第\s*\d+\s*集|集数|分集剧情|伏笔|回收|结局)/.test(text) && !/(资料不足|待核实|来源|公开资料|按已知剧情)/.test(text), {
      id: 'encyclopedia.tv_episode_fabrication_risk',
      source: 'template_rule',
      severity: severityOf('encyclopedia.tv_episode_fabrication_risk'),
      message: 'TV episode counts, episode plot nodes, foreshadowing, reveals, and endings are high hallucination-risk facts.',
      repairHint: 'Tie episode nodes to supplied context or mark missing data as "资料不足 / 待核实"; do not invent episode count, plot nodes, or ending explanations.',
    })
    addFindingIf(findings, /(结局|大结局|真相|凶手|反转|死亡|剧透)/.test(text) && !/(剧透|展开|确认|轻度|完整剧情|隐藏)/.test(text), {
      id: 'encyclopedia.spoiler_control_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.spoiler_control_required'),
      message: 'Spoiler-heavy TV content should be gated or clearly labeled.',
      repairHint: 'Add spoiler labels or local reveal controls before ending/truth/killer/reversal content.',
    })
  }

  if (isHistoryPerson) {
    addFindingIf(findings, /(父|母|妻|子|兄|弟|君臣|师承|对手|阵营|关系)/.test(text) && !/(来源|据|史料|资料|待核实|暂无|未知|资料不足)/.test(text), {
      id: 'encyclopedia.history_relation_source_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.history_relation_source_required'),
      message: 'Historical-person relationship claims need source, uncertainty, or missing-data wording.',
      repairHint: 'Add source/uncertainty hints for kinship, faction, mentorship, or rival relations; never leave relationship edges unlabeled or unsupported.',
    })
    addFindingIf(findings, templatePackIds.includes('dtp_de_history_person_event_chain') && !/(起因|经过|结果|影响|导致|引发|阶段|事件)/.test(text), {
      id: 'encyclopedia.history_event_chain_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.history_event_chain_required'),
      message: 'Historical-person event-chain templates need cause-process-result-impact structure.',
      repairHint: 'Add compact event nodes labeled 起因 / 经过 / 结果 / 影响, or switch to a relationship/summary template if event data is missing.',
    })
  }

  if (isCulturalPhrase) {
    addFindingIf(findings, /(出处|典故|故事|原文|寓意)/.test(text) && !/(来源|出自|据|原文|资料不足|暂无可靠出处|待核实)/.test(text), {
      id: 'encyclopedia.cultural_origin_source_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.cultural_origin_source_required'),
      message: 'Cultural phrase origin/story modules need source text, source work, or explicit missing-source wording.',
      repairHint: 'Show source work/original sentence when available; if not available, hide the origin module or mark "暂无可靠出处".',
    })
    addFindingIf(findings, /(近义词|反义词|同源词|易混词|关联词)/.test(text) && !/(近义|反义|同源|同类典故|人物关联|易混|关系类型)/.test(text), {
      id: 'encyclopedia.related_phrase_type_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.related_phrase_type_required'),
      message: 'Related cultural phrases need explicit relationship type labels.',
      repairHint: 'Label every related phrase as 近义 / 反义 / 同源 / 同类典故 / 人物关联 / 易混词, with a short relation note.',
    })
  }

  if (isScenicSpot) {
    addFindingIf(findings, /(坐标|经纬度|地图|定位|POI|poi)/.test(text) && !/(来源|据|资料|公开信息|待核实|暂无|未知|资料不足|坐标待补充|位置资料不足|示意)/.test(text), {
      id: 'encyclopedia.scenic_coordinate_source_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.scenic_coordinate_source_required'),
      message: 'Scenic-spot coordinate, map, or POI claims need source, uncertainty, or schematic wording.',
      repairHint: 'Add source/uncertainty hints such as "坐标待补充 / 位置资料不足 / 示意路线"; do not invent coordinates or live map facts.',
    })
    addFindingIf(findings, /(开放时间|营业时间|门票|票价|预约|交通|公交|地铁|停车|客流|拥挤|实时|安全提示)/.test(text) && !/(来源|据|资料|公开信息|待核实|暂无|未知|资料不足|以官方为准|示意)/.test(text), {
      id: 'encyclopedia.scenic_realtime_fact_source_required',
      source: 'template_rule',
      severity: severityOf('encyclopedia.scenic_realtime_fact_source_required'),
      message: 'Scenic-spot opening hours, tickets, transport, safety, and crowding facts are high-change facts and need source or uncertainty wording.',
      repairHint: 'Add "以官方信息为准 / 待核实 / 暂无可靠资料" and avoid exact current-state claims unless supplied by trusted context.',
    })
    addFindingIf(findings, /(导航|购票|订票|酒店|民宿|打车|外链|跳转|立即预订|立即购买|打开地图|路线规划)/.test(text) && !/(不提供|不含|不跳转|非导航|示意|移除|避免)/.test(text), {
      id: 'encyclopedia.scenic_external_navigation_blocked',
      source: 'template_rule',
      severity: severityOf('encyclopedia.scenic_external_navigation_blocked'),
      message: 'Scenic-spot dynamic encyclopedia cards should not depend on outbound navigation, booking, ticketing, hotel, or travel-platform actions.',
      repairHint: 'Keep the interaction local and schematic; remove outbound booking/navigation CTAs and use static route/POI explanation instead.',
    })
  }
}

function hasMediaResourceEntryIntent(text: string): boolean {
  const resourcePattern = /(在线观看|免费播放|免费观看|全集观看|下载|网盘|磁力|种子|未删减|泄露版|无删减版|片源|播放地址|迅雷)/ig
  for (const match of text.matchAll(resourcePattern)) {
    const index = match.index ?? 0
    const context = text.slice(Math.max(0, index - 18), Math.min(text.length, index + 38))
    if (/(不提供|不含|无任何|禁止|不得|不会提供|不展示|移除|删除|避免|不可提供|请勿|非资源|不是资源)/.test(context)) {
      continue
    }
    return true
  }
  return false
}

// ---------- Stage 1: 禁内部滚动规则 ----------
function applyStage1NoScrollRules(findings: EncyclopediaSpecFinding[], html: string): void {
  // 1) 检测 overflow: auto/scroll（任意方向）
  addFindingIf(findings, /overflow(-y|-x)?\s*:\s*(auto|scroll)/i.test(html), {
    id: 'encyclopedia.overflow_scroll_blocked',
    source: 'static_rule',
    severity: severityOf('encyclopedia.overflow_scroll_blocked'),
    message: 'Internal scroll (overflow:auto/scroll) is not allowed in dynamic encyclopedia cards.',
    repairHint: 'Remove overflow:auto/scroll. Use tab bars, page switchers, or modal dialogs to handle content overflow within the single 788×492 (PC) / 380×456 (WISE) canvas.',
  })
  // 2) 禁止 scroll-container 类名
  addFindingIf(findings, /class=["'][^"']*scroll-container/i.test(html), {
    id: 'encyclopedia.scroll_container_class_blocked',
    source: 'static_rule',
    severity: severityOf('encyclopedia.scroll_container_class_blocked'),
    message: 'The .scroll-container class is no longer permitted (semantics replaced by tab-bar / page-switcher / modal).',
    repairHint: 'Rename .scroll-container to .no-scroll-frame and switch the content overflow strategy to tabs, pagination, or modal dialogs.',
  })
}

// ---------- Stage 1: 真实交互规则 ----------
function applyStage1InteractionRules(findings: EncyclopediaSpecFinding[], html: string): void {
  const hasInlineScript = /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)
  const hasTabControl = /role=["']tab["']|class=["'][^"']*tab-bar|data-tab/i.test(html)
  const hasTabPanel = /role=["']tabpanel["']|class=["'][^"']*tab-panel|aria-controls=["'][^"']+/i.test(html)
  addFindingIf(findings, hasTabControl && (!hasTabPanel || !hasInlineScript), {
    id: 'encyclopedia.fake_tab_interaction',
    source: 'template_rule',
    severity: severityOf('encyclopedia.fake_tab_interaction'),
    message: 'Tab controls are visible but do not provide a complete local tab interaction.',
    repairHint: 'Add role=tabpanel sections and a small inline script that updates aria-selected and panel hidden states when each tab is clicked.',
  })

  const hasPageSwitcher = /class=["'][^"']*page-switcher|data-page|aria-label=["'][^"']*(分页|页面|page)/i.test(html)
  const hasPagePanels = /class=["'][^"']*(page-panel|page-slide)|data-page-panel|hidden/i.test(html)
  addFindingIf(findings, hasPageSwitcher && (!hasPagePanels || !hasInlineScript), {
    id: 'encyclopedia.fake_page_switcher_interaction',
    source: 'template_rule',
    severity: severityOf('encyclopedia.fake_page_switcher_interaction'),
    message: 'Page switcher controls are visible but do not switch local content.',
    repairHint: 'Add page panels and a scoped inline script that changes the active page, aria-current state, and hidden panels.',
  })

  const hasModalTrigger = /class=["'][^"']*(modal-trigger|open-modal)|data-modal|aria-haspopup=["']dialog["']/i.test(html)
  const hasModalPanel = /class=["'][^"']*modal-overlay|role=["']dialog["']/i.test(html)
  addFindingIf(findings, hasModalTrigger && (!hasModalPanel || !hasInlineScript), {
    id: 'encyclopedia.fake_modal_interaction',
    source: 'template_rule',
    severity: severityOf('encyclopedia.fake_modal_interaction'),
    message: 'Modal or reveal controls are visible but do not open a local dialog.',
    repairHint: 'Add a .modal-overlay or role=dialog panel plus scoped inline open/close handlers. Keep the interaction local and avoid external navigation.',
  })
}

// ---------- Stage 1: 中文优先 + 英文 UI 短语规则 ----------
function applyStage1ChineseOnlyRules(
  findings: EncyclopediaSpecFinding[],
  text: string,
  bodyHtml: string,
  entryTitle: string | null,
  isLanguageCategory: boolean,
): void {
  if (isLanguageCategory) return // 语言类词条整体豁免

  // 1) 抽离"标签"内容（headings/list items）作为语种判定的重点观察对象
  const prose = extractProseText(bodyHtml)
  if (!prose.trim()) return

  // 2) 中文优先：非语言类词条正文必须以 Han 字符为绝对主导（>= 60%）
  const hanCount = countMatches(prose, /[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const latinCount = countMatches(prose, /[A-Za-z\u00c0-\u00ff]/g)
  const total = hanCount + latinCount
  if (total >= 12) {
    const hanShare = hanCount / total
    addFindingIf(findings, hanShare < 0.6, {
      id: 'encyclopedia.chinese_only_required',
      source: 'static_rule',
      severity: severityOf('encyclopedia.chinese_only_required'),
      message: 'Non-language-category entries must present body content primarily in Chinese.',
      repairHint: `当前正文汉字占比 ${(hanShare * 100).toFixed(0)}%（应 ≥ 60%）。除专有名词/原文词条名保留外，请将正文改写为简体中文。`,
    })
  }

  // 3) 英文 UI 短语黑名单
  const englishUiPhrases = [
    'View More', 'Read More', 'Get Started', 'Learn More', 'Sign Up',
    'Subscribe', 'Try Now', 'Discover', 'Explore Now', 'Click Here',
    'See More', 'Find Out More', 'Buy Now', 'Add to Cart', 'Continue Reading',
  ]
  const englishUiPattern = new RegExp(`\\b(${englishUiPhrases.join('|')})\\b`, 'i')
  addFindingIf(findings, englishUiPattern.test(text), {
    id: 'encyclopedia.english_ui_phrase_blocked',
    source: 'static_rule',
    severity: severityOf('encyclopedia.english_ui_phrase_blocked'),
    message: 'English UI phrases are blocked in non-language-category entries.',
    repairHint: 'Replace with Chinese equivalents such as "查看更多 / 阅读更多 / 开始使用 / 了解详情".',
  })

  // 4) 连续 2+ 词首字母大写的英文短语（疑似过度使用外语，非专有名词）
  // Quoted work titles are proper nouns, not English UI copy. Remove quoted
  // spans before counting multi-word phrases to avoid flagging song/film/book
  // names such as 《Playing with Fire》 or “How You Like That”.
  const proseWithoutTags = stripTags(bodyHtml)
    .replace(/《[^》]*》/g, ' ')
    .replace(/[“”"'][^“”"']*[“”"']/g, ' ')
  // Two-word title-cased names are overwhelmingly organizations, people,
  // groups, brands, or works (for example Red Velvet or Interscope Records).
  // Leave those to the Chinese-share and explicit UI-phrase rules; this
  // heuristic targets longer English prose/UI fragments only.
  const englishPhraseMatches = proseWithoutTags.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){2,}/g) ?? []
  const excessiveEnglish = englishPhraseMatches.filter(phrase => {
    const words = phrase.trim().split(/\s+/).map(word => word.toLocaleLowerCase())
    // Repeated proper names can become adjacent after HTML tags are removed,
    // e.g. a member button label followed by its detail heading. That is not
    // an English UI phrase and must not consume the language warning budget.
    return new Set(words).size > 1
  }).length
  addFindingIf(findings, excessiveEnglish >= 2, {
    id: 'encyclopedia.excessive_english_phrases',
    source: 'static_rule',
    severity: severityOf('encyclopedia.excessive_english_phrases'),
    message: `Detected ${excessiveEnglish} multi-word English phrases — likely overuse of foreign language outside proper nouns.`,
    repairHint: 'Rewrite non-proper-noun English phrases into Chinese, or quote them as 引用 with attribution.',
  })

  // 5) 不支持书写系统（西里尔/阿拉伯/韩文）—— 警告而非错误
  addFindingIf(findings, /[\u0400-\u04ff]/.test(prose), {
    id: 'encyclopedia.unsupported_script_blocked',
    source: 'static_rule',
    severity: severityOf('encyclopedia.unsupported_script_blocked'),
    message: 'Cyrillic script detected — not the default for dynamic encyclopedia cards.',
    repairHint: 'Unless the entry is a linguistics/translation topic, transliterate or translate to Chinese.',
  })
  addFindingIf(findings, /[\u0600-\u06ff]/.test(prose), {
    id: 'encyclopedia.unsupported_script_blocked',
    source: 'static_rule',
    severity: severityOf('encyclopedia.unsupported_script_blocked'),
    message: 'Arabic script detected — not the default for dynamic encyclopedia cards.',
    repairHint: 'Unless the entry is a linguistics/translation topic, transliterate or translate to Chinese.',
  })
  // 注意：entryTitle 允许保留原文（专有名词），但仍排除西里尔/阿拉伯在正文里
  void entryTitle
}

// ---------- 工具函数 ----------

function severityOf(ruleId: string): 'error' | 'warning' {
  const level = ENFORCEMENT[ruleId] ?? 'warning'
  return level === 'disabled' ? 'warning' : level
}

function isDisabled(ruleId: string): boolean {
  return ENFORCEMENT[ruleId] === 'disabled'
}

function addFindingIf(findings: EncyclopediaSpecFinding[], condition: boolean, finding: EncyclopediaSpecFinding): void {
  if (condition) findings.push(finding)
}

function stripHtml(value: string): string {
  return stripTags(value).replace(/\s+/g, ' ').trim()
}

function stripTags(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function hasGlobalTouchActionNone(html: string): boolean {
  const withoutComments = stripSourceComments(html)
  const globalStyleAttrPattern = /<(?:html|body)\b[^>]*\bstyle=["'][^"']*touch-action\s*:\s*none[^"']*["']/i
  if (globalStyleAttrPattern.test(withoutComments)) return true

  for (const styleMatch of withoutComments.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1] ?? ''
    for (const ruleMatch of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = ruleMatch[1] ?? ''
      const declarations = ruleMatch[2] ?? ''
      const targetsGlobalFrame = selectors
        .split(',')
        .map(selector => selector.trim().toLowerCase())
        .some(selector => selector === '*' || selector === ':root' || selector === 'html' || selector === 'body')
      if (targetsGlobalFrame && /touch-action\s*:\s*none/i.test(declarations)) return true
    }
  }

  return false
}

function stripSourceComments(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_match, script: string) => {
      const strippedScript = stripLineComments(script)
      return `<script>${strippedScript}</script>`
    })
}

function stripCommentsFromScriptBlocks(html: string): string {
  return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_match, script: string) => {
    return `<script>${stripLineComments(script.replace(/\/\*[\s\S]*?\*\//g, ' '))}</script>`
  })
}

function stripLineComments(source: string): string {
  return source.replace(/(^|\n)\s*\/\/[^\n\r]*/g, '$1 ')
}

function extractProseText(bodyHtml: string): string {
  // 移除 script/style/svg/noscript，保留其余文本
  return bodyHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}
