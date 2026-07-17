import type {
  EncyclopediaDemocaseDominantStage,
  EncyclopediaDemocaseExperienceProfile,
} from './guidance.js'

const COMMON_FORBIDDEN_PATTERNS = [
  'dashboard or KPI composition',
  'equal-weight module grid',
  'simultaneous summary, timeline, relation, and comparison surfaces',
  'duplicate controls for the same action',
  'secondary metadata competing with the primary interaction',
] as const

export function encyclopediaDemocaseStageForInteractionParadigm(
  interactionParadigmId: string | null | undefined,
): EncyclopediaDemocaseDominantStage | null {
  if (interactionParadigmId === 'ip_relation_map') return 'relation_map'
  if (interactionParadigmId === 'ip_timeline_story' || interactionParadigmId === 'ip_causal_event_chain') return 'timeline_story'
  if (interactionParadigmId === 'ip_fact_compare') return 'fact_compare'
  if (interactionParadigmId === 'ip_expandable_facts') return 'progressive_disclosure'
  if (interactionParadigmId === 'ip_route_guide') return 'route_guide'
  if (interactionParadigmId === 'ip_entity_summary') return 'entity_summary'
  return null
}

export function defaultEncyclopediaDemocaseExperienceProfile(
  dominantStage: EncyclopediaDemocaseDominantStage,
): EncyclopediaDemocaseExperienceProfile {
  const commonForbidden = [...COMMON_FORBIDDEN_PATTERNS]
  if (dominantStage === 'relation_map') {
    return {
      dominantStage,
      firstViewPromise: 'Show the topic identity, one bounded relationship map, and one selected relationship detail.',
      primaryInteraction: 'Select a visible node or one relationship filter and update the same bounded detail surface.',
      secondaryReveal: 'Move biographies, sources, additional nodes, and long relationship explanations behind node selection or one local detail reveal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 12, maxVisibleItems: 6 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 5, maxPrimaryTabs: 3, maxVisibleItems: 3, maxTextCharacters: 320 },
      },
      preserveAt300x360: ['topic title', 'one compact relationship selector with up to three choices', 'selected relationship label', 'one short selected detail'],
      deferAt300x360: ['remaining nodes', 'source list', 'long biography', 'secondary filters', 'decorative legends', 'a second relationship navigation row'],
      forbiddenPatterns: [...commonForbidden, 'relationship graph plus a separate fact-card dashboard', 'tab row and node row both acting as primary navigation', 'a second toolbar below the graph'],
    }
  }
  if (dominantStage === 'timeline_story') {
    return {
      dominantStage,
      firstViewPromise: 'Show the topic identity, one active phase, and a compact phase-switching path.',
      primaryInteraction: 'Switch the active phase or unlock the next milestone while keeping one event detail in focus.',
      secondaryReveal: 'Keep causes, outcomes, sources, and later milestones behind the phase switcher or one detail reveal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 8, maxVisibleItems: 5 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 2, maxTextCharacters: 300 },
      },
      preserveAt300x360: ['topic title', 'active phase label', 'one core event fact', 'one compact phase switcher with up to three choices'],
      deferAt300x360: ['inactive event bodies', 'full chronology', 'source notes', 'relationship sidebars', 'repeated phase summaries', 'a duplicate phase toolbar'],
      forbiddenPatterns: [...commonForbidden, 'all milestones expanded at once', 'duplicate phase navigation in multiple regions'],
    }
  }
  if (dominantStage === 'fact_compare') {
    return {
      dominantStage,
      firstViewPromise: 'Show one comparison question, one active dimension, and the clearest shared or differing observation.',
      primaryInteraction: 'Switch one comparison dimension and update the same two-sided or staged comparison surface.',
      secondaryReveal: 'Keep definitions, examples, sources, and additional dimensions behind the dimension selector or one detail reveal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 8, maxVisibleItems: 3 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 2, maxTextCharacters: 300 },
      },
      preserveAt300x360: ['comparison title', 'two compared entities', 'one active dimension', 'one concise conclusion', 'one compact dimension selector'],
      deferAt300x360: ['additional dimensions', 'long examples', 'source notes', 'fact-tile rows', 'repeated conclusions', 'separate target and view tab rows'],
      forbiddenPatterns: [...commonForbidden, 'comparison dashboard made of equal-weight fact tiles', 'independent action button on every comparison side'],
    }
  }
  if (dominantStage === 'route_guide') {
    return {
      dominantStage,
      firstViewPromise: 'Show the place identity, one bounded route or map stage, and the currently selected stop or POI.',
      primaryInteraction: 'Select a stop or POI and update one shared detail surface without leaving the card.',
      secondaryReveal: 'Keep remaining stops, route notes, coordinate status, and supporting descriptions behind paging or local detail states.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 12, maxVisibleItems: 6 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 5, maxPrimaryTabs: 3, maxVisibleItems: 3, maxTextCharacters: 320 },
      },
      preserveAt300x360: ['place title', 'up to three stops or POIs', 'selected location name', 'one short visit cue'],
      deferAt300x360: ['remaining locations', 'coordinate metadata', 'long route description', 'secondary route modes', 'decorative map labels'],
      forbiddenPatterns: [...commonForbidden, 'route stage plus a separate attraction-card grid', 'external navigation as the primary action'],
    }
  }
  if (dominantStage === 'progressive_disclosure') {
    return {
      dominantStage,
      firstViewPromise: 'Show one concise topic answer and one visibly expanded fact group.',
      primaryInteraction: 'Open one fact group at a time or switch one compact fact category.',
      secondaryReveal: 'Keep examples, sources, and related facts inside collapsed local sections or one bounded modal.',
      attentionBudget: {
        desktop: { maxControlGroups: 2, maxVisibleControls: 7, maxVisibleItems: 4 },
        extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 1, maxTextCharacters: 320 },
      },
      preserveAt300x360: ['topic title', 'one-sentence answer', 'one expanded fact', 'one clear next disclosure control'],
      deferAt300x360: ['inactive fact bodies', 'related links', 'source list', 'long examples', 'article-style prose', 'duplicate accordion and tab navigation'],
      forbiddenPatterns: [...commonForbidden, 'accordion toggles and tabs duplicating the same choices', 'all accordion bodies expanded together', 'FAQ wall or long article composition'],
    }
  }
  return {
    dominantStage: 'entity_summary',
    firstViewPromise: 'Show one topic identity, one neutral summary, and one selected fact group.',
    primaryInteraction: 'Switch a compact fact group or reveal one bounded supporting detail.',
    secondaryReveal: 'Keep additional facts, sources, and related material behind the selected fact group.',
    attentionBudget: {
      desktop: { maxControlGroups: 2, maxVisibleControls: 6, maxVisibleItems: 3 },
      extremeSmall: { maxControlGroups: 2, maxVisibleControls: 4, maxPrimaryTabs: 3, maxVisibleItems: 2, maxTextCharacters: 300 },
    },
    preserveAt300x360: ['topic title', 'one neutral summary', 'up to two core facts', 'one compact fact-group switcher'],
    deferAt300x360: ['remaining facts', 'source rows', 'related topics', 'metadata chips', 'decorative labels'],
    forbiddenPatterns: commonForbidden,
  }
}
