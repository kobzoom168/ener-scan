import {
  UserPlus,
  ImageUp,
  MessageCircleMore,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'

const steps = [
  {
    icon: UserPlus,
    title: 'แอดเพื่อน LINE',
    desc: 'สแกน QR หรือกดปุ่มแอดเพื่อนเพื่อเริ่มต้น',
  },
  {
    icon: ImageUp,
    title: 'ส่งรูปวัตถุชัด ๆ',
    desc: 'ถ่ายให้ชัด วัตถุละ 1 รูป เพื่อผลที่แม่นยำ',
  },
  {
    icon: MessageCircleMore,
    title: 'รับสรุปในแชต',
    desc: 'รับสรุปผลเบื้องต้นในแชต พร้อมรายงานฉบับเต็ม',
  },
]

export function HowToStart() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="text-center">
        <span className="eyebrow">How It Works</span>
        <h2 className="mt-4 text-balance text-2xl font-bold sm:text-3xl">
          เริ่มยังไง
        </h2>
        <p className="mt-3 text-muted-foreground">ง่าย ๆ เพียง 3 ขั้นตอน</p>
      </div>

      <div className="mt-12 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        {steps.map(({ icon: Icon, title, desc }, i) => (
          <div key={title} className="contents">
            <div className="border-gold-hairline surface-premium lift relative flex-1 rounded-2xl p-6">
              <span className="absolute right-5 top-4 font-mono text-4xl font-bold text-gold/20">
                0{i + 1}
              </span>
              <span className="flex size-12 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30">
                <Icon className="size-6 text-gold" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>

            {i < steps.length - 1 && (
              <div
                className="flex shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                <span className="flex size-14 items-center justify-center rounded-full border border-line/40 bg-line/15 text-line shadow-[0_0_28px_-4px_rgba(6,199,85,0.55)] sm:size-12">
                  <ChevronRight className="hidden size-7 sm:block" />
                  <ChevronDown className="size-8 sm:hidden" />
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
