import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LineButton } from '@/components/line-button'
import newsData from '@/data/news.json'

export const metadata: Metadata = {
  title: 'ข่าวสาร',
  description:
    'ข่าวสารและประกาศจาก Ener Scan บริการรับอ่านพลังงานวัตถุและรับฝากขายพระเครื่อง',
}

type NewsItem = {
  id: string
  tag: string
  date: string
  title: string
  summary: string
}

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function NewsPage() {
  const items = (newsData as NewsItem[])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="bg-radial-gold">
          <div className="mx-auto max-w-4xl px-4 pb-8 pt-14 text-center sm:px-6 lg:pt-20">
            <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-medium text-gold-soft">
              ข่าวสาร
            </span>
            <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              ข่าวสารและประกาศจาก{' '}
              <span className="text-gradient-gold">Ener Scan</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              อัปเดตบริการ คู่มือการใช้งาน และโปรโมชันต่าง ๆ ของเรา
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
                      {formatThaiDate(item.date)}
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
            <h2 className="text-balance text-xl font-bold">
              พร้อมลองสแกนแล้วหรือยัง?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-pretty leading-relaxed text-muted-foreground">
              แอดเพื่อน LINE เพื่อเริ่มอ่านพลังงานวัตถุของคุณได้ทันที
            </p>
            <div className="mt-5 flex justify-center">
              <LineButton>แอดเพื่อน เริ่มสแกน</LineButton>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
