import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { analyzeHtmlArtifactQualityWithPixelGate } from './artifactQuality.js'
import { closePooledChromiumBrowser } from './playwrightBrowserPool.js'

after(async () => {
  await closePooledChromiumBrowser()
})

describe('Artifact quality pixel gate', () => {
  it('rejects artifacts that declare multiple dynamic-card roots', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <body>
    <main data-dudesign-template="relation-card"><h1>关系主题卡</h1><p>第一份动态卡内容。</p></main>
    <main data-dudesign-template="relation-card"><h1>关系主题卡</h1><p>重复的动态卡内容。</p></main>
  </body>
</html>`)

    assert.equal(report.status, 'fail')
    assert.deepEqual(report.issues, ['HTML declares 2 dynamic card roots; keep exactly one [data-dudesign-template] root.'])
  })

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

  it('fails fixed-card controls that are covered at their hit point', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; }
      #app { position: relative; width: 788px; height: 492px; overflow: hidden; background: #fff; }
      button { position: absolute; left: 32px; bottom: 24px; width: 180px; height: 48px; }
      .cover { position: absolute; left: 20px; bottom: 12px; width: 220px; height: 72px; background: rgba(255,0,0,.2); }
    </style>
  </head>
  <body>
    <main id="app">
      <h1>主题动态交互卡片</h1>
      <p>核心事实与交互内容。</p>
      <button type="button">切换阶段</button>
      <div class="cover"></div>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /interaction is unusable/i.test(issue)))
  })

  it('fails fixed-card controls that extend outside the frame', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; }
      .pc-card-frame { position: relative; width: 788px; height: 492px; overflow: hidden; background: #fff; }
      button { position: absolute; left: 32px; bottom: -30px; width: 180px; height: 48px; }
    </style>
  </head>
  <body>
    <main class="pc-card-frame">
      <h1>主题动态交互卡片</h1>
      <p>核心事实与交互内容。</p>
      <button type="button">下一阶段</button>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /layout is invalid/i.test(issue)))
  })

  it('passes a centered fixed card whose control is directly hittable', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      [data-dudesign-template] { width: 788px; height: 492px; padding: 36px; overflow: hidden; background: #fff; color: #111; }
      nav { display: flex; gap: 8px; margin-top: 32px; }
      button { width: 140px; height: 48px; background: #111; color: #fff; }
      @media (max-width: 320px), (max-height: 365px) {
        [data-dudesign-template] { width: 300px; height: 360px; padding: 16px; }
        nav { margin-top: 16px; }
        button { width: 124px; height: 42px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>主题动态交互卡片</h1>
      <p>核心事实与交互内容。</p>
      <nav role="tablist">
        <button type="button" role="tab" aria-selected="true" aria-controls="summary">概览</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="details">更多</button>
      </nav>
      <section id="summary" role="tabpanel">首屏核心摘要。</section>
      <section id="details" role="tabpanel" hidden>点击后显示的延伸事实。</section>
    </main>
    <script>
      document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => {
        document.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)))
        document.querySelectorAll('[role="tabpanel"]').forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute('aria-controls') })
      }))
    </script>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'pass')
    assert.equal(report.issues.length, 0)
  })

  it('reports measured SVG control dimensions when viewBox scaling makes the hit target too small', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      [data-dudesign-template] { width: 788px; height: 492px; padding: 36px; overflow: hidden; background: #fff; color: #111; }
      svg { display: block; width: 80px; height: 50px; }
      button { width: 120px; height: 40px; }
      @media (max-width: 320px), (max-height: 365px) {
        [data-dudesign-template] { width: 300px; height: 360px; padding: 16px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>主题动态交互卡片</h1>
      <p>核心事实保留在首屏，详细信息可通过下方操作继续查看。</p>
      <svg viewBox="0 0 100 100" aria-label="关系图">
        <g role="button" aria-label="关系节点"><circle cx="50" cy="50" r="10"></circle></g>
      </svg>
      <section id="detail">次要事实详情。</section>
      <button type="button" aria-controls="detail">查看更多</button>
    </main>
    <script>document.querySelector('button').addEventListener('click', function () { document.querySelector('#detail').textContent = '已展开的次要事实详情。' })</script>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /undersized interactive controls/i.test(issue)))
    assert.ok(report.issues.some(issue => /Measured: g\[关系节点\]=\d+x\d+px/i.test(issue)))
  })

  it('fails a declared 300x360 frame whose content-box padding makes the rendered frame larger', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 24px; overflow: hidden; background: #fff; }
      button { width: 120px; height: 40px; }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 16px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>词条主题</h1>
      <p>保留最核心的主题事实，并通过交互继续探索。</p>
      <button type="button" aria-expanded="false">查看更多</button>
    </main>
    <script>
      document.querySelector('button').addEventListener('click', event => {
        event.currentTarget.setAttribute('aria-expanded', 'true')
      })
    </script>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /not adapted to a 300x360/i.test(issue)))
  })

  it('accepts one meaningful reveal control when it preserves core text and changes state', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 32px; overflow: hidden; background: #fff; }
      button { min-width: 120px; min-height: 40px; }
      [hidden] { display: none; }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 16px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>词条主题</h1>
      <p>首屏保留一句最核心的事实说明，引导用户继续探索。</p>
      <button type="button" aria-expanded="false" aria-controls="details">查看更多</button>
      <section id="details" hidden>点击后显示的补充事实。</section>
    </main>
    <script>
      const button = document.querySelector('button')
      const details = document.querySelector('#details')
      button.addEventListener('click', () => {
        button.setAttribute('aria-expanded', 'true')
        details.hidden = false
      })
    </script>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'pass')
    assert.deepEqual(report.issues, [])
  })

  it('fails an inactive hidden panel that remains in layout and covers a compact control', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      main { position: relative; width: 788px; height: 492px; padding: 32px; overflow: hidden; background: #fff; }
      .tab-panel { display: grid; }
      button { position: relative; z-index: 1; min-width: 124px; min-height: 42px; }
      #details { position: absolute; inset: 0; z-index: 2; padding: 16px; background: rgba(255,255,255,.98); }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 16px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>词条主题</h1>
      <p>首屏保留核心事实，并通过切换继续探索。</p>
      <button type="button" role="tab" aria-selected="true" aria-controls="summary">概览</button>
      <section id="summary" class="tab-panel" role="tabpanel">核心摘要。</section>
      <section id="details" class="tab-panel" role="tabpanel" hidden>隐藏面板不应覆盖当前按钮。</section>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /inactive hidden panels in layout|interaction is unusable/i.test(issue)))
  })

  it('fails an extreme-small card that removes the only route to secondary content', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #e9edf5; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 32px; overflow: hidden; background: #fff; }
      button { width: 144px; height: 42px; }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 16px; }
        button { display: none; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>词条主题</h1>
      <p>这是一段足够明确的核心事实摘要内容。</p>
      <button type="button" aria-expanded="false">查看更多</button>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /no visible primary interaction|does not expose a local disclosure/i.test(issue)))
  })

  it('fails an extreme-small disclosure control that does not change state or content', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #e9edf5; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 32px; overflow: hidden; background: #fff; }
      nav { display: flex; gap: 8px; }
      button { width: 120px; height: 42px; }
      @media (max-width: 320px), (max-height: 365px) { main { width: 300px; height: 360px; padding: 16px; } }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>词条主题</h1>
      <p>这是一段足够明确的核心事实摘要内容。</p>
      <nav role="tablist">
        <button role="tab" aria-selected="true">概览</button>
        <button role="tab" aria-selected="false">详情</button>
      </nav>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /does not change visible content or accessible state/i.test(issue)))
  })

  it('fails an extreme-small card that has controls but no secondary content to reveal', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #e9edf5; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 32px; overflow: hidden; background: #fff; }
      nav { display: flex; gap: 8px; }
      button { width: 120px; height: 42px; }
      @media (max-width: 320px), (max-height: 365px) { main { width: 300px; height: 360px; padding: 16px; } }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>词条主题</h1>
      <p>这是一段足够明确的核心事实摘要内容。</p>
      <nav>
        <button type="button">概览</button>
        <button type="button">详情</button>
      </nav>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /does not reserve secondary topic details/i.test(issue)))
  })

  it('fails an extreme-small card that keeps only identity and controls without a core fact', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #e9edf5; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 16px; overflow: hidden; background: #fff; }
      nav { display: flex; gap: 8px; }
      button { min-width: 112px; min-height: 32px; }
      @media (max-width: 320px), (max-height: 365px) { main { width: 300px; height: 360px; } }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>主题动态交互卡</h1>
      <nav role="tablist">
        <button type="button" role="tab" aria-selected="true" aria-controls="summary">概览</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="details">详情</button>
      </nav>
      <section id="summary" role="tabpanel">暂无内容</section>
      <section id="details" role="tabpanel" hidden>点击后查看补充主题事实。</section>
    </main>
    <script>
      document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => {
        document.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)))
        document.querySelectorAll('[role="tabpanel"]').forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute('aria-controls') })
      }))
    </script>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /does not keep a visible core topic fact or summary/i.test(issue)))
  })

  it('fails an extreme-small card whose visible control budget is too dense', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #e9edf5; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 32px; overflow: hidden; background: #fff; }
      nav { display: flex; gap: 4px; }
      button { width: 52px; min-height: 30px; }
      @media (max-width: 320px), (max-height: 365px) { main { width: 300px; height: 360px; padding: 16px; } }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>词条主题</h1>
      <p>这是一段足够明确的核心事实摘要内容。</p>
      <nav role="tablist">
        <button role="tab" aria-selected="true">一</button>
        <button role="tab" aria-selected="false">二</button>
        <button role="tab" aria-selected="false">三</button>
        <button role="tab" aria-selected="false">四</button>
        <button role="tab" aria-selected="false">五</button>
      </nav>
      <nav aria-label="额外主题控制">
        <button type="button">节点一</button>
        <button type="button">节点二</button>
        <button type="button">节点三</button>
        <button type="button">节点四</button>
      </nav>
      <section hidden>点击后查看补充主题详情。</section>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /visible primary tabs/i.test(issue)))
    assert.ok(report.issues.some(issue => /additional topic controls/i.test(issue)))
  })

  it('fails an extreme-small card that crops a visible core fact at the frame edge', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      main { position: relative; width: 788px; height: 492px; padding: 28px; overflow: hidden; background: #fff; }
      .tabs { display: flex; gap: 8px; }
      button { min-width: 96px; height: 40px; }
      .fact { position: absolute; left: 16px; top: 312px; width: 268px; height: 72px; }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 16px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>三顾茅庐</h1>
      <p>刘备三次拜访诸葛亮，体现求贤若渴与诚意。</p>
      <nav class="tabs" role="tablist">
        <button role="tab" aria-selected="true" aria-controls="summary">概览</button>
        <button role="tab" aria-selected="false" aria-controls="detail">更多</button>
      </nav>
      <section id="summary" role="tabpanel" class="fact">这条核心事实被容器底边裁掉，不应作为合格的紧凑状态。</section>
      <section id="detail" role="tabpanel" hidden>点击后显示的补充信息。</section>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /clips .* visible core text blocks/i.test(issue)))
  })

  it('fails an extreme-small card that duplicates the same phase controls', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 28px; overflow: hidden; background: #fff; }
      nav { display: flex; gap: 8px; margin: 10px 0; }
      button { min-width: 72px; height: 36px; }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 16px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>三顾茅庐</h1>
      <p>当前阶段只展示一条核心事实。</p>
      <nav role="tablist">
        <button role="tab" aria-selected="true" aria-controls="phase-1">起因</button>
        <button role="tab" aria-selected="false" aria-controls="phase-2">经过</button>
      </nav>
      <section id="phase-1" role="tabpanel">刘备求贤，决定前往隆中拜访。</section>
      <section id="phase-2" role="tabpanel" hidden>多次拜访后，诸葛亮出山相助。</section>
      <nav aria-label="重复阶段控制">
        <button type="button">起因</button>
        <button type="button">经过</button>
      </nav>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /duplicate controls for the same labelled actions/i.test(issue)))
  })

  it('fails an extreme-small card that fragments navigation across too many control groups', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 24px; overflow: hidden; background: #fff; }
      nav { display: flex; gap: 6px; margin: 8px 0; }
      button { min-width: 64px; height: 32px; }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 14px; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>三顾茅庐</h1>
      <p>用一条事实引导用户继续探索。</p>
      <nav role="tablist"><button role="tab" aria-selected="true">人物</button></nav>
      <nav class="filters"><button type="button">刘备</button></nav>
      <nav class="page-switcher"><button type="button" aria-controls="detail">更多</button></nav>
      <section id="detail" hidden>次要关系与出处信息。</section>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /separate control groups/i.test(issue)))
  })

  it('fails a desktop first view that exposes a dashboard-sized control set', async () => {
    const report = await analyzeHtmlArtifactQualityWithPixelGate(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #eef1f8; font-family: sans-serif; }
      main { width: 788px; height: 492px; padding: 28px; overflow: hidden; background: #fff; }
      nav { display: flex; gap: 6px; margin: 12px 0; }
      button { min-width: 64px; height: 34px; }
      .detail { min-height: 160px; padding: 20px; background: #f6f7fa; }
      @media (max-width: 320px), (max-height: 365px) {
        main { width: 300px; height: 360px; padding: 16px; }
        nav button:nth-child(n + 3) { display: none; }
        .filters, .actions { display: none; }
      }
    </style>
  </head>
  <body>
    <main data-dudesign-template="topic-card">
      <h1>三顾茅庐</h1>
      <p>刘备三次拜访诸葛亮，体现求贤若渴与诚意。</p>
      <nav role="tablist">
        <button role="tab" aria-selected="true" aria-controls="summary">概览</button>
        <button role="tab" aria-selected="false" aria-controls="relations">关系</button>
        <button role="tab" aria-selected="false">起因</button>
        <button role="tab" aria-selected="false">经过</button>
        <button role="tab" aria-selected="false">影响</button>
      </nav>
      <nav class="filters">
        <button type="button">刘备</button><button type="button">诸葛亮</button>
        <button type="button">关羽</button><button type="button">张飞</button>
      </nav>
      <nav class="actions">
        <button type="button">事实</button><button type="button">出处</button>
        <button type="button">对比</button><button type="button">更多</button>
      </nav>
      <section id="summary" role="tabpanel" class="detail">当前只需展示一条选中关系的核心说明。</section>
      <section id="relations" role="tabpanel" hidden>点击后显示的关系详情。</section>
    </main>
  </body>
</html>`, { enabled: true })

    assert.equal(report.status, 'fail')
    assert.ok(report.issues.some(issue => /Desktop first view exposes 13 visible controls/i.test(issue)))
    assert.ok(report.issues.some(issue => /separate control groups/i.test(issue)))
  })
})
