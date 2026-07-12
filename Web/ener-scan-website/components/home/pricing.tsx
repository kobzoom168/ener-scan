import { Sparkles, Gift, CreditCard } from 'lucide-react'
import { LineButton } from '@/components/line-button'
import { siteConfig } from '@/lib/site'

const { freePerDay, paidPriceThb, paidScanCount, paidWindowHours } =
  siteConfig.pricing

export function Pricing() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="text-center">
        <span className="eyebrow">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Pricing
        </span>
        <h2 className="mt-4 text-balance text-2xl font-bold sm:text-3xl">
          สแกนฟรีวันละ {freePerDay} ครั้ง
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
          ลองใช้งานได้ทุกวันโดยไม่เสียค่าใช้จ่าย เกินโควตาฟรีแล้วชำระผ่าน PromptPay ในแชต LINE ได้ทันที
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <article className="border-gold-hairline surface-premium lift rounded-2xl p-6 sm:p-7">
          <span className="flex size-12 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30">
            <Gift className="size-6 text-gold" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-bold">ฟรีทุกวัน</h3>
          <p className="mt-2 text-3xl font-extrabold text-gradient-gold">
            {freePerDay} ครั้ง / วัน
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            สแกนพระเครื่อง เครื่องราง หรือหิน/คริสตัลได้ฟรีวันละ {freePerDay} ครั้ง
            รีเซ็ตทุกวันตามเวลาท้องถิ่น
          </p>
        </article>

        <article className="border-gold-hairline surface-premium lift rounded-2xl p-6 sm:p-7">
          <span className="flex size-12 items-center justify-center rounded-xl bg-line/15 ring-1 ring-line/30">
            <CreditCard className="size-6 text-line" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-bold">เกินโควตาฟรี</h3>
          <p className="mt-2 text-3xl font-extrabold text-gradient-gold">
            {paidPriceThb} บาท
          </p>
          <p className="mt-1 text-sm font-semibold text-gold-soft">
            {paidScanCount} ครั้ง / {paidWindowHours} ชม.
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            ต้องการสแกนเพิ่ม แพ็ก {paidPriceThb} บาท ใช้ได้ {paidScanCount} ครั้งภายใน{' '}
            {paidWindowHours} ชั่วโมง ชำระผ่าน PromptPay และส่งสลิปใน LINE
          </p>
        </article>
      </div>

      <div className="mt-8 flex justify-center">
        <LineButton>แอดเพื่อน เริ่มสแกนฟรี</LineButton>
      </div>
    </section>
  )
}
