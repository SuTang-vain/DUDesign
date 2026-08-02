import { createHash } from 'node:crypto'
import type {
  ImageGenerationArtifact,
  ImageGenerationRequest,
  ImageGenerationUsageContext,
  McpInvocationRequest,
  McpInvocationResult,
  ResearchContextArtifact,
  ResearchContextPlatform,
} from '@dudesign/contracts'
import { mcpUnavailableResult } from '@dudesign/runtime-gateway'

export type McpExecutor = {
  execute(request: McpInvocationRequest): Promise<McpInvocationResult>
}

export type HttpMcpExecutorConfig = {
  baseUrl: string
  endpointPath?: string
  apiKey?: string
  authHeaderName?: string
  timeoutMs?: number
}

export type ArkSeedreamImageMcpExecutorConfig = {
  apiKey: string
  baseUrl?: string
  model?: string
  timeoutMs?: number
  fallback?: McpExecutor
}

export class MockMcpExecutor implements McpExecutor {
  async execute(request: McpInvocationRequest): Promise<McpInvocationResult> {
    const completedAt = new Date().toISOString()
    if (request.serverName === 'quality-tools' && request.toolName === 'validateAccessibility') {
      return {
        invocationId: request.invocationId,
        status: 'ok',
        mcpToolId: request.mcpToolId,
        source: invocationSource(request),
        summary: 'Accessibility validation accepted for queued artifact review.',
        references: request.input.artifactId ? [{ id: String(request.input.artifactId), title: 'Artifact under validation' }] : [],
        data: {
          validationStatus: 'accepted',
          checkedRules: ['semantic_structure', 'contrast_placeholder', 'keyboard_flow_placeholder'],
        },
        completedAt,
      }
    }
    if (request.serverName === 'agent-reach' && ['search', 'readPage', 'scanSocial'].includes(request.toolName)) {
      const researchContext = mockResearchContextArtifact(request, completedAt)
      return {
        invocationId: request.invocationId,
        status: 'ok',
        mcpToolId: request.mcpToolId,
        source: invocationSource(request),
        summary: researchContext.summary,
        references: researchContext.sources.map((source, index) => ({
          id: `src_${index + 1}`,
          title: source.title ?? source.url,
          url: source.url,
        })),
        data: {
          researchContext,
          note: 'Mock Agent-Reach output is normalized before runtime prompt injection. Use as sourced design context only.',
        },
        completedAt,
      }
    }
    if (request.serverName === 'image-generation' && request.toolName === 'generateArkSeedreamImage') {
      const imageGeneration = mockImageGenerationArtifact(request, completedAt)
      return {
        invocationId: request.invocationId,
        status: imageGeneration.contentSafety.status === 'blocked' ? 'error' : 'ok',
        mcpToolId: request.mcpToolId,
        source: invocationSource(request),
        summary: imageGeneration.contentSafety.status === 'blocked'
          ? 'Image generation request was blocked by content safety policy.'
          : `Generated ${imageGeneration.usageContext} image asset with ${imageGeneration.provider}.`,
        references: imageGeneration.artifactId
          ? [{ id: imageGeneration.artifactId, title: 'Generated image asset', url: imageGeneration.imageUrl }]
          : [],
        data: {
          imageGeneration,
          note: 'Mock image generation output is artifact-backed context only; provider keys and raw provider payloads are never exposed.',
        },
        ...(imageGeneration.contentSafety.status === 'blocked'
          ? {
              error: {
                code: 'IMAGE_CONTENT_SAFETY_BLOCKED',
                message: imageGeneration.contentSafety.reason ?? 'Image generation request failed content safety checks.',
                retryable: false,
              },
            }
          : {}),
        completedAt,
      }
    }
    return mcpUnavailableResult(
      request,
      `No MCP executor is configured for ${request.serverName}.${request.toolName}.`,
      completedAt,
    )
  }
}

export class HttpMcpExecutor implements McpExecutor {
  private readonly baseUrl: string
  private readonly endpointPath: string
  private readonly apiKey: string | undefined
  private readonly authHeaderName: string
  private readonly timeoutMs: number

  constructor(config: HttpMcpExecutorConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.endpointPath = normalizeEndpointPath(config.endpointPath)
    this.apiKey = config.apiKey
    this.authHeaderName = config.authHeaderName?.trim() || 'authorization'
    this.timeoutMs = config.timeoutMs ?? 30000
  }

  async execute(request: McpInvocationRequest): Promise<McpInvocationResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}${this.endpointPath}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ request }),
        signal: controller.signal,
      })
      if (!response.ok) {
        return mcpUnavailableResult(request, `MCP HTTP executor returned ${response.status}: ${await safeResponseText(response)}`)
      }
      const payload = await response.json() as unknown
      const result = normalizeMcpExecutorResponse(payload)
      if (!result) return mcpUnavailableResult(request, 'MCP HTTP executor returned an invalid result envelope.')
      if (result.invocationId !== request.invocationId || result.mcpToolId !== request.mcpToolId) {
        return mcpUnavailableResult(request, 'MCP HTTP executor result does not match the invocation request.')
      }
      return result
    } catch (error) {
      return mcpUnavailableResult(request, error instanceof Error ? error.message : 'MCP HTTP executor request failed.')
    } finally {
      clearTimeout(timeout)
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.apiKey) {
      headers[this.authHeaderName] = this.authHeaderName.toLowerCase() === 'authorization'
        ? `Bearer ${this.apiKey}`
        : this.apiKey
    }
    return headers
  }
}

export class ArkSeedreamImageMcpExecutor implements McpExecutor {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly fallback: McpExecutor

  constructor(config: ArkSeedreamImageMcpExecutorConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3/images/generations').replace(/\/+$/, '')
    this.model = config.model ?? 'doubao-seedream-5-0-260128'
    this.timeoutMs = config.timeoutMs ?? 90000
    this.fallback = config.fallback ?? new MockMcpExecutor()
  }

  async execute(request: McpInvocationRequest): Promise<McpInvocationResult> {
    if (request.serverName !== 'image-generation' || request.toolName !== 'generateArkSeedreamImage') {
      return this.fallback.execute(request)
    }
    const completedAt = new Date().toISOString()
    const imageRequest = normalizeImageGenerationRequest({
      ...request.input,
      model: optionalString(request.input.model) ?? this.model,
    })
    if (isUnsafeImagePrompt(imageRequest.prompt)) {
      return imageSafetyBlockedResult(request, imageRequest, completedAt)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: imageRequest.model,
          prompt: imageRequest.prompt,
          response_format: 'url',
          size: imageRequest.size,
          stream: false,
          watermark: imageRequest.watermark,
          sequential_image_generation: 'disabled',
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        return arkSeedreamUnavailableResult(request, `Ark Seedream image provider returned ${response.status}: ${await safeResponseText(response)}`, completedAt)
      }
      const payload = await response.json() as unknown
      const imageUrl = arkImageUrl(payload)
      if (!imageUrl) {
        return arkSeedreamUnavailableResult(request, 'Ark Seedream image provider returned no image URL.', completedAt)
      }
      const imageGeneration = imageGenerationArtifactFromProvider({
        provider: 'ark_seedream',
        imageRequest,
        imageUrl,
        completedAt,
        costCents: providerCostCents(payload),
      })
      return imageGenerationResult(request, imageGeneration, completedAt)
    } catch (error) {
      return arkSeedreamUnavailableResult(request, error instanceof Error ? error.message : 'Ark Seedream image provider request failed.', completedAt)
    } finally {
      clearTimeout(timeout)
    }
  }
}

function arkSeedreamUnavailableResult(request: McpInvocationRequest, message: string, completedAt: string): McpInvocationResult {
  const result = mcpUnavailableResult(request, message, completedAt)
  return {
    ...result,
    data: {
      ...(result.data ?? {}),
      mcpToolId: request.mcpToolId,
      serverName: request.serverName,
      toolName: request.toolName,
      provider: 'ark_seedream',
    },
  }
}

function invocationSource(request: McpInvocationRequest): McpInvocationResult['source'] {
  return {
    serverName: request.serverName,
    toolName: request.toolName,
    scopes: [...request.scopes],
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalPositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function mockResearchContextArtifact(request: McpInvocationRequest, completedAt: string): ResearchContextArtifact {
  const query = optionalString(request.input.query)
    ?? optionalString(request.input.url)
    ?? optionalString(request.input.topic)
    ?? 'DUDesign research context'
  const platform = researchPlatformForTool(request.toolName)
  const sourceUrl = optionalString(request.input.url) ?? `https://research.local/${encodeURIComponent(query)}`
  const title = optionalString(request.input.title) ?? `Reviewed context for ${query}`
  const freshness = request.toolName === 'readPage' ? 'recent' : 'unknown'
  const summary = request.toolName === 'scanSocial'
    ? `Reviewed social/community signals for "${query}" with subjective claims marked as design context only.`
    : request.toolName === 'readPage'
      ? `Reviewed page context for "${query}" with source metadata preserved.`
      : `Reviewed search context for "${query}" with citations and risk flags prepared for data intake.`
  const rawPayload = JSON.stringify({
    toolName: request.toolName,
    query,
    sourceUrl,
    input: request.input,
  })

  return {
    schemaVersion: '2026-07-06.dudesign-research-context.v1',
    query,
    sources: [
      {
        url: sourceUrl,
        title,
        platform,
        retrievedAt: completedAt,
        licenseHint: 'unknown',
      },
    ],
    summary,
    citations: [
      {
        sourceUrl,
        note: 'Mock citation produced for contract testing; replace with reviewed Agent-Reach citations in staging.',
      },
    ],
    confidence: request.toolName === 'scanSocial' ? 'low' : 'medium',
    freshness,
    riskFlags: request.toolName === 'scanSocial' ? ['subjective-source'] : ['mock-source-review-required'],
    rawPayloadHash: createHash('sha256').update(rawPayload).digest('hex'),
    reviewStatus: 'auto_reviewed',
  }
}

function researchPlatformForTool(toolName: string): ResearchContextPlatform {
  if (toolName === 'readPage') return 'web'
  if (toolName === 'scanSocial') return 'social'
  return 'unknown'
}

function mockImageGenerationArtifact(request: McpInvocationRequest, completedAt: string): ImageGenerationArtifact {
  const parsed = normalizeImageGenerationRequest(request.input)
  const promptHash = createHash('sha256').update(JSON.stringify({
    prompt: parsed.prompt,
    model: parsed.model,
    size: parsed.size,
    usageContext: parsed.usageContext,
  })).digest('hex')
  const blocked = isUnsafeImagePrompt(parsed.prompt)
  const artifactId = blocked ? null : `img_${promptHash.slice(0, 16)}`
  return {
    schemaVersion: '2026-07-06.dudesign-image-generation-artifact.v1',
    provider: 'mock',
    model: parsed.model,
    promptHash,
    imageUrl: artifactId ? `mock://image-generation/${artifactId}.png` : '',
    size: parsed.size,
    watermark: parsed.watermark,
    usageContext: parsed.usageContext,
    contentType: 'image/png',
    contentSafety: {
      status: blocked ? 'blocked' : 'passed',
      policy: parsed.contentSafety?.policy ?? 'standard',
      reason: blocked ? 'Prompt appears to request protected brand, celebrity, or copyrighted imagery.' : null,
    },
    costCents: blocked ? 0 : 12,
    artifactId,
    createdAt: completedAt,
  }
}

function imageGenerationResult(
  request: McpInvocationRequest,
  imageGeneration: ImageGenerationArtifact,
  completedAt: string,
): McpInvocationResult {
  return {
    invocationId: request.invocationId,
    status: imageGeneration.contentSafety.status === 'blocked' ? 'error' : 'ok',
    mcpToolId: request.mcpToolId,
    source: invocationSource(request),
    summary: imageGeneration.contentSafety.status === 'blocked'
      ? 'Image generation request was blocked by content safety policy.'
      : `Generated ${imageGeneration.usageContext} image asset with ${imageGeneration.provider}.`,
    references: imageGeneration.artifactId
      ? [{ id: imageGeneration.artifactId, title: 'Generated image asset', url: imageGeneration.imageUrl }]
      : [],
    data: {
      imageGeneration,
      note: 'Image generation output is artifact-backed context only; provider keys and raw provider payloads are never exposed.',
    },
    ...(imageGeneration.contentSafety.status === 'blocked'
      ? {
          error: {
            code: 'IMAGE_CONTENT_SAFETY_BLOCKED',
            message: imageGeneration.contentSafety.reason ?? 'Image generation request failed content safety checks.',
            retryable: false,
          },
        }
      : {}),
    completedAt,
  }
}

function imageSafetyBlockedResult(
  request: McpInvocationRequest,
  imageRequest: ImageGenerationRequest,
  completedAt: string,
): McpInvocationResult {
  return imageGenerationResult(request, {
    schemaVersion: '2026-07-06.dudesign-image-generation-artifact.v1',
    provider: 'ark_seedream',
    model: imageRequest.model,
    promptHash: imagePromptHash(imageRequest),
    imageUrl: '',
    size: imageRequest.size,
    watermark: imageRequest.watermark,
    usageContext: imageRequest.usageContext,
    contentType: 'image/png',
    contentSafety: {
      status: 'blocked',
      policy: imageRequest.contentSafety?.policy ?? 'standard',
      reason: 'Prompt appears to request protected brand, celebrity, or copyrighted imagery.',
    },
    costCents: 0,
    artifactId: null,
    createdAt: completedAt,
  }, completedAt)
}

function imageGenerationArtifactFromProvider(input: {
  provider: string
  imageRequest: ImageGenerationRequest
  imageUrl: string
  completedAt: string
  costCents: number
}): ImageGenerationArtifact {
  const artifactId = `img_${imagePromptHash(input.imageRequest).slice(0, 16)}`
  return {
    schemaVersion: '2026-07-06.dudesign-image-generation-artifact.v1',
    provider: input.provider,
    model: input.imageRequest.model,
    promptHash: imagePromptHash(input.imageRequest),
    imageUrl: input.imageUrl,
    size: input.imageRequest.size,
    watermark: input.imageRequest.watermark,
    usageContext: input.imageRequest.usageContext,
    contentType: 'image/png',
    contentSafety: {
      status: 'passed',
      policy: input.imageRequest.contentSafety?.policy ?? 'standard',
      reason: null,
    },
    costCents: input.costCents,
    artifactId,
    createdAt: input.completedAt,
  }
}

function imagePromptHash(imageRequest: ImageGenerationRequest): string {
  return createHash('sha256').update(JSON.stringify({
    prompt: imageRequest.prompt,
    model: imageRequest.model,
    size: imageRequest.size,
    usageContext: imageRequest.usageContext,
  })).digest('hex')
}

function isUnsafeImagePrompt(prompt: string): boolean {
  return prompt
    .split(/[。.!?！？；;\n]+/)
    .some(segment => {
      const normalized = segment.trim()
      if (!normalized || isNegativeImageSafetyConstraint(normalized)) return false
      return /logo|copyrighted|celebrity|private person|exact brand trade dress/i.test(normalized)
    })
}

function isNegativeImageSafetyConstraint(segment: string): boolean {
  return /(?:不要|禁止|避免|不得|不能|请勿|非|无|no|avoid|without|do not|don't|never|must not)\s*(?:使用|包含|生成|描绘|出现|use|include|generate|depict|show)?/i.test(segment)
}

function normalizeImageGenerationRequest(input: Record<string, unknown>): ImageGenerationRequest {
  const prompt = optionalString(input.prompt) ?? 'Abstract product visual asset, clean composition, original non-branded design.'
  const model = optionalString(input.model) ?? 'doubao-seedream-5-0-260128'
  const size = optionalString(input.size) ?? '2K'
  const watermark = typeof input.watermark === 'boolean' ? input.watermark : true
  const usageContext = imageUsageContext(input.usageContext)
  const contentSafety = isRecord(input.contentSafety)
    ? {
        policy: input.contentSafety.policy === 'strict' ? 'strict' as const : 'standard' as const,
        allowBrandReference: input.contentSafety.allowBrandReference === true,
      }
    : {
        policy: 'standard' as const,
        allowBrandReference: false,
      }
  return {
    schemaVersion: '2026-07-06.dudesign-image-generation-request.v1',
    prompt,
    model,
    size,
    watermark,
    usageContext,
    variationId: optionalString(input.variationId),
    templatePackId: optionalString(input.templatePackId),
    contentSafety,
  }
}

function imageUsageContext(value: unknown): ImageGenerationUsageContext {
  if (
    value === 'template_hero'
    || value === 'template_illustration'
    || value === 'background_texture'
    || value === 'reference_mood'
  ) {
    return value
  }
  return 'template_illustration'
}

function normalizeMcpExecutorResponse(payload: unknown): McpInvocationResult | null {
  const value = isRecord(payload) && isRecord(payload.result) ? payload.result : payload
  if (!isRecord(value)) return null
  if (typeof value.invocationId !== 'string') return null
  if (!['ok', 'denied', 'unavailable', 'error'].includes(String(value.status))) return null
  if (typeof value.mcpToolId !== 'string') return null
  if (!isRecord(value.source)) return null
  if (typeof value.source.serverName !== 'string' || typeof value.source.toolName !== 'string' || !Array.isArray(value.source.scopes)) return null
  if (typeof value.summary !== 'string') return null
  if (!Array.isArray(value.references)) return null
  if (typeof value.completedAt !== 'string') return null
  return value as McpInvocationResult
}

function arkImageUrl(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const data = payload.data
  if (!Array.isArray(data)) return null
  for (const item of data) {
    if (!isRecord(item)) continue
    if (typeof item.url === 'string' && item.url) return item.url
    if (typeof item.image_url === 'string' && item.image_url) return item.image_url
  }
  return null
}

function providerCostCents(payload: unknown): number {
  if (!isRecord(payload) || !isRecord(payload.usage)) return 0
  const cents = Number(payload.usage.cost_cents ?? payload.usage.costCents)
  return Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeEndpointPath(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return '/v1/mcp/invocations'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500)
  } catch {
    return 'unreadable response body'
  }
}
