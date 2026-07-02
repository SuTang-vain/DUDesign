import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { LanguageProvider } from '@/components/LanguageProvider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'DUDesign',
  description: 'Hosted AI front-end design workspace',
}

export default function RootLayout(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <LanguageProvider>{props.children}</LanguageProvider>
      </body>
    </html>
  )
}
