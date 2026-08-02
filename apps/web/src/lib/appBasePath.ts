/**
 * 应用部署子路径（如 /dudesign）。
 * Next.js basePath 会自动给 Link/router/静态资源加前缀，但 window.location
 * 与原生 <a href> 不会——所有手动导航必须经过 withAppBase。
 */
export const appBasePath: string = (process.env.NEXT_PUBLIC_DUDESIGN_WEB_BASE_PATH ?? '').replace(/\/+$/, '')

export function withAppBase(path: string): string {
  if (!appBasePath) return path
  return `${appBasePath}${path.startsWith('/') ? path : `/${path}`}`
}
