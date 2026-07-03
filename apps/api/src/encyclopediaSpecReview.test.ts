import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reviewDynamicEncyclopediaSpec } from './encyclopediaSpecReview.js'

describe('Dynamic encyclopedia spec review', () => {
  it('reports deterministic findings for unsafe or incomplete encyclopedia cards', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: '<!doctype html><html><head><title>Bad</title></head><body><main><h1>百度百科</h1><p>简介</p><script src="https://example.com/app.js"></script></main></body></html>',
      templatePackIds: ['dtp_dynamic_encyclopedia_timeline_card'],
      interactionParadigmId: 'ip_timeline_story',
    })

    assert.equal(report.status, 'fail')
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.viewport_meta_missing'))
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.external_script_blocked'))
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.scroll_container_missing'))
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.timeline_template_mismatch'))
  })

  it('passes a self-contained card that follows the scroll and content contract', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { height: 100%; overflow: hidden; }
      .scroll-container { overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y; }
    </style>
  </head>
  <body>
    <main class="scroll-container">
      <h1>百度百科词条</h1>
      <section>百科概览与关键事实</section>
      <section>时间线 2000 成立 2010 发展 2020 里程碑</section>
    </main>
  </body>
</html>`,
      templatePackIds: ['dtp_dynamic_encyclopedia_timeline_card'],
      interactionParadigmId: 'ip_timeline_story',
    })

    assert.equal(report.status, 'pass')
    assert.deepEqual(report.findings, [])
  })
})
