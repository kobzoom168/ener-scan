import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LineButton } from '@/components/line-button'
import newsData from '@/data/news.json'
import { getDict, newsItemsEn, type Locale } from '@/lib/i18n'

type NewsItem = {
  id: string
  tag: string
  date: string
  title: string
  summary: string
}

export function NewsPage({ locale }: { locale: Locale }) {
  const t = getDict(locale)

  const items = (newsData as NewsItem[])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((item) =>
      locale === 'en' && newsItemsEn[item.id]
        ? { ...item, ...newsItemsEn[item.id] }
        : item,
    )

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(t.news.dateLocale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

  return (
    <div className="min-h-screen">
      <SiteHeader locale={locale} />
      <main>
        <section className="bg-radial-gold">
          <div className="mx-auto max-w-4xl px-4 pb-8 pt-14 text-center sm:px-6 lg:pt-20">
            <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-medium text-gold-soft">
              {t.news.eyebrow}
            </span>
            <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t.news.h1a}{' '}
              <span className="text-gradient-gold">Ener Scan</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              {t.news.desc}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          <ul className="grid gap-5">
            {items.map((item) => (
              <li key={item.id}>
                <article className="rounded-2xl border border-border bg-card/60 p-6 transition-colors hover:border-gold/40 hover:bg-card sm:p-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-0.5 text-xs font-semibold text-gold-soft">
                      {item.tag}
                    </span>
                    <time
                      dateTime={item.date}
                      className="text-sm text-muted-foreground"
                    >
                      {formatDate(item.date)}
                    </time>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-balance">
                    {item.title}
                  </h2>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {item.summary}
                  </p>
                </article>
              </li>
            ))}
          </ul>

          <div className="mt-12 rounded-2xl border border-line/40 bg-line/10 p-8 text-center">
            <h2 className="text-balance text-xl font-bold">{t.news.ctaH2}</h2>
            <p className="mx-auto mt-2 max-w-md text-pretty leading-relaxed text-muted-foreground">
              {t.news.ctaDesc}
            </p>
            <div className="mt-5 flex justify-center">
              <LineButton>{t.news.ctaBtn}</LineButton>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </div>
  )
}
