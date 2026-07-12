import { FileText, Sparkles, ScanLine, MessageCircle, BadgeCheck } from 'lucide-react'
import { LineButton } from '@/components/line-button'
import { HeroVideo } from '@/components/home/hero-video'
import { siteConfig } from '@/lib/site'

const trust = [
  { icon: ScanLine, label: 'วิเคราะห์เฉพาะบุคคล' },
  { icon: MessageCircle, label: 'สรุปผลในแชต LINE' },
  { icon: BadgeCheck, label: `สแกนฟรีวันละ ${siteConfig.pricing.freePerDay} ครั้ง` },
]

export function Hero() {
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
            สงสัยไหมว่า วัตถุชิ้นนี้
            <br className="hidden sm:block" /> เหมาะกับ
            <span className="text-gold-shimmer"> คุณแค่ไหน</span>
          </h1>

          <p
            className="animate-rise mt-4 text-xl font-semibold sm:text-2xl"
            style={{ animationDelay: '0.32s' }}
          >
            ลองสแกนกับ <span className="text-gold-shimmer">Ener Scan</span>
          </p>

          <p
            className="animate-rise mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground lg:mx-0"
            style={{ animationDelay: '0.46s' }}
          >
            ระบบวิเคราะห์พลังงานวัตถุแบบเฉพาะบุคคล พร้อมสรุปผลเบื้องต้นในแชต LINE
            รับอ่านพระเครื่อง เครื่องราง หิน/คริสตัล และบริการรับฝากขายพระเครื่อง
          </p>

          <div
            className="animate-rise mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
            style={{ animationDelay: '0.6s' }}
          >
            <LineButton>แอดเพื่อน เริ่มสแกน</LineButton>
            <LineButton variant="outline" href={siteConfig.reportUrl}>
              <FileText className="size-5 text-gold" aria-hidden="true" />
              ดูตัวอย่างรายงาน
            </LineButton>
          </div>

          <ul
            className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start"
            style={{ animationDelay: '0.74s' }}
          >
            {trust.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Icon className="size-4 text-gold" aria-hidden="true" />
                {label}
              </li>
            ))}
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
            <HeroVideo />
          </div>

          <div className="border-gold-hairline absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-card/90 px-4 py-2.5 backdrop-blur-md lg:left-auto lg:right-6 lg:translate-x-0">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/30">
              <BadgeCheck className="size-4 text-gold" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold">
              รายงานพร้อมกราฟพลัง
              <span className="block text-xs font-normal text-muted-foreground">
                Ener Scan Report
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="divider-gold mx-auto max-w-6xl" />
    </section>
  )
}
