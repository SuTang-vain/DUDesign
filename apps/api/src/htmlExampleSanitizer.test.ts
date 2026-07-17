import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeHtmlExample } from './htmlExampleSanitizer.js'

describe('HTML example sanitizer', () => {
  it('removes active/external content and redacts sensitive values into a safe candidate', () => {
    const result = sanitizeHtmlExample(`<!doctype html>
      <html><head>
        <script src="https://cdn.example.com/app.js"></script>
        <link rel="stylesheet" href="https://cdn.example.com/app.css">
        <style>@import url('https://cdn.example.com/theme.css'); .hero{background:url(https://cdn.example.com/a.png)}</style>
      </head><body>
        <main onclick="alert(1)">
          <a href="javascript:alert(1)">Open</a>
          <img class="brand-logo apple-logo" src="https://cdn.example.com/logo.svg">
          <p>owner@example.com api_key=sk-test-secret-123456 /Users/name/private.txt</p>
        </main>
      </body></html>`)

    assert.equal(result.status, 'passed')
    assert.match(result.contentHash ?? '', /^sha256:/)
    assert.doesNotMatch(result.html, /<script\b/i)
    assert.doesNotMatch(result.html, /onclick=/i)
    assert.doesNotMatch(result.html, /https:\/\/cdn\.example\.com/i)
    assert.doesNotMatch(result.html, /javascript:/i)
    assert.match(result.html, /\[redacted-email\]/)
    assert.match(result.html, /\[redacted-secret\]/)
    assert.match(result.html, /\[redacted-path\]/)
    const codes = result.findings.map(finding => finding.code)
    assert.ok(codes.includes('html_example.script_removed'))
    assert.ok(codes.includes('html_example.external_stylesheet_removed'))
    assert.ok(codes.includes('html_example.sensitive_text_redacted'))
    assert.ok(codes.includes('html_example.brand_asset_review'))
  })

  it('keeps local relative assets and safe inline styles', () => {
    const result = sanitizeHtmlExample(`<!doctype html><html><head><style>
      .hero { background: url('./assets/hero.png'); color: #171717; }
    </style></head><body><main><img src="assets/hero.png"><h1>Safe example</h1></main></body></html>`)

    assert.equal(result.status, 'passed')
    assert.match(result.html, /assets\/hero\.png/)
    assert.equal(result.findings.some(finding => finding.severity === 'error'), false)
  })
})
