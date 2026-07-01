import type {
  AestheticProfile,
  AutomationLoopProfile,
  BrandStyleReference,
  CapabilityRequirements,
  CapabilitySnapshot,
  CapabilityPlugin,
  CapabilityPluginSnapshot,
  ColorPalette,
  DesignSkill,
  DomainTemplate,
  ListCapabilitiesResponse,
  McpToolBinding,
  PluginPermissionScope,
} from '@dudesign/contracts'

export const CAPABILITY_SCHEMA_VERSION = '2026-07-01.dudesign-capabilities.v2'

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
    id: 'tpl_premium_product_page',
    name: 'Premium Product Page',
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
      'Keep brand-specific references as inspiration-only styling constraints.',
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

const brandStyleReferences: BrandStyleReference[] = [
  {
    id: 'brand_apple_inspired',
    name: 'Apple-inspired',
    description: 'Premium product storytelling with calm confidence, precise whitespace, and product-first hierarchy.',
    brandFamily: 'consumer hardware and ecosystem',
    inspirationOnly: true,
    visualPrinciples: [
      'Use restraint, clarity, and product-first composition.',
      'Prefer large product moments, short copy, and confident negative space.',
      'Make interactions subtle and polished rather than decorative.',
    ],
    tokenHints: {
      color: ['neutral monochrome base', 'sparingly used cool accents'],
      typography: ['large confident headings', 'short supporting copy', 'generous line height'],
      layout: ['full-width product moments', 'strong vertical rhythm', 'minimal chrome'],
      motion: ['subtle reveal', 'controlled section transitions'],
      voice: ['concise', 'assured', 'benefit-led'],
    },
    forbiddenRules: [
      'Do not copy protected logos, marks, product names, proprietary copy, or campaign slogans.',
      'Do not imply endorsement or official affiliation.',
      'Do not reproduce exact Apple page layouts or recognizable product imagery.',
    ],
  },
  {
    id: 'brand_stripe_inspired',
    name: 'Stripe-inspired',
    description: 'Developer-friendly commercial clarity with crisp information architecture and technical confidence.',
    brandFamily: 'developer platform and fintech',
    inspirationOnly: true,
    visualPrinciples: [
      'Use clear product explanation, practical proof, and confident conversion flow.',
      'Balance technical depth with approachable commercial copy.',
      'Keep visual energy purposeful rather than ornamental.',
    ],
    tokenHints: {
      color: ['cool gradients as accents', 'clean white or dark surfaces'],
      typography: ['technical but readable hierarchy'],
      layout: ['documentation-adjacent sections', 'product diagrams', 'proof blocks'],
      motion: ['light technical transitions'],
      voice: ['precise', 'developer-aware', 'commercially clear'],
    },
    forbiddenRules: [
      'Do not copy logos, proprietary gradients, exact copy, or brand-specific diagrams.',
      'Do not imply partnership or official endorsement.',
    ],
  },
  {
    id: 'brand_linear_inspired',
    name: 'Linear-inspired',
    description: 'Focused product velocity with quiet dark surfaces, refined controls, and dense operational clarity.',
    brandFamily: 'productivity and developer workflow',
    inspirationOnly: true,
    visualPrinciples: [
      'Use focused hierarchy, compact rhythm, and precise interface details.',
      'Let product workflow and speed feel tangible.',
      'Keep decorative elements subordinate to usability.',
    ],
    tokenHints: {
      color: ['dark neutral base', 'subtle violet or blue accent'],
      typography: ['compact headings', 'crisp labels'],
      layout: ['dense but breathable product surfaces', 'workflow-first sections'],
      motion: ['fast, subtle, utility-led motion'],
      voice: ['direct', 'calm', 'operator-focused'],
    },
    forbiddenRules: [
      'Do not copy logos, proprietary screenshots, exact UI chrome, or official copy.',
      'Do not imply affiliation.',
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
    id: 'aes_premium_minimal',
    name: 'Premium Minimal',
    description: 'Premium, restrained, spacious, and product-focused.',
    colorPaletteIds: ['pal_minimal_mono', 'pal_blue_white_trust'],
    mood: ['calm', 'premium', 'focused'],
    occasion: ['product launch', 'brand site', 'consumer product'],
    tone: ['confident', 'restrained', 'polished'],
    formality: 'medium-high',
    density: 'low',
    bestFor: ['premium product pages', 'hardware or app launches', 'focused feature storytelling'],
    avoidFor: ['dense dashboards', 'regulated disclosure-heavy pages', 'multi-product catalogs'],
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
    mood: ['calm', 'credible', 'practical'],
    occasion: ['b2b landing', 'product marketing', 'pricing page'],
    tone: ['trustworthy', 'direct', 'helpful'],
    formality: 'medium',
    density: 'medium',
    bestFor: ['SaaS landing pages', 'B2B product sites', 'conversion flows with proof'],
    avoidFor: ['art portfolios', 'fashion editorials', 'highly experimental campaigns'],
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
    mood: ['warm', 'approachable', 'commercial'],
    occasion: ['small business site', 'service landing', 'local commerce'],
    tone: ['friendly', 'plainspoken', 'encouraging'],
    formality: 'low-medium',
    density: 'medium',
    bestFor: ['service businesses', 'consultants', 'consumer-friendly commercial pages'],
    avoidFor: ['financial regulation pages', 'luxury minimal launches', 'developer tools'],
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
    mood: ['bold', 'memorable', 'sharp'],
    occasion: ['campaign page', 'portfolio', 'editorial launch'],
    tone: ['assertive', 'curated', 'expressive'],
    formality: 'medium',
    density: 'medium-high',
    bestFor: ['creative campaigns', 'portfolio showcases', 'single-message landing pages'],
    avoidFor: ['compliance-heavy pages', 'dense SaaS dashboards', 'support documentation'],
    typographyTone: 'oversized headlines, strong contrast, editorial labels',
    layoutTone: 'asymmetric grids and dramatic section breaks',
    motionTone: 'confident but controlled',
    negativeRules: ['Avoid illegible low-contrast text.', 'Do not overuse all-caps body copy.'],
  },
]

const capabilityPlugins: CapabilityPlugin[] = [
  {
    id: 'plug_static_export_safe',
    type: 'skill',
    visibility: 'official',
    name: 'Static Export Safe',
    description: 'Keeps generated HTML self-contained, portable, and safe for iframe preview/export.',
    category: 'quality',
    safetyLevel: 'safe',
    status: 'active',
    permissionPolicy: {
      scopes: ['readonly_context', 'validation_only'],
      maxPromptChars: 1600,
      allowRuntimeToolUse: false,
      requiresUserAuth: false,
      auditLevel: 'usage',
    },
  },
  {
    id: 'plug_mobile_first_landing',
    type: 'skill',
    visibility: 'official',
    name: 'Mobile-first Landing',
    description: 'Guides layout, tap targets, and responsive hierarchy for landing pages.',
    category: 'responsive',
    safetyLevel: 'safe',
    status: 'active',
    permissionPolicy: {
      scopes: ['readonly_context', 'validation_only'],
      maxPromptChars: 1800,
      allowRuntimeToolUse: false,
      requiresUserAuth: false,
      auditLevel: 'usage',
    },
  },
  {
    id: 'plug_accessibility_first',
    type: 'skill',
    visibility: 'official',
    name: 'Accessibility First',
    description: 'Adds accessibility, contrast, focus, and semantic HTML checks to generation.',
    category: 'quality',
    safetyLevel: 'safe',
    status: 'active',
    permissionPolicy: {
      scopes: ['readonly_context', 'validation_only'],
      maxPromptChars: 1800,
      allowRuntimeToolUse: false,
      requiresUserAuth: false,
      auditLevel: 'usage',
    },
  },
  {
    id: 'plug_asset_library_readonly',
    type: 'mcp_tool',
    visibility: 'official',
    name: 'Asset Library Readonly',
    description: 'Allows readonly retrieval of approved brand or workspace assets through a controlled MCP binding.',
    category: 'assets',
    safetyLevel: 'review_required',
    status: 'active',
    permissionPolicy: {
      scopes: ['asset_readonly', 'readonly_context'],
      maxPromptChars: 600,
      allowRuntimeToolUse: false,
      requiresUserAuth: true,
      auditLevel: 'full',
    },
  },
  {
    id: 'plug_accessibility_validate',
    type: 'mcp_tool',
    visibility: 'official',
    name: 'Accessibility Validate',
    description: 'Allows validation-only accessibility checks through a controlled MCP binding.',
    category: 'validation',
    safetyLevel: 'safe',
    status: 'active',
    permissionPolicy: {
      scopes: ['validation_only'],
      maxPromptChars: 600,
      allowRuntimeToolUse: false,
      requiresUserAuth: false,
      auditLevel: 'usage',
    },
  },
]

const designSkills: DesignSkill[] = [
  {
    id: 'sk_static_export_safe',
    pluginId: 'plug_static_export_safe',
    schemaVersion: '2026-07-01.dudesign-skill.v1',
    rules: [
      'Produce a complete static HTML document.',
      'Inline critical CSS and avoid external runtime dependencies unless included as assets.',
      'Keep preview, export, and share behavior deterministic.',
    ],
    promptBlocks: [
      'Use portable static HTML/CSS/JS only. The artifact must work in a sandboxed iframe and as a downloaded file.',
    ],
    negativeRules: [
      'Do not require package installation, build steps, network-only assets, or absolute filesystem paths.',
      'Do not write outside ./index.html and bundled relative assets.',
    ],
    qualityChecklist: [
      'HTML has a doctype, viewport meta, title, and semantic landmarks.',
      'No missing critical assets.',
      'No dependency on local absolute paths.',
    ],
    allowedTemplateCategories: ['finance', 'creative', 'enterprise', 'automotive', 'product', 'ai'],
  },
  {
    id: 'sk_mobile_first_landing',
    pluginId: 'plug_mobile_first_landing',
    schemaVersion: '2026-07-01.dudesign-skill.v1',
    rules: [
      'Design mobile hierarchy first, then expand to tablet and desktop.',
      'Keep tap targets large enough and bottom spacing comfortable.',
      'Avoid layout shifts caused by dynamic text or controls.',
    ],
    promptBlocks: [
      'Start from mobile layout constraints: one primary action, readable type, stable controls, and clear section rhythm.',
    ],
    negativeRules: [
      'Do not hide core CTA or proof below excessive hero decoration on mobile.',
      'Do not use viewport-width font scaling.',
    ],
    qualityChecklist: [
      'Hero text fits small screens.',
      'Buttons and segmented controls do not wrap awkwardly.',
      'Desktop layout remains aligned after mobile-first composition.',
    ],
    allowedTemplateCategories: ['finance', 'creative', 'enterprise', 'automotive', 'product', 'ai'],
  },
  {
    id: 'sk_accessibility_first',
    pluginId: 'plug_accessibility_first',
    schemaVersion: '2026-07-01.dudesign-skill.v1',
    rules: [
      'Use semantic HTML and visible focus states.',
      'Maintain accessible text contrast.',
      'Ensure controls have clear labels and states.',
    ],
    promptBlocks: [
      'Treat accessibility as a generation constraint: semantic structure, contrast, focus, and readable form/control states.',
    ],
    negativeRules: [
      'Do not use low-contrast body text.',
      'Do not rely on color alone to convey status.',
      'Do not place text over busy imagery without a readable treatment.',
    ],
    qualityChecklist: [
      'All interactive controls have accessible names.',
      'Text contrast is suitable for body copy.',
      'Focus states are visible.',
    ],
    allowedTemplateCategories: ['finance', 'creative', 'enterprise', 'automotive', 'product', 'ai'],
  },
]

const mcpToolBindings: McpToolBinding[] = [
  {
    id: 'mcp_asset_library_readonly',
    pluginId: 'plug_asset_library_readonly',
    serverName: 'asset-library',
    toolName: 'readApprovedAssets',
    scopes: ['asset_readonly', 'readonly_context'],
    requiresUserAuth: true,
    allowedTemplateCategories: ['enterprise', 'product', 'creative'],
  },
  {
    id: 'mcp_accessibility_validate',
    pluginId: 'plug_accessibility_validate',
    serverName: 'quality-tools',
    toolName: 'validateAccessibility',
    scopes: ['validation_only'],
    requiresUserAuth: false,
    allowedTemplateCategories: ['finance', 'creative', 'enterprise', 'automotive', 'product', 'ai'],
  },
]

const automationLoopProfiles: AutomationLoopProfile[] = [
  {
    id: 'loop_fast',
    name: 'Fast',
    description: 'Generate quickly with minimal automated repair.',
    maxRepairAttempts: 0,
    maxCostCents: null,
    maxDurationMs: 120000,
    enablePixelGate: false,
    qualityGate: 'static',
    repairStrategy: 'none',
  },
  {
    id: 'loop_standard',
    name: 'Standard',
    description: 'Run static quality checks and allow limited automated repair.',
    maxRepairAttempts: 1,
    maxCostCents: 200,
    maxDurationMs: 300000,
    enablePixelGate: false,
    qualityGate: 'static',
    repairStrategy: 'minimal_refine',
  },
  {
    id: 'loop_deep_repair',
    name: 'Deep Repair',
    description: 'Use stricter visual validation and more repair attempts when quality matters.',
    maxRepairAttempts: 2,
    maxCostCents: 500,
    maxDurationMs: 720000,
    enablePixelGate: true,
    qualityGate: 'pixel',
    repairStrategy: 'deep_refine',
  },
]

export function listCapabilities(): ListCapabilitiesResponse {
  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    domainTemplates,
    aestheticProfiles,
    colorPalettes,
    brandStyleReferences,
    plugins: capabilityPlugins,
    skills: designSkills,
    mcpToolBindings,
    automationLoopProfiles,
    defaults: {
      domainTemplateId: 'tpl_fintech_trust',
      aestheticProfileId: 'aes_trustworthy_saas',
      colorPaletteId: 'pal_blue_white_trust',
      brandStyleReferenceId: null,
      loopProfileId: 'loop_standard',
    },
  }
}

export function resolveCapabilitySnapshot(input: CapabilityRequirements | undefined): CapabilitySnapshot {
  const capabilities = listCapabilities()
  const domainTemplateId = input?.template?.domainTemplateId ?? capabilities.defaults.domainTemplateId
  const aestheticProfileId = input?.template?.aestheticProfileId ?? capabilities.defaults.aestheticProfileId
  const requestedPaletteId = input?.template?.colorPaletteId ?? capabilities.defaults.colorPaletteId
  const brandStyleReferenceId = input?.template?.brandStyleReferenceId ?? capabilities.defaults.brandStyleReferenceId
  const loopProfileId = input?.automation?.loopProfileId ?? capabilities.defaults.loopProfileId

  const domainTemplate = findById(capabilities.domainTemplates, domainTemplateId, 'DOMAIN_TEMPLATE_NOT_FOUND')
  const aestheticProfile = findById(capabilities.aestheticProfiles, aestheticProfileId, 'AESTHETIC_PROFILE_NOT_FOUND')
  const paletteId = aestheticProfile.colorPaletteIds.includes(requestedPaletteId) ? requestedPaletteId : aestheticProfile.colorPaletteIds[0] ?? requestedPaletteId
  const colorPalette = findById(capabilities.colorPalettes, paletteId, 'COLOR_PALETTE_NOT_FOUND')
  const brandStyleReference = brandStyleReferenceId
    ? findById(capabilities.brandStyleReferences, brandStyleReferenceId, 'BRAND_STYLE_REFERENCE_NOT_FOUND')
    : null
  const loopProfile = findById(capabilities.automationLoopProfiles, loopProfileId, 'LOOP_PROFILE_NOT_FOUND')
  const maxRepairAttempts = input?.automation?.maxRepairAttempts
  const maxCostCents = input?.automation?.maxCostCents
  const maxDurationMs = input?.automation?.maxDurationMs
  const pluginSnapshot = resolvePluginSnapshot(input, domainTemplate.category)

  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    template: {
      domainTemplate,
      aestheticProfile,
      colorPalette,
      brandStyleReference,
    },
    plugins: {
      skillIds: [...new Set(input?.plugins?.skillIds ?? [])],
      mcpToolIds: [...new Set(input?.plugins?.mcpToolIds ?? [])],
      pluginSnapshot,
    },
    automation: {
      loopProfile,
      maxRepairAttempts: typeof maxRepairAttempts === 'number'
        ? Math.max(0, Math.min(3, Math.trunc(maxRepairAttempts)))
        : loopProfile.maxRepairAttempts,
      maxCostCents: typeof maxCostCents === 'number'
        ? Math.max(0, Math.trunc(maxCostCents))
        : maxCostCents === null
          ? null
          : loopProfile.maxCostCents,
      maxDurationMs: typeof maxDurationMs === 'number'
        ? Math.max(1000, Math.min(900000, Math.trunc(maxDurationMs)))
        : loopProfile.maxDurationMs,
    },
  }
}

function findById<T extends { id: string }>(items: T[], id: string, code: string): T {
  const item = items.find(candidate => candidate.id === id)
  if (!item) throw capabilityError(code, `Capability not found: ${id}`)
  return item
}

function resolvePluginSnapshot(input: CapabilityRequirements | undefined, templateCategory: string): CapabilityPluginSnapshot {
  const skillIds = [...new Set(input?.plugins?.skillIds ?? [])]
  const mcpToolIds = [...new Set(input?.plugins?.mcpToolIds ?? [])]
  const selectedSkills = skillIds.map(skillId => findById(designSkills, skillId, 'DESIGN_SKILL_NOT_FOUND'))
  const selectedMcpBindings = mcpToolIds.map(toolId => findById(mcpToolBindings, toolId, 'MCP_TOOL_NOT_FOUND'))
  const selectedPluginIds = new Set([
    ...selectedSkills.map(skill => skill.pluginId),
    ...selectedMcpBindings.map(binding => binding.pluginId),
  ])
  const selectedPlugins = [...selectedPluginIds].map(pluginId => findById(capabilityPlugins, pluginId, 'CAPABILITY_PLUGIN_NOT_FOUND'))

  for (const plugin of selectedPlugins) {
    if (plugin.status !== 'active' || plugin.safetyLevel === 'disabled') {
      throw capabilityError('CAPABILITY_PLUGIN_DISABLED', `Capability plugin is not active: ${plugin.id}`)
    }
    if (!isMvpSafePluginPolicy(plugin.permissionPolicy.scopes)) {
      throw capabilityError('CAPABILITY_PLUGIN_SCOPE_FORBIDDEN', `Capability plugin requests unsupported MVP scopes: ${plugin.id}`)
    }
  }

  for (const skill of selectedSkills) {
    validateDeclarativeSkill(skill)
    if (!skill.allowedTemplateCategories.includes(templateCategory)) {
      throw capabilityError('DESIGN_SKILL_CATEGORY_FORBIDDEN', `Design skill ${skill.id} cannot be used with template category ${templateCategory}.`)
    }
  }

  for (const binding of selectedMcpBindings) {
    if (!binding.allowedTemplateCategories.includes(templateCategory)) {
      throw capabilityError('MCP_TOOL_CATEGORY_FORBIDDEN', `MCP tool ${binding.id} cannot be used with template category ${templateCategory}.`)
    }
    if (!isMvpSafePluginPolicy(binding.scopes)) {
      throw capabilityError('MCP_TOOL_SCOPE_FORBIDDEN', `MCP tool requests unsupported MVP scopes: ${binding.id}`)
    }
  }

  const scopes = [...new Set([
    ...selectedPlugins.flatMap(plugin => plugin.permissionPolicy.scopes),
    ...selectedMcpBindings.flatMap(binding => binding.scopes),
  ])]
  return {
    plugins: selectedPlugins,
    skills: selectedSkills,
    mcpToolBindings: selectedMcpBindings,
    toolPolicy: {
      allowedMcpToolIds: selectedMcpBindings.map(binding => binding.id),
      scopes,
      requiresUserAuth: selectedPlugins.some(plugin => plugin.permissionPolicy.requiresUserAuth) || selectedMcpBindings.some(binding => binding.requiresUserAuth),
      auditLevel: selectedPlugins.some(plugin => plugin.permissionPolicy.auditLevel === 'full')
        ? 'full'
        : selectedPlugins.some(plugin => plugin.permissionPolicy.auditLevel === 'usage') || selectedMcpBindings.length > 0
          ? 'usage'
          : 'none',
    },
  }
}

function validateDeclarativeSkill(skill: DesignSkill): void {
  const content = [
    ...skill.rules,
    ...skill.promptBlocks,
    ...skill.negativeRules,
    ...skill.qualityChecklist,
  ].join('\n')
  if (content.length > 5000) {
    throw capabilityError('DESIGN_SKILL_TOO_LARGE', `Design skill is too large: ${skill.id}`)
  }
  if (/(^|\s)(sudo|rm\s+-rf|curl|wget|chmod|chown|npm\s+install|pnpm\s+install|yarn\s+add)\b/i.test(content)) {
    throw capabilityError('DESIGN_SKILL_UNSAFE_INSTRUCTION', `Design skill contains unsafe executable instructions: ${skill.id}`)
  }
  if (/\b(ignore|override)\s+(previous|system|developer|runtime)\s+instructions?\b/i.test(content)) {
    throw capabilityError('DESIGN_SKILL_UNSAFE_INSTRUCTION', `Design skill attempts to override runtime instructions: ${skill.id}`)
  }
  if (/\/(?:var|tmp|workspace|app|root|etc|Users)\//.test(content)) {
    throw capabilityError('DESIGN_SKILL_UNSAFE_PATH', `Design skill references absolute filesystem paths: ${skill.id}`)
  }
}

function isMvpSafePluginPolicy(scopes: PluginPermissionScope[]): boolean {
  return scopes.every(scope => scope === 'readonly_context' || scope === 'asset_readonly' || scope === 'validation_only')
}

function capabilityError(code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = 400
  error.code = code
  return error
}
