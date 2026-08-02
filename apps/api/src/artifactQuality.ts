import { inflateSync } from 'node:zlib'
import { getPooledChromiumBrowser } from './playwrightBrowserPool.js'

export type ArtifactQualityReport = {
  status: 'pass' | 'warn' | 'fail'
  issues: string[]
  specFindings?: Array<{
    id: string
    source: 'static_rule' | 'template_rule' | 'pixel_gate'
    severity: 'error' | 'warning'
    message: string
    repairHint: string
  }>
}

type PixelGateOptions = {
  enabled?: boolean
  timeoutMs?: number
}

export function analyzeHtmlArtifactQuality(html: string): ArtifactQualityReport {
  const issues: string[] = []
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''
  const visibleText = stripHtml(body)
  const hasMeaningfulText = visibleText.replace(/\s+/g, '').length >= 24
  const hasVisualStructure = /<(main|section|article|header|nav|footer|h1|h2|p|button|a|img|svg|canvas)\b/i.test(body)
  const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1] ?? '')
    .filter(src => /^https?:\/\//i.test(src) || src.startsWith('//'))
  const externalStylesheets = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1] ?? '')
    .filter(href => /^https?:\/\//i.test(href) || href.startsWith('//'))
  const dynamicCardRootCount = [...html.matchAll(/<[a-z][\w:-]*\b[^>]*\bdata-dudesign-template(?:\s*=\s*["'][^"']*["'])?[^>]*>/gi)].length
  const rootOnlyShell = /<div\b[^>]*\bid=["']root["'][^>]*>\s*<\/div>/i.test(body)
    || /<div\b[^>]*\bid=["']app["'][^>]*>\s*<\/div>/i.test(body)
  const loadingOnly = /\b(loading|please wait|spinner|initializing)\b/i.test(visibleText) && visibleText.length < 80
  const darkShellRisk = /background(?:-color)?\s*:\s*(#000|#000000|black|rgb\(0\s*,\s*0\s*,\s*0\))/i.test(html)
    && !hasMeaningfulText

  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) issues.push('HTML is not a complete document.')
  if (!body.trim()) issues.push('Body is empty.')
  if (!hasMeaningfulText && !hasVisualStructure) issues.push('Body does not contain visible page content.')
  if (rootOnlyShell) issues.push('Page appears to depend on client-side hydration.')
  if (loadingOnly) issues.push('Page appears to be a loading shell.')
  if (externalScripts.length > 0) issues.push(`External scripts are blocked in preview: ${externalScripts.slice(0, 3).join(', ')}.`)
  if (externalStylesheets.length > 0) issues.push(`External stylesheets may not be bundled: ${externalStylesheets.slice(0, 3).join(', ')}.`)
  if (dynamicCardRootCount > 1) issues.push(`HTML declares ${dynamicCardRootCount} dynamic card roots; keep exactly one [data-dudesign-template] root.`)
  if (darkShellRisk) issues.push('Preview has a black-screen risk because the page is dark and has little visible content.')

  return qualityReport(issues)
}

export async function analyzeHtmlArtifactQualityWithPixelGate(
  html: string,
  options: PixelGateOptions = {},
): Promise<ArtifactQualityReport> {
  const base = analyzeHtmlArtifactQuality(html)
  if (!options.enabled) return base
  try {
    const pixelIssues = await analyzeRenderedPixelIssues(html, options.timeoutMs)
    return mergeQualityReports(base, qualityReport(pixelIssues))
  } catch (error) {
    return mergeQualityReports(base, {
      status: 'warn',
      issues: [`Pixel quality gate could not run: ${pixelGateErrorMessage(error)}.`],
    })
  }
}

function pixelGateErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown error'
  if (/Executable doesn't exist/i.test(message) && /ms-playwright|playwright install/i.test(message)) {
    return 'Playwright browser is not installed in this environment; rendered screenshot checks are disabled'
  }
  return message.split('\n')[0] ?? 'unknown error'
}

async function analyzeRenderedPixelIssues(
  html: string,
  timeoutMs = 6000,
): Promise<string[]> {
  const browser = await getPooledChromiumBrowser()
  const viewports = [
    { label: 'desktop', width: 1280, height: 900 },
    { label: 'extreme-small', width: 300, height: 360 },
  ] as const
  const issues: string[] = []
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    })
    try {
      page.setDefaultTimeout(timeoutMs)
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      await page.waitForTimeout(250)
      issues.push(...await page.evaluate(({
        label,
        width,
        height,
      }: {
        label: string
        width: number
        height: number
      }) => {
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const isExtremeSmall = label === 'extreme-small'
        const supportedFrame = (rect: DOMRect): boolean => (
          (Math.abs(rect.width - 788) <= 4 && Math.abs(rect.height - 492) <= 4)
          || (Math.abs(rect.width - 380) <= 4 && Math.abs(rect.height - 456) <= 4)
          || (Math.abs(rect.width - 300) <= 4 && Math.abs(rect.height - 360) <= 4)
        )
        const strongCandidates = Array.from(new Set([
          ...document.querySelectorAll<HTMLElement>('[data-dudesign-template]'),
          ...document.querySelectorAll<HTMLElement>('.pc-card-frame, .pc-card, .no-scroll-frame'),
        ]))
        const supportedStrongCandidates = strongCandidates.filter(element => supportedFrame(element.getBoundingClientRect()))
        const supportedFallbackCandidates = Array.from(document.querySelectorAll<HTMLElement>('#app, #app-container'))
          .filter(element => supportedFrame(element.getBoundingClientRect()))
        const frame = supportedStrongCandidates[0]
          ?? (isExtremeSmall ? strongCandidates[0] : undefined)
          ?? supportedFallbackCandidates[0]
        if (!frame) return []

        const frameRect = frame.getBoundingClientRect()
        const localIssues: string[] = []
        const expectedX = (viewportWidth - frameRect.width) / 2
        const expectedY = (viewportHeight - frameRect.height) / 2
        if (Math.abs(frameRect.x - expectedX) > 24 || Math.abs(frameRect.y - expectedY) > 24) {
          localIssues.push(`${label}: rendered fixed-card frame is not centered in the preview viewport.`)
        }
        if (isExtremeSmall && (Math.abs(frameRect.width - width) > 4 || Math.abs(frameRect.height - height) > 4)) {
          localIssues.push('Extreme-small viewport is not adapted to a 300x360 fixed-card frame.')
        }

        const visibleInFrame = (element: HTMLElement): boolean => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity) > 0.01
            && rect.width > 2
            && rect.height > 2
            && rect.right > frameRect.left
            && rect.left < frameRect.right
            && rect.bottom > frameRect.top
            && rect.top < frameRect.bottom
        }
        const controls = Array.from(frame.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [role="button"], [role="tab"]',
        )).filter(visibleInFrame)
        const allTabs = Array.from(frame.querySelectorAll<HTMLElement>('[role="tab"]'))
        const visibleTabs = allTabs.filter(tab => controls.includes(tab))
        const visibleControlGroups = Array.from(frame.querySelectorAll<HTMLElement>(
          'nav, [role="tablist"], [data-dudesign-control-group], .tabs, .tab-bar, .segmented-control, .page-switcher, .filters, .filter-bar',
        )).filter(element => visibleInFrame(element) && Array.from(element.querySelectorAll<HTMLElement>(
          'button, a[href], [role="tab"], [role="button"]',
        )).some(control => controls.includes(control)))

        const visibleTextLength = (() => {
          const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT)
          const visibleText: string[] = []
          let node = walker.nextNode()
          while (node) {
            const parent = node.parentElement
            if (parent && visibleInFrame(parent)) {
              const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
              if (text) visibleText.push(text)
            }
            node = walker.nextNode()
          }
          return visibleText.join(' ').replace(/\s+/g, '').length
        })()

        const repeatedSurfaceSelectors = 'article, aside, [class*="card"], [class*="panel"], [class*="tile"], [class*="fact"], [class*="stat"]'
        const repeatedSurfaceGroups = Array.from(frame.querySelectorAll<HTMLElement>('*')).map(parent => {
          const surfaces = Array.from(parent.children).filter((child): child is HTMLElement => (
            child instanceof HTMLElement
            && child.matches(repeatedSurfaceSelectors)
            && visibleInFrame(child)
            && child.getBoundingClientRect().width * child.getBoundingClientRect().height >= 1400
          ))
          return surfaces.length
        })
        const largestRepeatedSurfaceGroup = Math.max(0, ...repeatedSurfaceGroups)
        const profileLabel = ''

        if (!isExtremeSmall) {
          const maxDesktopControls = 12
          const maxDesktopControlGroups = 2
          const maxDesktopVisibleItems = 8
          if (controls.length > maxDesktopControls) {
            localIssues.push(`Desktop first view${profileLabel} exposes ${controls.length} visible controls; keep at most ${maxDesktopControls} and move secondary choices behind the primary interaction.`)
          }
          if (visibleControlGroups.length > maxDesktopControlGroups) {
            localIssues.push(`Desktop first view${profileLabel} exposes ${visibleControlGroups.length} separate control groups; keep at most ${maxDesktopControlGroups} around one primary selector and one local disclosure path.`)
          }
          if (visibleTextLength > 720) {
            localIssues.push(`Desktop first view exposes ${visibleTextLength} visible text characters; replace simultaneous detail modules with progressive reveal.`)
          }

          if (largestRepeatedSurfaceGroup > maxDesktopVisibleItems) {
            localIssues.push(`Desktop first view${profileLabel} renders ${largestRepeatedSurfaceGroup} equal-level content surfaces in one group; keep at most ${maxDesktopVisibleItems} and preserve one dominant stage plus a compact selected-detail surface.`)
          }
        }

        if (isExtremeSmall && allTabs.length > 0 && visibleTabs.length === 0 && controls.length === 0) {
          localIssues.push('Extreme-small viewport hides every page-switching tab without providing an alternative primary interaction.')
        }
        if (isExtremeSmall && controls.length === 0) {
          localIssues.push('Extreme-small viewport has no visible primary interaction control.')
        }
        const maxSmallTabs = 4
        if (isExtremeSmall && visibleTabs.length > maxSmallTabs) {
          localIssues.push(`Extreme-small viewport${profileLabel} exposes ${visibleTabs.length} visible primary tabs; keep at most ${maxSmallTabs}.`)
        }
        const visibleTopicControls = controls.filter(control => !visibleTabs.includes(control))
        const maxSmallControls = 7
        const maxSmallTopicControls = Math.max(0, maxSmallControls - visibleTabs.length)
        if (isExtremeSmall && controls.length > maxSmallControls) {
          localIssues.push(`Extreme-small viewport${profileLabel} exposes ${controls.length} visible controls in total; keep at most ${maxSmallControls}.`)
        }
        if (isExtremeSmall && visibleTopicControls.length > maxSmallTopicControls) {
          localIssues.push(`Extreme-small viewport${profileLabel} exposes ${visibleTopicControls.length} additional topic controls; keep at most ${maxSmallTopicControls} after the primary tabs.`)
        }

        if (isExtremeSmall) {
          const fullyInsideFrame = (element: HTMLElement, tolerance = 2): boolean => {
            const rect = element.getBoundingClientRect()
            return rect.left >= frameRect.left - tolerance
              && rect.top >= frameRect.top - tolerance
              && rect.right <= frameRect.right + tolerance
              && rect.bottom <= frameRect.bottom + tolerance
          }
          const title = Array.from(frame.querySelectorAll<HTMLElement>(
            'h1, h2, [data-dudesign-core-title], .entry-title, .topic-title, .card-title, .title, .intro-name, .modal-person-name',
          )).find(visibleInFrame)
          if (!title) {
            localIssues.push('Extreme-small viewport does not keep a visible topic title or identity heading.')
          }

          const visibleCoreContentCandidates = Array.from(frame.querySelectorAll<HTMLElement>(
            '[data-dudesign-core-fact], [data-dudesign-core-summary], [data-dudesign-selected-detail], .entry-summary, .topic-summary, .summary, .description, .fact, .selected-detail, .detail, [role="tabpanel"], p',
          )).filter(element => visibleInFrame(element) && element !== title)
          const visibleCoreContent = visibleCoreContentCandidates.find(element => (
            (element.textContent ?? '').replace(/\s+/g, '').trim().length >= 8
          ))
          if (!visibleCoreContent) {
            localIssues.push('Extreme-small viewport does not keep a visible core topic fact or summary; preserve one concise answer beneath the topic identity.')
          }

          if (visibleTextLength < 24) {
            localIssues.push('Extreme-small viewport does not keep enough visible core topic text.')
          }
          const maxSmallTextCharacters = 520
          if (visibleTextLength > maxSmallTextCharacters) {
            localIssues.push(`Extreme-small viewport${profileLabel} initial view is overloaded with ${visibleTextLength} visible text characters; keep at most ${maxSmallTextCharacters} and move secondary details behind a local interaction.`)
          }
          const maxSmallVisibleItems = 8
          if (largestRepeatedSurfaceGroup > maxSmallVisibleItems) {
            localIssues.push(`Extreme-small viewport${profileLabel} renders ${largestRepeatedSurfaceGroup} equal-level visible items; keep at most ${maxSmallVisibleItems} in the initial state and page or reveal the rest.`)
          }

          const partiallyVisibleTextBlocks = Array.from(frame.querySelectorAll<HTMLElement>(
            'h1, h2, h3, p, blockquote, figcaption, [data-dudesign-core-title], [data-dudesign-core-fact], .summary, .description, .detail, .fact, .source',
          )).filter(element => {
            const text = (element.textContent ?? '').replace(/\s+/g, '').trim()
            return text.length >= 8 && visibleInFrame(element) && !fullyInsideFrame(element)
          })
          if (partiallyVisibleTextBlocks.length > 0) {
            const details = partiallyVisibleTextBlocks.slice(0, 4).map(element => (
              (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28)
            )).join(', ')
            localIssues.push(`Extreme-small viewport clips ${partiallyVisibleTextBlocks.length} visible core text blocks at the card edge (${details}); curate the compact state instead of cropping content.`)
          }

          const repeatedControlLabels = new Map<string, number>()
          for (const control of controls) {
            const controlLabel = (control.getAttribute('aria-label') || control.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
            if (controlLabel.length < 2) continue
            repeatedControlLabels.set(controlLabel, (repeatedControlLabels.get(controlLabel) ?? 0) + 1)
          }
          const duplicateLabels = [...repeatedControlLabels.entries()]
            .filter(([, count]) => count > 1)
            .map(([controlLabel]) => controlLabel)
          if (duplicateLabels.length > 0) {
            localIssues.push(`Extreme-small viewport exposes duplicate controls for the same labelled actions (${duplicateLabels.slice(0, 4).join(', ')}); keep one compact control group.`)
          }

          if (visibleControlGroups.length > 2) {
            localIssues.push(`Extreme-small viewport exposes ${visibleControlGroups.length} separate control groups; consolidate compact navigation around one primary interaction and one optional disclosure control.`)
          }

          const hasHiddenContent = Array.from(frame.querySelectorAll<HTMLElement>(
            '[hidden], [aria-hidden="true"], [role="tabpanel"][style*="display: none"], .detail[style*="display: none"], .panel[style*="display: none"], .modal:not(.open)',
          )).some(element => (element.textContent ?? '').replace(/\s+/g, '').length >= 8)
          const hasExplicitDisclosureControl = controls.some(control => (
            control.hasAttribute('aria-controls')
            || control.hasAttribute('aria-expanded')
            || control.hasAttribute('data-target')
            || control.hasAttribute('data-panel')
            || control.hasAttribute('data-detail-target')
            || control.matches('[role="tab"]')
          ))
          const hasTabPanels = frame.querySelectorAll('[role="tablist"] [role="tab"]').length >= 2
            && frame.querySelectorAll('[role="tabpanel"]').length >= 2
          const hasStatefulDetailSurface = frame.querySelectorAll(
            '[aria-pressed], [role="tab"][aria-selected], [data-member], [data-target]',
          ).length >= 2 && Array.from(frame.querySelectorAll<HTMLElement>(
            '[aria-live], [role="tabpanel"], [data-dudesign-detail], .detail, .panel, .view',
          )).some(element => (element.textContent ?? '').replace(/\s+/g, '').length >= 8)
          const hasDisclosureTarget = Array.from(frame.querySelectorAll<HTMLElement>(
            'button[aria-controls], [role="tab"][aria-controls], [data-target], [data-panel], [data-detail-target]',
          )).some(control => {
            const targetId = control.getAttribute('aria-controls')
              ?? control.getAttribute('data-target')
              ?? control.getAttribute('data-panel')
              ?? control.getAttribute('data-detail-target')
            if (!targetId) return false
            const target = document.getElementById(targetId.replace(/^#/, ''))
            return Boolean(target && frame.contains(target) && (target.textContent ?? '').replace(/\s+/g, '').length >= 8)
          })
          if ((!hasHiddenContent || !hasExplicitDisclosureControl) && !hasTabPanels && !hasStatefulDetailSurface && !hasDisclosureTarget) {
            localIssues.push('Extreme-small viewport does not reserve secondary topic details behind a local reveal interaction.')
          }

          const inactivePanelsStillRendered = Array.from(frame.querySelectorAll<HTMLElement>(
            '[role="tabpanel"][hidden], [role="tabpanel"][aria-hidden="true"], [data-panel][hidden], .tab-panel[hidden], .panel[hidden], .view[hidden]',
          )).filter(element => {
            const style = getComputedStyle(element)
            const rect = element.getBoundingClientRect()
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number(style.opacity) > 0.01
              && rect.width > 2
              && rect.height > 2
          })
          if (inactivePanelsStillRendered.length > 0) {
            const details = inactivePanelsStillRendered.slice(0, 4).map(panel => (
              panel.id || panel.getAttribute('aria-label') || panel.className || panel.tagName.toLowerCase()
            )).join(', ')
            localIssues.push(`Extreme-small viewport keeps ${inactivePanelsStillRendered.length} inactive hidden panels in layout (${details}); hidden/inactive content must use display:none and must not cover active controls.`)
          }

          const undersizedControls = controls.filter(control => {
            const rect = control.getBoundingClientRect()
            return rect.width < 24 || rect.height < 24
          })
          if (undersizedControls.length > 0) {
            const details = undersizedControls.slice(0, 8).map(control => {
              const rect = control.getBoundingClientRect()
              const label = (control.getAttribute('aria-label')
                || control.getAttribute('data-node')
                || control.textContent
                || control.tagName)
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 28)
              return `${control.tagName.toLowerCase()}[${label || 'unnamed'}]=${Math.round(rect.width)}x${Math.round(rect.height)}px`
            }).join(', ')
            localIssues.push(`Extreme-small viewport has ${undersizedControls.length} undersized interactive controls; keep each tappable target at least 24x24 CSS px. Measured: ${details}.`)
          }
        }

        const clipped: string[] = []
        const covered: string[] = []
        for (const control of controls) {
          const rect = control.getBoundingClientRect()
          const label = (control.getAttribute('aria-label') || control.textContent || control.tagName)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48)
          const outsideFrame = rect.left < frameRect.left - 2
            || rect.top < frameRect.top - 2
            || rect.right > frameRect.right + 2
            || rect.bottom > frameRect.bottom + 2
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const outsideViewport = centerX < 0 || centerY < 0 || centerX >= viewportWidth || centerY >= viewportHeight
          if (outsideFrame || outsideViewport) {
            clipped.push(label || control.tagName.toLowerCase())
            continue
          }
          const hit = document.elementFromPoint(centerX, centerY)
          if (!hit || (hit !== control && !control.contains(hit))) {
            covered.push(label || control.tagName.toLowerCase())
          }
        }
        if (clipped.length > 0) {
          localIssues.push(`${label}: rendered fixed-card layout is invalid: ${clipped.length} interactive controls are clipped or outside the card frame (${clipped.slice(0, 4).join(', ')}).`)
        }
        if (covered.length > 0) {
          localIssues.push(`${label}: rendered fixed-card interaction is unusable: ${covered.length} controls are visually covered at their center hit point (${covered.slice(0, 4).join(', ')}).`)
        }
        return localIssues
      }, { ...viewport }))

      if (viewport.label === 'extreme-small') {
        const probe = await page.evaluate(() => {
          const frame = Array.from(new Set([
            ...document.querySelectorAll<HTMLElement>('[data-dudesign-template]'),
            ...document.querySelectorAll<HTMLElement>('.pc-card-frame, .pc-card, .no-scroll-frame, #app, #app-container'),
          ])).find(element => {
            const rect = element.getBoundingClientRect()
            return Math.abs(rect.width - 300) <= 4 && Math.abs(rect.height - 360) <= 4
          })
          if (!frame) return { found: false as const, changed: false, reason: 'no 300x360 frame' }
          const isVisible = (element: HTMLElement): boolean => {
            const style = getComputedStyle(element)
            const rect = element.getBoundingClientRect()
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01 && rect.width > 2 && rect.height > 2
          }
          const firstVisible = (selector: string): HTMLElement | undefined => Array.from(frame.querySelectorAll<HTMLElement>(selector))
            .find(element => isVisible(element) && !element.hasAttribute('disabled'))
          const candidate = [
            '[role="tab"][aria-selected="false"]',
            'button[aria-selected="false"]',
            'button[aria-expanded="false"]',
            '[role="button"][aria-pressed="false"]',
            'button[aria-pressed="false"]',
            'button[data-i]:not(.active)',
            '[data-member]:not([aria-current="true"])',
            'button[data-target]:not([aria-selected="true"])',
          ].map(firstVisible).find((element): element is HTMLElement => Boolean(element))
            ?? firstVisible('button, [role="button"]')
          if (!candidate) return { found: false as const, changed: false, reason: 'no disclosure control' }
          candidate.dataset.dudesignQualityProbe = 'true'
          const fingerprint = () => JSON.stringify({
            text: frame.innerText.replace(/\s+/g, ' ').trim(),
            selected: Array.from(frame.querySelectorAll<HTMLElement>('[aria-selected], [aria-expanded], [hidden]'))
              .map(element => `${element.tagName}:${element.getAttribute('aria-selected') ?? ''}:${element.getAttribute('aria-expanded') ?? ''}:${element.hidden ? 'hidden' : 'shown'}`)
              .join('|'),
            classes: Array.from(frame.querySelectorAll<HTMLElement>('[role="tabpanel"], [aria-selected], [aria-expanded], [hidden], .active, .open, .selected, .modal, .detail, .panel, .view'))
              .map(element => `${element.tagName}:${element.className}:${element.getAttribute('aria-selected') ?? ''}:${element.getAttribute('aria-expanded') ?? ''}:${element.hidden ? 'hidden' : 'shown'}`)
              .join('|'),
          })
          return { found: true as const, changed: false, reason: '', before: fingerprint() }
        })
        if (!probe.found) {
          issues.push(`Extreme-small viewport does not expose a local disclosure interaction (${probe.reason}); secondary details must be reachable without scrolling.`)
        } else {
          try {
            await page.locator('[data-dudesign-quality-probe="true"]').click({ timeout: Math.min(timeoutMs, 1500) })
            await page.waitForTimeout(80)
            const after = await page.evaluate(() => {
              const frame = Array.from(new Set([
                ...document.querySelectorAll<HTMLElement>('[data-dudesign-template]'),
                ...document.querySelectorAll<HTMLElement>('.pc-card-frame, .pc-card, .no-scroll-frame, #app, #app-container'),
              ])).find(element => {
                const rect = element.getBoundingClientRect()
                return Math.abs(rect.width - 300) <= 4 && Math.abs(rect.height - 360) <= 4
              })
              if (!frame) return ''
              return JSON.stringify({
                text: frame.innerText.replace(/\s+/g, ' ').trim(),
                selected: Array.from(frame.querySelectorAll<HTMLElement>('[aria-selected], [aria-expanded], [hidden]'))
                  .map(element => `${element.tagName}:${element.getAttribute('aria-selected') ?? ''}:${element.getAttribute('aria-expanded') ?? ''}:${element.hidden ? 'hidden' : 'shown'}`)
                  .join('|'),
                classes: Array.from(frame.querySelectorAll<HTMLElement>('[role="tabpanel"], [aria-selected], [aria-expanded], [hidden], .active, .open, .selected, .modal, .detail, .panel, .view'))
                  .map(element => `${element.tagName}:${element.className}:${element.getAttribute('aria-selected') ?? ''}:${element.getAttribute('aria-expanded') ?? ''}:${element.hidden ? 'hidden' : 'shown'}`)
                  .join('|'),
              })
            })
            if (after === probe.before) {
              issues.push('Extreme-small viewport primary disclosure interaction does not change visible content or accessible state.')
            }
          } catch (error) {
            issues.push(`Extreme-small viewport disclosure interaction could not be activated: ${pixelGateErrorMessage(error)}.`)
          }
        }
      }
      const screenshot = await page.screenshot({ type: 'png' })
      const pixelIssues = analyzePngPixelIssues(screenshot)
      issues.push(...pixelIssues.map(issue => `${viewport.label}: ${issue}`))
    } finally {
      await page.close()
    }
  }
  return issues
}

function analyzePngPixelIssues(png: Uint8Array): string[] {
  const image = decodePngRgba(png)
  if (image.pixels.byteLength === 0) return ['Rendered screenshot is empty.']
  const pixelCount = image.width * image.height
  const stride = Math.max(1, Math.floor(pixelCount / 12000))
  let sampled = 0
  let transparent = 0
  let black = 0
  let white = 0
  let lowContrastTransitions = 0
  let previousLuma: number | null = null
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += stride) {
    const offset = pixelIndex * 4
    const red = image.pixels[offset] ?? 0
    const green = image.pixels[offset + 1] ?? 0
    const blue = image.pixels[offset + 2] ?? 0
    const alpha = image.pixels[offset + 3] ?? 255
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    sampled += 1
    if (alpha <= 8) transparent += 1
    if (alpha > 8 && luma <= 8) black += 1
    if (alpha > 8 && luma >= 247) white += 1
    if (previousLuma !== null && Math.abs(luma - previousLuma) > 8) lowContrastTransitions += 1
    previousLuma = luma
  }
  const transparentRatio = transparent / sampled
  const blackRatio = black / sampled
  const whiteRatio = white / sampled
  const transitionRatio = lowContrastTransitions / Math.max(sampled - 1, 1)
  const issues: string[] = []
  if (transparentRatio > 0.96) issues.push('Rendered screenshot appears blank or fully transparent.')
  if (blackRatio > 0.96) issues.push('Rendered screenshot appears blank black.')
  if (whiteRatio > 0.995 && transitionRatio < 0.001) issues.push('Rendered screenshot appears blank white.')
  if (transitionRatio < 0.002) issues.push('Rendered screenshot has extremely low visual variation.')
  return issues
}

function decodePngRgba(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!signature.every((value, index) => png[index] === value)) {
    throw new Error('Screenshot is not a PNG image.')
  }
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Uint8Array[] = []
  let offset = 8
  while (offset + 12 <= png.byteLength) {
    const length = readU32be(png, offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const type = new TextDecoder().decode(png.slice(typeStart, typeStart + 4))
    if (dataEnd + 4 > png.byteLength) break
    if (type === 'IHDR') {
      width = readU32be(png, dataStart)
      height = readU32be(png, dataStart + 4)
      bitDepth = png[dataStart + 8] ?? 0
      colorType = png[dataStart + 9] ?? 0
    }
    if (type === 'IDAT') idatChunks.push(png.slice(dataStart, dataEnd))
    if (type === 'IEND') break
    offset = dataEnd + 4
  }
  if (width <= 0 || height <= 0 || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: ${width}x${height} depth=${bitDepth} colorType=${colorType}.`)
  }
  const channels = colorType === 6 ? 4 : 3
  const bytesPerPixel = channels
  const scanlineLength = width * channels
  const inflated = inflateSync(concatBytes(idatChunks))
  const rgba = new Uint8Array(width * height * 4)
  let sourceOffset = 0
  let previous: Uint8Array<ArrayBufferLike> = new Uint8Array(scanlineLength)
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? 0
    sourceOffset += 1
    const raw = inflated.slice(sourceOffset, sourceOffset + scanlineLength)
    sourceOffset += scanlineLength
    const recon = unfilterPngScanline(raw, previous, filter, bytesPerPixel)
    for (let x = 0; x < width; x += 1) {
      const src = x * channels
      const dst = (y * width + x) * 4
      rgba[dst] = recon[src] ?? 0
      rgba[dst + 1] = recon[src + 1] ?? 0
      rgba[dst + 2] = recon[src + 2] ?? 0
      rgba[dst + 3] = colorType === 6 ? recon[src + 3] ?? 255 : 255
    }
    previous = recon
  }
  return { width, height, pixels: rgba }
}

function unfilterPngScanline(raw: Uint8Array, previous: Uint8Array, filter: number, bytesPerPixel: number): Uint8Array {
  const output = new Uint8Array(raw.byteLength)
  for (let index = 0; index < raw.byteLength; index += 1) {
    const left = index >= bytesPerPixel ? output[index - bytesPerPixel] ?? 0 : 0
    const up = previous[index] ?? 0
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0
    const value = raw[index] ?? 0
    switch (filter) {
      case 0:
        output[index] = value
        break
      case 1:
        output[index] = (value + left) & 0xff
        break
      case 2:
        output[index] = (value + up) & 0xff
        break
      case 3:
        output[index] = (value + Math.floor((left + up) / 2)) & 0xff
        break
      case 4:
        output[index] = (value + paethPredictor(left, up, upLeft)) & 0xff
        break
      default:
        throw new Error(`Unsupported PNG filter: ${filter}.`)
    }
  }
  return output
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

function qualityReport(issues: string[]): ArtifactQualityReport {
  return {
    status: issues.length === 0
      ? 'pass'
      : issues.some(issue => /empty|hydration|loading shell|black-screen|blank|transparent|low visual variation|fixed-card layout is invalid|fixed-card interaction is unusable|democase-derived first view|not adapted to a 300x360|hides every page-switching tab|no visible primary interaction|visible primary tabs|visible controls in total|additional topic controls|equal-level visible items|does not keep a visible topic title|does not keep enough visible core topic text|initial view is overloaded|clips .* visible core text blocks|duplicate controls for the same labelled actions|separate control groups|undersized interactive controls|does not expose a local disclosure interaction|does not change visible content|declares \d+ dynamic card roots/i.test(issue))
        ? 'fail'
        : 'warn',
    issues,
  }
}

function mergeQualityReports(left: ArtifactQualityReport, right: ArtifactQualityReport): ArtifactQualityReport {
  const issues = [...left.issues, ...right.issues]
  const status = left.status === 'fail' || right.status === 'fail'
    ? 'fail'
    : left.status === 'warn' || right.status === 'warn'
      ? 'warn'
      : 'pass'
  const specFindings = [...left.specFindings ?? [], ...right.specFindings ?? []]
  return { status, issues, ...(specFindings.length ? { specFindings } : {}) }
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

function readU32be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false)
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}
