import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { analyzeHtmlArtifactQualityWithPixelGate } from './artifactQuality.js'
import { closePooledChromiumBrowser } from './playwrightBrowserPool.js'

after(async () => {
  await closePooledChromiumBrowser()
})

describe('Artifact quality pixel gate', () => {
  it('fails a visually blank white document', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#fff"></body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /blank white|empty|visible page content/i.test(issue)))
  })

  it('does not fail a mostly white card that still has visible content', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #fff; overflow: hidden; font-family: Arial, sans-serif; }
      main { width: 788px; height: 492px; padding: 48px; color: #111; background: #fff; }
      h1 { margin: 0 0 24px; font-size: 48px; line-height: 1; }
      p { max-width: 420px; font-size: 18px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>百度百科词条</h1>
      <p>百科概览与关键事实。这里展示来源状态、时间线和结构化摘要。</p>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.issues.some(issue => /blank white/i.test(issue)), false)
  })
})
