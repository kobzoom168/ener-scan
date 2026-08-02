import type { Metadata } from 'next'
import { NewsPage } from '@/components/news-page'

export const metadata: Metadata = {
  title: 'ข่าวสาร',
  description:
    'ข่าวสารและประกาศจาก Ener Scan บริการรับอ่านพลังงานวัตถุและรับฝากขายพระเครื่อง',
  alternates: {
    canonical: '/news/',
    languages: { th: '/news/', en: '/en/news/' },
  },
}

export default function Page() {
  return <NewsPage locale="th" />
}
