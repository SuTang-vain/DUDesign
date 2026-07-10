import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

describe('interactive variation preview', () => {
  let harness: ApiFlowHarness
  let browser: Browser

  before(async () => {
    harness = await startApiFlowHarness(new ApplicationService({ consumeQueue: false }))
    browser = await chromium.launch()
  })

  after(async () => {
    await browser.close()
    await harness.close()
  })

  it('runs local tab interaction inside the private preview iframe contract', async () => {
    const session = await harness.service.store.createSession({
      userId: harness.service.store.devUser.id,
      workspaceId: harness.service.store.devWorkspace.id,
      mode: 'new_html',
      title: 'Interactive preview smoke',
    })
    const job = await harness.service.store.createJob({
      session,
      prompt: 'Interactive preview smoke',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 1,
      templateRequirements: {},
    })
    const [variation] = await harness.service.store.createVariations({ job, count: 1 })
    assert.ok(variation)

    const html = interactiveTabHtml()
    const stored = await harness.service.artifacts.put({
      workspaceId: job.workspaceId,
      artifactId: 'art_interactive_preview_smoke',
      relativePath: 'v1/index.html',
      contentType: 'text/html; charset=utf-8',
      body: html,
      metadata: { kind: 'html', smoke: 'interactive-preview' },
    })
    const artifact = await harness.service.store.createArtifact({
      workspaceId: job.workspaceId,
      sessionId: session.id,
      variationId: variation.id,
      kind: 'html',
      version: 1,
      storageKey: stored.storageKey,
      entryPath: 'index.html',
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: { smoke: 'interactive-preview' },
    })
    await harness.service.store.setVariationCurrentArtifact(variation.id, artifact.id, `/api/variations/${variation.id}/preview`)

    const previewResponse = await fetch(`${harness.baseUrl}/api/variations/${variation.id}/preview`)
    assert.equal(previewResponse.headers.get('content-security-policy')?.includes("script-src 'self' 'unsafe-inline'"), true)

    const page = await browser.newPage()
    await page.goto(`${harness.baseUrl}/api/variations/${variation.id}/preview`)
    await assertVisiblePanel(page, 'panel-basic')
    await page.getByRole('tab', { name: '来源' }).click()
    await assertVisiblePanel(page, 'panel-source')
    await page.close()
  })
})

async function assertVisiblePanel(page: import('playwright').Page, panelId: string): Promise<void> {
  await page.waitForFunction(id => {
    const panel = document.getElementById(String(id))
    return Boolean(panel && !panel.hidden && getComputedStyle(panel).display !== 'none')
  }, panelId)
}

function interactiveTabHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>交互预览测试</title>
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; }
      body { font-family: system-ui, sans-serif; }
      .no-scroll-frame { width: 788px; height: 492px; overflow: hidden; padding: 24px; box-sizing: border-box; }
      [role="tab"][aria-selected="true"] { color: #2454ff; }
      [role="tabpanel"][hidden] { display: none; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">
      <h1>百度百科</h1>
      <p>百科概览：用于验证私有预览中的真实本地交互。</p>
      <nav role="tablist" aria-label="事实分组">
        <button type="button" role="tab" aria-selected="true" aria-controls="panel-basic">概要</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="panel-source">来源</button>
      </nav>
      <section id="panel-basic" role="tabpanel">关键事实：据公开资料整理。</section>
      <section id="panel-source" role="tabpanel" hidden>来源状态：待核实。</section>
    </main>
    <script>
      document.querySelectorAll('[role="tab"]').forEach(function(tab) {
        tab.addEventListener('click', function() {
          document.querySelectorAll('[role="tab"]').forEach(function(item) {
            item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
          });
          document.querySelectorAll('[role="tabpanel"]').forEach(function(panel) {
            panel.hidden = panel.id !== tab.getAttribute('aria-controls');
          });
        });
      });
    </script>
  </body>
</html>`
}
