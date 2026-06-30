import type {
  AestheticProfile,
  AutomationLoopProfile,
  CapabilityRequirements,
  CapabilitySnapshot,
  ColorPalette,
  DomainTemplate,
  ListCapabilitiesResponse,
} from '@dudesign/contracts'

export const CAPABILITY_SCHEMA_VERSION = '2026-06-30.dudesign-capabilities.v1'

const domainTemplates: DomainTemplate[] = [
  {
    id: 'tpl_fintech_trust',
    name: 'Fintech Trust Landing',
    category: 'finance',
    description: 'A trust-heavy financial technology landing page with proof, clarity, and conservative conversion flow.',
    contentVersion: '1.0.0',
    structure: {
      sections: ['hero', 'trust proof', 'product benefits', 'security', 'pricing or CTA', 'faq'],
      requiredElements: ['clear value proposition', 'compliance-safe copy', 'trust signals', 'primary CTA'],
      optionalElements: ['metric strip', 'customer logos', 'risk disclosure'],
    },
    constraints: [
      'Avoid speculative financial claims.',
      'Prefer clear hierarchy, security language, and restrained visual effects.',
      'Make pricing, risk, and CTA language easy to scan.',
    ],
    variationDirections: [
      'Institutional trust and audit-ready clarity.',
      'Modern consumer fintech with approachable confidence.',
      'Data-rich product story with proof blocks.',
    ],
  },
  {
    id: 'tpl_creative_studio',
    name: 'Creative Studio Portfolio',
    category: 'creative',
    description: 'An expressive portfolio or studio site for art, design, and creative work.',
    contentVersion: '1.0.0',
    structure: {
      sections: ['hero statement', 'selected work', 'process', 'about', 'contact'],
      requiredElements: ['work showcase', 'creator identity', 'contact CTA'],
      optionalElements: ['awards', 'client list', 'project filters'],
    },
    constraints: [
      'Let work samples or visual rhythm carry the page.',
      'Avoid generic SaaS-style cards unless the prompt asks for them.',
      'Keep navigation simple and editorial.',
    ],
    variationDirections: [
      'Editorial gallery with quiet typography.',
      'High-energy art direction with bold composition.',
      'Minimal portfolio focused on work thumbnails.',
    ],
  },
  {
    id: 'tpl_enterprise_professional',
    name: 'Professional Enterprise Home',
    category: 'enterprise',
    description: 'A polished corporate website for B2B, consulting, infrastructure, or professional services.',
    contentVersion: '1.0.0',
    structure: {
      sections: ['hero', 'capabilities', 'industries', 'proof', 'process', 'contact'],
      requiredElements: ['business outcome', 'capability summary', 'credibility proof', 'contact CTA'],
      optionalElements: ['case studies', 'leadership', 'regional offices'],
    },
    constraints: [
      'Prioritize credibility, clarity, and scanning.',
      'Avoid consumer-app playfulness unless explicitly requested.',
      'Use restrained motion and professional copy.',
    ],
    variationDirections: [
      'Quiet executive-grade corporate site.',
      'Consulting-style capability narrative.',
      'Dense but organized industry solutions page.',
    ],
  },
  {
    id: 'tpl_automotive_launch',
    name: 'Automotive Product Launch',
    category: 'automotive',
    description: 'A vehicle or mobility product launch page with strong product presence and technical detail.',
    contentVersion: '1.0.0',
    structure: {
      sections: ['hero product reveal', 'performance highlights', 'design details', 'technology', 'reservation CTA'],
      requiredElements: ['vehicle/product name', 'performance or feature metrics', 'visual-first hero', 'CTA'],
      optionalElements: ['spec table', 'trim comparison', 'charging or service details'],
    },
    constraints: [
      'Make the product the first-viewport signal.',
      'Balance aspirational visuals with concrete specifications.',
      'Avoid fake legal or safety claims.',
    ],
    variationDirections: [
      'Luxury reveal with cinematic spacing.',
      'Performance-focused technical page.',
      'Urban mobility story with practical detail.',
    ],
  },
  {
    id: 'tpl_apple_like_product',
    name: 'Apple-like Product Page',
    category: 'product',
    description: 'A premium product page with restrained copy, large product moments, and refined interaction rhythm.',
    contentVersion: '1.0.0',
    structure: {
      sections: ['product hero', 'feature moments', 'detail closeups', 'ecosystem or use cases', 'buy CTA'],
      requiredElements: ['product name', 'focused value proposition', 'feature storytelling', 'clear CTA'],
      optionalElements: ['comparison', 'accessory story', 'availability details'],
    },
    constraints: [
      'Use minimal copy and high confidence spacing.',
      'Prefer product-focused composition over decorative illustrations.',
      'Avoid copying protected brand marks or exact proprietary language.',
    ],
    variationDirections: [
      'Calm premium product storytelling.',
      'Spec-driven page with elegant section rhythm.',
      'Lifestyle-focused product narrative.',
    ],
  },
  {
    id: 'tpl_ai_tool_dashboard',
    name: 'AI Tool Dashboard',
    category: 'ai',
    description: 'A product site or app shell for AI tools, workflows, agents, or productivity dashboards.',
    contentVersion: '1.0.0',
    structure: {
      sections: ['hero workflow', 'product surface', 'automation benefits', 'integrations', 'pricing or CTA'],
      requiredElements: ['workflow promise', 'product UI signal', 'automation explanation', 'CTA'],
      optionalElements: ['prompt examples', 'integration grid', 'security notes'],
    },
    constraints: [
      'Show the actual workflow or interface early.',
      'Avoid vague AI magic claims.',
      'Make repeated-use controls feel practical and scannable.',
    ],
    variationDirections: [
      'Operational SaaS dashboard with dense clarity.',
      'Agent workflow story with visual process steps.',
      'Developer tool presentation with technical confidence.',
    ],
  },
]

const colorPalettes: ColorPalette[] = [
  {
    id: 'pal_blue_white_trust',
    name: 'Blue White Trust',
    colors: ['#0f172a', '#1d4ed8', '#38bdf8', '#f8fafc', '#e2e8f0'],
    usage: {
      background: '#f8fafc',
      text: '#0f172a',
      primary: '#1d4ed8',
      accent: '#38bdf8',
      border: '#e2e8f0',
    },
    accessibilityNotes: ['Use dark text on light backgrounds.', 'Reserve bright cyan for small accents.'],
  },
  {
    id: 'pal_minimal_mono',
    name: 'Minimal Mono',
    colors: ['#050505', '#262626', '#737373', '#f5f5f5', '#ffffff'],
    usage: {
      background: '#ffffff',
      text: '#050505',
      primary: '#262626',
      accent: '#737373',
      border: '#e5e5e5',
    },
    accessibilityNotes: ['Maintain strong text contrast.', 'Use grayscale hierarchy instead of low-contrast fine text.'],
  },
  {
    id: 'pal_warm_commercial',
    name: 'Warm Commercial',
    colors: ['#2f1f16', '#b45309', '#f97316', '#fff7ed', '#fed7aa'],
    usage: {
      background: '#fff7ed',
      text: '#2f1f16',
      primary: '#b45309',
      accent: '#f97316',
      border: '#fed7aa',
    },
    accessibilityNotes: ['Avoid orange-on-cream body text.', 'Use warm accents for CTA and proof moments.'],
  },
  {
    id: 'pal_editorial_contrast',
    name: 'Editorial Contrast',
    colors: ['#111111', '#ffffff', '#ef4444', '#facc15', '#d4d4d4'],
    usage: {
      background: '#ffffff',
      text: '#111111',
      primary: '#111111',
      accent: '#ef4444',
      highlight: '#facc15',
    },
    accessibilityNotes: ['Use yellow as highlight behind dark text only.', 'Keep red accents large enough to read.'],
  },
]

const aestheticProfiles: AestheticProfile[] = [
  {
    id: 'aes_apple_minimal',
    name: 'Apple-like Minimal',
    description: 'Premium, restrained, spacious, and product-focused.',
    colorPaletteIds: ['pal_minimal_mono', 'pal_blue_white_trust'],
    typographyTone: 'large confident headings, short supporting copy, high line-height',
    layoutTone: 'spacious product moments, generous vertical rhythm, minimal chrome',
    motionTone: 'subtle reveal and section transitions only',
    negativeRules: ['Do not imitate protected brand marks.', 'Avoid cluttered cards and busy gradients.'],
  },
  {
    id: 'aes_trustworthy_saas',
    name: 'Trustworthy SaaS',
    description: 'Clear, calm, scannable, and conversion-oriented for B2B software.',
    colorPaletteIds: ['pal_blue_white_trust', 'pal_minimal_mono'],
    typographyTone: 'clear hierarchy with practical subheads',
    layoutTone: 'organized sections, proof blocks, feature comparisons',
    motionTone: 'minimal motion, focus on usability',
    negativeRules: ['Avoid vague AI slogans.', 'Avoid decorative bloat before product proof.'],
  },
  {
    id: 'aes_warm_business',
    name: 'Warm Business',
    description: 'Approachable commercial tone with warmth and direct CTAs.',
    colorPaletteIds: ['pal_warm_commercial'],
    typographyTone: 'friendly headings and legible body copy',
    layoutTone: 'rounded but restrained sections, testimonials, approachable proof',
    motionTone: 'soft transitions',
    negativeRules: ['Avoid overly playful styling for regulated industries.'],
  },
  {
    id: 'aes_bold_editorial',
    name: 'Bold Editorial',
    description: 'High contrast, strong typographic rhythm, and memorable composition.',
    colorPaletteIds: ['pal_editorial_contrast', 'pal_minimal_mono'],
    typographyTone: 'oversized headlines, strong contrast, editorial labels',
    layoutTone: 'asymmetric grids and dramatic section breaks',
    motionTone: 'confident but controlled',
    negativeRules: ['Avoid illegible low-contrast text.', 'Do not overuse all-caps body copy.'],
  },
]

const automationLoopProfiles: AutomationLoopProfile[] = [
  {
    id: 'loop_fast',
    name: 'Fast',
    description: 'Generate quickly with minimal automated repair.',
    maxRepairAttempts: 0,
    enablePixelGate: false,
    qualityGate: 'static',
  },
  {
    id: 'loop_standard',
    name: 'Standard',
    description: 'Run static quality checks and allow limited automated repair.',
    maxRepairAttempts: 1,
    enablePixelGate: false,
    qualityGate: 'static',
  },
  {
    id: 'loop_deep_repair',
    name: 'Deep Repair',
    description: 'Use stricter visual validation and more repair attempts when quality matters.',
    maxRepairAttempts: 2,
    enablePixelGate: true,
    qualityGate: 'pixel',
  },
]

export function listCapabilities(): ListCapabilitiesResponse {
  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    domainTemplates,
    aestheticProfiles,
    colorPalettes,
    automationLoopProfiles,
    defaults: {
      domainTemplateId: 'tpl_fintech_trust',
      aestheticProfileId: 'aes_trustworthy_saas',
      colorPaletteId: 'pal_blue_white_trust',
      loopProfileId: 'loop_standard',
    },
  }
}

export function resolveCapabilitySnapshot(input: CapabilityRequirements | undefined): CapabilitySnapshot {
  const capabilities = listCapabilities()
  const domainTemplateId = input?.template?.domainTemplateId ?? capabilities.defaults.domainTemplateId
  const aestheticProfileId = input?.template?.aestheticProfileId ?? capabilities.defaults.aestheticProfileId
  const requestedPaletteId = input?.template?.colorPaletteId ?? capabilities.defaults.colorPaletteId
  const loopProfileId = input?.automation?.loopProfileId ?? capabilities.defaults.loopProfileId

  const domainTemplate = findById(capabilities.domainTemplates, domainTemplateId, 'DOMAIN_TEMPLATE_NOT_FOUND')
  const aestheticProfile = findById(capabilities.aestheticProfiles, aestheticProfileId, 'AESTHETIC_PROFILE_NOT_FOUND')
  const paletteId = aestheticProfile.colorPaletteIds.includes(requestedPaletteId) ? requestedPaletteId : aestheticProfile.colorPaletteIds[0] ?? requestedPaletteId
  const colorPalette = findById(capabilities.colorPalettes, paletteId, 'COLOR_PALETTE_NOT_FOUND')
  const loopProfile = findById(capabilities.automationLoopProfiles, loopProfileId, 'LOOP_PROFILE_NOT_FOUND')
  const maxRepairAttempts = input?.automation?.maxRepairAttempts

  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    template: {
      domainTemplate,
      aestheticProfile,
      colorPalette,
    },
    plugins: {
      skillIds: [...new Set(input?.plugins?.skillIds ?? [])],
      mcpToolIds: [...new Set(input?.plugins?.mcpToolIds ?? [])],
    },
    automation: {
      loopProfile,
      maxRepairAttempts: typeof maxRepairAttempts === 'number'
        ? Math.max(0, Math.min(3, Math.trunc(maxRepairAttempts)))
        : loopProfile.maxRepairAttempts,
    },
  }
}

function findById<T extends { id: string }>(items: T[], id: string, code: string): T {
  const item = items.find(candidate => candidate.id === id)
  if (!item) throw capabilityError(code, `Capability not found: ${id}`)
  return item
}

function capabilityError(code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = 400
  error.code = code
  return error
}
