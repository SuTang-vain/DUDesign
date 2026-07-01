import { inflateSync } from 'node:zlib'
import { getPooledChromiumBrowser } from './playwrightBrowserPool.js'

export type ArtifactQualityReport = {
  status: 'pass' | 'warn' | 'fail'
  issues: string[]
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
      issues: [`Pixel quality gate could not run: ${error instanceof Error ? error.message : 'unknown error'}.`],
    })
  }
}

async function analyzeRenderedPixelIssues(html: string, timeoutMs = 6000): Promise<string[]> {
  const browser = await getPooledChromiumBrowser()
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  })
  try {
    page.setDefaultTimeout(timeoutMs)
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    await page.waitForTimeout(250)
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    })
    return analyzePngPixelIssues(screenshot)
  } finally {
    await page.close()
  }
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
  if (whiteRatio > 0.96) issues.push('Rendered screenshot appears blank white.')
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
    status: issues.length === 0 ? 'pass' : issues.some(issue => /empty|hydration|loading shell|black-screen|blank|transparent|low visual variation/i.test(issue)) ? 'fail' : 'warn',
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
  return { status, issues }
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
