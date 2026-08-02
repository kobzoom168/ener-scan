import type { Metadata } from 'next'
import Image from 'next/image'
import { MapPin, Phone, Mail, Globe, User, ScanLine, Store } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LineButton } from '@/components/line-button'
import { siteConfig } from '@/lib/site'

export const metadata: Metadata = {
  title: 'เกี่ยวกับเรา · About Us',
  description:
    'ข้อมูลธุรกิจ Ener Scan — เจ้าของกิจการ ที่อยู่ ช่องทางติดต่อ | Ener Scan business information — owner, address, and contact details.',
}

const contact = {
  ownerEn: 'Tanarit Apichokjirasin',
  roleTh: 'เจ้าของกิจการ',
  roleEn: 'Business Owner',
  addressTh:
    '42/281 หมู่บ้านอีโค่เฮ้าส์ ต.บึงคำพร้อย อ.ลำลูกกา จ.ปทุมธานี 12150 ประเทศไทย',
  addressEn:
    '42/281 Eco-House Village, Bueng Kham Phroi, Lam Luk Ka, Pathum Thani 12150, Thailand',
  phone: '+66 93 666 4405',
  email: 'tanarit.ap@gmail.com',
}

const services = [
  {
    th: 'รับอ่านพลังงานวัตถุเฉพาะบุคคล (พระเครื่อง เครื่องราง หิน/คริสตัล) ผ่าน LINE',
    en: 'Personalized energy reading for Thai amulets, charms, and crystals via LINE chat',
  },
  {
    th: 'บริการรับฝากขายพระเครื่องและวัตถุมงคล',
    en: 'Consignment service for Thai amulets and sacred objects',
  },
  {
    th: 'จำหน่ายพระเครื่องและวัตถุมงคลไทยสำหรับนักสะสมทั้งในและต่างประเทศ (ผ่านแพลตฟอร์มออนไลน์ เช่น eBay)',
    en: 'Selling Thai amulets and collectible sacred objects to local and international collectors (via online marketplaces such as eBay)',
  },
]

function InfoRow({
  icon,
  labelTh,
  labelEn,
  children,
}: {
  icon: React.ReactNode
  labelTh: string
  labelEn: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/30">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-gold-soft">
          {labelTh} · {labelEn}
        </p>
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="bg-radial-gold">
          <div className="mx-auto max-w-4xl px-4 pb-8 pt-14 text-center sm:px-6 lg:pt-20">
            <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-medium text-gold-soft">
              เกี่ยวกับเรา · About Us
            </span>
            <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              รู้จัก <span className="text-gradient-gold">Ener Scan</span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              ระบบวิเคราะห์พลังงานวัตถุแบบเฉพาะบุคคล และบริการเกี่ยวกับพระเครื่อง
              วัตถุมงคลไทย
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
              Ener Scan is a personalized object-energy analysis service and a
              Thai amulet business based in Pathum Thani, Thailand.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Owner */}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <User className="size-5 text-gold" aria-hidden="true" />
                เจ้าของกิจการ · Owner
              </h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-gold/20">
                <Image
                  src="/images/tanarit-owner.jpg"
                  alt="Tanarit Apichokjirasin — เจ้าของกิจการ Ener Scan กับตู้พระเครื่อง"
                  width={1000}
                  height={563}
                  className="h-auto w-full object-cover"
                />
              </div>
              <div className="mt-4 space-y-1">
                <p className="text-xl font-bold text-gradient-gold">
                  {contact.ownerEn}
                </p>
                <p className="text-sm text-muted-foreground">
                  {contact.roleTh} Ener Scan · {contact.roleEn}, Ener Scan
                </p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                ดำเนินธุรกิจอ่านพลังงานวัตถุและพระเครื่องวัตถุมงคลไทย
                ให้บริการลูกค้าทั้งในประเทศและต่างประเทศ
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Operating an energy-reading and Thai amulet business, serving
                customers in Thailand and worldwide.
              </p>
            </div>

            {/* Contact */}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Phone className="size-5 text-gold" aria-hidden="true" />
                ติดต่อเรา · Contact
              </h2>
              <div className="mt-4 space-y-4">
                <InfoRow
                  icon={<MapPin className="size-4 text-gold" aria-hidden="true" />}
                  labelTh="ที่อยู่"
                  labelEn="Address"
                >
                  <p>{contact.addressTh}</p>
                  <p className="mt-1">{contact.addressEn}</p>
                </InfoRow>
                <InfoRow
                  icon={<Phone className="size-4 text-gold" aria-hidden="true" />}
                  labelTh="โทรศัพท์"
                  labelEn="Phone"
                >
                  <a
                    href={`tel:${contact.phone.replace(/\s/g, '')}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {contact.phone}
                  </a>
                </InfoRow>
                <InfoRow
                  icon={<Mail className="size-4 text-gold" aria-hidden="true" />}
                  labelTh="อีเมล"
                  labelEn="Email"
                >
                  <a
                    href={`mailto:${contact.email}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {contact.email}
                  </a>
                </InfoRow>
                <InfoRow
                  icon={<Globe className="size-4 text-gold" aria-hidden="true" />}
                  labelTh="เว็บไซต์"
                  labelEn="Website"
                >
                  <p>
                    my-ener.uk ·{' '}
                    <a
                      href={siteConfig.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-foreground"
                    >
                      scan.my-ener.uk
                    </a>
                  </p>
                </InfoRow>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Store className="size-5 text-gold" aria-hidden="true" />
              บริการของเรา · Our Services
            </h2>
            <ul className="mt-4 space-y-4">
              {services.map((s) => (
                <li key={s.en} className="flex items-start gap-3.5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/30">
                    <ScanLine className="size-4 text-gold" aria-hidden="true" />
                  </span>
                  <div className="text-sm leading-relaxed">
                    <p>{s.th}</p>
                    <p className="mt-0.5 text-muted-foreground">{s.en}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Disclaimer */}
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            ผลการวิเคราะห์พลังงานเป็นความเชื่อส่วนบุคคล
            โปรดใช้วิจารณญาณในการรับบริการ · Energy readings are based on
            traditional beliefs and are provided for entertainment and
            collectible purposes.
          </p>

          <div className="mt-8 flex justify-center">
            <LineButton>แอดเพื่อน เริ่มสแกน · Add us on LINE</LineButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
