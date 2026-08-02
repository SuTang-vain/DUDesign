import { useLanguage, type AppLanguage } from '@/components/LanguageProvider'

/**
 * 能力(capability)选项的中文本地化。
 * 选项数据来自 API(英文),这里按稳定 ID 提供中文名/描述,
 * 并提供常见词组(分类/情绪/密度/板块/标签等)的中文映射。
 * 未命中时回退英文原文。
 */

type DomainEntry = { name: string; desc: string; category: string }
type AestheticEntry = { name: string; desc: string; typo: string; layout: string; motion: string }

const domainTemplates: Record<string, DomainEntry> = {
  tpl_fintech_trust: {
    name: '金融信任落地页',
    desc: '强调信任的金融科技落地页:有据可查、清晰克制、转化路径保守。',
    category: '金融',
  },
  tpl_creative_studio: {
    name: '创意工作室作品集',
    desc: '面向艺术、设计与创意作品的表现力作品集 / 工作室站点。',
    category: '创意',
  },
  tpl_enterprise_professional: {
    name: '专业企业官网',
    desc: '面向 B2B、咨询、基础设施或专业服务的精致企业站点。',
    category: '企业',
  },
  tpl_automotive_launch: {
    name: '汽车产品发布',
    desc: '车辆或出行产品发布页:产品存在感强、技术细节充分。',
    category: '汽车',
  },
  tpl_premium_product_page: {
    name: '高端产品页',
    desc: '克制文案、大幅产品呈现、精致交互节奏的高端产品页。',
    category: '产品',
  },
  tpl_ai_tool_dashboard: {
    name: 'AI 工具控制台',
    desc: '面向 AI 工具、工作流、Agent 或效率仪表盘的产品站 / 应用外壳。',
    category: 'AI',
  },
}

const aesthetics: Record<string, AestheticEntry> = {
  aes_premium_minimal: {
    name: '高端极简',
    desc: '高端、克制、留白充足,聚焦产品本身。',
    typo: '大号自信标题、简短支撑文案、较高行高',
    layout: '留白充足的产品时刻、舒展的纵向节奏、极简外框',
    motion: '仅做轻微揭示与板块过渡',
  },
  aes_trustworthy_saas: {
    name: '可信 SaaS',
    desc: '清晰、克制、易扫读,面向 B2B 软件的转化导向。',
    typo: '清晰层级与务实副标题',
    layout: '条理分明的板块、佐证区块、功能对比',
    motion: '动效极简,聚焦可用性',
  },
  aes_warm_business: {
    name: '亲和商业',
    desc: '亲切的商业调性,带温度与直接的行动号召。',
    typo: '友好的标题与易读正文',
    layout: '圆角但克制的板块、用户评价、亲和的佐证',
    motion: '柔和过渡',
  },
  aes_bold_editorial: {
    name: '强对比编辑风',
    desc: '高对比、强排版节奏、令人印象深刻的构图。',
    typo: '超大标题、强对比、编辑式标签',
    layout: '非对称网格与戏剧化的板块分隔',
    motion: '自信但克制',
  },
}

const palettes: Record<string, { name: string; notes: string[] }> = {
  pal_blue_white_trust: { name: '蓝白信任', notes: ['浅底用深色文字。', '亮青色仅用于小面积强调。'] },
  pal_minimal_mono: { name: '极简单色', notes: ['保持较强的文字对比。', '用灰阶层次替代低对比的细字。'] },
  pal_warm_commercial: { name: '暖色商业', notes: ['避免橙底米色正文。', '暖色强调用于 CTA 与佐证时刻。'] },
  pal_editorial_contrast: { name: '编辑高对比', notes: ['黄色仅作为深色文字背后的高亮。', '红色强调需足够大以保证可读。'] },
}

const brands: Record<string, string> = {
  brand_apple_inspired: 'Apple 风格',
  brand_stripe_inspired: 'Stripe 风格',
  brand_linear_inspired: 'Linear 风格',
}

const loops: Record<string, string> = {
  loop_fast: '快速',
  loop_standard: '标准',
  loop_deep_repair: '深度修复',
}

/** 模型能力标签:provider/modelId 已由 displayName 表达,这里仅本地化能力短词 */
const modelCapabilities: Record<string, { zh: string; en: string }> = {
  html_generation: { zh: 'HTML 生成', en: 'HTML generation' },
  html_refine: { zh: 'HTML 精修', en: 'HTML refine' },
  long_context: { zh: '长上下文', en: 'Long context' },
}

/** 官方设计模板包中文名/描述(按稳定 ID)。用户私有模板未命中时回退其英文名。 */
const templatePacks: Record<string, { name: string; desc: string }> = {
  dtp_premium_product_launch: { name: '高端产品发布', desc: '为有质感、高价值的数字或实体产品打造的克制发布系统。' },
  dtp_trust_fintech: { name: '金融信任', desc: '清晰、合规优先的金融产品系统,强调信任、对比与转化。' },
  dtp_editorial_creative_portfolio: { name: '编辑创意作品集', desc: '面向艺术家、工作室、摄影师与实验性创意的作品集系统。' },
  dtp_enterprise_clarity: { name: '企业清晰', desc: '面向复杂产品、采购信心与反复扫读的稳重 B2B 系统。' },
  dtp_mobility_launch: { name: '出行发布', desc: '面向汽车、出行、机器人与硬件移动产品的动感发布系统。' },
  dtp_developer_workflow: { name: '开发者工作流', desc: '面向 API、CLI、基础设施与代码相关产品的精准开发者工具系统。' },
  dtp_warm_commerce: { name: '暖色电商', desc: '面向精选商品、生活方式与亲和转化的产品电商系统。' },
  dtp_data_operations: { name: '数据密集运营', desc: '面向仪表盘、管理工具、监控与重复流程的紧凑运营系统。' },
}

/** 官方交互范式中文名/描述(按稳定 ID)。 */
const interactionParadigms: Record<string, { name: string; desc: string }> = {
  ip_entity_summary: { name: '实体摘要', desc: '以事实为先的紧凑结构，呈现身份、定义、别名、指标与必要背景。' },
  ip_timeline_story: { name: '时间线叙事', desc: '按时间顺序组织生平阶段、发行历史、企业发展、事件或作品演进。' },
  ip_relation_map: { name: '关系图谱', desc: '围绕当前实体展示相关人物、作品、组织、角色与概念连接。' },
  ip_fact_compare: { name: '事实对比', desc: '用于概念辨析、规格差异、版本对照和并列事实比较。' },
  ip_expandable_facts: { name: '可展开事实', desc: '用于长事实、章节化说明、来源注释和渐进披露。' },
  ip_route_guide: { name: '路线导览', desc: '用于景区参观顺序、时间规划、路线推荐与 POI 探索。' },
}

/** 官方 safe skill 中文名/描述/规则/负向约束/质量检查(按 skill 稳定 ID)。 */
const skills: Record<string, {
  name: string
  desc: string
  rules: string[]
  negative: string[]
  checklist: string[]
}> = {
  sk_static_export_safe: {
    name: '静态导出安全',
    desc: '保持生成的 HTML 自包含、可移植,适配 iframe 预览与导出。',
    rules: [
      '生成完整的静态 HTML 文档。',
      '内联关键 CSS,除非作为资源打包,否则避免外部运行时依赖。',
      '保持预览、导出与分享行为确定一致。',
    ],
    negative: [
      '不要依赖包安装、构建步骤、仅网络可用的资源或绝对文件系统路径。',
      '不要写入 ./index.html 与打包的相对资源之外的内容。',
    ],
    checklist: ['HTML 含 doctype、viewport meta、title 与语义化地标。', '无缺失的关键资源。', '不依赖本地绝对路径。'],
  },
  sk_mobile_first_landing: {
    name: '移动优先落地页',
    desc: '引导落地页的布局、点击区域与响应式层级。',
    rules: [
      '先按移动端层级设计,再扩展到平板与桌面。',
      '保持点击区域足够大、底部间距舒适。',
      '避免动态文本或控件导致的布局偏移。',
    ],
    negative: [
      '不要在移动端把核心 CTA 或佐证藏在过多主视觉装饰之下。',
      '不要使用视口宽度字体缩放。',
    ],
    checklist: ['主视觉文字在小屏可读。', '按钮与分段控件不会尴尬换行。', '移动优先构图后桌面布局仍对齐。'],
  },
  sk_accessibility_first: {
    name: '无障碍优先',
    desc: '为生成加入无障碍、对比度、焦点与语义 HTML 检查。',
    rules: [
      '使用语义化 HTML 与可见的焦点状态。',
      '保持正文文字对比度可达。',
      '确保控件具备清晰的标签与状态。',
    ],
    negative: [
      '不要使用低对比度正文。',
      '不要仅靠颜色传达状态。',
      '不要把文字直接叠在繁杂图像上而无可达性处理。',
    ],
    checklist: ['所有可交互控件都有可达名称。', '正文对比度合适。', '焦点状态可见。'],
  },
  sk_dual_surface_strategy: {
    name: '双端差异化策略',
    desc: '把 PC、WISE、移动端与 iframe 嵌入视为不同产品端，而不是简单缩放同一版布局。',
    rules: [
      '将 PC、WISE、移动端与 iframe 目标作为密度、层级和交互不同的产品端处理。',
      '固定尺寸业务模板优先满足标准视口,再兼容次级尺寸。',
      '为每个变体说明端侧约束如何影响布局、信息密度和交互选择。',
      '移动端或 iframe 场景优先使用明确滚动容器、稳定控件和触摸安全交互。',
    ],
    negative: [
      '不要把移动端当成缩小版桌面。',
      '不要依赖 body 默认滚动承载嵌入式移动卡片。',
      '不要使用全局 touchmove 阻断、全局 touch-action:none、视频、下载或跳转作为核心移动交互。',
    ],
    checklist: [
      'PC 与 WISE/移动端存在清晰层级差异,不只是 CSS 缩放。',
      '固定视口模板在要求尺寸内不裁切主要内容。',
      '移动端或 iframe 端使用明确滚动容器和触摸安全控件。',
    ],
  },
  sk_data_intake_analysis: {
    name: '数据输入分析',
    desc: '把 prompt、链接、粘贴文本、表格、JSON、上传资产与检索结果整理为结构化生成 brief。',
    rules: [
      '生成前先整理主题摘要、实体、字段、缺失字段、推荐能力和风险标记。',
      '保留不同输入来源边界,区分 prompt、URL、粘贴文本、表格、JSON、上传资产、检索结果、已有 HTML 和记忆。',
      '推荐场景模板、设计模板包和 skill 时必须说明理由与置信度。',
      '把记忆和检索结果视为上下文提示,不是未经确认的事实。',
    ],
    negative: [
      '不要编造输入中不存在的事实、日期、指标、主张或来源信息。',
      '不要在不标注来源的情况下混合用户私有记忆和公开检索上下文。',
      '不要因为 URL 或检索结果存在就复制品牌 trade dress 或版权内容。',
    ],
    checklist: [
      '生成计划包含主题、核心实体、必要字段和缺失信息。',
      '模板与 skill 推荐包含理由和置信度。',
      '不确定或外部来源内容使用前先暴露风险标记。',
    ],
  },
  sk_research_brief_builder: {
    name: '网络检索摘要',
    desc: '把网络检索结果整理为带来源、引用、置信度和风险标记的审核上下文。',
    rules: [
      '先把网络检索结果转换为 ResearchContextArtifact,再参与生成。',
      '保留来源、获取时间、平台、置信度、新鲜度和审核状态。',
      '把公开检索、用户 prompt 与私有记忆的边界标清楚。',
      '社区、社媒、过期或低置信内容只能作为谨慎的设计上下文。',
    ],
    negative: [
      '不要编造来源之外的事实、引用、统计、日期、背书或结论。',
      '不要复制版权文章、专有截图、品牌 trade dress、logo 或平台 UI 外观。',
      '不要在不说明边界的情况下混合公开检索和私有记忆。',
    ],
    checklist: [
      '检索相关事实有引用或采用保守表达。',
      '来源新鲜度和置信度影响文案与设计决策。',
      '风险标记进入生成理由。',
    ],
  },
}

/** 词组翻译:分类、情绪、密度、正式度、色板用途键、详情标签、常见板块/必备项等 */
const phrases: Record<string, string> = {
  // 分类
  finance: '金融', creative: '创意', enterprise: '企业', automotive: '汽车', product: '产品', ai: 'AI',
  // 情绪
  calm: '沉稳', premium: '高端', focused: '专注', credible: '可信', practical: '务实',
  warm: '温暖', approachable: '亲和', commercial: '商业', bold: '大胆', memorable: '难忘', sharp: '锐利',
  // 密度 / 正式度
  low: '低', medium: '中', 'medium-high': '中高', 'low-medium': '中低', high: '高',
  // 色板用途键
  background: '背景', text: '文字', primary: '主色', accent: '强调', border: '边框', highlight: '高亮',
  // 详情面板标签
  Typography: '排版', Layout: '布局', Motion: '动效', Mood: '情绪', Density: '密度',
  'Best for': '适用于', 'Avoid for': '不适用于', Avoid: '避免',
  Sections: '板块', Required: '必备', Constraints: '约束',
  // 通用标签
  default: '默认',
  // 安全等级 / 插件分类
  safe: '安全', review_required: '需审核', disabled: '已禁用',
  quality: '质量', responsive: '响应式', assets: '资源', validation: '校验',
  // 板块(常见)
  hero: '主视觉', 'hero statement': '主视觉宣言', 'trust proof': '信任佐证', 'product benefits': '产品卖点',
  security: '安全', 'pricing or CTA': '定价 / CTA', faq: '常见问题', 'selected work': '精选作品',
  process: '流程', about: '关于', contact: '联系', capabilities: '能力', industries: '行业', proof: '佐证',
  // 必备项(常见)
  'clear value proposition': '清晰价值主张', 'compliance-safe copy': '合规文案', 'trust signals': '信任信号',
  'primary CTA': '主 CTA', 'work showcase': '作品展示', 'creator identity': '创作者标识',
  'contact CTA': '联系 CTA', 'business outcome': '业务成效', 'capability summary': '能力概览',
  'credibility proof': '可信度佐证',
  // 适用 / 不适用于(bestFor / avoidFor 常见)
  'premium product pages': '高端产品页', 'hardware or app launches': '硬件或应用发布', 'focused feature storytelling': '聚焦特性叙事',
  'SaaS landing pages': 'SaaS 落地页', 'B2B product sites': 'B2B 产品站', 'conversion flows with proof': '带佐证的转化流',
  'service businesses': '服务业', consultants: '顾问', 'consumer-friendly commercial pages': '面向消费者的商业页',
  'creative campaigns': '创意活动', 'portfolio showcases': '作品集展示', 'single-message landing pages': '单信息落地页',
  'dense dashboards': '密集仪表盘', 'regulated disclosure-heavy pages': '强监管披露页', 'multi-product catalogs': '多产品目录',
  'art portfolios': '艺术作品集', 'fashion editorials': '时尚编辑', 'highly experimental campaigns': '高度实验性活动',
  'financial regulation pages': '金融合规页', 'luxury minimal launches': '奢华极简发布', 'developer tools': '开发者工具',
  'compliance-heavy pages': '强合规页', 'support documentation': '支持文档',
}

function pick(lang: AppLanguage, zh: string | undefined, en: string): string {
  return lang === 'zh' && zh ? zh : en
}

/** 能力选项 i18n hook,按当前语言返回中/英文标签 */
export function useCapabilityI18n() {
  const { language } = useLanguage()
  return {
    language,
    domainName: (id: string, en: string) => pick(language, domainTemplates[id]?.name, en),
    domainDesc: (id: string, en: string) => pick(language, domainTemplates[id]?.desc, en),
    domainCategory: (id: string, en: string) => pick(language, domainTemplates[id]?.category, pick(language, phrases[en], en)),
    aestheticName: (id: string, en: string) => pick(language, aesthetics[id]?.name, en),
    aestheticDesc: (id: string, en: string) => pick(language, aesthetics[id]?.desc, en),
    aestheticField: (id: string, field: 'typo' | 'layout' | 'motion', en: string) =>
      pick(language, aesthetics[id]?.[field], en),
    paletteName: (id: string, en: string) => pick(language, palettes[id]?.name, en),
    paletteNotes: (id: string, en: string[]) =>
      language === 'zh' && palettes[id]?.notes ? palettes[id]!.notes : en,
    brandName: (id: string, en: string) => pick(language, brands[id], en),
    loopName: (id: string, en: string) => pick(language, loops[id], en),
    modelCaps: (ids: string[]) => ids.map(id => {
      const entry = modelCapabilities[id]
      return language === 'zh'
        ? (entry?.zh ?? id)
        : (entry?.en ?? id.replace(/_/g, ' '))
    }),
    templatePackName: (id: string, en: string) => pick(language, templatePacks[id]?.name, en),
    templatePackDesc: (id: string, en: string) => pick(language, templatePacks[id]?.desc, en),
    interactionParadigmName: (id: string, en: string) => pick(language, interactionParadigms[id]?.name, en),
    interactionParadigmDesc: (id: string, en: string) => pick(language, interactionParadigms[id]?.desc, en),
    skillName: (id: string, en: string) => pick(language, skills[id]?.name, en),
    skillDesc: (id: string, en: string) => pick(language, skills[id]?.desc, en),
    skillRules: (id: string, en: string[]) =>
      language === 'zh' && skills[id]?.rules ? skills[id]!.rules : en,
    skillNegative: (id: string, en: string[]) =>
      language === 'zh' && skills[id]?.negative ? skills[id]!.negative : en,
    skillChecklist: (id: string, en: string[]) =>
      language === 'zh' && skills[id]?.checklist ? skills[id]!.checklist : en,
    phrase: (en: string) => pick(language, phrases[en], en),
    phraseList: (items: string[]) => items.map(en => pick(language, phrases[en], en)),
  }
}
