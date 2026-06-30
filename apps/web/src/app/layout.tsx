import type { Metadata } from 'next'
import { LanguageProvider } from '@/components/LanguageProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'DUDesign',
  description: 'Hosted AI front-end design workspace',
}

export default function RootLayout(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{props.children}</LanguageProvider>
      </body>
    </html>
  )
}
