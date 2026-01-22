import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Adsterra Bot Management',
  description: 'Manage Adsterra bot runs and traffic generation',
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

