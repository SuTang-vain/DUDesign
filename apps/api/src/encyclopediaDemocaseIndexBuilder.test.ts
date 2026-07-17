import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { defaultEncyclopediaDemocaseExperienceProfile } from '@dudesign/contracts'
import { buildEncyclopediaDemocaseIndex } from './encyclopediaDemocaseIndexBuilder.js'

const CASE_ROOT = '/Users/tangyaoyue/DEV/Baidu/case垂类分类'

describe('Encyclopedia real case index builder', () => {
  it('indexes primary HTML cases and their supporting assets', { skip: !existsSync(CASE_ROOT) }, async () => {
    const index = await buildEncyclopediaDemocaseIndex(CASE_ROOT)
    const sourceHtmlCount = (await readdir(CASE_ROOT, { recursive: true }))
      .filter(file => /\.html?$/i.test(file)).length

    assert.equal(index.records.length, sourceHtmlCount, 'the index must cover every current democase HTML file')
    assert.ok(index.records.length >= 30, 'the real-case corpus must not silently shrink below its admitted baseline')
    assert.match(index.indexVersion, /^2026-07-16\.real-case\.[a-f0-9]{16}$/)
    assert.equal(new Set(index.records.map(record => record.caseId)).size, index.records.length)
    assert.equal(index.records.every(record => /^[a-f0-9]{64}$/.test(record.contentHash)), true)
    assert.equal(index.records.some(record => record.sourceCategory === '电影电视剧' && record.assetSummary.imageCount > 0), true)
    assert.equal(index.records.some(record => record.taxonomyNodeId === 'tax_celebrity_historical'), true)
    assert.equal(index.records.some(record => record.interactionParadigmIds.includes('ip_route_guide')), true)
    assert.equal(index.records.some(record => record.interactionParadigmIds.includes('ip_fact_compare')), true)
    assert.equal(index.records.every(record => record.experienceProfile.firstViewPromise.length > 0), true)
    assert.equal(index.records.every(record => record.experienceProfile.attentionBudget.extremeSmall.maxVisibleItems <= 3), true)
    assert.equal(index.records.some(record => record.experienceProfile.dominantStage === 'relation_map'), true)
    assert.equal(index.records.some(record => record.experienceProfile.dominantStage === 'timeline_story'), true)
    assert.equal(index.records.some(record => record.experienceProfile.dominantStage === 'fact_compare'), true)
    assert.equal(index.records.some(record => record.experienceProfile.dominantStage === 'route_guide'), true)
    assert.equal(index.records.some(record => record.experienceProfile.dominantStage === 'progressive_disclosure'), true)
    assert.equal(index.records.every(record => {
      const expected = defaultEncyclopediaDemocaseExperienceProfile(record.experienceProfile.dominantStage)
      return JSON.stringify(record.experienceProfile) === JSON.stringify(expected)
    }), true, 'real-case profiles must stay aligned with the shared experience contract')
  })
})
