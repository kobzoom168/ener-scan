import type { Metadata } from 'next'
import { AboutContent } from '@/components/about-content'

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Ener Scan business information, including owner, address, and contact details. Energy reading for Thai amulets, amulet consignment, and Thai sacred objects for collectors.',
  alternates: {
    canonical: '/en/about/',
    languages: { th: '/about/', en: '/en/about/' },
  },
}

export default function Page() {
  return <AboutContent locale="en" />
}
