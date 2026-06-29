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

  it('replays real BabeL-O execute golden events into DUDesign design events', () => {
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
        type: 'file_delta',
        path: 'styles.css',
        text: 'body { color: #111; }',
        sequence: 2,
        isFinal: true,
        timestamp: '2026-06-27T00:00:02.750Z',
      },
      {
        type: 'workspace_dirty_detected',
        artifactId: 'art_runtime_1',
        entryPath: 'index.html',
        changedPaths: ['index.html', 'styles.css'],
        files: [
          { path: 'index.html', content: '<!doctype html><html><body>Runtime draft</body></html>', contentType: 'text/html' },
          { path: 'styles.css', content: 'body { color: #111; }', contentType: 'text/css' },
        ],
        timestamp: '2026-06-27T00:00:03.000Z',
      },
      {
        type: 'execution_metrics',
        elapsedMs: 700,
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
      'design.variation_code_delta',
      'design.variation_artifact_updated',
      'design.runtime_warning',
      'design.variation_completed',
      'design.runtime_warning',
    ])
    assert.equal(asEvent(output[0], 'design.session_started').payload.runtimeSessionRef, 'runtime_ses_1')
    assert.equal(asEvent(output[1], 'design.variation_streaming').payload.channel, 'assistant')
    assert.equal(asEvent(output[2], 'design.variation_streaming').payload.channel, 'thinking')
    assert.equal(asEvent(output[3], 'design.variation_code_delta').payload.path, 'index.html')
    assert.equal(asEvent(output[3], 'design.variation_code_delta').payload.language, 'html')
    assert.equal(asEvent(output[3], 'design.variation_code_delta').payload.sequence, 1)
    assert.equal(asEvent(output[4], 'design.variation_code_delta').payload.path, 'styles.css')
    assert.equal(asEvent(output[4], 'design.variation_code_delta').payload.language, 'css')
    assert.equal(asEvent(output[4], 'design.variation_code_delta').payload.sequence, 2)
    assert.equal(asEvent(output[4], 'design.variation_code_delta').payload.isFinal, true)
    assert.deepEqual(asEvent(output[5], 'design.variation_artifact_updated').payload.changedPaths, ['index.html', 'styles.css'])
    assert.equal(asEvent(output[5], 'design.variation_artifact_updated').payload.files?.length, 2)
    assert.equal(asEvent(output[6], 'design.runtime_warning').payload.code, 'UNKNOWN_RUNTIME_EVENT')
    assert.equal(asEvent(output[7], 'design.variation_completed').payload.artifactId, 'art_runtime_1')
    assert.equal(asEvent(output[7], 'design.variation_completed').payload.entryPath, 'index.html')
    assert.match(asEvent(output[7], 'design.variation_completed').payload.html ?? '', /Runtime HTML/)
    assert.equal(asEvent(output[7], 'design.variation_completed').payload.files?.length, 2)
    assert.equal(asEvent(output[8], 'design.runtime_warning').payload.code, 'UNKNOWN_RUNTIME_EVENT')
    assert.ok(output.every(event => event.type.startsWith('design.')))
    assert.ok(output.every(event => event.sessionId === context.sessionId))
    assert.ok(output.every(event => event.jobId === context.jobId))
    assert.ok(output.every(event => event.variationId === context.variationId))
  })

  it('recovers resumed runtime transcripts while containing BabeL-O event drift', () => {
    const input: Array<BabelONexusEvent | UnknownBabelONexusEvent> = [
      {
        type: 'session_started',
        runtimeSessionId: 'runtime_ses_resumed',
        timestamp: '2026-06-27T01:00:00.000Z',
      },
      {
        type: 'session_resume_snapshot',
        replayedEventCount: 4,
        timestamp: '2026-06-27T01:00:00.500Z',
      },
      {
        type: 'file_delta',
        path: 'index.html',
        text: '<!doctype html><html><body>Recovered draft</body></html>',
        sequence: 7,
        isFinal: true,
        timestamp: '2026-06-27T01:00:01.000Z',
      },
      {
        type: 'workspace_dirty_detected',
        artifactId: 'art_resume_1',
        entryPath: 'index.html',
        changedPaths: ['index.html'],
        files: [
          { path: 'index.html', content: '<!doctype html><html><body>Recovered draft</body></html>', contentType: 'text/html' },
        ],
        timestamp: '2026-06-27T01:00:02.000Z',
      },
      {
        type: 'result',
        artifactId: 'art_resume_1',
        entryPath: 'index.html',
        files: [
          { path: 'index.html', content: '<!doctype html><html><body>Recovered final</body></html>', contentType: 'text/html' },
        ],
        timestamp: '2026-06-27T01:00:03.000Z',
      },
    ]

    const output = input.map(event => adapter.toDesignEvent(event, context))

    assert.deepEqual(output.map(event => event.type), [
      'design.session_started',
      'design.runtime_warning',
      'design.variation_code_delta',
      'design.variation_artifact_updated',
      'design.variation_completed',
    ])
    assert.equal(asEvent(output[0], 'design.session_started').payload.runtimeSessionRef, 'runtime_ses_resumed')
    assert.equal(asEvent(output[1], 'design.runtime_warning').payload.code, 'UNKNOWN_RUNTIME_EVENT')
    assert.equal(asEvent(output[2], 'design.variation_code_delta').payload.sequence, 7)
    assert.equal(asEvent(output[3], 'design.variation_artifact_updated').payload.files?.[0]?.path, 'index.html')
    assert.equal(asEvent(output[4], 'design.variation_completed').payload.artifactId, 'art_resume_1')
    assert.ok(output.every(event => event.type.startsWith('design.')))
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
