import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Sarabun, Geist_Mono } from 'next/font/google'
import './globals.css'

const sarabun = Sarabun({
  variable: '--font-sarabun',
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://my-ener.uk'),
  title: {
    default: 'Ener Scan · รับอ่านพลังงานวัตถุเฉพาะบุคคล ผ่าน LINE',
    template: '%s · Ener Scan',
  },
  description:
    'Ener Scan ระบบวิเคราะห์พลังงานวัตถุแบบเฉพาะบุคคล สแกนฟรีวันละ 2 ครั้ง แพ็ก 49 บาท (4 ครั้ง/24 ชม.) รับอ่านพระเครื่อง เครื่องราง หิน/คริสตัล พร้อมสรุปผลในแชต LINE',
  keywords: [
    'Ener Scan',
    'อ่านพลังงาน',
    'พระเครื่อง',
    'เครื่องราง',
    'หินมงคล',
    'คริสตัล',
    'รับฝากขายพระ',
    'พลังงานวัตถุ',
  ],
  generator: 'v0.app',
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    url: 'https://my-ener.uk',
    siteName: 'Ener Scan',
    title: 'Ener Scan · รับอ่านพลังงานวัตถุเฉพาะบุคคล ผ่าน LINE',
    description:
      'สงสัยไหมว่าวัตถุชิ้นนี้เหมาะกับคุณแค่ไหน ลองสแกนกับ Ener Scan รับอ่านพระเครื่อง เครื่องราง หิน/คริสตัล พร้อมสรุปผลในแชต LINE',
    images: [
      {
        url: '/images/ener-scan-poster.jpg',
        width: 1080,
        height: 1527,
        alt: 'Ener Scan ระบบวิเคราะห์พลังงานวัตถุ',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ener Scan · รับอ่านพลังงานวัตถุเฉพาะบุคคล',
    description:
      'ระบบวิเคราะห์พลังงานวัตถุแบบเฉพาะบุคคล พร้อมสรุปผลในแชต LINE',
    images: ['/images/ener-scan-poster.jpg'],
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0f0b06',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="th"
      className={`${sarabun.variable} ${geistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
