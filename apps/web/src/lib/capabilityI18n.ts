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
    phrase: (en: string) => pick(language, phrases[en], en),
    phraseList: (items: string[]) => items.map(en => pick(language, phrases[en], en)),
  }
}
