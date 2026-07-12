import { ShieldCheck, Gem, Sparkle } from 'lucide-react'

const categories = [
  {
    icon: ShieldCheck,
    title: 'พระเครื่อง',
    desc: 'วิเคราะห์พลังคุ้มครอง เมตตา และบารมี พร้อมบริการรับฝากขายพระเครื่อง',
  },
  {
    icon: Sparkle,
    title: 'เครื่องราง',
    desc: 'อ่านพลังเด่นและจังหวะการใช้ ให้เหมาะกับเป้าหมายของคุณ',
  },
  {
    icon: Gem,
    title: 'หิน / คริสตัล',
    desc: 'ประเมินความเหมาะกับดวงและจุดประสงค์ที่ต้องการเสริม',
  },
]

export function ScanCategories() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="text-center">
        <span className="eyebrow">Scan Categories</span>
        <h2 className="mt-4 text-balance text-2xl font-bold sm:text-3xl">
          สแกนได้ทั้ง
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
          ส่งรูปวัตถุมงคลของคุณ แล้วรับผลวิเคราะห์พลังงานที่เหมาะกับคุณโดยเฉพาะ
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(({ icon: Icon, title, desc }) => (
          <article
            key={title}
            className="border-gold-hairline surface-premium lift group rounded-2xl p-6"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30 transition-transform duration-300 group-hover:scale-105">
              <Icon className="size-6 text-gold" aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-bold">{title}</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">{desc}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
