import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ENCYCLOPEDIA_TAXONOMY_DECLARED_L2_COUNT,
  findEncyclopediaTaxonomyNode,
  lintEncyclopediaTaxonomy,
  listEncyclopediaTaxonomyNodes,
  resolveEncyclopediaTaxonomyCandidates,
} from './encyclopediaTaxonomy.js'

describe('Encyclopedia taxonomy registry', () => {
  it('registers all 11 documented L1 categories and preserves the source L2 count discrepancy', () => {
    const nodes = listEncyclopediaTaxonomyNodes()
    const l2Nodes = nodes.filter(node => node.level === 'L2')
    const l1Categories = new Set(l2Nodes.map(node => node.l1))

    assert.equal(l1Categories.size, 11)
    assert.equal(l2Nodes.length, 41)
    assert.equal(ENCYCLOPEDIA_TAXONOMY_DECLARED_L2_COUNT, 44)
    assert.deepEqual(lintEncyclopediaTaxonomy(), [{
      code: 'l2_count_mismatch',
      severity: 'warning',
      message: 'Source document declares 44 L2 categories but its tables register 41; reconcile the missing three categories before marking CAP-12 complete.',
    }])
  })

  it('resolves high-priority vertical candidates from query signals and democase category hints', () => {
    const candidates = resolveEncyclopediaTaxonomyCandidates({
      query: '庆余年人物关系与剧情脉络',
      categoryHints: [{ primaryCategory: '影视作品', secondaryCategory: '电视剧' }],
      limit: 5,
    })

    assert.equal(candidates[0]?.taxonomyNodeId, 'tax_tv_historical')
    assert.equal(candidates.some(candidate => candidate.taxonomyNodeId === 'tax_screen_tv'), true)
    assert.equal(candidates[0]?.compatibleTemplatePackIds.includes('dtp_de_tv_character_relation'), true)
  })

  it('covers previously missing high-frequency categories', () => {
    const cases = [
      ['抑郁症的症状与治疗', '医学健康'],
      ['大熊猫的习性与分布', '动物'],
      ['春节的起源和习俗', '节日庆典'],
      ['周杰伦七里香单曲发行', '音乐'],
    ] as const
    for (const [query, expectedL2] of cases) {
      const candidates = resolveEncyclopediaTaxonomyCandidates({ query, limit: 3 })
      assert.equal(candidates.some(candidate => candidate.l2 === expectedL2), true, query)
}
  })

  it('finds the stable registry node for legacy category mappings', () => {
    const node = findEncyclopediaTaxonomyNode('地域建筑', '景区景点', '导览路线')
    assert.equal(node?.taxonomyNodeId, 'tax_scenic_route')
  })
})
