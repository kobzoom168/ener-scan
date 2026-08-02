import type { Metadata } from 'next'
import { HomePage } from '@/components/home-page'

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    languages: { th: '/', en: '/en/' },
  },
}

export default function Page() {
  return <HomePage locale="th" />
}
