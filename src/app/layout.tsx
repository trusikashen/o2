import type { Metadata } from 'next'
import './globals.css'
import { ProtectedLayout } from '@/components/ProtectedLayout'

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
      <body>
        <ProtectedLayout>
          {children}
        </ProtectedLayout>
      </body>
    </html>
  )
}

