import { createHash } from 'node:crypto'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import postcss, { type AtRule, type Declaration, type Rule } from 'postcss'
import type {
  CapabilityExtractionEvidence,
  ComponentBlueprint,
  DesignTemplateDraftV2,
  ResponsiveRule,
  SectionBlueprint,
} from '@dudesign/contracts'

type HtmlNode = DefaultTreeAdapterMap['node']
type HtmlElement = DefaultTreeAdapterMap['element']

export type HtmlTemplateExtractionInput = {
  name: string
  description?: string | null
  html: string
  cssFiles?: Array<{ path: string; content: string }>
  source: {
    artifactId: string
    artifactVersion: number
    contentHash: string
    entryPath: string
  }
}

type Candidate = {
  value: string
  count: number
  preferredName: string | null
  evidence: CapabilityExtractionEvidence[]
}

export function extractHtmlTemplateDraft(input: HtmlTemplateExtractionInput): DesignTemplateDraftV2 {
  const document = parse(input.html, { sourceCodeLocationInfo: true })
  const inlineStyles = collectElements(document, element => element.tagName === 'style')
    .map((element, index) => ({
      path: `html.style[${index}]`,
      content: textContent(element),
    }))
  const styleAttributes = collectElements(document, element => Boolean(attribute(element, 'style')))
    .map((element, index) => ({
      path: `html.inline-style[${index}]`,
      content: `.__dudesign_inline_${index}{${attribute(element, 'style') ?? ''}}`,
    }))
  const cssSources = [
    ...(input.cssFiles ?? []),
    ...inlineStyles,
    ...styleAttributes,
  ]

  const css = extractCss(cssSources)
  const sections = extractSections(document)
  const components = extractComponents(document)
  const interactionParadigmIds = interactionIds(components)
  const htmlEvidence = evidence(
    `artifact:${input.source.artifactId}@${input.source.artifactVersion}:${input.source.entryPath}`,
    input.html.slice(0, 240),
    'htmlExamples[0]',
    'deterministic',
    1,
  )

  return {
    schemaVersion: 'dudesign-template-draft.v2',
    name: input.name.trim() || 'Extracted HTML Template',
    description: input.description?.trim() || null,
    designTokens: {
      colors: css.colors,
      typography: css.typography,
      spacing: css.spacing,
      rounded: css.rounded,
      components: {
        elevation: css.elevation,
      },
    },
    rationale: {
      overview: `Extracted from frozen HTML artifact ${input.source.artifactId} v${input.source.artifactVersion}.`,
      colors: Object.keys(css.colors).length > 0 ? 'Frequent and declared CSS colors extracted from the source artifact.' : null,
      typography: Object.keys(css.typography).length > 0 ? 'Typography roles inferred from CSS selectors and declarations.' : null,
      layout: sections.length > 0 ? `Detected ${sections.length} page sections from semantic DOM structure.` : null,
      elevation: Object.keys(css.elevation).length > 0 ? 'Box-shadow and elevation values extracted from CSS declarations.' : null,
      shapes: Object.keys(css.rounded).length > 0 ? 'Border radius values extracted from CSS declarations.' : null,
      components: components.length > 0 ? `Detected ${components.length} repeated or interactive component candidates.` : null,
      dos: [],
      donts: [
        'Use the reference HTML only for structure, layout rhythm, and visual direction.',
        'Do not copy source-specific text, facts, personal data, logos, or protected brand assets.',
      ],
      sections: Object.fromEntries(sections.map(section => [section.id, `${section.role}${section.layout ? `; ${section.layout}` : ''}`])),
    },
    responsiveRules: css.responsiveRules,
    sectionBlueprints: sections,
    componentBlueprints: components,
    interactionParadigmIds,
    htmlExamples: [{
      artifactId: input.source.artifactId,
      artifactVersion: input.source.artifactVersion,
      contentHash: input.source.contentHash,
      entryPath: input.source.entryPath,
      sanitizationStatus: 'pending',
      notes: [
        'Source is frozen to artifact id, version, and content hash.',
        'Sanitization must pass before this reference can be published or compiled into runtime context.',
      ],
    }],
    sourceEvidence: [...css.evidence, ...sections.flatMap(sectionEvidence), ...components.flatMap(componentEvidence), htmlEvidence],
    confidence: {
      'designTokens.colors': confidenceForCount(Object.keys(css.colors).length, 0.55, 0.96),
      'designTokens.typography': confidenceForCount(Object.keys(css.typography).length, 0.5, 0.9),
      'designTokens.spacing': confidenceForCount(Object.keys(css.spacing).length, 0.45, 0.88),
      sectionBlueprints: confidenceForCount(sections.length, 0.5, 0.92),
      componentBlueprints: confidenceForCount(components.length, 0.4, 0.85),
      responsiveRules: confidenceForCount(css.responsiveRules.length, 0.6, 0.94),
    },
  }
}

function extractCss(sources: Array<{ path: string; content: string }>) {
  const colors = new Map<string, Candidate>()
  const spacing = new Map<string, Candidate>()
  const rounded = new Map<string, Candidate>()
  const elevation = new Map<string, Candidate>()
  const typography: DesignTemplateDraftV2['designTokens']['typography'] = {}
  const responsiveRules: ResponsiveRule[] = []
  const evidenceList: CapabilityExtractionEvidence[] = []

  for (const source of sources) {
    if (!source.content.trim()) continue
    let root
    try {
      root = postcss.parse(source.content, { from: source.path })
    } catch {
      continue
    }
    root.walkDecls(declaration => {
      const sourcePath = cssDeclarationPath(source.path, declaration)
      const target = classifyDeclaration(declaration)
      if (!target) return
      if (target.kind === 'typography') {
        const role = typographyRole(declaration.parent?.type === 'rule' ? (declaration.parent as Rule).selector : 'body')
        const current = typography[role] ?? {}
        typography[role] = {
          ...current,
          ...typographyProperty(declaration),
        }
        evidenceList.push(evidence(sourcePath, declaration.toString(), `designTokens.typography.${role}.${target.tokenName}`, 'deterministic', 0.82))
        return
      }
      const candidates = target.kind === 'color'
        ? colors
        : target.kind === 'spacing'
          ? spacing
          : target.kind === 'rounded'
            ? rounded
            : elevation
      addCandidate(
        candidates,
        target.value,
        target.tokenName,
        evidence(sourcePath, declaration.toString(), `designTokens.${tokenCollectionName(target.kind)}.${target.tokenName}`, 'deterministic', 0.86),
      )
    })
    root.walkAtRules('media', atRule => {
      responsiveRules.push(responsiveRuleFromAtRule(source.path, atRule, responsiveRules.length))
      evidenceList.push(evidence(
        `${source.path}:@media ${atRule.params}`,
        atRule.toString().slice(0, 240),
        `responsiveRules[${responsiveRules.length - 1}]`,
        'deterministic',
        0.92,
      ))
    })
  }

  const colorTokens = materializeCandidates(colors, 'color', 'designTokens.colors')
  const spacingTokens = materializeCandidates(spacing, 'space', 'designTokens.spacing')
  const roundedTokens = materializeCandidates(rounded, 'radius', 'designTokens.rounded')
  const elevationTokens = materializeCandidates(elevation, 'shadow', 'designTokens.components.elevation')

  return {
    colors: colorTokens.values,
    typography,
    spacing: spacingTokens.values,
    rounded: roundedTokens.values,
    elevation: Object.fromEntries(Object.entries(elevationTokens.values).map(([key, value]) => [key, { boxShadow: value }])),
    responsiveRules,
    evidence: [
      ...evidenceList,
      ...colorTokens.evidence,
      ...spacingTokens.evidence,
      ...roundedTokens.evidence,
      ...elevationTokens.evidence,
    ],
  }
}

function extractSections(root: HtmlNode): SectionBlueprint[] {
  const candidates = collectElements(root, element =>
    ['header', 'main', 'section', 'article', 'aside', 'footer', 'nav'].includes(element.tagName)
    || hasSectionLikeIdentity(element),
  )
  const seen = new Set<string>()
  const sections: SectionBlueprint[] = []
  for (const element of candidates) {
    const identity = elementIdentity(element)
    if (seen.has(identity)) continue
    seen.add(identity)
    const order = sections.length
    const role = sectionRole(element, order)
    sections.push({
      id: stableId('section', identity || `${element.tagName}-${order}`),
      name: sectionName(element, role, order),
      role,
      order,
      required: order === 0 || element.tagName === 'main' || role === 'hero' || role === 'summary',
      layout: layoutHint(element),
      evidencePaths: [domPath(element)],
    })
  }
  return sections.slice(0, 40)
}

function extractComponents(root: HtmlNode): ComponentBlueprint[] {
  const components: ComponentBlueprint[] = []
  const repeated = repeatedClassGroups(root)
  for (const item of repeated) {
    components.push({
      id: stableId('component', item.className),
      name: humanize(item.className),
      role: componentRoleFromName(item.className),
      repeatable: true,
      states: [],
      interactionParadigmIds: interactionIdsForName(item.className),
      evidencePaths: item.paths.slice(0, 5),
    })
  }

  const interactive = collectElements(root, element => interactiveRole(element) !== null)
  for (const element of interactive) {
    const role = interactiveRole(element)
    if (!role) continue
    const identity = elementIdentity(element)
    const id = stableId('component', `${role}:${identity}`)
    if (components.some(component => component.id === id)) continue
    components.push({
      id,
      name: sectionName(element, role, components.length),
      role,
      repeatable: false,
      states: interactionStates(role, element),
      interactionParadigmIds: interactionIdsForName(`${role} ${identity}`),
      evidencePaths: [domPath(element)],
    })
  }
  return components.slice(0, 60)
}

function classifyDeclaration(declaration: Declaration):
  | { kind: 'color' | 'spacing' | 'rounded' | 'elevation'; value: string; tokenName: string }
  | { kind: 'typography'; value: string; tokenName: string }
  | null {
  const prop = declaration.prop.toLowerCase()
  const value = declaration.value.trim()
  const customName = prop.startsWith('--') ? normalizeTokenName(prop.slice(2)) : ''
  if (prop.startsWith('--')) {
    if (isColor(value)) return { kind: 'color', value, tokenName: customName }
    if (isLength(value) && /space|gap|padding|margin/i.test(prop)) return { kind: 'spacing', value, tokenName: customName }
    if (isLength(value) && /radius|rounded/i.test(prop)) return { kind: 'rounded', value, tokenName: customName }
    if (/shadow/i.test(prop)) return { kind: 'elevation', value, tokenName: customName }
  }
  if (/^(color|background|background-color|border-color|outline-color|fill|stroke)$/.test(prop) && isColor(value)) {
    return { kind: 'color', value, tokenName: normalizeTokenName(`${prop}-${value}`) }
  }
  if (/^(gap|row-gap|column-gap|padding|padding-.+|margin|margin-.+)$/.test(prop) && isLength(value)) {
    return { kind: 'spacing', value, tokenName: normalizeTokenName(`${prop}-${value}`) }
  }
  if (prop === 'border-radius' && isLength(value)) {
    return { kind: 'rounded', value, tokenName: normalizeTokenName(value) }
  }
  if (prop === 'box-shadow' && value && value !== 'none') {
    return { kind: 'elevation', value, tokenName: normalizeTokenName(value) }
  }
  if (['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'].includes(prop)) {
    return { kind: 'typography', value, tokenName: camelCase(prop) }
  }
  return null
}

function typographyProperty(declaration: Declaration) {
  const property = camelCase(declaration.prop)
  if (property === 'fontWeight') {
    const numeric = Number(declaration.value)
    return { fontWeight: Number.isFinite(numeric) ? numeric : declaration.value }
  }
  return { [property]: declaration.value }
}

function responsiveRuleFromAtRule(path: string, atRule: AtRule, index: number): ResponsiveRule {
  const min = atRule.params.match(/min-width\s*:\s*(\d+)px/i)
  const max = atRule.params.match(/max-width\s*:\s*(\d+)px/i)
  const maxWidth = max ? Number(max[1]) : null
  const target = maxWidth !== null && maxWidth <= 600
    ? 'mobile'
    : maxWidth !== null && maxWidth <= 1024
      ? 'tablet'
      : 'custom'
  return {
    id: stableId('responsive', `${path}:${atRule.params}:${index}`),
    target,
    minWidth: min ? Number(min[1]) : null,
    maxWidth,
    viewport: null,
    rules: childRules(atRule).slice(0, 30),
  }
}

function childRules(atRule: AtRule): string[] {
  const rules: string[] = []
  atRule.walkRules(rule => {
    const declarations: string[] = []
    rule.walkDecls(decl => {
      declarations.push(decl.toString())
    })
    rules.push(`${rule.selector} { ${declarations.join('; ')} }`)
  })
  return rules
}

function repeatedClassGroups(root: HtmlNode): Array<{ className: string; paths: string[] }> {
  const classes = new Map<string, string[]>()
  for (const element of collectElements(root, () => true)) {
    const classNames = (attribute(element, 'class') ?? '').split(/\s+/).filter(Boolean)
    for (const className of classNames) {
      const list = classes.get(className) ?? []
      list.push(domPath(element))
      classes.set(className, list)
    }
  }
  return [...classes.entries()]
    .filter(([className, paths]) => paths.length >= 2 && isComponentClass(className))
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([className, paths]) => ({ className, paths }))
    .slice(0, 30)
}

function collectElements(root: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement[] {
  const elements: HtmlElement[] = []
  const visit = (node: HtmlNode) => {
    if (isElement(node) && predicate(node)) elements.push(node)
    for (const child of childNodes(node)) visit(child)
  }
  visit(root)
  return elements
}

function childNodes(node: HtmlNode): HtmlNode[] {
  return 'childNodes' in node && Array.isArray(node.childNodes) ? node.childNodes : []
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node && typeof node.tagName === 'string'
}

function attribute(element: HtmlElement, name: string): string | null {
  return element.attrs.find(attr => attr.name === name)?.value ?? null
}

function textContent(node: HtmlNode): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  return childNodes(node).map(textContent).join('')
}

function domPath(element: HtmlElement): string {
  const location = element.sourceCodeLocation
  const line = location && 'startLine' in location ? location.startLine : null
  return `html.${element.tagName}${line ? `:line-${line}` : ''}${attribute(element, 'id') ? `#${attribute(element, 'id')}` : ''}`
}

function cssDeclarationPath(path: string, declaration: Declaration): string {
  const line = declaration.source?.start?.line
  const selector = declaration.parent?.type === 'rule' ? (declaration.parent as Rule).selector : ':root'
  return `${path}${line ? `:line-${line}` : ''}:${selector}.${declaration.prop}`
}

function addCandidate(
  map: Map<string, Candidate>,
  value: string,
  preferredName: string,
  itemEvidence: CapabilityExtractionEvidence,
): void {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const current = map.get(normalized) ?? {
    value: normalized,
    count: 0,
    preferredName: preferredName || null,
    evidence: [],
  }
  current.count += 1
  if (!current.preferredName && preferredName) current.preferredName = preferredName
  current.evidence.push(itemEvidence)
  map.set(normalized, current)
}

function materializeCandidates(
  map: Map<string, Candidate>,
  prefix: string,
  targetPrefix: string,
): { values: Record<string, string>; evidence: CapabilityExtractionEvidence[] } {
  const used = new Set<string>()
  const values: Record<string, string> = {}
  const evidenceItems: CapabilityExtractionEvidence[] = []
  const candidates = [...map.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 24)
  candidates.forEach((candidate, index) => {
    const preferred = candidate.preferredName ? normalizeTokenName(candidate.preferredName) : ''
    let name = preferred || `${prefix}${index + 1}`
    while (used.has(name)) name = `${name}-${index + 1}`
    used.add(name)
    values[name] = candidate.value
    evidenceItems.push(...candidate.evidence.map(item => ({
      ...item,
      targetPath: `${targetPrefix}.${name}`,
    })))
  })
  return { values, evidence: evidenceItems }
}

function hasSectionLikeIdentity(element: HtmlElement): boolean {
  const identity = elementIdentity(element)
  return /\b(hero|summary|overview|features?|pricing|timeline|gallery|members?|works?|faq|contact|content|panel|section)\b/i.test(identity)
}

function elementIdentity(element: HtmlElement): string {
  return [
    element.tagName,
    attribute(element, 'id') ?? '',
    attribute(element, 'class') ?? '',
    attribute(element, 'role') ?? '',
    attribute(element, 'aria-label') ?? '',
    attribute(element, 'data-testid') ?? '',
  ].join(' ').trim()
}

function sectionRole(element: HtmlElement, order: number): string {
  const identity = elementIdentity(element).toLowerCase()
  if (element.tagName === 'header' || /\bheader\b/.test(identity)) return 'header'
  if (element.tagName === 'nav' || /\bnav|tabs?\b/.test(identity)) return 'navigation'
  if (/\bhero\b/.test(identity)) return 'hero'
  if (/\bsummary|overview\b/.test(identity)) return 'summary'
  if (/\btimeline\b/.test(identity)) return 'timeline'
  if (/\bmember/.test(identity)) return 'member_collection'
  if (/\bworks?|portfolio\b/.test(identity)) return 'work_collection'
  if (element.tagName === 'footer') return 'footer'
  if (element.tagName === 'aside') return 'supporting'
  return order === 0 ? 'primary_content' : 'content_section'
}

function sectionName(element: HtmlElement, role: string, index: number): string {
  const label = attribute(element, 'aria-label')
    ?? attribute(element, 'data-title')
    ?? attribute(element, 'id')
    ?? primaryClass(element)
  return label ? humanize(label) : humanize(role || `section-${index + 1}`)
}

function layoutHint(element: HtmlElement): string | null {
  const identity = elementIdentity(element).toLowerCase()
  if (/\bgrid\b/.test(identity)) return 'grid'
  if (/\bcolumns?|split\b/.test(identity)) return 'multi-column'
  if (/\blist\b/.test(identity)) return 'list'
  if (/\btimeline\b/.test(identity)) return 'timeline'
  return null
}

function interactiveRole(element: HtmlElement): string | null {
  const identity = elementIdentity(element).toLowerCase()
  const role = (attribute(element, 'role') ?? '').toLowerCase()
  if (role === 'tab' || role === 'tablist' || /\btabs?\b/.test(identity)) return 'tabs'
  if (/\baccordion|disclosure\b/.test(identity) || attribute(element, 'aria-expanded') !== null) return 'accordion'
  if (role === 'dialog' || /\bmodal|dialog\b/.test(identity)) return 'modal'
  if (/\bpage-switcher|pagination|pager\b/.test(identity)) return 'page_switcher'
  if (/\bcarousel|slider\b/.test(identity)) return 'carousel'
  if (element.tagName === 'select' || /\bfilter|sort\b/.test(identity)) return 'local_filter'
  return null
}

function interactionStates(role: string, element: HtmlElement): string[] {
  const states = new Set<string>()
  if (role === 'tabs') {
    states.add('selected')
    states.add('unselected')
  }
  if (role === 'accordion') {
    states.add('expanded')
    states.add('collapsed')
  }
  if (role === 'modal') {
    states.add('open')
    states.add('closed')
  }
  if (attribute(element, 'aria-selected') !== null) states.add(`aria-selected:${attribute(element, 'aria-selected')}`)
  if (attribute(element, 'aria-expanded') !== null) states.add(`aria-expanded:${attribute(element, 'aria-expanded')}`)
  return [...states]
}

function interactionIds(components: ComponentBlueprint[]): string[] {
  return [...new Set(components.flatMap(component => component.interactionParadigmIds))]
}

function interactionIdsForName(value: string): string[] {
  const normalized = value.toLowerCase()
  const ids: string[] = []
  if (/\baccordion|disclosure|expand/.test(normalized)) ids.push('ip_expandable_facts')
  if (/\btimeline\b/.test(normalized)) ids.push('ip_timeline_story')
  if (/\brelation|graph\b/.test(normalized)) ids.push('ip_relation_map')
  return ids
}

function tokenCollectionName(kind: 'color' | 'spacing' | 'rounded' | 'elevation'): string {
  if (kind === 'color') return 'colors'
  if (kind === 'spacing') return 'spacing'
  if (kind === 'rounded') return 'rounded'
  return 'components.elevation'
}

function componentRoleFromName(name: string): string {
  const interactions = interactionIdsForName(name)
  if (interactions.length > 0) return interactions[0]!.replace(/^ip_/, '')
  if (/card/i.test(name)) return 'card'
  if (/item|row/i.test(name)) return 'list_item'
  if (/badge|chip|tag/i.test(name)) return 'status_label'
  return 'repeated_component'
}

function isComponentClass(className: string): boolean {
  return /card|item|row|tile|member|work|feature|stat|metric|badge|chip|tag|tab|panel|slide/i.test(className)
}

function primaryClass(element: HtmlElement): string | null {
  return (attribute(element, 'class') ?? '').split(/\s+/).find(Boolean) ?? null
}

function typographyRole(selector: string): string {
  const normalized = selector.toLowerCase()
  if (/\bh1\b|hero.*title|headline/.test(normalized)) return 'display'
  if (/\bh2\b|\bh3\b|section.*title/.test(normalized)) return 'heading'
  if (/button|\.btn|cta/.test(normalized)) return 'action'
  if (/caption|small|meta|eyebrow/.test(normalized)) return 'caption'
  return 'body'
}

function sectionEvidence(section: SectionBlueprint): CapabilityExtractionEvidence[] {
  return section.evidencePaths.map(path => evidence(path, section.name, `sectionBlueprints.${section.id}`, 'deterministic', 0.82))
}

function componentEvidence(component: ComponentBlueprint): CapabilityExtractionEvidence[] {
  return component.evidencePaths.map(path => evidence(path, component.name, `componentBlueprints.${component.id}`, 'deterministic', component.repeatable ? 0.86 : 0.78))
}

function evidence(
  sourcePath: string,
  sourceExcerpt: string,
  targetPath: string,
  extractionMethod: CapabilityExtractionEvidence['extractionMethod'],
  confidence: number,
): CapabilityExtractionEvidence {
  return {
    sourcePath,
    sourceExcerpt,
    targetPath,
    extractionMethod,
    confidence,
  }
}

function confidenceForCount(count: number, minimum: number, maximum: number): number {
  if (count === 0) return 0
  return Number(Math.min(maximum, minimum + Math.log2(count + 1) * 0.1).toFixed(2))
}

function isColor(value: string): boolean {
  return /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(|transparent$|currentcolor$)/i.test(value.trim())
}

function isLength(value: string): boolean {
  return /^-?(?:\d*\.)?\d+(?:px|rem|em|%|vh|vw|ch|ex|vmin|vmax)(?:\s+-?(?:\d*\.)?\d+(?:px|rem|em|%|vh|vw|ch|ex|vmin|vmax)){0,3}$/i.test(value.trim())
}

function normalizeTokenName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return normalized.slice(0, 60) || 'token'
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).trim()
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
}
