import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const { toUserFacingError } = await import('../src/lib/userErrors.ts')

describe('capability user errors', () => {
  it('maps unavailable image generation MCP results to a recoverable no-image action', () => {
    const error = toUserFacingError({
      code: 'MCP_UNAVAILABLE',
      message: 'Ark Seedream image provider request failed.',
      recoverable: true,
      scope: 'runtime',
      context: {
      mcpToolId: 'mcp_image_generation_ark_seedream',
        serverName: 'image-generation',
        toolName: 'generateArkSeedreamImage',
        provider: 'ark_seedream',
      },
    })

    assert.equal(error?.title, 'Image generation temporarily unavailable')
    assert.equal(error?.action, 'Continue without images')
    assert.equal(error?.retryable, true)
    assert.equal(error?.severity, 'warning')
  })

  it('keeps the image-generation action labels stable for notice UI', () => {
    const imageError = toUserFacingError({
      code: 'MCP_UNAVAILABLE',
      message: 'Ark Seedream image provider request failed.',
      recoverable: true,
      scope: 'runtime',
      context: {
        mcpToolId: 'mcp_image_generation_ark_seedream',
        serverName: 'image-generation',
        toolName: 'generateArkSeedreamImage',
      },
    })

    assert.equal(imageError.action, 'Continue without images')
    assert.match(imageError.message, /Retry image generation later|switch to another image provider/)
  })

  it('keeps non-image MCP unavailable results on the generic capability message', () => {
    const error = toUserFacingError({
      code: 'MCP_UNAVAILABLE',
      message: 'Agent-Reach is unavailable.',
      recoverable: true,
      scope: 'runtime',
      context: {
      mcpToolId: 'mcp_network_research_agent_reach',
        serverName: 'agent-reach',
        toolName: 'search',
      },
    })

    assert.equal(error?.title, 'Capability temporarily unavailable')
    assert.equal(error?.action, 'Retry capability')
  })
})
