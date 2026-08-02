import { FileText, Sparkles, ScanLine, MessageCircle, BadgeCheck } from 'lucide-react'
import { LineButton } from '@/components/line-button'
import { HeroVideo } from '@/components/home/hero-video'
import { siteConfig } from '@/lib/site'
import { getDict, type Locale } from '@/lib/i18n'

const trustIcons = [ScanLine, MessageCircle, BadgeCheck]

export function Hero({ locale = 'th' }: { locale?: Locale }) {
  const t = getDict(locale).hero
  const tc = getDict(locale).common

  return (
    <section className="grain relative overflow-hidden bg-radial-gold">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:pb-24 lg:pt-20">
        <div className="text-center lg:text-left">
          <span
            className="eyebrow animate-rise"
            style={{ animationDelay: '0.05s' }}
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            Energy Analysis
          </span>

          <h1
            className="animate-rise mt-5 text-balance text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-4xl lg:text-[3.25rem]"
            style={{ animationDelay: '0.18s' }}
          >
            {t.h1a}
            <br className="hidden sm:block" /> {t.h1b}
            <span className="text-gold-shimmer">{t.h1c}</span>
          </h1>

          <p
            className="animate-rise mt-4 text-xl font-semibold sm:text-2xl"
            style={{ animationDelay: '0.32s' }}
          >
            {t.sub1} <span className="text-gold-shimmer">Ener Scan</span>
          </p>

          <p
            className="animate-rise mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground lg:mx-0"
            style={{ animationDelay: '0.46s' }}
          >
            {t.desc}
          </p>

          <div
            className="animate-rise mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
            style={{ animationDelay: '0.6s' }}
          >
            <LineButton>{t.ctaAdd}</LineButton>
            <a
              href={siteConfig.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border/70 px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground"
            >
              <FileText className="size-4 text-gold/80" aria-hidden="true" />
              {t.ctaReport}
            </a>
          </div>

          <ul
            className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start"
            style={{ animationDelay: '0.74s' }}
          >
            {t.trust.map((label, i) => {
              const Icon = trustIcons[i]
              return (
                <li
                  key={label}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground"
                >
                  <Icon className="size-4 text-gold" aria-hidden="true" />
                  {label}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] opacity-70 blur-2xl"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 35%, oklch(0.55 0.13 72 / 55%), transparent 70%)',
            }}
            aria-hidden="true"
          />
          <div className="border-gold-hairline overflow-hidden rounded-3xl ring-gold-glow">
            <HeroVideo
              ariaLabel={t.videoAria}
              playLabel={tc.playVideo}
              pauseLabel={tc.pauseVideo}
            />
          </div>

          <div className="border-gold-hairline absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-card/90 px-4 py-2.5 backdrop-blur-md lg:left-auto lg:right-6 lg:translate-x-0">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/30">
              <BadgeCheck className="size-4 text-gold" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold">
              {t.floatTitle}
              <span className="block text-xs font-normal text-muted-foreground">
                {t.floatSub}
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="divider-gold mx-auto max-w-6xl" />
    </section>
  )
}
