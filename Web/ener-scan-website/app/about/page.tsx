import type { Metadata } from 'next'
import { AboutContent } from '@/components/about-content'

export const metadata: Metadata = {
  title: 'เกี่ยวกับเรา',
  description:
    'ข้อมูลธุรกิจ Ener Scan เจ้าของกิจการ ที่อยู่ ช่องทางติดต่อ บริการอ่านพลังงานวัตถุ รับฝากขายพระเครื่อง และจำหน่ายวัตถุมงคลไทย',
  alternates: {
    canonical: '/about/',
    languages: { th: '/about/', en: '/en/about/' },
  },
}

export default function Page() {
  return <AboutContent locale="th" />
}
