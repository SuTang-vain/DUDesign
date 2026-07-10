import type { Metadata } from 'next'
import { LanguageProvider } from '@/components/LanguageProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'DUDesign',
  description: 'Hosted AI front-end design workspace',
}

const themeInitScript = `
(() => {
  try {
    const key = 'dudesign.theme';
    const stored = window.localStorage.getItem(key);
    const theme = stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch {
    document.documentElement.removeAttribute('data-theme');
  }
})();
`

export default function RootLayout(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <LanguageProvider>{props.children}</LanguageProvider>
      </body>
    </html>
  )
}
