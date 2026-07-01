import { createHash } from 'node:crypto'
import { parseDocument, stringify } from 'yaml'
import type {
  DesignTemplatePack,
  DesignTemplatePackImportResult,
  DesignTemplatePackLintFinding,
  DesignTokenTypography,
} from '@dudesign/contracts'

export const DESIGN_TEMPLATE_PACK_SCHEMA_VERSION = '2026-07-01.dudesign-template-pack.v1'

type ImportDesignMdOptions = {
  id?: string
  source?: DesignTemplatePack['source']
  visibility?: DesignTemplatePack['visibility']
  status?: DesignTemplatePack['status']
  createdByUserId?: string | null
}

type ParsedFrontMatter = {
  frontMatter: Record<string, unknown>
  body: string
  findings: DesignTemplatePackLintFinding[]
}

type ParsedSections = {
  overview?: string
  colors?: string
  typography?: string
  layout?: string
  elevation?: string
  shapes?: string
  components?: string
  rawDoDonts?: string
  extra: Record<string, string>
}

type ParsedSectionKey = Exclude<keyof ParsedSections, 'extra' | 'rawDoDonts'>

const canonicalSectionNames = new Map<string, ParsedSectionKey | 'doDonts'>([
  ['overview', 'overview'],
  ['brand & style', 'overview'],
  ['colors', 'colors'],
  ['typography', 'typography'],
  ['layout', 'layout'],
  ['layout & spacing', 'layout'],
  ['elevation & depth', 'elevation'],
  ['elevation', 'elevation'],
  ['shapes', 'shapes'],
  ['components', 'components'],
  ["do's and don'ts", 'doDonts'],
  ['dos and donts', 'doDonts'],
])

const dangerousInstructionPatterns = [
  /\bignore\s+(all\s+)?(previous|above|system|developer)\s+instructions?\b/i,
  /\boverride\s+(the\s+)?(system|developer|runtime|safety)\b/i,
  /\bdisable\s+(sandbox|guardrails?|safety|path\s+checks?)\b/i,
  /\bwrite\s+(outside|beyond)\s+(the\s+)?workspace\b/i,
  /\b\/etc\/passwd\b/i,
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
]

export function importDesignMd(markdown: string, options: ImportDesignMdOptions = {}): DesignTemplatePackImportResult {
  const findings: DesignTemplatePackLintFinding[] = []
  const parsed = parseFrontMatter(markdown)
  findings.push(...parsed.findings)

  const sections = parseMarkdownSections(parsed.body, findings)
  const tokens = normalizeDesignTokens(parsed.frontMatter, findings)
  const name = stringValue(parsed.frontMatter.name) || 'Imported Design Template'
  const description = stringValue(parsed.frontMatter.description) || null
  const version = stringValue(parsed.frontMatter.version) || '1.0.0'
  const bodyText = parsed.body.trim()

  lintRequiredTokens(tokens, findings)
  lintBrokenReferences(parsed.frontMatter, findings)
  lintContrast(tokens.components, tokens.colors, findings)
  lintDangerousInstructions(`${JSON.stringify(parsed.frontMatter)}\n${bodyText}`, findings)

  const pack: DesignTemplatePack = {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: options.id ?? `dtp_${stableHash(markdown).slice(0, 16)}`,
    source: options.source ?? 'imported',
    format: 'design-md',
    visibility: options.visibility ?? 'private',
    status: options.status ?? 'draft',
    name,
    description,
    version,
    designTokens: tokens,
    rationale: {
      overview: sections.overview ?? null,
      colors: sections.colors ?? null,
      typography: sections.typography ?? null,
      layout: sections.layout ?? null,
      elevation: sections.elevation ?? null,
      shapes: sections.shapes ?? null,
      components: sections.components ?? null,
      dos: extractDoDontList(sections.rawDoDonts ?? '').dos,
      donts: extractDoDontList(sections.rawDoDonts ?? '').donts,
      sections: sections.extra,
    },
    previewArtifactId: null,
    lintStatus: lintStatus(findings),
    createdByUserId: options.createdByUserId ?? null,
  }

  return {
    pack,
    findings,
    summary: summarizeFindings(findings),
  }
}

export function exportDesignTemplatePackToDesignMd(pack: DesignTemplatePack): string {
  const frontMatter: Record<string, unknown> = {
    name: pack.name,
    version: pack.version,
  }

  if (pack.description) {
    frontMatter.description = pack.description
  }
  addNonEmptyRecord(frontMatter, 'colors', pack.designTokens.colors)
  addNonEmptyRecord(frontMatter, 'typography', pack.designTokens.typography)
  addNonEmptyRecord(frontMatter, 'spacing', pack.designTokens.spacing)
  addNonEmptyRecord(frontMatter, 'rounded', pack.designTokens.rounded)
  addNonEmptyRecord(frontMatter, 'components', pack.designTokens.components)

  const sections: string[] = []
  pushSection(sections, 'Overview', pack.rationale.overview)
  pushSection(sections, 'Colors', pack.rationale.colors)
  pushSection(sections, 'Typography', pack.rationale.typography)
  pushSection(sections, 'Layout', pack.rationale.layout)
  pushSection(sections, 'Elevation & Depth', pack.rationale.elevation)
  pushSection(sections, 'Shapes', pack.rationale.shapes)
  pushSection(sections, 'Components', pack.rationale.components)
  pushDoDontSection(sections, pack.rationale.dos, pack.rationale.donts)

  for (const [title, content] of Object.entries(pack.rationale.sections)) {
    pushSection(sections, title, content)
  }

  const yamlSource = stringify(frontMatter, {
    lineWidth: 0,
    sortMapEntries: false,
  }).trimEnd()

  return `---\n${yamlSource}\n---\n\n${sections.join('\n\n')}\n`
}

function parseFrontMatter(markdown: string): ParsedFrontMatter {
  const findings: DesignTemplatePackLintFinding[] = []
  const normalized = markdown.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    findings.push(finding('warning', 'missing-frontmatter', 'frontMatter', 'DESIGN.md has no YAML front matter; tokens will be empty.'))
    return { frontMatter: {}, body: normalized, findings }
  }

  const endIndex = normalized.indexOf('\n---', 4)
  if (endIndex === -1) {
    findings.push(finding('error', 'unterminated-frontmatter', 'frontMatter', 'YAML front matter is missing the closing --- fence.'))
    return { frontMatter: {}, body: normalized, findings }
  }

  const yamlSource = normalized.slice(4, endIndex)
  const body = normalized.slice(endIndex).replace(/^\n---\n?/, '')
  let document: ReturnType<typeof parseDocument>
  try {
    document = parseDocument(yamlSource, { prettyErrors: false })
  } catch (error) {
    findings.push(finding('error', 'invalid-yaml', 'frontMatter', error instanceof Error ? error.message : 'YAML front matter could not be parsed.'))
    return { frontMatter: {}, body, findings }
  }

  for (const error of document.errors) {
    findings.push(finding('error', 'invalid-yaml', 'frontMatter', error.message))
  }
  for (const warning of document.warnings) {
    findings.push(finding('warning', 'yaml-warning', 'frontMatter', warning.message))
  }

  const frontMatter = document.toJSON() as unknown
  if (!isPlainObject(frontMatter)) {
    findings.push(finding('error', 'invalid-frontmatter', 'frontMatter', 'YAML front matter must be a mapping object.'))
    return { frontMatter: {}, body, findings }
  }

  return { frontMatter, body, findings }
}

function parseMarkdownSections(body: string, findings: DesignTemplatePackLintFinding[]): ParsedSections {
  const sections: ParsedSections = { extra: {} }
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)]
  const seen = new Set<string>()

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const title = match[1]?.trim() ?? ''
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? body.length
    const content = body.slice(start, end).trim()
    const normalizedTitle = normalizeHeading(title)

    if (seen.has(normalizedTitle)) {
      findings.push(finding('error', 'duplicate-section', `sections.${normalizedTitle}`, `Duplicate DESIGN.md section: ${title}.`))
      continue
    }
    seen.add(normalizedTitle)

    const key = canonicalSectionNames.get(normalizedTitle)
    if (key && key !== 'doDonts') {
      sections[key] = content
    } else if (key === 'doDonts') {
      sections.rawDoDonts = content
    } else if (title) {
      sections.extra[title] = content
      findings.push(finding('info', 'unknown-section', `sections.${title}`, `Unknown DESIGN.md section preserved: ${title}.`))
    }
  }

  return sections
}

function normalizeDesignTokens(frontMatter: Record<string, unknown>, findings: DesignTemplatePackLintFinding[]): DesignTemplatePack['designTokens'] {
  return {
    colors: normalizeStringRecord(frontMatter.colors, 'colors', findings, isCssColorLike),
    typography: normalizeTypography(frontMatter.typography, findings),
    spacing: normalizeDimensionRecord(frontMatter.spacing, 'spacing', findings),
    rounded: normalizeStringRecord(frontMatter.rounded, 'rounded', findings, value => isDimensionLike(value)),
    components: normalizeComponents(frontMatter.components, findings),
  }
}

function normalizeStringRecord(
  value: unknown,
  path: string,
  findings: DesignTemplatePackLintFinding[],
  validator: (value: string) => boolean,
): Record<string, string> {
  if (value == null) return {}
  if (!isPlainObject(value)) {
    findings.push(finding('error', 'invalid-token-group', path, `${path} must be a mapping object.`))
    return {}
  }
  const output: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    const stringified = typeof rawValue === 'string' || typeof rawValue === 'number' ? String(rawValue) : ''
    if (!stringified) {
      findings.push(finding('warning', 'invalid-token-value', `${path}.${key}`, `${path}.${key} must be a string or number.`))
      continue
    }
    if (!validator(stringified)) {
      findings.push(finding('warning', 'suspicious-token-value', `${path}.${key}`, `${path}.${key} has an unusual value: ${stringified}.`))
    }
    output[key] = stringified
  }
  return output
}

function normalizeDimensionRecord(value: unknown, path: string, findings: DesignTemplatePackLintFinding[]): Record<string, string | number> {
  if (value == null) return {}
  if (!isPlainObject(value)) {
    findings.push(finding('error', 'invalid-token-group', path, `${path} must be a mapping object.`))
    return {}
  }
  const output: Record<string, string | number> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === 'number') {
      output[key] = rawValue
      continue
    }
    if (typeof rawValue !== 'string') {
      findings.push(finding('warning', 'invalid-token-value', `${path}.${key}`, `${path}.${key} must be a CSS dimension string or number.`))
      continue
    }
    if (!isDimensionLike(rawValue)) {
      findings.push(finding('warning', 'suspicious-token-value', `${path}.${key}`, `${path}.${key} has an unusual dimension: ${rawValue}.`))
    }
    output[key] = rawValue
  }
  return output
}

function normalizeTypography(value: unknown, findings: DesignTemplatePackLintFinding[]): Record<string, DesignTokenTypography> {
  if (value == null) return {}
  if (!isPlainObject(value)) {
    findings.push(finding('error', 'invalid-token-group', 'typography', 'typography must be a mapping object.'))
    return {}
  }
  const output: Record<string, DesignTokenTypography> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (!isPlainObject(rawValue)) {
      findings.push(finding('warning', 'invalid-typography-token', `typography.${key}`, `typography.${key} must be an object.`))
      continue
    }
    const token: DesignTokenTypography = {}
    for (const property of ['fontFamily', 'fontSize', 'letterSpacing', 'fontFeature', 'fontVariation'] as const) {
      const propertyValue = rawValue[property]
      if (typeof propertyValue === 'string') {
        token[property] = propertyValue
      }
    }
    for (const property of ['fontWeight', 'lineHeight'] as const) {
      const propertyValue = rawValue[property]
      if (typeof propertyValue === 'string' || typeof propertyValue === 'number') {
        token[property] = propertyValue
      }
    }
    output[key] = token
  }
  return output
}

function normalizeComponents(value: unknown, findings: DesignTemplatePackLintFinding[]): Record<string, Record<string, unknown>> {
  if (value == null) return {}
  if (!isPlainObject(value)) {
    findings.push(finding('error', 'invalid-token-group', 'components', 'components must be a mapping object.'))
    return {}
  }
  const output: Record<string, Record<string, unknown>> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (!isPlainObject(rawValue)) {
      findings.push(finding('warning', 'invalid-component-token', `components.${key}`, `components.${key} must be an object.`))
      continue
    }
    output[key] = { ...rawValue }
  }
  return output
}

function addNonEmptyRecord(target: Record<string, unknown>, key: string, value: Record<string, unknown> | Record<string, string | number>): void {
  if (Object.keys(value).length > 0) {
    target[key] = value
  }
}

function pushSection(sections: string[], title: string, content: string | null | undefined): void {
  if (!content?.trim()) return
  sections.push(`## ${title}\n\n${content.trim()}`)
}

function pushDoDontSection(sections: string[], dos: string[], donts: string[]): void {
  const lines = [
    ...dos.map(item => `- Do: ${item}`),
    ...donts.map(item => `- Don't: ${item}`),
  ]
  if (lines.length > 0) {
    sections.push(`## Do's and Don'ts\n\n${lines.join('\n')}`)
  }
}

function lintRequiredTokens(tokens: DesignTemplatePack['designTokens'], findings: DesignTemplatePackLintFinding[]): void {
  if (Object.keys(tokens.colors).length > 0 && !tokens.colors.primary) {
    findings.push(finding('warning', 'missing-primary', 'colors.primary', 'Colors are defined but no primary color token exists.'))
  }
  if (Object.keys(tokens.colors).length > 0 && Object.keys(tokens.typography).length === 0) {
    findings.push(finding('warning', 'missing-typography', 'typography', 'Colors are defined but no typography tokens exist.'))
  }
}

function lintBrokenReferences(frontMatter: Record<string, unknown>, findings: DesignTemplatePackLintFinding[]): void {
  const references = collectTokenReferences(frontMatter)
  for (const reference of references) {
    if (!resolveTokenPath(frontMatter, reference.reference)) {
      findings.push(finding('error', 'broken-ref', reference.path, `Token reference does not resolve: {${reference.reference}}.`))
    }
  }
}

function lintContrast(
  components: Record<string, Record<string, unknown>>,
  colors: Record<string, string>,
  findings: DesignTemplatePackLintFinding[],
): void {
  for (const [componentName, component] of Object.entries(components)) {
    const background = resolveColorComponent(component.backgroundColor, colors)
    const foreground = resolveColorComponent(component.textColor, colors)
    if (!background || !foreground) continue
    const ratio = contrastRatio(background, foreground)
    if (ratio == null) continue
    if (ratio < 4.5) {
      findings.push(finding('warning', 'contrast-ratio', `components.${componentName}`, `Text contrast ratio is ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1.`))
    } else {
      findings.push(finding('info', 'contrast-ratio', `components.${componentName}`, `Text contrast ratio is ${ratio.toFixed(2)}:1.`))
    }
  }
}

function lintDangerousInstructions(text: string, findings: DesignTemplatePackLintFinding[]): void {
  for (const pattern of dangerousInstructionPatterns) {
    if (pattern.test(text)) {
      findings.push(finding('error', 'dangerous-instruction', 'content', 'Template contains instructions that appear to override safety, runtime, or workspace boundaries.'))
      return
    }
  }
}

function collectTokenReferences(value: unknown, path = ''): Array<{ path: string; reference: string }> {
  const references: Array<{ path: string; reference: string }> = []
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)) {
      references.push({ path, reference: match[1] ?? '' })
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => references.push(...collectTokenReferences(item, `${path}[${index}]`)))
  } else if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      references.push(...collectTokenReferences(nestedValue, path ? `${path}.${key}` : key))
    }
  }
  return references
}

function resolveTokenPath(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root
  for (const part of path.split('.')) {
    if (!isPlainObject(current) || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

function resolveColorComponent(value: unknown, colors: Record<string, string>): string | null {
  if (typeof value !== 'string') return null
  const referenceMatch = value.match(/^\{colors\.([a-zA-Z0-9_-]+)\}$/)
  if (referenceMatch) return colors[referenceMatch[1] ?? ''] ?? null
  return value
}

function contrastRatio(background: string, foreground: string): number | null {
  const bg = parseHexColor(background)
  const fg = parseHexColor(foreground)
  if (!bg || !fg) return null
  const bgLum = relativeLuminance(bg)
  const fgLum = relativeLuminance(fg)
  const lighter = Math.max(bgLum, fgLum)
  const darker = Math.min(bgLum, fgLum)
  return (lighter + 0.05) / (darker + 0.05)
}

function parseHexColor(color: string): [number, number, number] | null {
  const normalized = color.trim()
  const short = normalized.match(/^#([0-9a-f]{3})$/i)
  if (short) {
    const hex = short[1] ?? ''
    return [...hex].map(value => Number.parseInt(`${value}${value}`, 16)) as [number, number, number]
  }
  const long = normalized.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i)
  if (!long) return null
  const hex = long[1] ?? ''
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(channel => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function extractDoDontList(content: string): { dos: string[]; donts: string[] } {
  const dos: string[] = []
  const donts: string[] = []
  for (const line of content.split('\n')) {
    const clean = line.replace(/^[-*]\s*/, '').trim()
    if (!clean) continue
    if (/^(don't|dont|do not|donts|don'ts|don't:|dont:)/i.test(clean)) {
      donts.push(clean.replace(/^(?:don'ts?|donts?|do not)\s*:?\s*-?\s*/i, '').trim())
    } else if (/^(do|dos|do:|do\s+-)/i.test(clean)) {
      dos.push(clean.replace(/^do(?:s)?\s*:?\s*-?\s*/i, '').trim())
    }
  }
  return { dos, donts }
}

function lintStatus(findings: DesignTemplatePackLintFinding[]): DesignTemplatePack['lintStatus'] {
  const summary = summarizeFindings(findings)
  if (summary.errors > 0) return 'failed'
  if (summary.warnings > 0) return 'warning'
  return 'passed'
}

function summarizeFindings(findings: DesignTemplatePackLintFinding[]): DesignTemplatePackImportResult['summary'] {
  return {
    errors: findings.filter(item => item.severity === 'error').length,
    warnings: findings.filter(item => item.severity === 'warning').length,
    info: findings.filter(item => item.severity === 'info').length,
  }
}

function finding(
  severity: DesignTemplatePackLintFinding['severity'],
  code: string,
  path: string,
  message: string,
): DesignTemplatePackLintFinding {
  return { severity, code, path, message }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isCssColorLike(value: string): boolean {
  const trimmed = value.trim()
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)
    || /^(rgb|rgba|hsl|hsla|oklch|oklab|lch|lab|color-mix)\(/i.test(trimmed)
    || /^[a-z]+$/i.test(trimmed)
    || trimmed === 'transparent'
}

function isDimensionLike(value: string): boolean {
  return /^-?\d+(\.\d+)?(px|em|rem|%)$/.test(value.trim()) || value.trim() === '0'
}

function normalizeHeading(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
