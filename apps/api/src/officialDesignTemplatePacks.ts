import type { DesignTemplatePack } from '@dudesign/contracts'
import { DESIGN_TEMPLATE_PACK_SCHEMA_VERSION } from './designTemplatePack.js'

/**
 * 硬性归束（v0.4）few-shot HTML 示例：每个示例必须满足
 *  - PC 788×492 / WISE 380×456 / 极小屏 300×360 单屏交付（no-scroll-frame, overflow:hidden）
 *  - 至少包含一种溢出策略组件（.tab-bar / .page-switcher / .modal-overlay）
 *  - 中文优先（语言类词条可豁免）
 *  - 禁英文 UI 短语（View More / Read More / ...）
 *  - 不抄任何公开百科 / 搜索引擎 / 浏览器的视觉设计
 *  - 自包含：内联 <style>，无外部脚本
 *  - 通过 apps/api/src/encyclopediaSpecReview.ts 的 spec review（10 条规则全 pass）
 *
 * 通用结构与优先垂类模板均通过文件型 compact few-shot 覆盖，并由
 * dynamicTemplateExamples.test.ts 统一执行桌面与 300×360 门禁。
 */
const SUMMARY_CARD_HTML_EXAMPLE = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>动态百科·摘要卡 - 参考实现</title>
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; }
      body { display: grid; place-items: center; font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #1E1F24; background: #F8F8F8; }
      .no-scroll-frame { width: 788px; height: 492px; overflow: hidden; position: relative; box-sizing: border-box; padding: 24px 28px; background: #FFFFFF; }
      .entry-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
      .entry-title { font-size: 24px; font-weight: 700; line-height: 1.18; color: #1E1F24; margin: 0; }
      .entry-category { font-size: 12px; font-weight: 600; padding: 4px 10px; background: #EEF3FF; color: #6487FA; border-radius: 6px; }
      .entry-summary { font-size: 14px; line-height: 1.58; color: #1E1F24; margin: 0 0 16px 0; }
      .tab-bar { display: flex; gap: 18px; border-bottom: 1px solid #E5E7EB; margin-bottom: 16px; }
      .tab-bar button { background: none; border: none; padding: 6px 0; font: inherit; font-size: 12px; font-weight: 600; color: #848691; cursor: pointer; border-bottom: 2px solid transparent; }
      .tab-bar button[aria-selected="true"] { color: #6487FA; border-bottom-color: #6487FA; }
      .tab-panel[hidden] { display: none; }
      .fact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .fact-cell { background: #F8F8F8; border-radius: 10px; padding: 12px 14px; }
      .fact-label { display: block; font-size: 12px; font-weight: 600; color: #848691; margin-bottom: 4px; }
      .fact-value { font-size: 14px; line-height: 1.45; color: #1E1F24; margin: 0; }
      .source-hint { position: absolute; bottom: 18px; right: 28px; font-size: 12px; color: #B7B9C1; }
      @media (max-width: 320px), (max-height: 365px) {
        .no-scroll-frame { width: 300px; height: 360px; padding: 14px; }
        .entry-header { gap: 6px; margin-bottom: 5px; }
        .entry-title { max-width: 68%; font-size: 17px; }
        .entry-category { padding: 3px 6px; font-size: 10px; }
        .entry-summary { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 11px; line-height: 1.35; margin-bottom: 7px; }
        .tab-bar { gap: 6px; margin-bottom: 8px; }
        .tab-bar button { min-width: 0; padding: 5px 3px; font-size: 10px; white-space: nowrap; }
        .fact-grid { gap: 6px; }
        .fact-cell { padding: 8px; border-radius: 7px; }
        .fact-cell:nth-child(n + 3) { display: none; }
        .fact-label { margin-bottom: 2px; font-size: 10px; }
        .fact-value { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 11px; line-height: 1.35; }
        .source-hint { display: none; }
      }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame" data-dudesign-template="dtp_dynamic_encyclopedia_summary_card">
      <header class="entry-header">
        <h1 class="entry-title">【示例词条名】</h1>
        <span class="entry-category">【分类】</span>
      </header>
      <p class="entry-summary">【一句中性摘要，说明该词条的核心事实，不含营销/绝对化语言。】</p>
      <nav class="tab-bar" role="tablist" aria-label="事实分组">
        <button type="button" role="tab" aria-selected="true" aria-controls="panel-basic" id="tab-basic">【分组一】</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="panel-more" id="tab-more">【分组二】</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="panel-source" id="tab-source">【分组三】</button>
      </nav>
      <section class="tab-panel fact-grid" id="panel-basic" role="tabpanel" aria-labelledby="tab-basic">
        <article class="fact-cell"><span class="fact-label">【事实 1 名称】</span><p class="fact-value">【事实 1 内容】</p></article>
        <article class="fact-cell"><span class="fact-label">【事实 2 名称】</span><p class="fact-value">【事实 2 内容】</p></article>
        <article class="fact-cell"><span class="fact-label">【事实 3 名称】</span><p class="fact-value">【事实 3 内容】</p></article>
      </section>
      <section class="tab-panel fact-grid" id="panel-more" role="tabpanel" aria-labelledby="tab-more" hidden>
        <article class="fact-cell"><span class="fact-label">【补充事实】</span><p class="fact-value">【更多事实内容，资料不足时明确标注。】</p></article>
        <article class="fact-cell"><span class="fact-label">【关联信息】</span><p class="fact-value">【相关实体、时间或分类。】</p></article>
      </section>
      <section class="tab-panel fact-grid" id="panel-source" role="tabpanel" aria-labelledby="tab-source" hidden>
        <article class="fact-cell"><span class="fact-label">【来源状态】</span><p class="fact-value">【据公开资料 / 待核实 / 资料不足。】</p></article>
      </section>
      <p class="source-hint">【信息以可核验来源为基础】</p>
    </main>
    <script>
      document.querySelectorAll('[role="tab"]').forEach(function(tab) {
        tab.addEventListener('click', function() {
          var target = tab.getAttribute('aria-controls');
          document.querySelectorAll('[role="tab"]').forEach(function(item) {
            item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
          });
          document.querySelectorAll('[role="tabpanel"]').forEach(function(panel) {
            panel.hidden = panel.id !== target;
          });
        });
      });
    </script>
  </body>
</html>`

export const officialDesignTemplatePacks: DesignTemplatePack[] = [
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_premium_product_launch',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Premium Product Launch',
    description: 'A restrained product launch system for tactile, high-value digital or physical products.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#171717',
        'on-primary': '#FFFFFF',
        background: '#F7F5F0',
        surface: '#FFFFFF',
        accent: '#6F7D5D',
      },
      typography: {
        display: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '56px', fontWeight: 650, lineHeight: 1.02 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '16px', fontWeight: 400, lineHeight: 1.6 },
      },
      spacing: { xs: '6px', sm: '12px', md: '24px', lg: '48px', xl: '80px' },
      rounded: { sm: '6px', md: '10px', lg: '18px' },
      components: {
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.sm}' },
        'product-panel': { backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
      },
    },
    rationale: {
      overview: 'Use calm premium hierarchy, strong product focus, and spacious comparison moments.',
      colors: 'Warm neutral surfaces carry most of the page; accent color is used sparingly for proof or progress states.',
      typography: 'Large compact headlines paired with quiet body copy. Avoid decorative type.',
      layout: 'Hero first, proof second, product detail third. Keep product imagery or generated product mockups inspectable.',
      elevation: 'Use shallow elevation only for product panels and sticky actions.',
      shapes: 'Prefer restrained radii and simple silhouettes.',
      components: 'Primary buttons are direct and dark; cards are used only for repeated product details or comparisons.',
      dos: ['Show the actual product or interface early.', 'Use one decisive CTA per viewport.'],
      donts: ['Do not copy any public brand chrome, product photography style, logos, or proprietary copy.', 'Do not turn the page into a generic gradient hero.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_trust_fintech',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Trust-Centered Fintech',
    description: 'A clear, compliance-aware financial product system for trust, comparison, and conversion.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#123C3A',
        'on-primary': '#FFFFFF',
        background: '#F4F7F5',
        surface: '#FFFFFF',
        accent: '#3B82F6',
        warning: '#B45309',
      },
      typography: {
        display: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '48px', fontWeight: 680, lineHeight: 1.08 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '16px', fontWeight: 400, lineHeight: 1.58 },
      },
      spacing: { sm: '10px', md: '20px', lg: '40px', xl: '72px' },
      rounded: { sm: '4px', md: '8px', lg: '14px' },
      components: {
        'metric-card': { backgroundColor: '{colors.surface}', rounded: '{rounded.md}' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.sm}' },
      },
    },
    rationale: {
      overview: 'Prioritize legibility, proof, pricing clarity, and explicit risk or security language.',
      colors: 'Stable greens and whites should dominate; bright blue is reserved for links and verified actions.',
      typography: 'Use plain language and numerals that scan quickly.',
      layout: 'Comparison tables, trust bands, and calculator-like modules should be easy to audit.',
      elevation: 'Minimal shadows. Trust comes from structure and content, not gloss.',
      shapes: 'Moderate radius only; avoid playful shapes.',
      components: 'Use metric cards, disclosure rows, fee tables, and security badges with restrained styling.',
      dos: ['Surface fees, limits, and security details plainly.', 'Use realistic financial examples without overpromising outcomes.'],
      donts: ['Do not imitate bank, card network, or payment company trade dress.', 'Do not hide risk language in tiny text.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_editorial_creative_portfolio',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Editorial Creative Portfolio',
    description: 'A portfolio system for artists, studios, photographers, and experimental creative work.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#202020',
        'on-primary': '#FAFAF7',
        background: '#FBFAF6',
        surface: '#FFFFFF',
        accent: '#D86C4A',
      },
      typography: {
        display: { fontFamily: 'Georgia, ui-serif, serif', fontSize: '58px', fontWeight: 500, lineHeight: 1.0 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '16px', fontWeight: 400, lineHeight: 1.7 },
      },
      spacing: { sm: '12px', md: '24px', lg: '56px', xl: '96px' },
      rounded: { sm: '2px', md: '6px', lg: '8px' },
      components: {
        'project-tile': { backgroundColor: '{colors.surface}', rounded: '{rounded.md}' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.sm}' },
      },
    },
    rationale: {
      overview: 'Give work samples room to breathe and let captions carry the story.',
      colors: 'Mostly monochrome with one editorial accent for active states and tags.',
      typography: 'Pair expressive display type with neutral UI labels.',
      layout: 'Use magazine-like rhythm, alternating scale, and strong image or canvas placements.',
      elevation: 'Flat by default; depth comes from image scale and whitespace.',
      shapes: 'Keep framing quiet so the creative work stays primary.',
      components: 'Project tiles, filters, captions, and contact modules should feel curated rather than dashboard-like.',
      dos: ['Show concrete work above the fold.', 'Make project metadata scannable.'],
      donts: ['Do not copy a known magazine, gallery, studio, or portfolio trade dress.', 'Do not use stock-like abstract backgrounds as the main proof.', 'Do not overcrowd the page with badges.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_enterprise_clarity',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Enterprise Clarity',
    description: 'A sober B2B system for complex products, procurement confidence, and repeated scanning.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#253247',
        'on-primary': '#FFFFFF',
        background: '#F6F7F9',
        surface: '#FFFFFF',
        accent: '#2F6FED',
      },
      typography: {
        display: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '44px', fontWeight: 680, lineHeight: 1.12 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '15px', fontWeight: 400, lineHeight: 1.62 },
      },
      spacing: { sm: '8px', md: '18px', lg: '36px', xl: '64px' },
      rounded: { sm: '4px', md: '8px', lg: '12px' },
      components: {
        'feature-row': { backgroundColor: '{colors.surface}', rounded: '{rounded.md}' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.sm}' },
      },
    },
    rationale: {
      overview: 'Keep dense information orderly, with trust proof and implementation context close to claims.',
      colors: 'Neutral operational colors with blue reserved for navigation, links, and primary actions.',
      typography: 'Professional and compact. Favor subheads and labels that support scanning.',
      layout: 'Use clear bands, tables, diagrams, and side-by-side evidence blocks.',
      elevation: 'Low depth; use borders and banding for separation.',
      shapes: 'Conservative radius, no playful decorative forms.',
      components: 'Feature matrices, integration lists, role-based use cases, and security sections are first-class.',
      dos: ['Make deployment and security concerns visible.', 'Support comparison and repeated review.'],
      donts: ['Do not copy or imitate a specific enterprise software homepage or console trade dress.', 'Do not use oversized marketing-only hero composition for operational tools.', 'Do not obscure dense data inside decorative cards.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_mobility_launch',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Mobility Launch',
    description: 'A motion-aware launch system for automotive, transportation, robotics, and hardware mobility.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#101113',
        'on-primary': '#FFFFFF',
        background: '#F5F2EC',
        surface: '#FFFFFF',
        accent: '#B91C1C',
      },
      typography: {
        display: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '54px', fontWeight: 720, lineHeight: 1.0 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '16px', fontWeight: 400, lineHeight: 1.55 },
      },
      spacing: { sm: '10px', md: '22px', lg: '48px', xl: '88px' },
      rounded: { sm: '4px', md: '10px', lg: '20px' },
      components: {
        'spec-strip': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
        'button-primary': { backgroundColor: '{colors.accent}', textColor: '{colors.on-primary}', rounded: '{rounded.sm}' },
      },
    },
    rationale: {
      overview: 'Use strong silhouettes, specs, and motion cues while keeping the object inspectable.',
      colors: 'Charcoal and warm neutrals dominate; red accent adds urgency without becoming a brand clone.',
      typography: 'Confident technical headlines with compact spec labels.',
      layout: 'Lead with the vehicle or hardware object, then show specs, experience, safety, and availability.',
      elevation: 'Use layered panels only where specs need contrast.',
      shapes: 'Use subtle aerodynamic curves in layout, not decorative blobs.',
      components: 'Spec strips, model comparison, safety highlights, and configurator-like controls are key.',
      dos: ['Show product form, scale, and practical details.', 'Use motion cues to support understanding.'],
      donts: ['Do not imitate any automaker grille, badge, typography, launch page, or photography trade dress.', 'Do not hide safety information behind vibe-only visuals.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_developer_workflow',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Developer Workflow',
    description: 'A precise developer-tool system for APIs, CLIs, infrastructure, and code-adjacent products.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#0F172A',
        'on-primary': '#E5E7EB',
        background: '#F8FAFC',
        surface: '#FFFFFF',
        accent: '#14B8A6',
      },
      typography: {
        display: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '46px', fontWeight: 700, lineHeight: 1.08 },
        mono: { fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '13px', fontWeight: 500, lineHeight: 1.55 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '16px', fontWeight: 400, lineHeight: 1.6 },
      },
      spacing: { sm: '8px', md: '18px', lg: '40px', xl: '72px' },
      rounded: { sm: '4px', md: '8px', lg: '12px' },
      components: {
        'code-panel': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
        'button-primary': { backgroundColor: '{colors.accent}', textColor: '{colors.primary}', rounded: '{rounded.sm}' },
      },
    },
    rationale: {
      overview: 'Make implementation feel obvious: code samples, workflow steps, and integration state should be first-class.',
      colors: 'Dark code panels contrast with light documentation surfaces; teal accent marks success or active state.',
      typography: 'Use a trustworthy sans for product copy and a readable mono only for real code or commands.',
      layout: 'Expose API examples, quickstart steps, and architecture diagrams without overwhelming the first viewport.',
      elevation: 'Prefer borders and terminal-like panels over heavy shadows.',
      shapes: 'Crisp edges and predictable controls.',
      components: 'Code panels, tabs, copy buttons, status badges, and changelog snippets are expected.',
      dos: ['Include plausible code or CLI examples.', 'Make docs and product value connect in the same flow.'],
      donts: ['Do not fake unreadable code texture.', 'Do not copy any specific developer platform landing page chrome.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_warm_commerce',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Warm Commerce',
    description: 'A product-commerce system for curated goods, lifestyle offers, and approachable conversion.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#312A25',
        'on-primary': '#FFFFFF',
        background: '#FAF6EF',
        surface: '#FFFFFF',
        accent: '#C96A43',
      },
      typography: {
        display: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '50px', fontWeight: 660, lineHeight: 1.06 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '16px', fontWeight: 400, lineHeight: 1.64 },
      },
      spacing: { sm: '10px', md: '22px', lg: '44px', xl: '76px' },
      rounded: { sm: '6px', md: '12px', lg: '18px' },
      components: {
        'product-card': { backgroundColor: '{colors.surface}', rounded: '{rounded.md}' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.sm}' },
      },
    },
    rationale: {
      overview: 'Balance warmth, product inspection, and purchasing clarity.',
      colors: 'Soft commerce neutrals with a single warm accent for price, promo, or availability.',
      typography: 'Friendly but not cute; support product detail scanning.',
      layout: 'Product grids, bundles, story bands, and trust proof should remain clean and transactional.',
      elevation: 'Subtle depth on product cards only.',
      shapes: 'Moderate radius for approachability.',
      components: 'Product cards, bundles, review snippets, variant selectors, and sticky buy actions are core.',
      dos: ['Make product details and purchase path visible.', 'Use real product imagery or generated product-like assets when needed.'],
      donts: ['Do not bury buying controls under editorial content.', 'Do not copy any marketplace or fashion brand trade dress.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_data_operations',
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Data-Dense Operations',
    description: 'A compact operational system for dashboards, admin tools, monitoring, and repeated workflows.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#1F2937',
        'on-primary': '#FFFFFF',
        background: '#F3F4F6',
        surface: '#FFFFFF',
        accent: '#2563EB',
        success: '#047857',
        danger: '#B91C1C',
      },
      typography: {
        display: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '34px', fontWeight: 700, lineHeight: 1.14 },
        body: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '14px', fontWeight: 400, lineHeight: 1.55 },
        label: { fontFamily: 'Inter, ui-sans-serif, system-ui', fontSize: '12px', fontWeight: 650, lineHeight: 1.25 },
      },
      spacing: { xs: '4px', sm: '8px', md: '16px', lg: '28px', xl: '48px' },
      rounded: { sm: '4px', md: '8px', lg: '10px' },
      components: {
        'data-table': { backgroundColor: '{colors.surface}', rounded: '{rounded.md}' },
        'button-primary': { backgroundColor: '{colors.accent}', textColor: '{colors.on-primary}', rounded: '{rounded.sm}' },
      },
    },
    rationale: {
      overview: 'Prioritize scanning, comparison, filters, error states, and fast repeated action.',
      colors: 'Neutral operational surfaces with semantic status colors.',
      typography: 'Dense, legible, and label-driven.',
      layout: 'Navigation, filters, tables, charts, and detail drawers should be predictable and stable.',
      elevation: 'Use borders and layout bands before shadows.',
      shapes: 'Small radii preserve density.',
      components: 'Tables, filters, tabs, segmented controls, drawers, and metric strips are primary.',
      dos: ['Keep workflows dense but organized.', 'Show empty, loading, and error states.'],
      donts: ['Do not copy or imitate a specific analytics, monitoring, or admin platform trade dress.', 'Do not make a marketing landing page for an operational tool.', 'Do not use oversized cards where tables or lists are more useful.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'parent_pack',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['encyclopedia'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '词条主题动态交互卡',
    description: '以词条或实体为主题入口，通过单屏视觉叙事和本地交互呈现精选内容；不是传统百科文章或百科页面。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        // 硬性归束（v0.4）：单一界面交付，禁止任何内部滚动。
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-large-frame': { width: 396, height: 475, ratio: '1:1.2' },
        'wise-small-frame': { width: 300, height: 360, ratio: '1:1.2' },
        // 取代旧 scroll-container；html/body 与根容器一律 overflow:hidden。
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        // 溢出策略三件套：tab 栏 / 分页指示器 / 模态弹窗。
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}' },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
      },
    },
    rationale: {
      overview: 'Use this as a template package for topic-driven dynamic interactive cards. The entry defines the theme and factual boundary, while the deliverable is a single-screen interactive experience rather than a traditional encyclopedia article or website page. Content that exceeds the canvas must be curated or split across tabs, page switchers, or modal dialogs.',
      colors: 'Primary action color is #6487FA. Content surfaces are #FFFFFF and #F8F8F8. Main text is #1E1F24, secondary text is #848691, and tertiary text is #B7B9C1.',
      typography: 'Default body language is Simplified Chinese. Entries classified as language-category may use the source language. Content must stay legible at 300px width. Prefer short labels, expressive hierarchy, and curated supporting facts rather than article-like prose.',
      layout: 'PC must render perfectly at 788x492. Mobile standard is 380x456, and 300x360 is an equally required compact authored state; 396x475 remains a compatibility size. Preserve width:height ratio near 1:1.2 on mobile. No body scrolling, no container scrolling — content overflow is handled by tabs, page switchers, or modals.',
      elevation: 'Use subtle borders or shallow shadows only where needed to support the thematic focal module and interactive controls.',
      shapes: 'Use moderate radii and theme-appropriate geometry. Avoid public-product trade dress and generic article chrome.',
      components: 'Expected subtemplates include thematic identity, timeline narrative, relation exploration, comparison, route guidance, and progressive disclosure. Select one primary interaction instead of reproducing encyclopedia article sections.',
      dos: [
        'Set html, body { height: 100%; overflow: hidden; } so the page itself never scrolls.',
        'When information density exceeds the canvas, split content across tab bars (max 4 tabs), page switchers (dots or pill), or modal dialogs.',
        'Default body content to Simplified Chinese. Preserve proper nouns, foreign entry titles, and language-category entries in their original script.',
        'Keep iframe-embedded mobile pages compatible with native page gestures.',
        'Use local interactive UI states instead of external navigation.',
        'Make one theme-specific interaction the primary experience and curate supporting content around it.',
        'Treat 300x360 as a first-class delivery target: keep the necessary page switcher or primary action visible, reduce the first view to topic identity plus one concise core fact, and use a clearly labelled local interaction to reveal secondary information.',
        'Keep inactive tab/page/detail panels out of layout and pointer hit-testing with [hidden] { display:none !important; } or an equally specific inactive-state rule.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not use overflow: auto / scroll / hidden on any container — set overflow: hidden on the root and route overflow through tab-bar / page-switcher / modal.',
        'Do not use the .scroll-container class (legacy; replaced by .no-scroll-frame + tab-bar / page-switcher / modal).',
        'Do not attach global touchmove preventDefault handlers to document, body, or html.',
        'Do not set touch-action: none globally; only use local touch behavior on precise controls.',
        'Do not call stopPropagation for touchstart, touchmove, or touchend on scroll gestures.',
        'Do not rely on video, download actions, or outbound links as core interactions.',
        'Do not reproduce a traditional encyclopedia infobox, table of contents, or long article layout.',
        'Do not keep a 380x456 or 788x492 frame at 300x360, hide every tab/action, or remove details without providing a local reveal interaction.',
        'Do not let .tab-panel/.panel display:grid or display:flex declarations override the hidden attribute; inactive content must never cover the active compact controls.',
        'Do not insert English UI phrases (View More / Read More / Get Started / Learn More / Sign Up / Subscribe / Try Now / Discover / Explore Now / Click Here / See More / Find Out More / Buy Now / Add to Cart / Continue Reading) in non-language-category entries. Use Chinese equivalents: 查看更多 / 阅读更多 / 开始使用 / 了解详情 / 注册 / 订阅 / 立即试用 / 发现 / 立即探索 / 点击此处 / 查看更多 / 了解更多 / 立即购买 / 加入购物车 / 继续阅读.',
      ],
      sections: {
        sizing: 'PC: 788x492 exact composition. WISE standard: 380x456. WISE compatibility: 396x475 and 300x360. Mobile ratio should remain width:height = 1:1.2.',
        smallViewport: 'At 300x360, author a dedicated compact information architecture in an exact 300x360 frame. Preserve the topic identity, one concise core fact, and exactly one primary navigation/control group: either 2-3 page-switching tabs or choices, or one reveal action. Permit at most 3 primary choices plus 2 other visible controls, and do not keep two competing navigation rows. Remove duplicate metadata, source rows, decorative labels, repeated summaries, and secondary fact cards from the initial state. Guide intentional disclosure with a short Chinese affordance such as 查看更多、切换阶段、查看关系 or a page indicator. Inactive and deferred modules must use display:none and leave both layout and pointer hit-testing. Never hide the only route to more information and never solve overflow with scrolling.',
        scrolling: 'Set html, body, .no-scroll-frame to height: 100% and overflow: hidden. Internal scroll containers are FORBIDDEN. Use .tab-bar (max 4 tabs) / .page-switcher (dots or pill) / .modal-overlay to navigate or reveal overflow content within the single canvas.',
        iframeTouch: 'No internal scroll means no need to intercept touchmove. Iframe embeds must present the full card without parent-page scroll influence. Avoid pinch/zoom conflicts by using touch-action: pan-x pan-y on local controls only.',
        canvasTouch: 'Canvas-like interactions must use touch-action: pan-x pan-y and should leave physical spacing from iframe or scroll areas.',
        compatibility: 'Android compatibility is prioritized: avoid video resources, downloads, and jump links unless explicitly requested.',
        packageChildren: 'This root template represents a package. Generic child templates: dtp_dynamic_encyclopedia_summary_card (summary-card: entity summary and key facts), dtp_dynamic_encyclopedia_timeline_card (timeline-card: events or development history), dtp_dynamic_encyclopedia_relation_card (relation-card: related entities and lightweight graph preview), dtp_dynamic_encyclopedia_compare_card (comparison-card: side-by-side fact comparison), dtp_dynamic_encyclopedia_expandable_card (expandable-fact-card: progressive disclosure for long encyclopedic details). Vertical child templates: dtp_de_history_person_relationship, dtp_de_history_person_event_chain, dtp_de_film_cast_role_network, dtp_de_film_series_navigation, dtp_de_tv_character_relation, dtp_de_tv_episode_chain, dtp_de_cultural_phrase_relation_graph, dtp_de_cultural_phrase_origin_story, dtp_de_scenic_spot_route_guide, dtp_de_scenic_spot_map_poi, dtp_de_star_group_member_map (star-group-member-map: member identity, member list, roles, timeline, and works for music groups and idol bands). All child templates inherit sizing, color, iframe/touch, no-scroll, and delivery safety constraints. No child template may introduce overflow:auto/scroll containers.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_dynamic_encyclopedia_summary_card',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['名人', '机构组织', '企业', '学校', '物品产品', '知识术语'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·摘要卡',
    description: '用于核心实体事实、简短摘要与关键指标的子模版。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'fact-grid': { minColumns: 2, maxColumns: 4, backgroundColor: '{colors.surface}', rounded: '{rounded.md}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
      },
    },
    rationale: {
      overview: 'Use this child template when the entry is best represented by a compact identity summary and verified key facts.',
      colors: 'Inherit #6487FA primary actions and neutral encyclopedia surfaces from the parent package.',
      typography: 'Default body language is Simplified Chinese. Keep short labels, dense facts, and legible CJK content at 300px width.',
      layout: 'Lead with entry name, one-sentence neutral summary, then grouped facts. Fact grid renders at most 2 rows × 2 columns; overflow facts go to a "更多事实" tab (max 4 tabs total). Preserve PC 788x492 and mobile 380x456 constraints. No body or container scroll.',
      elevation: 'Use borders and shallow separation only where fact groups need hierarchy.',
      shapes: 'Moderate radii inherited from the parent package.',
      components: 'Summary header, fact grid (≤ 4 cells), tab bar (for overflow facts), source hint, modal (for "see full source" if needed).',
      dos: [
        'Keep claims factual and compact.',
        'Use grouped facts rather than long prose when space is limited.',
        'If more than 4 key facts exist, surface the first 4 and route the rest to a secondary "更多事实" tab.',
        'Default body text to Simplified Chinese. Preserve proper nouns and the entry title in its original script.',
        'Place modal-triggered source details in .modal-overlay, not in a scroll container.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not invent missing entity facts.',
        'Do not use overflow: auto / scroll on any container; the card must be a single-screen deliverable.',
        'Do not use the .scroll-container class (legacy).',
        'Do not insert English UI phrases (View More / Read More / Get Started / Learn More / Sign Up / Subscribe / Try Now / Discover / Explore Now / Click Here / See More / Find Out More / Buy Now / Add to Cart / Continue Reading). Use Chinese equivalents.',
      ],
      sections: {
        parentPack: 'Inherits sizing, iframe/touch, no-scroll, and color constraints from dtp_dynamic_encyclopedia_card.',
        dataShape: 'Best with entry title, concise description, category, aliases, dates, locations, metrics, tags, and source notes.',
        overflowStrategy: 'Up to 4 facts in the primary view; remainder goes to a tab. "查看完整来源" (if any) opens a modal. No scroll containers.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
    htmlExamples: [SUMMARY_CARD_HTML_EXAMPLE],
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_dynamic_encyclopedia_timeline_card',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['历史人物', '影视作品', '文学著作', '企业', '文化活动', '游戏'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·时间线卡',
    description: '用于人物传记、历史、发布时间线与阶段性发展的子模版。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'timeline-track': { accentColor: '{colors.primary}', markerSize: 8 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}', pagesPerView: 1 },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
      },
    },
    rationale: {
      overview: 'Use this child template when the entry has a meaningful sequence of events, milestones, releases, or life stages.',
      colors: 'Use the parent palette; timeline markers may use #6487FA sparingly.',
      typography: 'Default body language is Simplified Chinese. Dates and event labels must remain readable in compact mobile frames.',
      layout: 'Lead with entry summary, then a vertical or segmented timeline rendered as paginated pages. Each page shows at most 3–4 milestones; pages are navigated via a .page-switcher (dots or pill) at the bottom. No body or container scroll. Preserve PC and WISE frame constraints.',
      elevation: 'Use light separation for event cards only.',
      shapes: 'Moderate radii; markers should be small and precise.',
      components: 'Timeline track, milestone cards (3–4 per page), .page-switcher (dots/pill), summary chips, modal (for "展开完整里程碑" if dense).',
      dos: [
        'Keep every event tied to supplied entry context.',
        'Group sparse dates into phases when exact dates are unavailable.',
        'Render 3–4 milestones per page; navigate remaining milestones via .page-switcher.',
        'For dense periods, use a "展开完整里程碑" trigger that opens a .modal-overlay listing all events.',
        'Default body text to Simplified Chinese. Preserve proper nouns and original event titles in their script.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not fabricate dates or milestones.',
        'Do not turn timeline controls into outbound navigation.',
        'Do not globally intercept touch gestures.',
        'Do not use overflow: auto / scroll on any container; pagination is the only navigation mode.',
        'Do not use the .scroll-container class (legacy).',
        'Do not insert English UI phrases (View More / Read More / Get Started / Learn More / Sign Up / Subscribe / Try Now / Discover / Explore Now / Click Here / See More / Find Out More / Buy Now / Add to Cart / Continue Reading). Use Chinese equivalents.',
      ],
      sections: {
        parentPack: 'Inherits sizing, iframe/touch, no-scroll, and color constraints from dtp_dynamic_encyclopedia_card.',
        dataShape: 'Best with dated events, life stages, development history, releases, or notable milestones.',
        overflowStrategy: 'Primary view shows 3–4 milestones; additional milestones paginate via .page-switcher. Dense periods open in .modal-overlay.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
    htmlExamples: [{ file: 'apps/api/src/html-examples/timeline-card-compact-example.html' }],
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_dynamic_encyclopedia_relation_card',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['名人', '历史人物', '企业', '机构组织', '影视作品', '文学著作', '游戏'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·关系图谱卡',
    description: '用于相关实体、轻量关系图谱与局部知识导航的子模版。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'relation-node': { maxNodes: 6, accentColor: '{colors.primary}', rounded: '{rounded.md}' },
        'relation-edge': { strokeColor: '{colors.subtle}', strokeWidth: 1 },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
      },
    },
    rationale: {
      overview: 'Use this child template when the entry is best understood through people, works, organizations, roles, or related concepts around the entity.',
      colors: 'Inherit the parent encyclopedia palette. Use #6487FA only for the current entry and selected relation state.',
      typography: 'Default body language is Simplified Chinese. Relation labels must stay compact and legible in mobile frames; avoid tiny graph text.',
      layout: 'Lead with the current entity, then show a bounded local relation map with at most 6 visible nodes. If more related entities exist, surface a "查看更多关系" button that opens a .modal-overlay listing the remainder. Preserve PC 788x492 and mobile 380x456 constraints. No body or container scroll.',
      elevation: 'Use subtle borders for relation groups, not heavy graph containers.',
      shapes: 'Moderate radii inherited from the parent package; graph nodes should be simple chips or circles.',
      components: 'Entity anchor, relation nodes (≤ 6 visible), "查看更多关系" button → .modal-overlay with the full list, local filter chips.',
      dos: [
        'Limit the visible relation map to at most 6 nodes.',
        'Use local state for relation focus instead of outbound links.',
        'If the full relation list exceeds 6, expose a "查看更多关系" button that opens a .modal-overlay.',
        'Use local interactive UI states instead of external navigation.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not fabricate relationships that are not present in the supplied context.',
        'Do not rely on canvas-only interactions that block mobile scroll gestures.',
        'Do not use overflow: auto / scroll on any container; the map and the modal must be single-screen deliverable.',
        'Do not use the .scroll-container class (legacy).',
        'Do not insert English UI phrases (View More / Read More / Get Started / Learn More / Sign Up / Subscribe / Try Now / Discover / Explore Now / Click Here / See More / Find Out More / Buy Now / Add to Cart / Continue Reading). Use Chinese equivalents (e.g. "查看更多关系").',
      ],
      sections: {
        parentPack: 'Inherits sizing, iframe/touch, no-scroll, and color constraints from dtp_dynamic_encyclopedia_card.',
        dataShape: 'Best with related people, works, organizations, roles, aliases, source/target pairs, or entity relation notes.',
        overflowStrategy: 'Up to 6 relation nodes in the primary view. Overflow goes to a .modal-overlay via a "查看更多关系" button.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
    htmlExamples: [{ file: 'apps/api/src/html-examples/relation-card-compact-example.html' }],
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_dynamic_encyclopedia_compare_card',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['知识术语', '物品产品', '产品设备', '企业', '学校', '游戏'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·对比辨析卡',
    description: '用于并排事实对比、概念辨析与紧凑决策支持的子模版。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'comparison-table': { maxColumns: 2, stickyFirstColumn: false, backgroundColor: '{colors.surface}' },
        'comparison-row': { minHeight: 36, borderColor: '{colors.subtle}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 3 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
      },
    },
    rationale: {
      overview: 'Use this child template when users need to distinguish similar concepts, products, organizations, editions, or factual dimensions.',
      colors: 'Inherit the parent palette; use the accent only to highlight differences or current selection.',
      typography: 'Default body language is Simplified Chinese. Row labels and comparison values must remain readable at 300px width; prefer short neutral copy.',
      layout: 'Lead with the comparison question, then show a bounded side-by-side table. PC supports max 2 columns side-by-side; mobile uses a .tab-bar (one tab per comparison target) to switch between objects without scrolling. Preserve PC and WISE frame constraints. No body or container scroll.',
      elevation: 'Use row dividers and subtle grouping instead of card stacks inside cards.',
      shapes: 'Moderate radii inherited from the parent package.',
      components: 'Comparison header, side-by-side rows (≤ 2 columns on PC), .tab-bar (per-target on mobile), .page-switcher (for row pagination), source hints.',
      dos: [
        'Compare only facts supplied by entry context.',
        'Use concise labels and avoid marketing claims.',
        'On PC, render at most 2 columns side-by-side; on mobile, use a .tab-bar (one tab per target) instead of stacking.',
        'If the comparison has many rows, paginate via .page-switcher (e.g. 5 rows per page).',
        'Default body text to Simplified Chinese. Preserve proper nouns in their original script.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not invent competitors, editions, specs, or pros/cons.',
        'Do not use oversized cards where a table is clearer.',
        'Do not use overflow: auto / scroll on any container; tab-bar / page-switcher is the navigation mode.',
        'Do not use the .scroll-container class (legacy).',
        'Do not insert English UI phrases (View More / Read More / Get Started / Learn More / Sign Up / Subscribe / Try Now / Discover / Explore Now / Click Here / See More / Find Out More / Buy Now / Add to Cart / Continue Reading). Use Chinese equivalents.',
      ],
      sections: {
        parentPack: 'Inherits sizing, iframe/touch, no-scroll, and color constraints from dtp_dynamic_encyclopedia_card.',
        dataShape: 'Best with comparable entities, editions, concepts, definitions, specs, dimensions, or disambiguation notes.',
        overflowStrategy: 'PC: 2-column table with .page-switcher for long row lists. Mobile: .tab-bar with one tab per comparison target.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
    htmlExamples: [{ file: 'apps/api/src/html-examples/compare-card-compact-example.html' }],
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_dynamic_encyclopedia_expandable_card',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['知识术语', '历史人物', '影视作品', '文学著作', '文化活动', '机构组织'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·可展开事实卡',
    description: '用于渐进展开、长事实段落与局部展开百科详情的子模版。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'accordion-section': { minHeight: 40, rounded: '{rounded.md}', borderColor: '{colors.subtle}', maxExpandedHeight: 280 },
        'fact-callout': { backgroundColor: '#EEF3FF', textColor: '{colors.text}', rounded: '{rounded.md}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
      },
    },
    rationale: {
      overview: 'Use this child template when the entry contains longer definitions, sections, caveats, or layered explanations that should be progressively revealed within the single canvas.',
      colors: 'Inherit the parent palette. Use light blue callouts only for key facts or current expanded sections.',
      typography: 'Default body language is Simplified Chinese. Accordion labels must be concise; expanded text should stay readable and avoid wall-of-text density.',
      layout: 'Lead with a compact summary, then expose details through local accordion sections. Expanded sections must fit within the remaining canvas (max expanded height 280px on PC, 200px on WISE). If a section would exceed that, group it into a .tab-bar instead. No body or container scroll.',
      elevation: 'Use shallow separation between expandable sections.',
      shapes: 'Moderate radii inherited from the parent package.',
      components: 'Summary header, accordion sections (with bounded max-expanded height), .tab-bar (for sections that would overflow), fact callouts, source hint.',
      dos: [
        'Use progressive disclosure for long facts.',
        'Keep expanded content within the local accordion and bound maxExpandedHeight so it fits the canvas.',
        'If a section would overflow the canvas when expanded, group it into a .tab-bar tab instead.',
        'Make the current expanded state obvious without external navigation.',
        'Default body text to Simplified Chinese. Preserve proper nouns in their original script.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not hide essential facts behind too many nested controls.',
        'Do not use overflow: auto / scroll on any container; accordion expand must be in-place and bounded.',
        'Do not use the .scroll-container class (legacy).',
        'Do not insert English UI phrases (View More / Read More / Get Started / Learn More / Sign Up / Subscribe / Try Now / Discover / Explore Now / Click Here / See More / Find Out More / Buy Now / Add to Cart / Continue Reading). Use Chinese equivalents.',
      ],
      sections: {
        parentPack: 'Inherits sizing, iframe/touch, no-scroll, and color constraints from dtp_dynamic_encyclopedia_card.',
        dataShape: 'Best with long definitions, layered explanations, sections, caveats, frequently asked facts, or source notes.',
        overflowStrategy: 'Accordion expand in-place, bounded by maxExpandedHeight. Sections that would overflow are promoted to a .tab-bar tab.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
    htmlExamples: [{ file: 'apps/api/src/html-examples/expandable-card-example.html' }],
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_history_person_relationship',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['名人', '历史人物'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·历史人物关系',
    description: '历史人物关系图谱子模版，覆盖血缘、派系、师从、敌对与跨人物导航。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'relation-node': { maxNodes: 7, accentColor: '{colors.primary}', rounded: '{rounded.md}' },
        'relation-edge': { strokeColor: '{colors.subtle}', strokeWidth: 1 },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for historical people where the main unmet demand is kinship, monarch-subject, faction, mentorship, rival, or literary/social relations. Case references emphasize an unlock-style journey: users first choose an impression of the person, then inspect compact relation groups and event-linked people.',
      colors: 'Inherit the parent encyclopedia palette. Use #6487FA for the current person and selected relation only.',
      typography: 'Default body language is Simplified Chinese. Relation labels must be short and fact-like.',
      layout: 'Lead with the current person, then show one bounded relation graph. On desktop, keep at most 6 visible nodes including the current-person anchor, one relation-category selector, and at most one local detail action. On 300x360, hide the category selector and action row, keep only 2-3 directly selectable relation nodes plus one concise selected-detail surface. No internal scrolling.',
      elevation: 'Use quiet borders and grouped relation lanes instead of decorative graph frames.',
      shapes: 'Use simple chips or circles for nodes; avoid complex canvas-only navigation.',
      components: 'Current-person anchor, one relation selector layer, bounded relation graph, and one replacing selected-detail surface. Desktop may use a relation-category tab bar; 300x360 uses only compact relation nodes and hides the tab bar, source row, reset action, and modal trigger.',
      dos: [
        'Classify every edge with a relationship type.',
        'Keep relation labels bidirectional where applicable.',
        'Use modal details for supporting notes instead of adding scrollable panels.',
        'When relationship data is sparse, connect people through the event where they appear rather than drawing unsupported edges.',
        'At 300x360 expose exactly one selector group with 2-3 nodes and one short selected relationship detail.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not fabricate family, faction, mentor, rival, or literary relationships.',
        'Do not leave unlabeled edges.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
        'Do not expose relation-category tabs and relation nodes as two competing navigation groups at 300x360.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Historical person P0: relationship graph and related-person navigation.',
        dataShape: 'Best with person, relation type, related person, relation note, source hint, and optional event/work linkage.',
        overflowStrategy: 'Visible graph <= 7 nodes. More relations open in .modal-overlay or separate tab groups.',
        extremeSmall: 'At 300x360 keep topic identity, 2-3 selectable relation nodes, one selected relationship label, and no more than two short detail sentences. Hide category tabs, sources, legends, counts, reset actions, and modal triggers in the initial state; additional nodes replace the same selector slots through at most one 更多 control.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_history_person_event_chain',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['名人', '历史人物'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·历史人物事件链',
    description: '历史人物事件因果子模版，覆盖生平阶段、改革、战役与文化事件。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'timeline-track': { accentColor: '{colors.primary}', markerSize: 8 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}', pagesPerView: 1 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for historical people whose value lies in why events happened, how stages changed, and what consequences followed. Case references repeatedly use "如果没有这 N 件事" and "史实 / 如果没发生" contrast, so the template should support counterfactual explanation without presenting it as fact.',
      colors: 'Inherit the parent encyclopedia palette; use the accent on causality arrows and selected event state.',
      typography: 'Event labels should stay concise and Chinese-first.',
      layout: 'Show cause -> process -> result -> impact as a compact event chain. Each page contains at most 3 event nodes. Additional nodes use page switcher or modal detail. No internal scrolling.',
      elevation: 'Use lightweight event cards and connector lines.',
      shapes: 'Precise markers and arrows; avoid decorative timeline clutter.',
      components: 'Splash/intro choice, causality chain, phase chips, what-if contrast modal, event detail modal, page switcher, source hint.',
      dos: [
        'Every event should include its role in the chain: 起因、经过、结果、影响.',
        'Use "资料不足" rather than inventing event dates or consequences.',
        'Keep the chain readable in both 788x492 and 380x456 frames.',
        'If using counterfactual copy, label it as "如果没发生" and keep the paired "史实" visible.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not fabricate causes, dates, battles, reforms, or consequences.',
        'Do not render long article prose.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Historical person P1: event causality and high-value deep browsing.',
        dataShape: 'Best with event name, phase, date/order, cause, process, result, impact, participants, and source hint.',
        overflowStrategy: '3 event nodes per page. More nodes are paginated via .page-switcher.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_film_cast_role_network',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['影视作品', '电影'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·电影演员角色网',
    description: '电影演员角色映射子模版，覆盖导演演员合作、角色与跨作品发现。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'cast-role-grid': { maxItems: 6, rounded: '{rounded.md}', accentColor: '{colors.primary}' },
        'relation-node': { maxNodes: 6, accentColor: '{colors.primary}', rounded: '{rounded.md}' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for film entries where actor-role mapping and related people are the strongest extension path. Case references combine relationship graph, plot causality, and related-work recommendation tabs; for a cast template, keep graph primary and expose the other two as local tabs.',
      colors: 'Use neutral encyclopedia surfaces; reserve #6487FA for selected actor, role, or current work.',
      typography: 'Chinese-first labels; preserve film and person names in their original script when needed.',
      layout: 'Lead with film identity, then actor -> role pairs or a compact cooperation map. Keep 4-6 visible actor-role pairs and route overflow to a modal. No internal scrolling.',
      elevation: 'Use compact cards or chips, not promotional movie-poster layouts.',
      shapes: 'Moderate radii and inspectable nodes.',
      components: 'Film identity header, cast-role grid, relation detail modal, local tabs for 人物图谱/剧情因果/作品推荐, source hint.',
      dos: [
        'Bind each actor to a role or collaboration note.',
        'Use "资料不足" for unknown roles rather than inventing.',
        'Keep the module encyclopedia-like, not ticketing or streaming oriented.',
        'If showing recommendations, label why they are related: 同主演、同题材、同作者、同系列 or 同IP.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not provide playback, download, netdisk, magnet, leaked, or pirated-resource entry points.',
        'Do not fabricate actors, roles, box office, ratings, or release facts.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Film P0: actor-role network is the largest extension path.',
        dataShape: 'Best with film title, actor, role, director, collaboration, related works, and source hint.',
        overflowStrategy: '4-6 visible actor-role pairs. Overflow opens .modal-overlay.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_film_series_navigation',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['影视作品', '电影'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·电影系列导航',
    description: '电影系列导格子模版，覆盖前传续集翻拍、IP衍生与相似影片发现。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'series-track': { maxItems: 5, accentColor: '{colors.primary}', markerSize: 8 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
      },
    },
    rationale: {
      overview: 'Use for films with series, sequel, prequel, remake, derivative, same-IP, or similar-film discovery demand. Case references expect a work recommendation area with tabs for 同主演、同题材、同作者、同系列/同IP rather than a generic carousel.',
      colors: 'Use #6487FA to mark the current film in the series track.',
      typography: 'Keep titles and year/status labels compact.',
      layout: 'Show the current film inside a bounded series track, with tabs for 系列/同IP/相似推荐/版本. Use page switcher for additional recommendations. No internal scrolling.',
      elevation: 'Prefer timeline-like lanes and concise recommendation cards.',
      shapes: 'Moderate radii and clear current-state markers.',
      components: 'Series track, current-film marker, recommendation cards, relation-reason tabs, tab bar, page switcher.',
      dos: [
        'Clearly label sequel, prequel, remake, derivative, or similar recommendation.',
        'Keep recommendations grounded in supplied context or readonly democase references.',
        'Use neutral labels and avoid marketing CTAs.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not provide playback, download, netdisk, magnet, leaked, or pirated-resource entry points.',
        'Do not fabricate series members, release years, ratings, or recommendations.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Film P0: series/IP navigation and similar discovery.',
        dataShape: 'Best with current film, related work title, relationship type, year/status, reason, and source hint.',
        overflowStrategy: 'Series track <= 5 items; additional works paginate via .page-switcher or tabs.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_tv_character_relation',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['影视作品', '电视剧'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·电视剧角色关系',
    description: '电视剧角色关系子模版，覆盖派系、家族、职场、感情与角色快答。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'relation-node': { maxNodes: 7, accentColor: '{colors.primary}', rounded: '{rounded.md}' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for TV entries whose strongest extension demand is character identity, relationship, faction, family, workplace, or emotion lines. Case references expect a three-view structure: 关系图谱、剧情因果、作品推荐.',
      colors: 'Use #6487FA for selected character and active relation type.',
      typography: 'Character names, actor names, and relation labels must remain compact.',
      layout: 'Lead with drama identity and a quick role-answer strip, then show a bounded character relation graph with tabs for 家族、阵营、情感、职场. No internal scrolling.',
      elevation: 'Use compact grouped relation cards and clear visual hierarchy.',
      shapes: 'Simple node chips and readable edges.',
      components: 'Role quick answer, character relation graph, view tabs for 关系图谱/剧情因果/作品推荐, relation tabs, detail modal, source hint.',
      dos: [
        'Separate character, actor, and relation labels clearly.',
        'Use relation type tabs for complex dramas.',
        'Default to quick answer for "某角色是谁" style demand.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not provide playback, download, netdisk, magnet, leaked, or pirated-resource entry points.',
        'Do not fabricate characters, actors, relationship edges, or factions.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'TV P0: character relationship graph and role quick answers.',
        dataShape: 'Best with drama title, character, actor, relation type, faction/family/emotion label, and source hint.',
        overflowStrategy: 'Visible graph <= 7 nodes. More details open in .modal-overlay or relation-type tabs.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_star_group_member_map',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['名人'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·明星组合成员体系',
    description: '明星组合成员体系子模版，覆盖当前全员名单、队内定位、成员状态、入退团时间线与团体作品概览。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'member-grid': { minColumns: 2, maxColumns: 4, gap: '10px' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'timeline-track': { accentColor: '{colors.primary}', markerSize: 8 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
        'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: '{rounded.md}' },
      },
    },
    rationale: {
      overview: 'Use for music groups, idol bands, duos, or any multi-member performing ensemble. The core value is member-identity resolution: who is in the group, their roles, tenure, and connection to the group\'s works. Member list must be the primary module; timeline and works are supporting tabs.',
      colors: 'Inherit the parent encyclopedia palette; use accent on member status badges and selected tab state.',
      typography: 'Member names should be prominent; role labels concise. Chinese-first.',
      layout: 'Lead with group identity card (name, type, debut, status) and current member grid. Tab bar switches between member details, timeline, and works. No internal scrolling.',
      elevation: 'Lightweight member cards with status badge.',
      shapes: 'Moderate radii for member avatars.',
      components: 'Group identity header, member grid (avatar/name/role/status), tab bar (成员详情 / 入退团时间线 / 团体作品), member detail modal, page switcher for overflow.',
      dos: [
        'Make the current member list the primary visual anchor.',
        'Show member status clearly: 在团 / 暂停活动 / 退出 / 已故.',
        'Distinguish group works from individual member works — group works go in the main module, individual works are linked to member pages.',
        'Default body text to Simplified Chinese. Preserve stage names and group names in their original script.',
        'Place source notes for member history in .modal-overlay.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not fabricate member history, join/leave dates, or roles.',
        'Do not use overflow: auto / scroll on any container.',
        'Do not use the .scroll-container class (legacy).',
        'Do not insert English UI phrases (View More / Read More / Get Started / Learn More / Sign Up / Subscribe / Try Now / Discover / Explore Now / Click Here / See More / Find Out More / Buy Now / Add to Cart / Continue Reading). Use Chinese equivalents.',
        'Do not merge group works with individual member works in the same list.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Star group P0: member identity resolution and group↔member navigation.',
        dataShape: 'Best with group name, type (男团/女团/乐队/双人组合/限定团), debut date, company, current members (avatar, name, role, status, join date), former members, timeline events, representative works.',
        overflowStrategy: 'Primary member grid shows up to 8 members with avatars. More members or former members go to a "历任成员" tab. Timeline events paginated via .page-switcher.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_tv_episode_chain',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['影视作品', '电视剧'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·电视剧剧集链',
    description: '电视剧剧集情节链子模版，覆盖线索因果、伏笔与剧情阶段探索。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'episode-chain': { maxNodes: 4, accentColor: '{colors.primary}', markerSize: 8 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}' },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for TV entries where episode plots, clue chains, cause-effect development, foreshadowing, or reveal structure matters. Case references use a horizontal mind-map-like chain with draggable/clickable nodes; DUDesign should approximate this with bounded nodes and page-switcher controls inside the fixed card.',
      colors: 'Use the accent for current episode and cause-effect connectors.',
      typography: 'Episode labels must be short and readable in mobile frames.',
      layout: 'Show up to 4 event nodes with episode numbers or phased labels, causal labels, and visible source/uncertainty wording per node. Additional episodes paginate. Spoiler-heavy details open only after an explicit local control. No internal scrolling.',
      elevation: 'Use lightweight event cards.',
      shapes: 'Clear markers and connectors.',
      components: 'Episode chain, clue/reveal markers, mind-map lane, page switcher, spoiler detail modal, source hint.',
      dos: [
        'Include episode number or ordered phase when available.',
        'Attach a visible source hint, 资料不足, 待核实, 据公开资料, or 来源 label to every episode node, plot point, clue, reveal, and ending-related statement.',
        'Mark clue, foreshadowing, reveal, cause, and result explicitly.',
        'Use local confirm/open controls for ending or full-spoiler details.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not provide playback, download, netdisk, magnet, leaked, or pirated-resource entry points.',
        'Do not fabricate episode count, plot nodes, clues, reveals, or ending explanations; if supplied context is incomplete, replace exact details with phased nodes labeled 资料不足 or 待核实.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'TV P0/P1: episode plot chain and foreshadowing/reveal exploration.',
        dataShape: 'Best with episode number or phase label, event node, cause/reveal relation, participating characters, spoiler level, and visible source hint per node.',
        overflowStrategy: '4 episode nodes per page. More nodes paginate through .page-switcher; spoiler detail uses .modal-overlay.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_cultural_phrase_relation_graph',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['知识术语', '文化类词语'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·文化词语关系图',
    description: '文化词语关联子模版，覆盖成语近义词反义词同源典故与易混词关系。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'relation-node': { maxNodes: 8, accentColor: '{colors.primary}', rounded: '{rounded.md}' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for cultural words, idioms, phrases, and concepts where related-word exploration is the largest second-search demand. Case references show "关联词详解" as the dominant pattern, usually grouping 近义、反义、同源、同类典故、人物关联、易混词.',
      colors: 'Use the parent palette; use #6487FA for current phrase and selected relation type.',
      typography: 'Definitions and relation notes should be concise and Chinese-first.',
      layout: 'Lead with one-sentence meaning and pronunciation/source summary, then show relation groups: 近义、反义、同类典故、同源、人物关联、易混词. No internal scrolling.',
      elevation: 'Use compact grouped chips and fact callouts.',
      shapes: 'Simple chips and bounded graph nodes.',
      components: 'Meaning header, relation graph/list, relation type tabs, confusing-word modal, source hint.',
      dos: [
        'Label every related phrase with its relation type.',
        'Prioritize 6-12 high-confidence related words.',
        'Use modal explanation for high-frequency confusing words.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not invent source, synonym, antonym, same-origin, or story links.',
        'Do not turn the card into a long dictionary article.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Cultural phrase P0: related-word graph.',
        dataShape: 'Best with phrase, pronunciation, meaning, source summary, related phrase, relation type, and relation note.',
        overflowStrategy: '6-8 visible relation nodes. More nodes open in .modal-overlay or relation-type tabs.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_cultural_phrase_origin_story',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['知识术语', '文化类词语'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·文化词语起源',
    description: '文化词语典故起源子模版，覆盖出处原文、故事情节、人物事件与文化含义。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'timeline-track': { accentColor: '{colors.primary}', markerSize: 8 },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}' },
      },
    },
    rationale: {
      overview: 'Use for cultural phrases where origin, source text, story, figures, events, and modern meaning are the high-value deep-reading path. Case references pair source/origin with relation graph; origin story should not crowd out the first-screen meaning and relation entry points.',
      colors: 'Use neutral content surfaces; reserve blue for active story step and source marker.',
      typography: 'Source text, modern explanation, and story labels should remain compact.',
      layout: 'Lead with meaning and source summary, then show origin story as 起因/经过/结果/寓意 tabs or a short chain. No internal scrolling.',
      elevation: 'Use subtle source callouts and story step cards.',
      shapes: 'Moderate radii and clear story markers.',
      components: 'Meaning header, source callout, story chain, person/event chips, page switcher.',
      dos: [
        'Hide or mark origin story as unavailable when reliable source is missing.',
        'Separate original source text from modern explanation.',
        'Use concise story steps rather than long paragraphs.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not invent source text, historical figures, events, or cultural interpretations.',
        'Do not display an origin module when the source is missing.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Cultural phrase P1: origin, story, and meaning deepening.',
        dataShape: 'Best with phrase, pronunciation, concise meaning, source work/chapter, original sentence, story steps, related figures, and cultural meaning.',
        overflowStrategy: 'Story is split into tabs or page-switcher pages; missing source hides the origin story module.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_scenic_spot_route_guide',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['地域建筑', '景区景点'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·景区路线导览',
    description: '景区游览路线导览子模版，覆盖参观顺序、时间规划与路线推荐。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'route-stepper': { maxSteps: 6, accentColor: '{colors.primary}', markerSize: 8 },
        'poi-card': { maxItems: 5, rounded: '{rounded.md}', accentColor: '{colors.primary}' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'page-switcher': { variant: 'dots-or-pill', position: 'bottom', height: 28, accentColor: '{colors.primary}' },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for scenic-spot entries where the main value is intelligent guide route, visit order, key POIs, and time-aware route recommendation. Case references emphasize 导览、路线、景点、地图 and 坐标, but DUDesign should keep map/coordinate data symbolic unless trusted context is supplied.',
      colors: 'Use neutral encyclopedia surfaces; reserve #6487FA for the selected route step or current scenic spot.',
      typography: 'Route labels and POI notes should be compact, Chinese-first, and readable at 300px width.',
      layout: 'Lead with scenic spot identity and a recommended route strip, then show 4-6 route steps with POI highlights. Provide tabs for 推荐路线、必看景点、游览提示、地图概览. No internal scrolling.',
      elevation: 'Use bounded route cards and lightweight POI markers.',
      shapes: 'Use simple route dots, connectors, and POI chips. Avoid imitating any map provider UI.',
      components: 'Scenic identity header, route stepper, POI cards, route tabs, map-schematic panel, detail modal, source hint.',
      dos: [
        'Label route order clearly and keep each step short.',
        'Use "坐标待补充" or "位置资料不足" when coordinates are not supplied.',
        'Separate scenic facts, route suggestions, and safety/visit tips.',
        'Use schematic route lines, not external map tiles or provider chrome.',
      ],
      donts: [
        'Do not copy or imitate any public encyclopedia, search engine, browser, map provider, or travel platform trade dress.',
        'Do not fabricate coordinates, opening hours, ticket prices, traffic routes, safety warnings, or real-time crowding.',
        'Do not embed outbound navigation, map, ticketing, hotel, or booking links as core interactions.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Scenic spot P0: route guide and POI visit order.',
        dataShape: 'Best with scenic spot name, POI names, route order, time estimate, coordinates/source status, visit tips, and source hint.',
        overflowStrategy: '4-6 route steps in primary view. More POIs paginate through .page-switcher or open in .modal-overlay.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
  {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: 'dtp_de_scenic_spot_map_poi',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['地域建筑', '景区景点'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: '动态百科·景区地图导览',
    description: '景区地图 POI 子模版，覆盖景点集群、坐标提示与局部探索。',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        'on-primary': '#FFFFFF',
        background: '#F8F8F8',
        surface: '#FFFFFF',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        display: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.18 },
        body: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '14px', fontWeight: 400, lineHeight: 1.58 },
        label: { fontFamily: 'Inter, PingFang SC, system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.35 },
      },
      spacing: { xs: '4px', sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      rounded: { sm: '6px', md: '10px', lg: '14px' },
      components: {
        'pc-card-frame': { width: 788, height: 492, backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2', backgroundColor: '{colors.surface}', rounded: '{rounded.lg}' },
        'no-scroll-frame': { overflow: 'hidden', position: 'relative', width: '100%', height: '100%' },
        'map-schematic': { maxPois: 7, accentColor: '{colors.primary}', rounded: '{rounded.md}' },
        'poi-card': { maxItems: 5, rounded: '{rounded.md}', accentColor: '{colors.primary}' },
        'tab-bar': { position: 'top', height: 36, accentColor: '{colors.primary}', indicatorStyle: 'underline', maxTabs: 4 },
        'modal-overlay': { background: 'rgba(30,31,36,0.45)', rounded: '{rounded.lg}', maxWidth: '90%' },
      },
    },
    rationale: {
      overview: 'Use for scenic-spot entries where the user needs a compact 地图-like POI overview and local exploration. Case references include image-backed scenic POIs and 坐标 files; this template should represent coordinates as verified hints or placeholders, not live navigation.',
      colors: 'Use the parent palette with blue only for current POI, selected route, and map marker state.',
      typography: 'POI names, scenic area names, and visit tips should be concise and Chinese-first.',
      layout: 'Show a schematic POI map with up to 7 markers and a side/bottom POI detail area. Provide tabs for 景点分布、路线串联、游览提示、资料来源. No internal scrolling.',
      elevation: 'Use quiet panels and bounded marker callouts.',
      shapes: 'Use simplified map blocks, route lines, and POI chips. Do not imitate any real map-product controls.',
      components: 'Schematic map, POI markers, POI detail modal, source hint, route link chips.',
      dos: [
        'Clearly mark whether coordinates are supplied, approximate, or missing.',
        'Use source wording for opening hours, ticket, transportation, or safety facts.',
        'Keep POI marker labels short and avoid overcrowding the fixed viewport.',
      ],
      donts: [
        'Do not copy or imitate any public map provider, travel platform, encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not fabricate coordinates, opening hours, ticket prices, transportation, safety warnings, or real-time status.',
        'Do not use external map tiles, outbound navigation, ticketing, hotel, or booking links as core interactions.',
        'Do not use overflow: auto / scroll or .scroll-container.',
        'Do not insert English UI phrases.',
      ],
      sections: {
        parentPack: 'Inherits fixed viewport, iframe/touch, no-scroll, Chinese-first, and delivery safety constraints from dtp_dynamic_encyclopedia_card.',
        businessPriority: 'Scenic spot P0/P1: POI map overview and route-linked exploration.',
        dataShape: 'Best with scenic spot name, POI names, approximate location or coordinate source status, route relation, visit tips, and source hint.',
        overflowStrategy: 'Up to 7 POI markers in primary view. More POIs grouped by tab or opened in .modal-overlay.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  },
]

// Vertical templates reuse the nearest interaction archetype as a structural
// few-shot. Their domain rationale remains authoritative, while the example
// supplies the proven fixed-viewport composition and interaction rhythm.
const verticalTemplateExampleFiles: Record<string, string> = {
  dtp_de_history_person_relationship: 'apps/api/src/html-examples/relation-card-compact-example.html',
  dtp_de_history_person_event_chain: 'apps/api/src/html-examples/timeline-card-compact-example.html',
  dtp_de_film_cast_role_network: 'apps/api/src/html-examples/relation-card-compact-example.html',
  dtp_de_film_series_navigation: 'apps/api/src/html-examples/series-navigation-compact-example.html',
  dtp_de_tv_character_relation: 'apps/api/src/html-examples/relation-card-compact-example.html',
  dtp_de_star_group_member_map: 'apps/api/src/html-examples/star-group-member-map-example.html',
  dtp_de_tv_episode_chain: 'apps/api/src/html-examples/timeline-card-compact-example.html',
  dtp_de_cultural_phrase_relation_graph: 'apps/api/src/html-examples/relation-card-compact-example.html',
  dtp_de_cultural_phrase_origin_story: 'apps/api/src/html-examples/timeline-card-compact-example.html',
  dtp_de_scenic_spot_route_guide: 'apps/api/src/html-examples/route-guide-compact-example.html',
  dtp_de_scenic_spot_map_poi: 'apps/api/src/html-examples/map-poi-compact-example.html',
}

type DemocaseCompositionProfile = {
  firstView: string
  attentionBudget: string
  progressiveReveal: string
  forbiddenComposition: string
}

const democaseCompositionProfiles: Record<string, DemocaseCompositionProfile> = {
  dtp_dynamic_encyclopedia_card: {
    firstView: 'One topic promise, one dominant visual or interaction stage, and one obvious next action. Supporting facts are subordinate and must not compete with the stage.',
    attentionBudget: 'Use at most two navigation/control groups, one dominant stage, and one compact supporting detail surface. Deliberate whitespace is required; do not fill every available region.',
    progressiveReveal: 'Keep secondary facts, sources, alternate dimensions, and long lists behind the primary interaction. Initial state should make the next tap obvious through the control itself.',
    forbiddenComposition: 'No dashboard, KPI row, generic hero plus feature cards, multi-module encyclopedia portal, or simultaneous summary + timeline + relation + comparison layout.',
  },
  dtp_dynamic_encyclopedia_summary_card: {
    firstView: 'Topic identity, one neutral summary, and one selected fact group. The fact group is the single content stage rather than a grid of equal-weight modules.',
    attentionBudget: 'Show at most three facts in the active desktop group and at most two in the 300x360 state. Use one compact selector group.',
    progressiveReveal: 'Additional fact groups and source notes switch into the same content stage through tabs or one reveal action.',
    forbiddenComposition: 'Do not show an infobox, statistics strip, source panel, tag cloud, and fact grid at the same time.',
  },
  dtp_dynamic_encyclopedia_timeline_card: {
    firstView: 'Use either a sparse onboarding question with one start action or one active phase with its narrative. Do not expose every milestone card at once.',
    attentionBudget: 'One active phase, one compact phase selector, and one short contextual note. Prefer 4-7 phase labels on desktop and page them on compact screens.',
    progressiveReveal: 'Move through phases inside the same stage. The selected phase replaces content; it must not append another timeline section.',
    forbiddenComposition: 'No timeline plus fact dashboard plus relation panel plus duplicated phase footer. Do not render all event descriptions simultaneously.',
  },
  dtp_dynamic_encyclopedia_relation_card: {
    firstView: 'One bounded relation map with the topic as the visual anchor and one selected-node detail surface.',
    attentionBudget: 'At most six selectable nodes on desktop, at most three at 300x360, one relation-type selector, and one detail surface.',
    progressiveReveal: 'Selecting a node replaces the detail surface. Additional nodes use paging or a local reveal state.',
    forbiddenComposition: 'No bottom fact-card grid, second relation toolbar, separate summary dashboard, or simultaneous multiple graphs.',
  },
  dtp_dynamic_encyclopedia_compare_card: {
    firstView: 'One comparison question, one large observation/comparison stage, and one selected dimension.',
    attentionBudget: 'One dimension selector, at most four comparison targets, and only the facts needed for the active dimension.',
    progressiveReveal: 'Switch dimensions or targets in place. Deeper evidence opens in one local detail state.',
    forbiddenComposition: 'No dashboard of independent fact tiles, pros/cons marketing cards, KPI strip, or multiple comparison tables.',
  },
  dtp_dynamic_encyclopedia_expandable_card: {
    firstView: 'A concise topic prompt and a short list with at most one section expanded. The open section is the dominant reading surface.',
    attentionBudget: 'Keep 3-5 disclosure labels and one expanded fact block; collapse all other long content.',
    progressiveReveal: 'Accordion or reveal actions replace the expanded content in place. Preserve a clear closed/open state.',
    forbiddenComposition: 'No long article, nested card stack, fully expanded FAQ wall, or separate source/summary dashboards.',
  },
}

const profileAliases: Record<string, keyof typeof democaseCompositionProfiles> = {
  dtp_de_history_person_relationship: 'dtp_dynamic_encyclopedia_relation_card',
  dtp_de_history_person_event_chain: 'dtp_dynamic_encyclopedia_timeline_card',
  dtp_de_film_cast_role_network: 'dtp_dynamic_encyclopedia_relation_card',
  dtp_de_tv_character_relation: 'dtp_dynamic_encyclopedia_relation_card',
  dtp_de_star_group_member_map: 'dtp_dynamic_encyclopedia_relation_card',
  dtp_de_tv_episode_chain: 'dtp_dynamic_encyclopedia_timeline_card',
  dtp_de_cultural_phrase_relation_graph: 'dtp_dynamic_encyclopedia_relation_card',
  dtp_de_cultural_phrase_origin_story: 'dtp_dynamic_encyclopedia_timeline_card',
}

const specializedDemocaseCompositionProfiles: Record<string, DemocaseCompositionProfile> = {
  dtp_de_film_series_navigation: {
    firstView: 'One selected work or series node as the main stage, with one relationship dimension such as 同系列、同题材、同主演 or 同作者.',
    attentionBudget: 'One dimension selector, one active work detail, and a short bounded set of related works.',
    progressiveReveal: 'Switch the relationship dimension in place; open one work detail without adding a second recommendation grid.',
    forbiddenComposition: 'No streaming-service shell, poster wall, ranking dashboard, or simultaneous cast + plot + recommendation modules.',
  },
  dtp_de_scenic_spot_route_guide: {
    firstView: 'One route stage with the current stop emphasized and one concise stop detail.',
    attentionBudget: 'One route selector, one active stop, and only essential visit guidance. Keep secondary notices behind a local reveal.',
    progressiveReveal: 'Advance through route stops or switch routes inside the same stage; selected-stop content replaces the detail surface.',
    forbiddenComposition: 'No booking/travel portal, dense POI card grid, multiple route diagrams, or separate weather/ticket/transport dashboards.',
  },
  dtp_de_scenic_spot_map_poi: {
    firstView: 'One schematic map stage, one selected POI, and one concise POI detail surface.',
    attentionBudget: 'At most seven markers on desktop and three selectable markers at 300x360. Use one map/route selector group.',
    progressiveReveal: 'Selecting a marker replaces the detail surface; additional POIs use paging or one local list state.',
    forbiddenComposition: 'No real-map product chrome, booking modules, dense POI card grid, or simultaneous map + route + ticket + transport panels.',
  },
}

for (const [templateId, profileId] of Object.entries(profileAliases)) {
  democaseCompositionProfiles[templateId] = democaseCompositionProfiles[profileId]
}
Object.assign(democaseCompositionProfiles, specializedDemocaseCompositionProfiles)

for (const template of officialDesignTemplatePacks) {
  const exampleFile = verticalTemplateExampleFiles[template.id]
  if (exampleFile && (!template.htmlExamples || template.htmlExamples.length === 0)) {
    template.htmlExamples = [{ file: exampleFile }]
  }
  const composition = democaseCompositionProfiles[template.id]
  if (composition) {
    template.rationale.sections.democaseComposition = composition.firstView
    template.rationale.sections.firstViewBudget = composition.attentionBudget
    template.rationale.sections.progressiveReveal = composition.progressiveReveal
    template.rationale.sections.forbiddenComposition = composition.forbiddenComposition
    if (!template.rationale.dos.some(rule => /dominant.*stage|single.*stage/i.test(rule))) {
      template.rationale.dos.push('Keep one dominant visual or interaction stage and make one next action immediately obvious.')
    }
    if (!template.rationale.donts.some(rule => /dashboard|equal-weight/i.test(rule))) {
      template.rationale.donts.push('Do not compose the first view as a dashboard or a grid of equal-weight modules.')
    }
  }
}

const EXTREME_SMALL_FRAME = {
  width: 300,
  height: 360,
  ratio: '1:1.2',
  backgroundColor: '{colors.surface}',
  rounded: '{rounded.lg}',
}

const EXTREME_SMALL_VIEWPORT_RULE = 'At 300x360, author a dedicated compact information architecture in an exact 300x360 frame; preserve the topic identity, one concise core fact, and exactly one primary navigation/control group; use either 2-3 page-switching tabs or choices, or one reveal action; allow at most 3 primary choices plus 2 other visible controls and never show two competing navigation rows; remove duplicate metadata, source rows, decorative labels, repeated summaries, and secondary fact cards from the initial state; guide the user toward more information with an explicit Chinese affordance or page indicator; page or select longer item sets; hide deferred modules with display:none; never expose duplicate SVG and HTML controls for the same action; never use scrolling to solve overflow.'

for (const template of officialDesignTemplatePacks.filter(pack => pack.id === 'dtp_dynamic_encyclopedia_card' || pack.parentPackId === 'dtp_dynamic_encyclopedia_card')) {
  template.designTokens.components['wise-small-frame'] = EXTREME_SMALL_FRAME
  template.rationale.sections.smallViewport ??= EXTREME_SMALL_VIEWPORT_RULE
  if (!template.rationale.dos.some(rule => /300x360|极小屏/.test(rule))) {
    template.rationale.dos.push('Treat 300x360 as a first-class delivery target: preserve a compact page switcher or primary reveal action, keep only topic identity plus one concise core fact, and guide the user to reveal secondary facts after a tap.')
  }
  if (!template.rationale.donts.some(rule => /300x360/.test(rule))) {
    template.rationale.donts.push('Do not keep a 380x456 or 788x492 frame at 300x360, hide every tab/action, or remove details without providing a local reveal interaction.')
  }
}
