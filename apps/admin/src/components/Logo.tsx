import type { CSSProperties } from 'react'

type LogoProps = {
  size?: number
  className?: string
  title?: string
  style?: CSSProperties
}

/**
 * DUDesign 品牌标。直接引用 /public/logo.png(Studio Light 版品牌图)。
 */
export function Logo({ size = 32, className, title = 'DUDesign', style }: LogoProps): React.JSX.Element {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt={title}
      className={className}
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      draggable={false}
    />
  )
}
