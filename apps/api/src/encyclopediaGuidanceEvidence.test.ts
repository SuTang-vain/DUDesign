import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION,
  resolveEncyclopediaDemocaseEvidence,
} from './encyclopediaGuidanceEvidence.js'

describe('Encyclopedia democase evidence resolver', () => {
  it('treats exact aliases as strong retrieval evidence instead of weak keyword ratios', () => {
    const result = resolveEncyclopediaDemocaseEvidence('baidu baike')

    assert.equal(result.indexVersion, ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION)
    assert.equal(result.evidence[0]?.caseId, 'demo_baidu_baike_company')
    assert.equal(result.evidence[0]?.score, 0.78)
    assert.equal(result.evidence[0]?.taxonomyNodeId, 'tax_organization_company')
  })

  it('keeps weak incidental keyword matches as low-score evidence rather than classification truth', () => {
    const result = resolveEncyclopediaDemocaseEvidence('人工智能')

    assert.equal(result.evidence[0]?.caseId, 'demo_baidu_baike_company')
    assert.equal(result.evidence[0]?.score, 0.12)
    assert.equal(result.categoryHints[0]?.secondaryCategory, '企业公司')
  })

  it('maps vertical democases to stable taxonomy and capability evidence', () => {
    const result = resolveEncyclopediaDemocaseEvidence('甄嬛传分集剧情与角色关系')
    const tv = result.evidence.find(item => item.caseId === 'demo_tv_work')

    assert.equal(tv?.taxonomyNodeId, 'tax_screen_tv')
    assert.equal(tv?.preferredTemplatePackIds.includes('dtp_de_tv_character_relation'), true)
    assert.equal(tv?.interactionParadigmIds.includes('ip_relation_map'), true)
    assert.match(tv?.contentHash ?? '', /^[a-f0-9]{64}$/)
  })

  it('retrieves versioned real cases with exact-title and BM25-style evidence', () => {
    const result = resolveEncyclopediaDemocaseEvidence('庆余年人物关系与剧情脉络')
    const realCase = result.evidence.find(item => item.caseId.startsWith('case_'))

    assert.match(result.indexVersion, /^2026-07-16\.real-case\.[a-f0-9]{16}$/)
    assert.ok(realCase)
    assert.match(realCase.title, /庆余年/)
    assert.equal(realCase.taxonomyNodeId === 'tax_tv_historical' || realCase.taxonomyNodeId === 'tax_screen_tv', true)
    assert.equal(realCase.preferredTemplatePackIds.includes('dtp_de_tv_character_relation'), true)
    assert.equal(realCase.experienceProfile?.dominantStage, 'relation_map')
    assert.equal(realCase.experienceProfile?.attentionBudget.extremeSmall.maxVisibleItems, 3)
    assert.match(realCase.experienceProfile?.firstViewPromise ?? '', /relationship map/i)
    assert.ok(realCase.score >= 0.88)
  })
})
