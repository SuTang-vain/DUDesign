import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reviewDynamicEncyclopediaSpec } from './encyclopediaSpecReview.js'

/**
 * 动态百科规范审查测试。
 *
 * 设计目的：
 * 1. 旧 Stage 0 规则（viewport / 外部脚本 / scroll-container / touch 等）行为不变。
 * 2. 新 Stage 1 规则（禁内部滚动 + 中文优先）首期以 warning 形态生效。
 * 3. "语言类"词条整体豁免中文优先约束。
 *
 * 升级到 Stage 2 时，把对应规则的 ENFORCEMENT 从 'warning' 改为 'error'，
 * 期望以下对应测试从 "warn" 状态改为 "fail" 状态。
 */

const TIMELINE_TEMPLATE = 'dtp_dynamic_encyclopedia_timeline_card'
const SUMMARY_TEMPLATE = 'dtp_dynamic_encyclopedia_summary_card'

const BASE_HTML = (body: string) => `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; }
      .no-scroll-frame { width: 788px; height: 492px; overflow: hidden; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">${body}</main>
  </body>
</html>`

describe('Dynamic encyclopedia spec review', () => {
  it('reports deterministic findings for unsafe or incomplete encyclopedia cards', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: '<!doctype html><html><head><title>Bad</title></head><body><main><h1>百度百科</h1><p>简介：全球第一、最强、革命性知识产品。</p><script src="https://example.com/app.js"></script></main></body></html>',
      templatePackIds: [TIMELINE_TEMPLATE],
      interactionParadigmId: 'ip_timeline_story',
    })

    assert.equal(report.status, 'fail')
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.viewport_meta_missing'))
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.external_script_blocked'))
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.no_scroll_frame_required'))
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.timeline_template_mismatch'))
    assert.ok(report.findings.some(finding => finding.id === 'encyclopedia.neutral_tone_risk'))
  })

  it('passes a self-contained Chinese card that follows the no-scroll contract', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { height: 100%; overflow: hidden; }
      .no-scroll-frame { width: 788px; height: 492px; overflow: hidden; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">
      <h1>百度百科词条</h1>
      <section>百科概览与关键事实</section>
      <section>时间线 2000 成立 2010 发展 2020 里程碑</section>
    </main>
  </body>
</html>`,
      templatePackIds: [TIMELINE_TEMPLATE],
      interactionParadigmId: 'ip_timeline_story',
      entryTitle: '百度百科',
    })

    assert.equal(report.status, 'pass')
    assert.deepEqual(report.findings, [])
  })

  // -------- Stage 1: 禁内部滚动规则 --------

  it('warns (Stage 1) when overflow:auto is used', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div style="overflow-y: auto; height: 100%;"><main>${chineseBody('李白 词条 概览 关键事实 发展')}</main></div></body></html>`,
      templatePackIds: [SUMMARY_TEMPLATE],
      entryTitle: '李白',
    })

    assert.equal(report.status, 'warn')
    const finding = report.findings.find(item => item.id === 'encyclopedia.overflow_scroll_blocked')
    assert.ok(finding, 'expected overflow_scroll_blocked finding')
    assert.equal(finding!.severity, 'warning')
  })

  it('warns (Stage 1) when scroll-container class is used', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main class="scroll-container">${chineseBody('李白 词条 概览 关键事实')}</main></body></html>`,
      templatePackIds: [SUMMARY_TEMPLATE],
      entryTitle: '李白',
    })

    assert.equal(report.status, 'warn')
    const finding = report.findings.find(item => item.id === 'encyclopedia.scroll_container_class_blocked')
    assert.ok(finding, 'expected scroll_container_class_blocked finding')
    assert.equal(finding!.severity, 'warning')
  })

  // -------- Stage 1: 中文优先 + 英文 UI 短语 --------

  it('warns (Stage 1) when non-language-category body is dominated by English', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>李 Li Bai</h1>
        <section>View More content about Li Bai, the famous Tang Dynasty poet, who lived in the eighth century and wrote many famous poems and stories.</section>
      `),
      templatePackIds: [SUMMARY_TEMPLATE],
      entryTitle: '李 Li Bai',
      isLanguageCategory: false,
    })

    const finding = report.findings.find(item => item.id === 'encyclopedia.chinese_only_required')
    assert.ok(finding, 'expected chinese_only_required finding')
    assert.equal(finding!.severity, 'warning')
  })

  it('blocks English UI phrases in non-language-category cards', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>李白</h1>
        <section>唐代著名诗人，作品丰富。</section>
        <button>View More</button>
      `),
      templatePackIds: [SUMMARY_TEMPLATE],
      entryTitle: '李白',
      isLanguageCategory: false,
    })

    const finding = report.findings.find(item => item.id === 'encyclopedia.english_ui_phrase_blocked')
    assert.ok(finding, 'expected english_ui_phrase_blocked finding')
    assert.equal(finding!.severity, 'warning')
  })

  it('detects excessive English multi-word phrases in non-language-category cards', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>李白</h1>
        <section>词条概览：李白是 Tang Dynasty 著名诗人，写过 Quiet Night Thoughts 和 Hard Road To Shu 等作品，享有 Immortal Poet 之美誉。</section>
      `),
      templatePackIds: [SUMMARY_TEMPLATE],
      entryTitle: '李白',
      isLanguageCategory: false,
    })

    const finding = report.findings.find(item => item.id === 'encyclopedia.excessive_english_phrases')
    assert.ok(finding, 'expected excessive_english_phrases finding')
    assert.equal(finding!.severity, 'warning')
  })

  it('detects Cyrillic script as a warning in non-language-category cards', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>普希金</h1>
        <section>词条概览：俄罗斯浪漫主义诗人。原文片段：${'Здравствуй, мир'}</section>
      `),
      templatePackIds: [SUMMARY_TEMPLATE],
      entryTitle: '普希金',
      isLanguageCategory: false,
    })

    const finding = report.findings.find(item => item.id === 'encyclopedia.unsupported_script_blocked')
    assert.ok(finding, 'expected unsupported_script_blocked finding')
    assert.equal(finding!.severity, 'warning')
  })

  it('exempts language-category entries from Chinese-only rules', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>Machine Learning</h1>
        <section>View More content: a subfield of artificial intelligence that enables systems to learn from data.</section>
      `),
      templatePackIds: [SUMMARY_TEMPLATE],
      entryTitle: 'Machine Learning',
      isLanguageCategory: true,
      entryContentLanguage: 'en',
    })

    assert.equal(
      report.findings.some(finding => finding.id === 'encyclopedia.chinese_only_required'),
      false,
      'language-category entries must not trigger chinese_only_required',
    )
    assert.equal(
      report.findings.some(finding => finding.id === 'encyclopedia.english_ui_phrase_blocked'),
      false,
      'language-category entries must not trigger english_ui_phrase_blocked',
    )
  })

  it('keeps no-scroll and Chinese-only rules on a real timeline card with all warnings', () => {
    const report = reviewDynamicEncyclopediaSpec({
      // 综合问题：viewport 缺失 + scroll-container + 英文主导 + UI 短语
      html: `<!doctype html><html><head><title>Bad Timeline</title></head>
<body><main class="scroll-container">
  <h1>Brand New Timeline</h1>
  <section>View More content about this timeline entry, listing every milestone and development in the company history over the past years.</section>
</main></body></html>`,
      templatePackIds: [TIMELINE_TEMPLATE],
      interactionParadigmId: 'ip_timeline_story',
      entryTitle: 'Brand New Timeline',
      isLanguageCategory: false,
    })

    assert.equal(report.status, 'fail', 'viewport 缺失是 error，整体应 fail')
    const findingIds = report.findings.map(f => f.id)
    assert.ok(findingIds.includes('encyclopedia.viewport_meta_missing'))
    assert.ok(findingIds.includes('encyclopedia.timeline_template_mismatch'))
    assert.ok(findingIds.includes('encyclopedia.no_scroll_frame_required'))
    assert.ok(findingIds.includes('encyclopedia.scroll_container_class_blocked'))
    assert.ok(findingIds.includes('encyclopedia.chinese_only_required'))
    assert.ok(findingIds.includes('encyclopedia.english_ui_phrase_blocked'))
  })

  it('warns when film cards provide playback or piracy-oriented resources', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>飞驰人生3</h1>
        <section>电影百科概览：主演与角色信息。</section>
        <button>免费观看全集</button>
        <p>网盘下载和磁力链接见下方。</p>
      `),
      templatePackIds: ['dtp_de_film_cast_role_network'],
      classificationVector: classificationVector('影视作品', '电影', '电影作品概况'),
    })

    assert.equal(report.status, 'warn')
    assert.ok(report.findings.some(item => item.id === 'encyclopedia.media_resource_link_blocked'))
  })

  it('allows negative safety disclaimers that reject playback or download resources', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>庆余年</h1>
        <section>电视剧百科概览、角色关系和剧情结构。</section>
        <p>本词条不提供任何形式的播放、下载或资源入口。</p>
      `),
      templatePackIds: ['dtp_de_tv_episode_chain'],
      classificationVector: classificationVector('影视作品', '电视剧', '古装历史剧'),
    })

    assert.ok(!report.findings.some(item => item.id === 'encyclopedia.media_resource_link_blocked'))
  })

  it('warns when TV episode facts lack source or uncertainty wording', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>庆余年</h1>
        <section>电视剧百科概览和关键事实。</section>
        <section>第 12 集：主角发现真相并完成反转。</section>
      `),
      templatePackIds: ['dtp_de_tv_episode_chain'],
      classificationVector: classificationVector('影视作品', '电视剧', '古装历史剧'),
    })

    assert.equal(report.status, 'warn')
    assert.ok(report.findings.some(item => item.id === 'encyclopedia.tv_episode_fabrication_risk'))
  })

  it('warns when historical relationship claims lack source wording', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>李白</h1>
        <section>历史人物百科概览。</section>
        <section>关系图谱：李白与杜甫为文学好友，另列师承和对手关系。</section>
      `),
      templatePackIds: ['dtp_de_history_person_relationship'],
      classificationVector: classificationVector('名人', '历史人物', '文人学者'),
    })

    assert.equal(report.status, 'warn')
    assert.ok(report.findings.some(item => item.id === 'encyclopedia.history_relation_source_required'))
  })

  it('warns when cultural phrase origin modules lack source wording', () => {
    const report = reviewDynamicEncyclopediaSpec({
      html: BASE_HTML(`
        <h1>悬梁刺股</h1>
        <section>成语百科概览：努力学习的典故故事和寓意。</section>
        <section>故事：孙敬和苏秦勤学，最终获得成就。</section>
      `),
      templatePackIds: ['dtp_de_cultural_phrase_origin_story'],
      classificationVector: classificationVector('知识术语', '文化类词语', '出处典故'),
    })

    assert.equal(report.status, 'warn')
    assert.ok(report.findings.some(item => item.id === 'encyclopedia.cultural_origin_source_required'))
  })
})

function chineseBody(keywords: string): string {
  return `<p>${keywords}</p>`
}

function classificationVector(l1: string, l2: string, l3: string) {
  return {
    schemaVersion: '2026-07-08.dudesign-encyclopedia-classification-vector.v1' as const,
    l1,
    l2,
    l3,
    confidence: 0.86,
    signals: [l1, l2, l3],
    source: 'mock_rules' as const,
    recommendedModulePriorities: ['summary_facts'],
    preferredTemplateIds: [],
    riskFlags: [],
  }
}
