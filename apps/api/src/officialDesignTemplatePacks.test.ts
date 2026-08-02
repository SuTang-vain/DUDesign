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

  it('emits the reference example label, the example body, and the no-copy warning', async () => {
    // 通过源码字符串扫描验证 babelOClient.ts 定义了 htmlExamplesPromptBlock helper：
    // 1. "参考实现 #N" 标签（每个 example 一个编号）
    // 2. "do NOT copy entry-specific text" 警告（防止 LLM 复制具体词条内容）
    // 这两条来自 htmlExamplesPromptBlock。如果 babelOClient 改成不调这个函数，下面会 fail。
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const cwd = process.cwd()
    const candidates = [
      path.resolve(cwd, 'packages/runtime-gateway/src/babelOClient.ts'),
      path.resolve(cwd, '../../packages/runtime-gateway/src/babelOClient.ts'),
    ]
    const filePath = (await Promise.all(candidates.map(async candidate => {
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        return null
      }
    }))).find((candidate): candidate is string => Boolean(candidate))
    assert.ok(filePath, `babelOClient.ts should exist in one of: ${candidates.join(', ')}`)
    const src = await fs.readFile(filePath, 'utf-8')
    assert.match(src, /htmlExamplesPromptBlock/, 'babelOClient must define an htmlExamplesPromptBlock helper')
    assert.match(src, /参考实现 #\$\{index \+ 1\}/, 'helper must label each example with 参考实现 #N')
    assert.match(src, /do NOT copy entry-specific text/i, 'helper must warn LLM not to copy specific content')
    // 同时验证 designTemplatePackPromptBlock 真的调用了 helper
    assert.match(
      src,
      /pack\.htmlExamples\?\.length \? htmlExamplesPromptBlock/,
      'designTemplatePackPromptBlock must call htmlExamplesPromptBlock when pack ships htmlExamples',
    )
  })
})
