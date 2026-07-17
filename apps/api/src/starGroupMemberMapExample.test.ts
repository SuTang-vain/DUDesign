import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { after, describe, it } from 'node:test'
import { closePooledChromiumBrowser, getPooledChromiumBrowser } from './playwrightBrowserPool.js'

after(async () => {
  await closePooledChromiumBrowser()
})

describe('star group member map example', () => {
  it('keeps the fixed frame centered and exposes working member and tab interactions', async () => {
    const file = [
      resolve(process.cwd(), 'src/html-examples/star-group-member-map-example.html'),
      resolve(process.cwd(), 'apps/api/src/html-examples/star-group-member-map-example.html'),
      resolve(process.cwd(), '../../apps/api/src/html-examples/star-group-member-map-example.html'),
    ].find(candidate => existsSync(candidate))
    assert.ok(file, 'star group member map example must be available from the repository or workspace root')
    const html = await readFile(file, 'utf8')
    const browser = await getPooledChromiumBrowser()
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
      const frame = page.locator('.pc-card-frame')
      const frameBox = await frame.boundingBox()
      assert.ok(frameBox)
      assert.ok(Math.abs(frameBox.x - (1280 - 788) / 2) <= 2)
      assert.ok(Math.abs(frameBox.y - (900 - 492) / 2) <= 2)

      const secondMember = page.locator('.member[data-member="b"]')
      await secondMember.click()
      assert.equal(await secondMember.getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('#detail-name').textContent(), '【成员乙】')

      await page.locator('#timeline-tab').click()
      assert.equal(await page.locator('#timeline-tab').getAttribute('aria-selected'), 'true')
      assert.equal(await page.locator('#timeline-panel').getAttribute('hidden'), null)
      assert.equal(await page.locator('#members-panel').getAttribute('hidden'), '')
    } finally {
      await page.close()
    }
  })

  it('keeps essential navigation and interaction usable at 300x360', async () => {
    const file = [
      resolve(process.cwd(), 'src/html-examples/star-group-member-map-example.html'),
      resolve(process.cwd(), 'apps/api/src/html-examples/star-group-member-map-example.html'),
      resolve(process.cwd(), '../../apps/api/src/html-examples/star-group-member-map-example.html'),
    ].find(candidate => existsSync(candidate))
    assert.ok(file)
    const html = await readFile(file, 'utf8')
    const browser = await getPooledChromiumBrowser()
    const page = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
      const frameBox = await page.locator('.pc-card-frame').boundingBox()
      assert.ok(frameBox)
      assert.deepEqual(
        { x: Math.round(frameBox.x), y: Math.round(frameBox.y), width: Math.round(frameBox.width), height: Math.round(frameBox.height) },
        { x: 0, y: 0, width: 300, height: 360 },
      )
      assert.equal(await page.locator('[role="tab"]:visible').count(), 0)
      assert.equal(await page.locator('.more-views:visible').count(), 1)
      assert.equal(await page.locator('.member:visible').count(), 3)
      await page.locator('.more-views').click()
      assert.equal(await page.locator('#timeline-panel').getAttribute('hidden'), null)
      assert.equal(await page.locator('.timeline-item:visible').count(), 2)
      await page.locator('.more-views').click()
      assert.equal(await page.locator('#works-panel').getAttribute('hidden'), null)
      assert.equal(await page.locator('.work-item:visible').count(), 2)

      await page.locator('.more-views').click()
      assert.equal(await page.locator('#members-panel').getAttribute('hidden'), null)
      await page.locator('.member[data-member="b"]').click()
      assert.equal(await page.locator('#members-panel').getAttribute('class'), 'view members-view active detail-open')
      assert.equal(await page.locator('.detail-panel:visible').count(), 1)
      assert.equal(await page.locator('#detail-name').textContent(), '【成员乙】')
      await page.locator('.detail-close').click()
      assert.equal(await page.locator('.detail-panel:visible').count(), 0)

      const clippedControls = await page.locator('button:visible').evaluateAll((buttons: HTMLElement[]) => buttons.filter((button: HTMLElement) => {
        const rect = button.getBoundingClientRect()
        return rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight
      }).length)
      assert.equal(clippedControls, 0)
    } finally {
      await page.close()
    }
  })
})
