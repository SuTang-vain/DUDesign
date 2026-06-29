import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DesignEvent } from '@dudesign/contracts'
import { BabelONexusEventAdapter, type BabelONexusEvent, type UnknownBabelONexusEvent } from './babelOAdapter.js'

const context = {
  requestId: 'req_golden',
  sessionId: 'ses_golden',
  jobId: 'job_golden',
  variationId: 'var_golden',
}

describe('BabelONexusEventAdapter', () => {
  const adapter = new BabelONexusEventAdapter()

  it('replays golden Nexus events into DUDesign design events', () => {
    const input: Array<BabelONexusEvent | UnknownBabelONexusEvent> = [
      {
        type: 'session_started',
        runtimeSessionId: 'runtime_ses_1',
        memoryRefs: [{ id: 'mem_1', summary: 'prefers concise SaaS layouts', relevance: 0.8 }],
        timestamp: '2026-06-27T00:00:00.000Z',
      },
      {
        type: 'assistant_delta',
        delta: 'Building hero copy',
        timestamp: '2026-06-27T00:00:01.000Z',
      },
      {
        type: 'thinking_delta',
        text: 'Checking layout constraints',
        timestamp: '2026-06-27T00:00:02.000Z',
      },
      {
        type: 'code_delta',
        path: 'index.html',
        delta: '<main>',
        sequence: 1,
        timestamp: '2026-06-27T00:00:02.500Z',
      },
      {
        type: 'workspace_dirty',
        artifactId: 'art_runtime_1',
        path: 'index.html',
        timestamp: '2026-06-27T00:00:03.000Z',
      },
      {
        type: 'permission_request',
        requestId: 'perm_1',
        risk: 'write',
        message: 'Write generated files',
        toolName: 'write_file',
        timestamp: '2026-06-27T00:00:04.000Z',
      },
      {
        type: 'result',
        artifactId: 'art_runtime_1',
        entryPath: 'index.html',
        html: '<!doctype html><html><body>Runtime HTML</body></html>',
        files: [
          { path: 'index.html', content: '<!doctype html><html><body>Runtime file</body></html>', contentType: 'text/html' },
          { path: 'styles.css', content: 'body { color: red; }', contentType: 'text/css' },
        ],
        inputTokens: 100,
        outputTokens: 500,
        costCents: 2,
        durationMs: 900,
        timestamp: '2026-06-27T00:00:05.000Z',
      },
      {
        type: 'error',
        code: 'RUNTIME_TIMEOUT',
        message: 'Timed out',
        recoverable: true,
        timestamp: '2026-06-27T00:00:06.000Z',
      },
      {
        type: 'new_future_event',
        timestamp: '2026-06-27T00:00:07.000Z',
      },
    ]

    const output = input.map(event => adapter.toDesignEvent(event, context))

    assert.deepEqual(output.map(event => event.type), [
      'design.session_started',
      'design.variation_streaming',
      'design.variation_streaming',
      'design.variation_code_delta',
      'design.variation_artifact_updated',
      'design.permission_required',
      'design.variation_completed',
      'design.variation_failed',
      'design.runtime_warning',
    ])
    assert.equal(asEvent(output[0], 'design.session_started').payload.runtimeSessionRef, 'runtime_ses_1')
    assert.equal(asEvent(output[1], 'design.variation_streaming').payload.channel, 'assistant')
    assert.equal(asEvent(output[2], 'design.variation_streaming').payload.channel, 'thinking')
    assert.equal(asEvent(output[3], 'design.variation_code_delta').payload.path, 'index.html')
    assert.equal(asEvent(output[3], 'design.variation_code_delta').payload.language, 'html')
    assert.equal(asEvent(output[3], 'design.variation_code_delta').payload.sequence, 1)
    assert.deepEqual(asEvent(output[4], 'design.variation_artifact_updated').payload.changedPaths, ['index.html'])
    assert.equal(asEvent(output[5], 'design.permission_required').payload.permissionRequestId, 'perm_1')
    assert.equal(asEvent(output[6], 'design.variation_completed').payload.artifactId, 'art_runtime_1')
    assert.equal(asEvent(output[6], 'design.variation_completed').payload.entryPath, 'index.html')
    assert.match(asEvent(output[6], 'design.variation_completed').payload.html ?? '', /Runtime HTML/)
    assert.equal(asEvent(output[6], 'design.variation_completed').payload.files?.length, 2)
    assert.equal(asEvent(output[7], 'design.variation_failed').payload.errorCode, 'RUNTIME_TIMEOUT')
    assert.equal(asEvent(output[7], 'design.variation_failed').payload.recoverable, true)
    assert.equal(asEvent(output[8], 'design.runtime_warning').payload.code, 'UNKNOWN_RUNTIME_EVENT')
    assert.ok(output.every(event => event.sessionId === context.sessionId))
    assert.ok(output.every(event => event.jobId === context.jobId))
    assert.ok(output.every(event => event.variationId === context.variationId))
  })
})

function asEvent<TType extends DesignEvent['type']>(
  event: DesignEvent | undefined,
  type: TType,
): Extract<DesignEvent, { type: TType }> {
  assert.ok(event)
  assert.equal(event.type, type)
  return event as Extract<DesignEvent, { type: TType }>
}
