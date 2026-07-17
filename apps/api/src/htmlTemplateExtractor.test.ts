import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractHtmlTemplateDraft } from './htmlTemplateExtractor.js'

describe('HTML template extractor', () => {
  it('extracts non-empty tokens, sections, responsive rules, components, and interactions', () => {
    const draft = extractHtmlTemplateDraft({
      name: 'Celebrity group knowledge card',
      html: `<!doctype html>
        <html lang="zh-CN">
          <head>
            <style>
              :root {
                --surface: #ffffff;
                --text-primary: #171717;
                --accent: #2454ff;
                --space-md: 16px;
                --radius-card: 8px;
                --shadow-card: 0 8px 24px rgba(0,0,0,.12);
              }
              body { color: #171717; background-color: #ffffff; font-family: Inter, sans-serif; font-size: 16px; }
              h1 { font-size: 36px; font-weight: 700; line-height: 1.15; }
              .member-card { padding: 16px; border-radius: 8px; box-shadow: var(--shadow-card); }
              @media (max-width: 600px) {
                .member-grid { grid-template-columns: 1fr; gap: 12px; }
              }
            </style>
          </head>
          <body>
            <header class="site-header">Star Group</header>
            <main>
              <section class="hero summary-section"><h1>Group profile</h1></section>
              <nav class="member-tabs" role="tablist">
                <button role="tab" aria-selected="true">Current</button>
              </nav>
              <section class="member-grid">
                <article class="member-card">Member A</article>
                <article class="member-card">Member B</article>
              </section>
              <section class="works-section">
                <button class="accordion-trigger" aria-expanded="false">Works</button>
              </section>
            </main>
          </body>
        </html>`,
      cssFiles: [{
        path: 'styles/theme.css',
        content: '.member-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }',
      }],
      source: {
        artifactId: 'art_fixture',
        artifactVersion: 4,
        contentHash: 'sha256:fixture',
        entryPath: 'index.html',
      },
    })

    assert.equal(draft.schemaVersion, 'dudesign-template-draft.v2')
    assert.ok(Object.values(draft.designTokens.colors).includes('#ffffff'))
    assert.ok(Object.values(draft.designTokens.colors).includes('#2454ff'))
    assert.ok(Object.values(draft.designTokens.spacing).includes('16px'))
    assert.ok(Object.values(draft.designTokens.rounded).includes('8px'))
    assert.ok(draft.designTokens.typography.display)
    assert.ok(draft.sectionBlueprints.some(section => section.role === 'hero'))
    assert.ok(draft.sectionBlueprints.some(section => section.role === 'member_collection'))
    assert.ok(draft.componentBlueprints.some(component => component.repeatable && component.role === 'card'))
    assert.ok(draft.componentBlueprints.some(component => component.role === 'tabs'))
    assert.ok(draft.componentBlueprints.some(component => component.role === 'accordion'))
    assert.ok(draft.interactionParadigmIds.includes('ip_expandable_facts'))
    assert.equal(draft.interactionParadigmIds.includes('ip_tab_navigation'), false)
    assert.equal(draft.responsiveRules[0]?.target, 'mobile')
    assert.equal(draft.responsiveRules[0]?.maxWidth, 600)
    assert.equal(draft.htmlExamples[0]?.sanitizationStatus, 'pending')
    assert.equal(draft.htmlExamples[0]?.artifactVersion, 4)
    assert.ok(draft.sourceEvidence.some(item => item.sourcePath.includes('@media')))
    assert.ok(draft.sourceEvidence.some(item => item.targetPath === 'designTokens.colors.surface'))
    assert.ok((draft.confidence.sectionBlueprints ?? 0) > 0)
  })

  it('skips malformed CSS without losing semantic DOM extraction', () => {
    const draft = extractHtmlTemplateDraft({
      name: 'Malformed CSS fixture',
      html: '<main><section class="hero"><h1>Still extractable</h1></section></main>',
      cssFiles: [{ path: 'broken.css', content: '.hero { color: #fff;' }],
      source: {
        artifactId: 'art_broken',
        artifactVersion: 1,
        contentHash: 'sha256:broken',
        entryPath: 'index.html',
      },
    })

    assert.ok(draft.sectionBlueprints.some(section => section.role === 'hero'))
    assert.deepEqual(draft.designTokens.colors, {})
  })
})
