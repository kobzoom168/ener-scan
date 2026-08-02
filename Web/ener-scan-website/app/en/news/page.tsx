import type { Metadata } from 'next'
import { NewsPage } from '@/components/news-page'

export const metadata: Metadata = {
  title: 'News',
  description:
    'News and announcements from Ener Scan, covering object energy reading and Thai amulet consignment.',
  alternates: {
    canonical: '/en/news/',
    languages: { th: '/news/', en: '/en/news/' },
  },
}

export default function Page() {
  return <NewsPage locale="en" />
}
