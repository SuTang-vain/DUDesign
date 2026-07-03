import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { exportDesignTemplatePackToDesignMd, importDesignMd } from './designTemplatePack.js'
import { officialDesignTemplatePacks } from './officialDesignTemplatePacks.js'

const publicBrandNames = [
  'apple',
  'stripe',
  'linear',
  'vercel',
  'tesla',
  'mercedes',
  'bmw',
  'porsche',
  'figma',
]

describe('officialDesignTemplatePacks', () => {
  it('provides official heuristic templates without public brand names', () => {
    assert.ok(officialDesignTemplatePacks.length >= 6)

    for (const pack of officialDesignTemplatePacks) {
      assert.equal(pack.source, 'official')
      assert.equal(pack.visibility, 'public')
      assert.equal(pack.status, 'published')
      assert.equal(pack.createdByUserId, null)
      assert.ok(pack.rationale.donts.some(rule => /copy|imitate/i.test(rule)))

      const searchable = [
        pack.id,
        pack.name,
        pack.description ?? '',
        JSON.stringify(pack.designTokens),
        JSON.stringify(pack.rationale),
      ].join('\n').toLowerCase()

      for (const brandName of publicBrandNames) {
        assert.equal(searchable.includes(brandName), false, `${pack.id} should not reference ${brandName}`)
      }
    }
  })

  it('exports every official heuristic template to DESIGN.md compatible content', () => {
    for (const pack of officialDesignTemplatePacks) {
      const exported = exportDesignTemplatePackToDesignMd(pack)
      const imported = importDesignMd(exported, {
        id: pack.id,
        source: 'official',
        visibility: 'public',
        status: 'published',
      })

      assert.equal(imported.summary.errors, 0, `${pack.id} should not export invalid DESIGN.md`)
      assert.equal(imported.pack.name, pack.name)
      assert.equal(imported.pack.designTokens.colors.primary, pack.designTokens.colors.primary)
      assert.equal(imported.pack.designTokens.components['button-primary']?.backgroundColor, pack.designTokens.components['button-primary']?.backgroundColor)
    }
  })

  it('includes a dynamic encyclopedia card template package with fixed viewport constraints', () => {
    const pack = officialDesignTemplatePacks.find(item => item.id === 'dtp_dynamic_encyclopedia_card')
    assert.ok(pack)
    assert.equal(pack.designTokens.colors.primary, '#6487FA')
    assert.equal(pack.designTokens.components['pc-card-frame']?.width, 788)
    assert.equal(pack.designTokens.components['pc-card-frame']?.height, 492)
    assert.equal(pack.designTokens.components['wise-standard-frame']?.width, 380)
    assert.equal(pack.designTokens.components['wise-standard-frame']?.height, 456)
    assert.match(pack.rationale.sections.sizing ?? '', /788x492/)
    assert.match(pack.rationale.sections.iframeTouch ?? '', /touchmove/)
    assert.ok(pack.rationale.donts.some(rule => /touch-action: none/i.test(rule)))
  })

  it('includes dynamic encyclopedia child templates linked to the parent package', () => {
    const childIds = [
      'dtp_dynamic_encyclopedia_summary_card',
      'dtp_dynamic_encyclopedia_timeline_card',
    ]

    for (const childId of childIds) {
      const pack = officialDesignTemplatePacks.find(item => item.id === childId)
      assert.ok(pack, `${childId} should exist`)
      assert.equal(pack.parentPackId, 'dtp_dynamic_encyclopedia_card')
      assert.equal(pack.templateRole, 'child_template')
      assert.deepEqual(pack.supportedProductModes, ['dynamic_encyclopedia_card'])
      assert.equal(pack.designTokens.components['pc-card-frame']?.width, 788)
      assert.equal(pack.designTokens.components['wise-standard-frame']?.width, 380)
      assert.match(pack.rationale.sections.parentPack ?? '', /dtp_dynamic_encyclopedia_card/)
    }
  })
})
