import { createHash } from 'node:crypto'
import type { EncyclopediaGuidanceDemocaseEvidence } from '@dudesign/contracts'
import { listEncyclopediaDemocases } from './encyclopediaDemocase.js'
import { findEncyclopediaTaxonomyNode, listEncyclopediaTaxonomyNodes } from './encyclopediaTaxonomy.js'
import { REAL_ENCYCLOPEDIA_DEMOCASE_INDEX } from './fixtures/encyclopediaDemocaseIndex.generated.js'

export const ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION = REAL_ENCYCLOPEDIA_DEMOCASE_INDEX.indexVersion

type ScoredEvidence = EncyclopediaGuidanceDemocaseEvidence & {
  primaryCategory: string
  secondaryCategory: string
}

const GENERIC_EVIDENCE_TOKENS = new Set(['智能', '人物', '剧情', '关系', '解析', '百科', '互动', '动态', '展示', '设计'])

export type EncyclopediaDemocaseResolution = {
  indexVersion: string
  evidence: EncyclopediaGuidanceDemocaseEvidence[]
  categoryHints: Array<{
    primaryCategory: string
    secondaryCategory: string
  }>
}

export function resolveEncyclopediaDemocaseEvidence(query: string, limit = 12): EncyclopediaDemocaseResolution {
  const normalizedQuery = normalize(query)
  const realEvidence = resolveRealCaseEvidence(query)
  const mockEvidence: ScoredEvidence[] = listEncyclopediaDemocases()
    .map(democase => {
      const exactMatches = [democase.title, ...democase.aliases]
        .filter(value => normalizedQuery.includes(normalize(value)))
      const keywordMatches = democase.keywords
        .filter(value => normalizedQuery.includes(normalize(value)))
      const matchedEvidence = [...new Set([...exactMatches, ...keywordMatches])]
      const exactScore = exactMatches.length > 0 ? 0.78 + Math.min(0.18, (exactMatches.length - 1) * 0.06) : 0
      const keywordScore = Math.min(0.72, keywordMatches.length * 0.12)
      const score = Math.min(1, Math.max(exactScore, keywordScore))
      const taxonomyNode = resolveDemocaseTaxonomyNode(democase.primaryCategory, democase.secondaryCategory)
      return {
        caseId: democase.id,
        title: democase.title,
        taxonomyNodeId: taxonomyNode?.taxonomyNodeId ?? null,
        summary: democase.summary,
        score,
        matchedEvidence,
        preferredTemplatePackIds: [...democase.preferredTemplateIds],
        interactionParadigmIds: [democase.interactionParadigmId],
        contentHash: createHash('sha256').update(JSON.stringify(democase)).digest('hex'),
        primaryCategory: taxonomyNode?.l1 ?? democase.primaryCategory,
        secondaryCategory: taxonomyNode?.l2 ?? democase.secondaryCategory,
      }
    })
    .filter(item => item.score > 0)
  const evidence = [...realEvidence, ...mockEvidence]
    .sort((a, b) => b.score - a.score || b.matchedEvidence.length - a.matchedEvidence.length || a.caseId.localeCompare(b.caseId))
    .slice(0, Math.max(1, Math.min(20, Math.trunc(limit))))

  return {
    indexVersion: ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION,
    evidence: evidence.map(({ primaryCategory: _primary, secondaryCategory: _secondary, ...item }) => item),
    categoryHints: uniqueCategoryHints(evidence.map(item => ({
      primaryCategory: item.primaryCategory,
      secondaryCategory: item.secondaryCategory,
    }))),
  }
}

function resolveRealCaseEvidence(query: string): ScoredEvidence[] {
  const queryTokens = lexicalTokens(query)
  if (queryTokens.length === 0) return []
  const documents = REAL_ENCYCLOPEDIA_DEMOCASE_INDEX.records.map(record => ({
    record,
    tokens: lexicalTokens([
      record.title,
      record.entryTitle,
      record.sourceCategory,
      record.primaryCategory,
      record.secondaryCategory,
      record.tertiaryCategory,
      ...record.keywords,
      ...record.structuralFeatures,
    ].join(' ')),
  }))
  const averageLength = documents.reduce((total, document) => total + document.tokens.length, 0) / Math.max(1, documents.length)
  const documentFrequency = new Map<string, number>()
  for (const token of new Set(queryTokens)) {
    documentFrequency.set(token, documents.filter(document => document.tokens.includes(token)).length)
  }
  const scored = documents.map(document => {
    const frequencies = tokenFrequencies(document.tokens)
    let bm25 = 0
    for (const token of new Set(queryTokens)) {
      const frequency = frequencies.get(token) ?? 0
      if (frequency === 0) continue
      const df = documentFrequency.get(token) ?? 0
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5))
      const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * document.tokens.length / Math.max(1, averageLength))
      bm25 += idf * (frequency * 2.2) / denominator
    }
    const normalizedQuery = normalize(query)
    const normalizedEntry = normalize(document.record.entryTitle)
    const normalizedTitle = normalize(document.record.title)
    const exactBoost = normalizedEntry.length >= 2 && (normalizedQuery.includes(normalizedEntry) || normalizedEntry.includes(normalizedQuery))
      ? 0.88
      : normalizedTitle.length >= 2 && normalizedQuery.includes(normalizedTitle)
        ? 0.82
        : 0
    return { ...document, bm25, exactBoost }
  })
  const maxBm25 = Math.max(0, ...scored.map(item => item.bm25))
  return scored
    .map(({ record, tokens, bm25, exactBoost }) => {
      const lexicalScore = maxBm25 > 0 ? bm25 / maxBm25 * 0.78 : 0
      const score = Math.min(0.99, Math.max(exactBoost, lexicalScore))
      const matchedKeywords = record.keywords.filter(keyword => {
        const normalizedKeyword = normalize(keyword)
        const normalizedQuery = normalize(query)
        return normalizedKeyword.length >= 2
          && (normalizedQuery.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedQuery))
      })
      const tokenMatches = [...new Set(queryTokens.filter(token => tokens.includes(token) && token.length >= 2))]
      const matchedEvidence = [...new Set([...matchedKeywords, ...tokenMatches])].slice(0, 12)
      const strongEvidenceCount = matchedEvidence.filter(item => !GENERIC_EVIDENCE_TOKENS.has(normalize(item))).length
      return {
        caseId: record.caseId,
        title: record.title,
        taxonomyNodeId: record.taxonomyNodeId,
        summary: record.structuralSummary,
        score,
        matchedEvidence,
        preferredTemplatePackIds: [...record.preferredTemplatePackIds],
        interactionParadigmIds: [...record.interactionParadigmIds],
        contentHash: record.contentHash,
        experienceProfile: record.experienceProfile,
        primaryCategory: record.primaryCategory,
        secondaryCategory: record.secondaryCategory,
        strongMatch: exactBoost > 0 || strongEvidenceCount >= 2,
      }
    })
    .filter(item => item.score >= 0.08 && item.strongMatch)
    .map(({ strongMatch: _strongMatch, ...item }) => item)
}

function resolveDemocaseTaxonomyNode(primaryCategory: string, secondaryCategory: string) {
  const normalizedPair = legacyCategoryPair(primaryCategory, secondaryCategory)
  const exact = findEncyclopediaTaxonomyNode(normalizedPair.primaryCategory, normalizedPair.secondaryCategory)
  if (exact) return exact
  if (secondaryCategory === '文化类词语') {
    return listEncyclopediaTaxonomyNodes().find(node => node.l3 === '文化类词语') ?? null
  }
  return null
}

function legacyCategoryPair(primaryCategory: string, secondaryCategory: string): {
  primaryCategory: string
  secondaryCategory: string
} {
  const aliases: Record<string, [string, string]> = {
    '机构组织/企业': ['机构组织', '企业公司'],
    '作品/游戏': ['游戏', '电子游戏'],
    '知识/知识术语': ['知识术语', '工程技术'],
  }
  const mapped = aliases[`${primaryCategory}/${secondaryCategory}`]
  return mapped
    ? { primaryCategory: mapped[0], secondaryCategory: mapped[1] }
    : { primaryCategory, secondaryCategory }
}

function uniqueCategoryHints(items: Array<{ primaryCategory: string; secondaryCategory: string }>) {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = `${item.primaryCategory}/${item.secondaryCategory}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

function lexicalTokens(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase()
  const tokens = normalized.match(/[a-z0-9]+|[\u3400-\u9fff]+/gu) ?? []
  const expanded: string[] = []
  for (const token of tokens) {
    expanded.push(token)
    if (/^[\u3400-\u9fff]+$/u.test(token)) {
      for (let index = 0; index < token.length - 1; index += 1) expanded.push(token.slice(index, index + 2))
    }
  }
  return expanded.filter(token => token.length >= 2)
}

function tokenFrequencies(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>()
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  return frequencies
}
