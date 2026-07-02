import type { DesignTemplatePack } from '@dudesign/contracts'

/**
 * 模板包预览缩略图:官方包 previewArtifactId 为 null,
 * 用 designTokens(色板 + 字体)生成预览;非空时由卡片层显示徽标。
 */
export function TemplateThumbnail(props: {
  pack: DesignTemplatePack
  size?: 'sm' | 'lg'
}): React.JSX.Element {
  const colors = Object.values(props.pack.designTokens.colors).slice(0, 6)
  const display = props.pack.designTokens.typography.display
  const body = props.pack.designTokens.typography.body
  const size = props.size ?? 'sm'
  const sampleStyle = display
    ? {
        fontFamily: display.fontFamily,
        fontWeight: display.fontWeight as React.CSSProperties['fontWeight'],
      }
    : undefined
  const bodyFont = body?.fontFamily ? body.fontFamily.split(',')[0] : null

  return (
    <div className={`tpl-thumb tpl-thumb-${size}`} aria-hidden="true">
      <div className="tpl-thumb-sample" style={sampleStyle}>
        <span className="big">Aa</span>
        {bodyFont ? <span className="small">{bodyFont}</span> : null}
      </div>
      {colors.length ? (
        <div className="tpl-thumb-strip">
          {colors.map((color, index) => (
            <b key={`${color}-${index}`} style={{ background: color }} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
