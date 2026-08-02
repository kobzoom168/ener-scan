import Image from 'next/image'
import { LineButton } from '@/components/line-button'
import { getDict, type Locale } from '@/lib/i18n'

export function QrSection({ locale = 'th' }: { locale?: Locale }) {
  const t = getDict(locale).qr

  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6">
      <div className="border-gold-hairline grain relative overflow-hidden rounded-3xl bg-gradient-to-br from-line/15 via-card to-card p-8 sm:p-10">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line/40 bg-line/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-line">
              Add LINE
            </span>
            <h2 className="mt-4 text-balance text-2xl font-bold sm:text-3xl">
              {t.h2}
            </h2>
            <p className="mt-3 max-w-md text-pretty leading-relaxed text-muted-foreground">
              {t.desc}
            </p>
            <div className="mt-6">
              <LineButton>{t.cta}</LineButton>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <div className="rounded-3xl bg-white p-5 shadow-2xl shadow-line/20 ring-1 ring-line/30">
              <Image
                src="/images/line-qr.png"
                alt={t.qrAlt}
                width={224}
                height={224}
                className="size-48 sm:size-56"
              />
              <p className="mt-2 text-center text-xs font-semibold uppercase tracking-widest text-line">
                Scan to add
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
