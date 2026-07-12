import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Hero } from '@/components/home/hero'
import { ScanCategories } from '@/components/home/scan-categories'
import { Pricing } from '@/components/home/pricing'
import { Consignment } from '@/components/home/consignment'
import { HowToStart } from '@/components/home/how-to-start'
import { QrSection } from '@/components/home/qr-section'

export default function Page() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <ScanCategories />
        <Pricing />
        <HowToStart />
        <Consignment />
        <QrSection />
      </main>
      <SiteFooter />
    </div>
  )
}
