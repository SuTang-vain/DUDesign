import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DesignTemplatePack } from '@dudesign/contracts'
import {
  exportPortableDesignTemplatePack,
  importPortableDesignTemplatePack,
} from './portableDesignTemplatePack.js'

describe('portable Design Template Pack JSON', () => {
  it('round-trips the portable template core without environment-bound fields', () => {
    const source = templateFixture()
    const exported = exportPortableDesignTemplatePack(source, '2026-07-13T00:00:00.000Z')
    const imported = importPortableDesignTemplatePack(exported)

    assert.equal(exported.manifest.examplesIncluded, false)
    assert.ok(exported.manifest.omittedFields.includes('htmlExamples'))
    assert.equal('id' in exported.template, false)
    assert.equal('previewArtifactId' in exported.template, false)
    assert.deepEqual(imported.template.designTokens, source.designTokens)
    assert.deepEqual(imported.template.rationale, source.rationale)
    assert.equal(imported.draft.name, source.name)
    assert.equal(imported.draft.sourceEvidence[0]?.confidence, 1)
  })

  it('keeps content hash stable across export timestamps', () => {
    const source = templateFixture()
    const first = exportPortableDesignTemplatePack(source, '2026-07-13T00:00:00.000Z')
    const second = exportPortableDesignTemplatePack(source, '2026-07-14T00:00:00.000Z')
    assert.equal(first.manifest.contentHash, second.manifest.contentHash)
  })

  it('rejects a tampered portable template', () => {
    const exported = exportPortableDesignTemplatePack(templateFixture(), '2026-07-13T00:00:00.000Z')
    exported.template.name = 'Tampered name'
    assert.throws(
      () => importPortableDesignTemplatePack(exported),
      error => (error as { code?: string }).code === 'TEMPLATE_PACK_HASH_MISMATCH',
    )
  })
})

function templateFixture(): DesignTemplatePack {
  return {
    schemaVersion: '2026-07-01.dudesign-template-pack.v1',
    id: 'dtp_portable_fixture',
    source: 'user',
    format: 'dudesign-template-v1',
    visibility: 'private',
    status: 'published',
    name: 'Portable fixture',
    description: 'Portable template core fixture.',
    version: '1.2.3',
    designTokens: {
      colors: { surface: '#ffffff', accent: '#2454ff' },
      typography: { body: { fontFamily: 'Inter', fontSize: '16px' } },
      spacing: { md: 16 },
      rounded: { card: '8px' },
      components: { card: { padding: '{spacing.md}' } },
    },
    rationale: {
      overview: 'Portable structure.',
      colors: 'White surface and blue accent.',
      typography: 'Readable body type.',
      layout: 'Single-column summary.',
      elevation: null,
      shapes: 'Moderate radius.',
      components: 'Reusable fact cards.',
      dos: ['Keep hierarchy clear.'],
      donts: ['Do not copy source facts.'],
      sections: { Summary: 'Primary facts.' },
    },
    previewArtifactId: 'art_environment_only',
    lintStatus: 'passed',
    createdByUserId: 'usr_dev',
    htmlExamples: ['<main>Environment-bound example</main>'],
  }
}
