import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DUDesign',
  description: 'Hosted AI front-end design workspace',
}

export default function RootLayout(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  )
}

