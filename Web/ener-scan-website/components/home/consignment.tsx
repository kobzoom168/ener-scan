import { Camera, Handshake, Megaphone } from 'lucide-react'
import { LineButton } from '@/components/line-button'

const steps = [
  {
    icon: Camera,
    title: 'ส่งรูปใน LINE',
    desc: 'ถ่ายรูปพระที่อยากปล่อยให้ชัด แล้วทักมาที่ LINE',
  },
  {
    icon: Handshake,
    title: 'ประเมินและตกลงเงื่อนไข',
    desc: 'ทีมงานประเมินและแจ้งเงื่อนไขการฝากขายให้ทราบ',
  },
  {
    icon: Megaphone,
    title: 'ลงประกาศและแจ้งผล',
    desc: 'ลงประกาศให้ และแจ้งทันทีเมื่อมีผู้สนใจ',
  },
]

export function Consignment() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
      <div className="border-gold-hairline grain relative overflow-hidden rounded-3xl bg-gradient-to-br from-gold/15 via-card to-card p-8 sm:p-10">
        <div className="bg-radial-gold pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <span className="eyebrow">Consignment</span>
          <h2 className="mt-4 text-balance text-2xl font-bold sm:text-3xl">
            มีพระอยากปล่อย? ฝากขายกับ Ener Scan
          </h2>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            ให้เราช่วยดูแลตั้งแต่ประเมิน ลงประกาศ ไปจนถึงหาผู้สนใจ
            เพียงไม่กี่ขั้นตอน
          </p>

          <ol className="mt-8 grid gap-5 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, desc }, i) => (
              <li
                key={title}
                className="border-gold-hairline lift rounded-2xl bg-background/50 p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-gold/15 text-sm font-bold text-gold ring-1 ring-gold/30">
                    {i + 1}
                  </span>
                  <Icon className="size-5 text-gold" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-8">
            <LineButton>สอบถามฝากขายพระ · ทัก LINE</LineButton>
          </div>
        </div>
      </div>
    </section>
  )
}
