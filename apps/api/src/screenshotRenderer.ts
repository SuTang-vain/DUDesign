import type { DeviceTarget } from '@dudesign/contracts'
import { getPooledChromiumBrowser } from './playwrightBrowserPool.js'

export type ScreenshotDevice = DeviceTarget

export type RenderedScreenshot = {
  device: ScreenshotDevice
  width: number
  height: number
  body: Uint8Array
}

const VIEWPORTS: Record<ScreenshotDevice, { width: number; height: number }> = {
  desktop: { width: 1440, height: 960 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
}

export async function renderHtmlScreenshots(
  html: string,
  devices: ScreenshotDevice[] = ['desktop', 'tablet', 'mobile'],
  timeoutMs = 8000,
): Promise<RenderedScreenshot[]> {
  const browser = await getPooledChromiumBrowser()
  const screenshots: RenderedScreenshot[] = []
  const pages = []
  try {
    for (const device of devices) {
      const viewport = VIEWPORTS[device]
      const page = await browser.newPage({
        viewport,
        deviceScaleFactor: 1,
        isMobile: device === 'mobile',
      })
      pages.push(page)
      try {
        page.setDefaultTimeout(timeoutMs)
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
        await page.waitForTimeout(250)
        const body = await page.screenshot({
          type: 'png',
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
        })
        screenshots.push({
          device,
          width: viewport.width,
          height: viewport.height,
          body: new Uint8Array(body),
        })
      } finally {
        await page.close()
      }
    }
    return screenshots
  } finally {
    await Promise.allSettled(pages.map(page => page.close()))
  }
}
