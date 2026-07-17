import type { EncyclopediaDemocaseExperienceProfile } from '@dudesign/contracts'

export const ENCYCLOPEDIA_DEMOCASE_INDEX_SCHEMA_VERSION = '2026-07-16.dudesign-democase-index.v2' as const

export type EncyclopediaIndexedDemocase = {
  schemaVersion: typeof ENCYCLOPEDIA_DEMOCASE_INDEX_SCHEMA_VERSION
  caseId: string
  sourceCategory: string
  title: string
  entryTitle: string
  relativeHtmlPath: string
  taxonomyNodeId: string
  primaryCategory: string
  secondaryCategory: string
  tertiaryCategory: string
  interactionParadigmIds: string[]
  preferredTemplatePackIds: string[]
  keywords: string[]
  structuralFeatures: string[]
  experienceProfile: EncyclopediaDemocaseExperienceProfile
  assetSummary: {
    totalFiles: number
    imageCount: number
    documentCount: number
    dataFileCount: number
    extensions: Record<string, number>
    namedGroups: string[]
  }
  structuralSummary: string
  contentHash: string
}

export type EncyclopediaDemocaseIndex = {
  schemaVersion: typeof ENCYCLOPEDIA_DEMOCASE_INDEX_SCHEMA_VERSION
  indexVersion: string
  sourceLabel: string
  records: EncyclopediaIndexedDemocase[]
}
