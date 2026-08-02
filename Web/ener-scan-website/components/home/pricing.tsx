import { Sparkles, Gift, CreditCard } from 'lucide-react'
import { LineButton } from '@/components/line-button'
import { getDict, type Locale } from '@/lib/i18n'

export function Pricing({ locale = 'th' }: { locale?: Locale }) {
  const t = getDict(locale).pricing

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="text-center">
        <span className="eyebrow">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Pricing
        </span>
        <h2 className="mt-4 text-balance text-2xl font-bold sm:text-3xl">
          {t.h2}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
          {t.desc}
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <article className="border-gold-hairline surface-premium lift rounded-2xl p-6 sm:p-7">
          <span className="flex size-12 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30">
            <Gift className="size-6 text-gold" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-bold">{t.freeTitle}</h3>
          <p className="mt-2 text-3xl font-extrabold text-gradient-gold">
            {t.freePrice}
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            {t.freeDesc}
          </p>
        </article>

        <article className="border-gold-hairline surface-premium lift rounded-2xl p-6 sm:p-7">
          <span className="flex size-12 items-center justify-center rounded-xl bg-line/15 ring-1 ring-line/30">
            <CreditCard className="size-6 text-line" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-bold">{t.paidTitle}</h3>
          <p className="mt-2 text-3xl font-extrabold text-gradient-gold">
            {t.paidPrice}
          </p>
          <p className="mt-1 text-sm font-semibold text-gold-soft">
            {t.paidSub}
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            {t.paidDesc}
          </p>
        </article>
      </div>

      <div className="mt-8 flex justify-center">
        <LineButton>{t.cta}</LineButton>
      </div>
    </section>
  )
}
