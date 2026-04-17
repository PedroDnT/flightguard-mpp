import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FlightGuard MPP - Parametric Flight Delay Insurance',
  description: 'Automated flight delay insurance on the Tempo blockchain',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
