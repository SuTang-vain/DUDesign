import type { AnnotationShape } from '@dudesign/contracts'

export function buildAnnotationPrompt(shapes: AnnotationShape[], prompt?: string): string {
  const lines = shapes.map((shape, index) => {
    const label = `Annotation ${index + 1}`
    if (shape.type === 'rect') {
      return `${label}: rectangle at x=${round(shape.x)}, y=${round(shape.y)}, w=${round(shape.w)}, h=${round(shape.h)}${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'circle') {
      return `${label}: circle at cx=${round(shape.cx)}, cy=${round(shape.cy)}, r=${round(shape.r)}${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'arrow') {
      return `${label}: arrow from (${round(shape.from.x)}, ${round(shape.from.y)}) to (${round(shape.to.x)}, ${round(shape.to.y)})${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'pen') {
      return `${label}: freehand stroke with ${shape.points.length} points${shape.note ? `; note: ${shape.note}` : ''}`
    }
    return `${label}: text note at (${round(shape.anchor.x)}, ${round(shape.anchor.y)}): ${shape.text}${shape.note ? `; note: ${shape.note}` : ''}`
  })
  return [
    prompt?.trim() || 'Apply the requested visual changes from these annotations.',
    'Use normalized coordinates where 0,0 is the top-left of the current preview and 1,1 is the bottom-right.',
    ...lines,
  ].join('\n')
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000'
}
