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
}

export type EncyclopediaSpecReviewReport = {
  status: 'pass' | 'warn' | 'fail'
  findings: EncyclopediaSpecFinding[]
}

export function reviewDynamicEncyclopediaSpec(input: EncyclopediaSpecReviewInput): EncyclopediaSpecReviewReport {
  const html = input.html
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html
  const text = stripHtml(body)
  const findings: EncyclopediaSpecFinding[] = []

  addFindingIf(findings, !/<meta\b[^>]*name=["']viewport["']/i.test(html), {
    id: 'encyclopedia.viewport_meta_missing',
    source: 'static_rule',
    severity: 'error',
    message: 'Dynamic encyclopedia cards must include a viewport meta tag for mobile iframe rendering.',
    repairHint: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> in the document head.',
  })
  addFindingIf(findings, /<script\b[^>]*\bsrc=["'][^"']+["']/i.test(html), {
    id: 'encyclopedia.external_script_blocked',
    source: 'static_rule',
    severity: 'error',
    message: 'Dynamic encyclopedia cards cannot rely on external script files.',
    repairHint: 'Remove external script tags and implement any small interaction with inline, self-contained JavaScript or CSS-only states.',
  })
  addFindingIf(findings, !/overflow-y\s*:\s*auto|-webkit-overflow-scrolling\s*:\s*touch|class=["'][^"']*scroll-container/i.test(html), {
    id: 'encyclopedia.scroll_container_missing',
    source: 'template_rule',
    severity: 'error',
    message: 'Long encyclopedia content must live inside an explicit scroll container instead of relying on body scrolling.',
    repairHint: 'Wrap content in a .scroll-container with overflow-y:auto and -webkit-overflow-scrolling:touch; keep html/body overflow hidden for standalone pages.',
  })
  addFindingIf(findings, /touch-action\s*:\s*none/i.test(html), {
    id: 'encyclopedia.global_touch_blocked',
    source: 'template_rule',
    severity: 'error',
    message: 'Dynamic encyclopedia cards must not globally disable touch gestures.',
    repairHint: 'Remove global touch-action:none and use touch-action:pan-x pan-y or local control-specific touch handling only.',
  })
  addFindingIf(findings, /\bpreventDefault\s*\([^)]*\)|\bstopPropagation\s*\([^)]*\)/i.test(html) && /\btouch(move|start|end)\b/i.test(html), {
    id: 'encyclopedia.touch_intercept_risk',
    source: 'template_rule',
    severity: 'warning',
    message: 'Touch event interception can break iframe scrolling and native page gestures.',
    repairHint: 'Allow normal touch scrolling; if event handling is needed, scope it to precise controls and do not intercept .scroll-container gestures.',
  })
  addFindingIf(findings, !/(词条|百科|概览|简介|摘要|事实|基本信息|关键事实|时间线|发展|里程碑|相关|来源)/i.test(text), {
    id: 'encyclopedia.required_content_missing',
    source: 'template_rule',
    severity: 'warning',
    message: 'The artifact does not expose recognizable encyclopedia content structure.',
    repairHint: 'Add a compact entry title, neutral summary, key facts, and a source/fact hint section suited to the selected child template.',
  })
  addFindingIf(findings, /全球第一|行业第一|国内第一|唯一|首个|最佳|最强|顶级|领先全球|革命性|颠覆|震撼|必看|完美|无敌|权威认证/i.test(text), {
    id: 'encyclopedia.neutral_tone_risk',
    source: 'static_rule',
    severity: 'warning',
    message: 'Dynamic encyclopedia copy should avoid promotional or unverifiable superlative language.',
    repairHint: 'Rewrite marketing-like claims into neutral, attributable facts; keep subjective conclusions out of the card unless the source is shown.',
  })

  if (input.templatePackIds.includes('dtp_dynamic_encyclopedia_timeline_card')) {
    addFindingIf(findings, !/(时间线|发展|历程|阶段|里程碑|年份|上线|发布|成立)/i.test(text), {
      id: 'encyclopedia.timeline_template_mismatch',
      source: 'template_rule',
      severity: 'error',
      message: 'The selected timeline child template needs visible timeline or milestone content.',
      repairHint: 'Add a timeline section with dated or phased milestones; group sparse dates into phases rather than inventing exact dates.',
    })
  }

  const status = findings.some(finding => finding.severity === 'error')
    ? 'fail'
    : findings.length > 0
      ? 'warn'
      : 'pass'
  return { status, findings }
}

function addFindingIf(findings: EncyclopediaSpecFinding[], condition: boolean, finding: EncyclopediaSpecFinding): void {
  if (condition) findings.push(finding)
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
