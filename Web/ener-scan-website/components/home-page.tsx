import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Hero } from '@/components/home/hero'
import { ScanCategories } from '@/components/home/scan-categories'
import { Pricing } from '@/components/home/pricing'
import { Consignment } from '@/components/home/consignment'
import { HowToStart } from '@/components/home/how-to-start'
import { QrSection } from '@/components/home/qr-section'
import type { Locale } from '@/lib/i18n'

export function HomePage({ locale }: { locale: Locale }) {
  return (
    <div className="min-h-screen">
      <SiteHeader locale={locale} />
      <main>
        <Hero locale={locale} />
        <ScanCategories locale={locale} />
        <Pricing locale={locale} />
        <HowToStart locale={locale} />
        <Consignment locale={locale} />
        <QrSection locale={locale} />
      </main>
      <SiteFooter locale={locale} />
    </div>
  )
}
