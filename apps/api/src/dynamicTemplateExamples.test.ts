import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { after, describe, it } from 'node:test'
import {
  defaultEncyclopediaDemocaseExperienceProfile,
  type EncyclopediaDemocaseDominantStage,
  type HtmlExample,
} from '@dudesign/contracts'
import { analyzeHtmlArtifactQualityWithPixelGate } from './artifactQuality.js'
import { officialDesignTemplatePacks } from './officialDesignTemplatePacks.js'
import { closePooledChromiumBrowser, getPooledChromiumBrowser } from './playwrightBrowserPool.js'

after(async () => {
  await closePooledChromiumBrowser()
})

async function exampleHtml(example: HtmlExample): Promise<string> {
  if (typeof example === 'string') return example
  const file = [
    resolve(process.cwd(), example.file),
    resolve(process.cwd(), '../..', example.file),
  ].find(candidate => existsSync(candidate))
  assert.ok(file, `HTML example must exist: ${example.file}`)
  return readFile(file, 'utf8')
}

function exampleFor(packId: string): HtmlExample {
  const example = officialDesignTemplatePacks.find(pack => pack.id === packId)?.htmlExamples?.[0]
  assert.ok(example, `${packId} must provide an HTML example`)
  return example
}

function dominantStageForPack(packId: string): EncyclopediaDemocaseDominantStage {
  if (packId.includes('timeline') || packId.includes('origin_story') || packId.includes('episode_chain') || packId.includes('series_navigation')) return 'timeline_story'
  if (packId.includes('relation') || packId.includes('member_map')) return 'relation_map'
  if (packId.includes('compare')) return 'fact_compare'
  if (packId.includes('expandable')) return 'progressive_disclosure'
  if (packId.includes('route') || packId.includes('map_poi')) return 'route_guide'
  return 'entity_summary'
}

describe('dynamic template examples', () => {
  it('passes desktop and 300x360 pixel gates for every dynamic-card example', async () => {
    const packs = officialDesignTemplatePacks.filter(pack =>
      pack.id === 'dtp_dynamic_encyclopedia_card'
      || pack.parentPackId === 'dtp_dynamic_encyclopedia_card',
    ).filter(pack => (pack.htmlExamples?.length ?? 0) > 0)
    const uniqueExamples = new Map<string, { id: string; example: HtmlExample }>()
    for (const pack of packs) {
      const example = pack.htmlExamples?.[0]
      assert.ok(example, `${pack.id} must provide an HTML example`)
      const key = typeof example === 'string' ? example : example.file
      uniqueExamples.set(key, { id: pack.id, example })
    }

    for (const { id, example } of uniqueExamples.values()) {
      const report = await analyzeHtmlArtifactQualityWithPixelGate(await exampleHtml(example), {
        enabled: true,
        experienceProfile: defaultEncyclopediaDemocaseExperienceProfile(dominantStageForPack(id)),
      })
      assert.equal(report.status, 'pass', `${id} quality issues: ${report.issues.join(' | ')}`)
    }
  })

  it('keeps summary, timeline, relation, compare, and expandable disclosure controls usable at 300x360', async () => {
    const browser = await getPooledChromiumBrowser()

    const summary = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await summary.setContent(await exampleHtml(exampleFor('dtp_dynamic_encyclopedia_summary_card')), { waitUntil: 'domcontentloaded' })
      const summaryTabs = summary.locator('[role="tab"]:visible')
      assert.equal(await summaryTabs.count(), 3)
      await summaryTabs.nth(1).click()
      assert.equal(await summaryTabs.nth(1).getAttribute('aria-selected'), 'true')
      assert.equal(await summary.locator('#panel-basic').isHidden(), true)
      assert.equal(await summary.locator('#panel-more').isVisible(), true)
      assert.match(await summary.locator('#panel-more').innerText(), /更多事实内容/)
    } finally {
      await summary.close()
    }

    const timeline = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await timeline.setContent(await exampleHtml(exampleFor('dtp_dynamic_encyclopedia_timeline_card')), { waitUntil: 'domcontentloaded' })
      const eventButtons = timeline.locator('.event-btn:visible')
      assert.equal(await eventButtons.count(), 3)
      await eventButtons.nth(2).click()
      assert.match(await timeline.locator('#eventIntro').innerText(), /寿春失利/)
    } finally {
      await timeline.close()
    }

    const relation = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await relation.setContent(await exampleHtml(exampleFor('dtp_dynamic_encyclopedia_relation_card')), { waitUntil: 'domcontentloaded' })
      await relation.locator('.relation-node').nth(1).click()
      assert.equal(await relation.locator('.relation-node').nth(1).getAttribute('aria-pressed'), 'true')
      assert.equal(await relation.locator('#relationTitle').innerText(), '关键人物')
      assert.equal(await relation.locator('.relation-tab:visible').count(), 0)
    } finally {
      await relation.close()
    }

    const compare = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await compare.setContent(await exampleHtml(exampleFor('dtp_dynamic_encyclopedia_compare_card')), { waitUntil: 'domcontentloaded' })
      await compare.locator('.target-tab').nth(1).click()
      assert.equal(await compare.locator('.target-tab').nth(1).getAttribute('aria-selected'), 'true')
      await compare.locator('.more').first().click()
      assert.equal(await compare.locator('.modal').getAttribute('class'), 'modal open')
      await compare.locator('.close').click()
      assert.equal(await compare.locator('.modal').getAttribute('class'), 'modal')
    } finally {
      await compare.close()
    }

    const expandable = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await expandable.setContent(await exampleHtml(exampleFor('dtp_dynamic_encyclopedia_expandable_card')), { waitUntil: 'domcontentloaded' })
      assert.equal(await expandable.locator('.tab:visible').count(), 0)
      await expandable.locator('.detail-toggle').first().click()
      assert.equal(await expandable.locator('.detail').first().getAttribute('aria-expanded'), 'true')
    } finally {
      await expandable.close()
    }
  })

  it('keeps series navigation and scenic exploration controls usable at 300x360', async () => {
    const browser = await getPooledChromiumBrowser()

    const series = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await series.setContent(await exampleHtml(exampleFor('dtp_de_film_series_navigation')), { waitUntil: 'domcontentloaded' })
      assert.equal(await series.locator('.tab:visible').count(), 0)
      assert.equal(await series.locator('.work:visible').count(), 2)
      await series.locator('.next-page').click()
      assert.equal(await series.locator('#pageLabel').innerText(), '2/2')
      await series.locator('.work:visible').first().click()
      assert.equal(await series.locator('.work:visible').first().getAttribute('aria-pressed'), 'true')
      assert.equal(await series.locator('#workTitle').innerText(), '【相关作品乙】')
    } finally {
      await series.close()
    }

    const route = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await route.setContent(await exampleHtml(exampleFor('dtp_de_scenic_spot_route_guide')), { waitUntil: 'domcontentloaded' })
      assert.equal(await route.locator('.tab:visible').count(), 0)
      assert.equal(await route.locator('.stop:visible').count(), 2)
      await route.locator('.next-stops').click()
      assert.equal(await route.locator('#routePage').innerText(), '2/2')
      await route.locator('.stop:visible').first().click()
      assert.equal(await route.locator('.stop:visible').first().getAttribute('aria-pressed'), 'true')
      assert.equal(await route.locator('#stopTitle').innerText(), '路线转折点')
    } finally {
      await route.close()
    }

    const map = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await map.setContent(await exampleHtml(exampleFor('dtp_de_scenic_spot_map_poi')), { waitUntil: 'domcontentloaded' })
      assert.equal(await map.locator('.poi:visible').count(), 3)
      await map.locator('.poi').nth(2).click()
      assert.equal(await map.locator('.poi').nth(2).getAttribute('aria-pressed'), 'true')
      assert.equal(await map.locator('#poiTitle').innerText(), '【景点丙】')
      await map.locator('.more-pois').click()
      assert.equal(await map.locator('#poiPage').innerText(), '2/2')
      assert.equal(await map.locator('.poi:visible').count(), 2)
      await map.locator('.poi:visible').first().click()
      assert.equal(await map.locator('#poiTitle').innerText(), '【景点丁】')
    } finally {
      await map.close()
    }
  })

  it('keeps member details progressively discoverable at 300x360', async () => {
    const browser = await getPooledChromiumBrowser()
    const members = await browser.newPage({ viewport: { width: 300, height: 360 } })
    try {
      await members.setContent(await exampleHtml(exampleFor('dtp_de_star_group_member_map')), { waitUntil: 'domcontentloaded' })
      const visibleMembers = members.locator('.member:visible')
      assert.equal(await visibleMembers.count(), 3)

      await visibleMembers.nth(1).click()
      assert.equal(await visibleMembers.nth(1).getAttribute('aria-pressed'), 'true')
      await assert.doesNotReject(() => members.locator('.members-view.detail-open .detail-panel').waitFor({ state: 'visible' }))
      assert.equal(await members.locator('#detail-name').innerText(), '【成员乙】')
      assert.equal(await members.locator('.detail-close').isVisible(), true)

      await members.locator('.detail-close').click()
      assert.equal(await members.locator('.members-view').getAttribute('class'), 'view members-view active')
      assert.equal(await members.locator('.tab:visible').count(), 0)
      await members.locator('.more-views').click()
      assert.equal(await members.locator('#timeline-panel').isVisible(), true)
      assert.equal(await members.locator('.more-views').innerText(), '查看作品')
    } finally {
      await members.close()
    }
  })
})
