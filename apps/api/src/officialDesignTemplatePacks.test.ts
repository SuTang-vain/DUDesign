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
    assert.equal(pack.templateRole, 'parent_pack')
    assert.deepEqual(pack.supportedProductModes, ['dynamic_encyclopedia_card'])
    assert.deepEqual(pack.supportedEntryCategories, ['encyclopedia'])
    assert.equal(pack.designTokens.colors.primary, '#6487FA')
    assert.equal(pack.designTokens.components['pc-card-frame']?.width, 788)
    assert.equal(pack.designTokens.components['pc-card-frame']?.height, 492)
    assert.equal(pack.designTokens.components['wise-standard-frame']?.width, 380)
    assert.equal(pack.designTokens.components['wise-standard-frame']?.height, 456)
    assert.match(pack.rationale.sections.sizing ?? '', /788x492/)
    assert.match(pack.rationale.sections.iframeTouch ?? '', /touchmove/)
    assert.match(pack.rationale.sections.packageChildren ?? '', /dtp_dynamic_encyclopedia_summary_card/)
    assert.match(pack.rationale.sections.packageChildren ?? '', /dtp_dynamic_encyclopedia_timeline_card/)
    assert.match(pack.rationale.sections.packageChildren ?? '', /dtp_dynamic_encyclopedia_relation_card/)
    assert.match(pack.rationale.sections.packageChildren ?? '', /dtp_dynamic_encyclopedia_compare_card/)
    assert.match(pack.rationale.sections.packageChildren ?? '', /dtp_dynamic_encyclopedia_expandable_card/)
    assert.ok(pack.rationale.donts.some(rule => /touch-action: none/i.test(rule)))
  })

  it('includes dynamic encyclopedia child templates linked to the parent package', () => {
    const childIds = [
      'dtp_dynamic_encyclopedia_summary_card',
      'dtp_dynamic_encyclopedia_timeline_card',
      'dtp_dynamic_encyclopedia_relation_card',
      'dtp_dynamic_encyclopedia_compare_card',
      'dtp_dynamic_encyclopedia_expandable_card',
      'dtp_de_history_person_relationship',
      'dtp_de_history_person_event_chain',
      'dtp_de_film_cast_role_network',
      'dtp_de_film_series_navigation',
      'dtp_de_tv_character_relation',
      'dtp_de_tv_episode_chain',
      'dtp_de_cultural_phrase_relation_graph',
      'dtp_de_cultural_phrase_origin_story',
    ]

    for (const childId of childIds) {
      const pack = officialDesignTemplatePacks.find(item => item.id === childId)
      assert.ok(pack, `${childId} should exist`)
      assert.equal(pack.parentPackId, 'dtp_dynamic_encyclopedia_card')
      assert.equal(pack.templateRole, 'child_template')
      assert.deepEqual(pack.supportedProductModes, ['dynamic_encyclopedia_card'])
      assert.ok((pack.supportedEntryCategories ?? []).length > 0)
      assert.equal(pack.designTokens.components['pc-card-frame']?.width, 788)
      assert.equal(pack.designTokens.components['pc-card-frame']?.height, 492)
      assert.equal(pack.designTokens.components['wise-standard-frame']?.width, 380)
      assert.equal(pack.designTokens.components['wise-standard-frame']?.height, 456)
      // 硬性归束（v0.4）：scroll-container 已被 no-scroll-frame + tab-bar / page-switcher / modal 取代。
      assert.equal(pack.designTokens.components['scroll-container'], undefined, `${childId} must not define legacy scroll-container`)
      assert.equal(pack.designTokens.components['no-scroll-frame']?.overflow, 'hidden', `${childId} must declare no-scroll-frame`)
      assert.ok(pack.designTokens.components['tab-bar'] ?? pack.designTokens.components['modal-overlay'] ?? pack.designTokens.components['page-switcher'], `${childId} must declare at least one overflow strategy component`)
      assert.match(pack.rationale.sections.parentPack ?? '', /dtp_dynamic_encyclopedia_card/)
      assert.equal('supportedInteractionParadigms' in pack, false)
      // 硬性归束（v0.4）：donts 必须包含 "English UI phrases" 阻断规则
      const dontsJoined = (pack.rationale.donts ?? []).join(' \n ')
      assert.match(dontsJoined, /English UI phrases|英文 UI 短语/i, `${childId} must block English UI phrases`)
    }
  })

  it('includes vertical dynamic encyclopedia templates for prioritized entry categories', () => {
    const expected = [
      ['dtp_de_history_person_relationship', ['名人', '历史人物']],
      ['dtp_de_history_person_event_chain', ['名人', '历史人物']],
      ['dtp_de_film_cast_role_network', ['影视作品', '电影']],
      ['dtp_de_film_series_navigation', ['影视作品', '电影']],
      ['dtp_de_tv_character_relation', ['影视作品', '电视剧']],
      ['dtp_de_tv_episode_chain', ['影视作品', '电视剧']],
      ['dtp_de_cultural_phrase_relation_graph', ['知识术语', '文化类词语']],
      ['dtp_de_cultural_phrase_origin_story', ['知识术语', '文化类词语']],
    ] as const

    for (const [templateId, categories] of expected) {
      const pack = officialDesignTemplatePacks.find(item => item.id === templateId)
      assert.ok(pack, `${templateId} should exist`)
      assert.equal(pack.parentPackId, 'dtp_dynamic_encyclopedia_card')
      assert.deepEqual(pack.supportedProductModes, ['dynamic_encyclopedia_card'])
      for (const category of categories) {
        assert.ok(pack.supportedEntryCategories?.includes(category), `${templateId} should support ${category}`)
      }
      assert.equal(pack.designTokens.components['no-scroll-frame']?.overflow, 'hidden')
      assert.ok(pack.rationale.sections.businessPriority, `${templateId} should document business priority`)
    }
  })

  // 硬性归束（v0.4）— few-shot HTML 示例（demo 模板）
  it('ships a few-shot HTML example on the summary child template', () => {
    const summary = officialDesignTemplatePacks.find(pack => pack.id === 'dtp_dynamic_encyclopedia_summary_card')
    assert.ok(summary)
    assert.ok(Array.isArray(summary.htmlExamples), 'summary card must declare htmlExamples')
    assert.ok(summary.htmlExamples.length >= 1, 'summary card must ship at least one HTML example')
  })

  it('keeps summary HTML examples compliant with the v0.4 spec review', async () => {
    const { reviewDynamicEncyclopediaSpec } = await import('./encyclopediaSpecReview.js')
    const summary = officialDesignTemplatePacks.find(pack => pack.id === 'dtp_dynamic_encyclopedia_summary_card')
    assert.ok(summary?.htmlExamples?.length)
    // 每条 demo HTML 必须通过 spec review（10 条规则全 pass）——这同时是 v0.4 硬性归束的"活文档"。
    for (const [index, html] of summary.htmlExamples.entries()) {
      const report = reviewDynamicEncyclopediaSpec({
        html,
        templatePackIds: ['dtp_dynamic_encyclopedia_summary_card'],
        // demo HTML 自带具体词条（李白），按"语言类"豁免中文优先检查
        isLanguageCategory: false,
        entryTitle: '李白',
      })
      assert.equal(
        report.status,
        'pass',
        `summary htmlExamples[${index}] must pass v0.4 spec review, got: ${report.status} findings=${JSON.stringify(report.findings.map(f => f.id))}`,
      )
    }
  })

  it('summary HTML example uses the v0.4 overflow strategy primitives', () => {
    const summary = officialDesignTemplatePacks.find(pack => pack.id === 'dtp_dynamic_encyclopedia_summary_card')
    assert.ok(summary?.htmlExamples?.[0])
    const html = summary.htmlExamples[0]
    // 单屏交付：no-scroll-frame + overflow:hidden
    assert.match(html, /no-scroll-frame/, 'demo must use .no-scroll-frame class')
    assert.match(html, /overflow\s*:\s*hidden/, 'demo must declare overflow:hidden on root frame')
    // 至少一种溢出策略组件
    assert.ok(
      /class="[^"]*tab-bar/.test(html)
      || /class="[^"]*page-switcher/.test(html)
      || /class="[^"]*modal-overlay/.test(html),
      'demo must use at least one overflow strategy component (tab-bar / page-switcher / modal-overlay)',
    )
    // 中文优先：demo 正文必须包含 Han 字符
    assert.match(html, /[\u4e00-\u9fff\u3400-\u4dbf]/, 'demo body must contain Chinese characters')
    // 禁英文 UI 短语
    const englishUiPhrases = ['View More', 'Read More', 'Get Started', 'Learn More', 'Sign Up', 'Subscribe', 'Try Now', 'Discover', 'Explore Now', 'Click Here']
    for (const phrase of englishUiPhrases) {
      assert.doesNotMatch(html, new RegExp(`\\b${phrase}\\b`, 'i'), `demo must not contain English UI phrase "${phrase}"`)
    }
    // 不应使用旧 scroll-container
    assert.doesNotMatch(html, /scroll-container/, 'demo must not use legacy .scroll-container class')
    // 不引用具体词条名以避免 LLM 复制
    assert.ok(!html.includes('李白'), 'demo must not embed a specific entry name (李 would be reproduced by LLM)')
  })
})

describe('babelOClient prompt injection of v0.4 few-shot HTML examples', () => {
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
