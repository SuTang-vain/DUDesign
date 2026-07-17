import { createHash } from 'node:crypto'
import { defaultTreeAdapter, parse, serialize, type DefaultTreeAdapterMap } from 'parse5'
import postcss from 'postcss'
import type { CapabilityAuthoringFinding } from '@dudesign/contracts'
import { redactAdminText } from './adminRedaction.js'

type HtmlNode = DefaultTreeAdapterMap['node']
type HtmlElement = DefaultTreeAdapterMap['element']
type HtmlText = DefaultTreeAdapterMap['textNode']

export type HtmlExampleSanitizationResult = {
  status: 'passed' | 'failed'
  html: string
  contentHash: string | null
  findings: CapabilityAuthoringFinding[]
}

const removableElements = new Set(['script', 'iframe', 'object', 'embed', 'form', 'base'])
const urlAttributes = new Set(['src', 'href', 'action', 'formaction', 'poster', 'data'])
const publicBrandNames = [
  'apple', 'google', 'microsoft', 'amazon', 'meta', 'facebook', 'instagram', 'tiktok',
  'netflix', 'spotify', 'airbnb', 'uber', 'tesla', 'vercel', 'linear', 'notion', 'figma',
]

export function sanitizeHtmlExample(sourceHtml: string): HtmlExampleSanitizationResult {
  const findings: CapabilityAuthoringFinding[] = []
  let document: DefaultTreeAdapterMap['document']
  try {
    document = parse(sourceHtml)
  } catch (error) {
    return {
      status: 'failed',
      html: '',
      contentHash: null,
      findings: [finding('error', 'html_example.parse_failed', 'html', error instanceof Error ? error.message : 'HTML could not be parsed.')],
    }
  }

  sanitizeNode(document, findings)
  const html = serialize(document)
  lintSanitizedHtml(html, findings)
  const hasErrors = findings.some(item => item.severity === 'error')
  return {
    status: hasErrors ? 'failed' : 'passed',
    html,
    contentHash: hasErrors ? null : `sha256:${createHash('sha256').update(html).digest('hex')}`,
    findings,
  }
}

function sanitizeNode(node: HtmlNode, findings: CapabilityAuthoringFinding[]): void {
  for (const child of [...childNodes(node)]) {
    if (isElement(child) && removableElements.has(child.tagName)) {
      findings.push(finding(
        'warning',
        `html_example.${child.tagName}_removed`,
        domPath(child),
        `${child.tagName} elements are not allowed in reusable HTML examples and were removed.`,
      ))
      defaultTreeAdapter.detachNode(child)
      continue
    }
    if (isElement(child)) sanitizeElement(child, findings)
    if (isTextNode(child)) sanitizeTextNode(child, findings)
    sanitizeNode(child, findings)
  }
}

function sanitizeElement(element: HtmlElement, findings: CapabilityAuthoringFinding[]): void {
  const nextAttrs = []
  for (const attr of element.attrs) {
    const name = attr.name.toLowerCase()
    const path = `${domPath(element)}@${name}`
    if (name.startsWith('on')) {
      findings.push(finding('warning', 'html_example.event_handler_removed', path, `Inline event handler ${name} was removed.`))
      continue
    }
    if (name === 'srcdoc') {
      findings.push(finding('warning', 'html_example.srcdoc_removed', path, 'srcdoc content was removed.'))
      continue
    }
    if (name === 'style') {
      const css = sanitizeStyleAttribute(attr.value, path, findings)
      if (css) nextAttrs.push({ ...attr, value: css })
      continue
    }
    if (urlAttributes.has(name)) {
      const sanitized = sanitizeUrl(attr.value, path, findings)
      if (sanitized !== null) nextAttrs.push({ ...attr, value: sanitized })
      continue
    }
    const redacted = redactSensitiveText(attr.value, path, findings)
    nextAttrs.push({ ...attr, value: redacted })
  }
  element.attrs = nextAttrs

  if (element.tagName === 'link' && /stylesheet/i.test(attribute(element, 'rel') ?? '')) {
    const href = attribute(element, 'href')
    if (!href || isExternalUrl(href)) {
      findings.push(finding('warning', 'html_example.external_stylesheet_removed', domPath(element), 'External stylesheets are not allowed and the link was removed.'))
      defaultTreeAdapter.detachNode(element)
      return
    }
  }
  if (element.tagName === 'style') sanitizeStyleElement(element, findings)
  lintBrandRisk(element, findings)
}

function sanitizeStyleElement(element: HtmlElement, findings: CapabilityAuthoringFinding[]): void {
  const source = textContent(element)
  const result = sanitizeCss(source, domPath(element), findings)
  element.childNodes = [defaultTreeAdapter.createTextNode(result)]
  element.childNodes[0]!.parentNode = element
}

function sanitizeStyleAttribute(value: string, path: string, findings: CapabilityAuthoringFinding[]): string {
  const wrapped = `.__dudesign_inline{${value}}`
  const sanitized = sanitizeCss(wrapped, path, findings)
  return sanitized.replace(/^\.__dudesign_inline\s*\{/, '').replace(/\}\s*$/, '').trim()
}

function sanitizeCss(source: string, path: string, findings: CapabilityAuthoringFinding[]): string {
  let root
  try {
    root = postcss.parse(source)
  } catch {
    findings.push(finding('warning', 'html_example.css_parse_failed', path, 'Malformed CSS was removed from the HTML example.'))
    return ''
  }
  root.walkAtRules(rule => {
    if (/^(import|charset|namespace)$/i.test(rule.name)) {
      findings.push(finding('warning', 'html_example.external_css_rule_removed', path, `@${rule.name} is not allowed and was removed.`))
      rule.remove()
    }
  })
  root.walkDecls(declaration => {
    if (/url\s*\(/i.test(declaration.value)) {
      const external = [...declaration.value.matchAll(/url\s*\(\s*['"]?([^)'"\s]+)[^)]*\)/gi)]
        .some(match => isExternalUrl(match[1] ?? ''))
      if (external || /javascript:/i.test(declaration.value)) {
        findings.push(finding('warning', 'html_example.external_css_url_removed', path, `External or dangerous URL in ${declaration.prop} was removed.`))
        declaration.remove()
      }
    }
  })
  return root.toString()
}

function sanitizeTextNode(node: HtmlText, findings: CapabilityAuthoringFinding[]): void {
  const redacted = redactSensitiveText(node.value, 'html.text', findings)
  node.value = redacted
}

function redactSensitiveText(value: string, path: string, findings: CapabilityAuthoringFinding[]): string {
  const redacted = redactAdminText(value) ?? ''
  if (redacted !== value) {
    findings.push(finding('warning', 'html_example.sensitive_text_redacted', path, 'Email, secret, token, password, or absolute path content was redacted.'))
  }
  return redacted
}

function sanitizeUrl(value: string, path: string, findings: CapabilityAuthoringFinding[]): string | null {
  const normalized = value.trim()
  if (!normalized) return normalized
  if (/^(javascript|vbscript|file):/i.test(normalized)) {
    findings.push(finding('warning', 'html_example.dangerous_url_removed', path, 'Dangerous URL scheme was removed.'))
    return null
  }
  if (isExternalUrl(normalized)) {
    findings.push(finding('warning', 'html_example.external_resource_removed', path, 'External resource URL was removed.'))
    return null
  }
  if (isAbsoluteFilePath(normalized)) {
    findings.push(finding('warning', 'html_example.absolute_path_removed', path, 'Absolute filesystem path was removed.'))
    return null
  }
  return normalized
}

function lintBrandRisk(element: HtmlElement, findings: CapabilityAuthoringFinding[]): void {
  const identity = [element.tagName, ...element.attrs.map(attr => `${attr.name}=${attr.value}`)].join(' ').toLowerCase()
  if (/\b(logo|wordmark|brand-mark|trademark)\b/.test(identity)) {
    findings.push(finding('warning', 'html_example.brand_asset_review', domPath(element), 'Possible logo or brand mark requires human review before publication.'))
  }
  const brand = publicBrandNames.find(name => identity.includes(name))
  if (brand) {
    findings.push(finding('warning', 'html_example.public_brand_review', domPath(element), `Public brand reference "${brand}" requires trade dress and license review.`))
  }
}

function lintSanitizedHtml(html: string, findings: CapabilityAuthoringFinding[]): void {
  if (/<script\b|\son[a-z]+\s*=|javascript:|vbscript:/i.test(html)) {
    findings.push(finding('error', 'html_example.active_content_remaining', 'html', 'Active script content remains after sanitization.'))
  }
  if (/(?:src|href)=["'](?:https?:)?\/\//i.test(html) || /@import\b/i.test(html)) {
    findings.push(finding('error', 'html_example.external_dependency_remaining', 'html', 'External dependency remains after sanitization.'))
  }
  if (isAbsoluteFilePath(html)) {
    findings.push(finding('error', 'html_example.absolute_path_remaining', 'html', 'Absolute filesystem path remains after sanitization.'))
  }
}

function childNodes(node: HtmlNode): HtmlNode[] {
  return 'childNodes' in node && Array.isArray(node.childNodes) ? node.childNodes : []
}

function isElement(node: HtmlNode): node is HtmlElement {
  return defaultTreeAdapter.isElementNode(node)
}

function isTextNode(node: HtmlNode): node is HtmlText {
  return defaultTreeAdapter.isTextNode(node)
}

function attribute(element: HtmlElement, name: string): string | null {
  return element.attrs.find(attr => attr.name.toLowerCase() === name)?.value ?? null
}

function textContent(node: HtmlNode): string {
  if (isTextNode(node)) return node.value
  return childNodes(node).map(textContent).join('')
}

function domPath(element: HtmlElement): string {
  const id = attribute(element, 'id')
  const className = attribute(element, 'class')?.split(/\s+/).find(Boolean)
  return `html.${element.tagName}${id ? `#${id}` : className ? `.${className}` : ''}`
}

function isExternalUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value)
}

function isAbsoluteFilePath(value: string): boolean {
  return /(?:^|[\s"'`=(])\/(?:Users|home|var|tmp|private|Volumes|root|etc|workspace|app)\//i.test(value)
    || /\b[A-Za-z]:\\(?:Users|Temp|Windows|ProgramData)\\/i.test(value)
}

function finding(
  severity: CapabilityAuthoringFinding['severity'],
  code: string,
  path: string,
  message: string,
): CapabilityAuthoringFinding {
  return { severity, code, path, message }
}
