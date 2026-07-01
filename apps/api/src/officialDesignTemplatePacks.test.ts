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
  it('provides 6-8 official heuristic templates without public brand names', () => {
    assert.ok(officialDesignTemplatePacks.length >= 6)
    assert.ok(officialDesignTemplatePacks.length <= 8)

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
})
