import type { Metadata } from 'next'
import { HomePage } from '@/components/home-page'

export const metadata: Metadata = {
  title: 'Ener Scan · Personalized Energy Reading for Thai Amulets via LINE',
  description:
    'Personalized energy analysis for Thai amulets, charms, and stones/crystals with instant summaries in LINE chat, plus Thai amulet consignment and sales for collectors worldwide.',
  alternates: {
    canonical: '/en/',
    languages: { th: '/', en: '/en/' },
  },
  openGraph: {
    locale: 'en_US',
    title: 'Ener Scan · Personalized Energy Reading for Thai Amulets',
    description:
      'Wondering how well this sacred object matches you? Try a scan with Ener Scan. Thai amulets, charms, stones/crystals, with results in LINE chat.',
  },
}

export default function Page() {
  return <HomePage locale="en" />
}
