type BrowserLike = {
  newPage(options?: Record<string, unknown>): Promise<any>
  close(): Promise<void>
}

let browserPromise: Promise<BrowserLike> | null = null

export async function getPooledChromiumBrowser(): Promise<BrowserLike> {
  if (!browserPromise) {
    browserPromise = import('playwright')
      .then(({ chromium }) => chromium.launch({ headless: true }))
      .catch(error => {
        browserPromise = null
        throw error
      })
  }
  return browserPromise
}

export async function closePooledChromiumBrowser(): Promise<void> {
  const browser = browserPromise
  browserPromise = null
  if (browser) await (await browser).close()
}
