import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAnnotationPrompt } from './annotationPrompt.js'

describe('buildAnnotationPrompt', () => {
  it('serializes rect and text annotations with normalized coordinates', () => {
    const prompt = buildAnnotationPrompt([
      {
        type: 'rect',
        x: 0.12345,
        y: 0.2,
        w: 0.33333,
        h: 0.44444,
        note: 'Increase whitespace around the headline.',
      },
      {
        type: 'text',
        anchor: { x: 0.75, y: 0.125 },
        text: 'Use a clearer CTA label.',
        note: 'Button copy feels vague.',
      },
    ], 'Apply these marked changes.')

    assert.equal(prompt, [
      'Apply these marked changes.',
      'Use normalized coordinates where 0,0 is the top-left of the current preview and 1,1 is the bottom-right.',
      'Annotation 1: rectangle at x=0.123, y=0.200, w=0.333, h=0.444; note: Increase whitespace around the headline.',
      'Annotation 2: text note at (0.750, 0.125): Use a clearer CTA label.; note: Button copy feels vague.',
    ].join('\n'))
  })

  it('uses the default instruction and clamps non-finite coordinate text to zero', () => {
    const prompt = buildAnnotationPrompt([
      {
        type: 'rect',
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        w: 0.1,
        h: 0.2,
      },
    ])

    assert.match(prompt, /^Apply the requested visual changes from these annotations\./)
    assert.match(prompt, /rectangle at x=0\.000, y=0\.000, w=0\.100, h=0\.200/)
  })
})
