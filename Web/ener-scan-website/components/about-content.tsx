import Image from 'next/image'
import { MapPin, Phone, Mail, Globe, User, ScanLine, Store } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LineButton } from '@/components/line-button'
import { siteConfig } from '@/lib/site'
import { getDict, type Locale } from '@/lib/i18n'

export const aboutContact = {
  ownerEn: 'Tanarit Apichokjirasin',
  phone: '+66 93 666 4405',
  email: 'tanarit.ap@gmail.com',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Ener Scan',
  url: 'https://my-ener.uk',
  image: 'https://my-ener.uk/images/tanarit-owner.jpg',
  description:
    'Personalized energy reading for Thai amulets, charms, and crystals via LINE chat, plus Thai amulet consignment and sales for collectors worldwide.',
  founder: {
    '@type': 'Person',
    name: 'Tanarit Apichokjirasin',
  },
  telephone: '+66936664405',
  email: 'tanarit.ap@gmail.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '42/281 Eco-House Village, Bueng Kham Phroi',
    addressLocality: 'Lam Luk Ka',
    addressRegion: 'Pathum Thani',
    postalCode: '12150',
    addressCountry: 'TH',
  },
  sameAs: ['https://scan.my-ener.uk/', siteConfig.lineUrl],
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/20 ring-1 ring-gold/50">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-gold-soft">{label}</p>
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  )
}

export function AboutContent({ locale }: { locale: Locale }) {
  const t = getDict(locale).about
  const tc = getDict(locale).common

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader locale={locale} />
      <main id="main">
        <section className="bg-radial-gold">
          <div className="mx-auto max-w-4xl px-4 pb-8 pt-14 text-center sm:px-6 lg:pt-20">
            <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-medium text-gold-soft">
              {t.eyebrow}
            </span>
            <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t.h1a} <span className="text-gradient-gold">Ener Scan</span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              {t.heroDesc}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Owner */}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <User className="size-5 text-gold" aria-hidden="true" />
                {t.ownerH2}
              </h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-gold/20">
                <Image
                  src="/images/tanarit-owner.jpg"
                  alt={t.ownerPhotoAlt}
                  width={1000}
                  height={563}
                  className="h-auto w-full object-cover"
                />
              </div>
              <div className="mt-4 space-y-1">
                <p className="text-xl font-bold text-gradient-gold">
                  {aboutContact.ownerEn}
                </p>
                <p className="text-sm text-muted-foreground">{t.ownerRole}</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {t.ownerDesc}
              </p>
            </div>

            {/* Contact */}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Phone className="size-5 text-gold" aria-hidden="true" />
                {t.contactH2}
              </h2>
              <div className="mt-4 space-y-4">
                <InfoRow
                  icon={<MapPin className="size-4 text-gold" aria-hidden="true" />}
                  label={t.addressLabel}
                >
                  <p>{t.address}</p>
                </InfoRow>
                <InfoRow
                  icon={<Phone className="size-4 text-gold" aria-hidden="true" />}
                  label={t.phoneLabel}
                >
                  <a
                    href={`tel:${aboutContact.phone.replace(/\s/g, '')}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {aboutContact.phone}
                  </a>
                </InfoRow>
                <InfoRow
                  icon={<Mail className="size-4 text-gold" aria-hidden="true" />}
                  label={t.emailLabel}
                >
                  <a
                    href={`mailto:${aboutContact.email}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {aboutContact.email}
                  </a>
                </InfoRow>
                <InfoRow
                  icon={<Globe className="size-4 text-gold" aria-hidden="true" />}
                  label={t.websiteLabel}
                >
                  <p>
                    <a
                      href="https://my-ener.uk/"
                      className="transition-colors hover:text-foreground"
                    >
                      my-ener.uk
                    </a>{' '}
                    ·{' '}
                    <a
                      href={siteConfig.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-foreground"
                    >
                      scan.my-ener.uk
                    </a>
                  </p>
                </InfoRow>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Store className="size-5 text-gold" aria-hidden="true" />
              {t.servicesH2}
            </h2>
            <ul className="mt-4 space-y-4">
              {t.services.map((s) => (
                <li key={s} className="flex items-start gap-3.5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/20 ring-1 ring-gold/50">
                    <ScanLine className="size-4 text-gold" aria-hidden="true" />
                  </span>
                  <p className="text-sm leading-relaxed">{s}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {tc.trustLine}
          </p>
          <div className="mt-3 flex justify-center">
            <LineButton>{t.cta}</LineButton>
          </div>

          {/* Disclaimer — อยู่ใต้ CTA ไม่ขวางจังหวะตัดสินใจ */}
          <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
            {t.disclaimer}
          </p>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </div>
  )
}
