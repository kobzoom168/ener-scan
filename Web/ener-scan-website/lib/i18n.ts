import { siteConfig } from '@/lib/site'

export type Locale = 'th' | 'en'

const { freePerDay, paidPriceThb, paidScanCount, paidWindowHours } =
  siteConfig.pricing

export function localePath(locale: Locale, path: string) {
  return locale === 'en' ? `/en${path === '/' ? '' : path}` || '/en' : path
}

export const dict = {
  th: {
    nav: {
      home: 'หน้าแรก',
      news: 'ข่าวสาร',
      about: 'เกี่ยวกับเรา',
      switchLabel: 'EN',
      switchTitle: 'Switch to English',
    },
    badge: 'รับอ่านพลังงาน · รับฝากขายพระ',
    footer: {
      tagline: 'ระบบวิเคราะห์พลังงานวัตถุ',
      ariaLabel: 'ลิงก์ส่วนท้าย',
    },
    hero: {
      h1a: 'สงสัยไหมว่า วัตถุชิ้นนี้',
      h1b: 'เหมาะกับ',
      h1c: ' คุณแค่ไหน',
      sub1: 'ลองสแกนกับ',
      desc: 'ระบบวิเคราะห์พลังงานวัตถุแบบเฉพาะบุคคล พร้อมสรุปผลเบื้องต้นในแชต LINE รับอ่านพระเครื่อง เครื่องราง หิน/คริสตัล และบริการรับฝากขายพระเครื่อง',
      ctaAdd: 'แอดเพื่อน เริ่มสแกน',
      ctaReport: 'ดูตัวอย่างรายงาน',
      trust: [
        'วิเคราะห์เฉพาะบุคคล',
        'สรุปผลในแชต LINE',
        `สแกนฟรีวันละ ${freePerDay} ครั้ง`,
      ],
      floatTitle: 'รายงานพร้อมกราฟพลัง',
      floatSub: 'Ener Scan Report',
      videoAria: 'วิดีโอแนะนำ Ener Scan ระบบวิเคราะห์พลังงานวัตถุ',
    },
    categories: {
      h2: 'สแกนได้ทั้ง',
      desc: 'ส่งรูปวัตถุมงคลของคุณ แล้วรับผลวิเคราะห์พลังงานที่เหมาะกับคุณโดยเฉพาะ',
      items: [
        {
          title: 'พระเครื่อง',
          desc: 'วิเคราะห์พลังคุ้มครอง เมตตา และบารมี พร้อมบริการรับฝากขายพระเครื่อง',
        },
        {
          title: 'เครื่องราง',
          desc: 'อ่านพลังเด่นและจังหวะการใช้ ให้เหมาะกับเป้าหมายของคุณ',
        },
        {
          title: 'หิน / คริสตัล',
          desc: 'ประเมินความเหมาะกับดวงและจุดประสงค์ที่ต้องการเสริม',
        },
      ],
    },
    pricing: {
      h2: `สแกนฟรีวันละ ${freePerDay} ครั้ง`,
      desc: 'ลองใช้งานได้ทุกวันโดยไม่เสียค่าใช้จ่าย เกินโควตาฟรีแล้วชำระผ่าน PromptPay ในแชต LINE ได้ทันที',
      freeTitle: 'ฟรีทุกวัน',
      freePrice: `${freePerDay} ครั้ง / วัน`,
      freeDesc: `สแกนพระเครื่อง เครื่องราง หรือหิน/คริสตัลได้ฟรีวันละ ${freePerDay} ครั้ง รีเซ็ตทุกวันตามเวลาท้องถิ่น`,
      paidTitle: 'เกินโควตาฟรี',
      paidPrice: `${paidPriceThb} บาท`,
      paidSub: `${paidScanCount} ครั้ง / ${paidWindowHours} ชม.`,
      paidDesc: `ต้องการสแกนเพิ่ม แพ็ก ${paidPriceThb} บาท ใช้ได้ ${paidScanCount} ครั้งภายใน ${paidWindowHours} ชั่วโมง ชำระผ่าน PromptPay และส่งสลิปใน LINE`,
      cta: 'แอดเพื่อน เริ่มสแกนฟรี',
    },
    howto: {
      h2: 'เริ่มยังไง',
      desc: 'ง่าย ๆ เพียง 3 ขั้นตอน',
      steps: [
        {
          title: 'แอดเพื่อน LINE',
          desc: 'สแกน QR หรือกดปุ่มแอดเพื่อนเพื่อเริ่มต้น',
        },
        {
          title: 'ส่งรูปวัตถุชัด ๆ',
          desc: 'ถ่ายให้ชัด วัตถุละ 1 รูป เพื่อผลที่แม่นยำ',
        },
        {
          title: 'รับสรุปในแชต',
          desc: 'รับสรุปผลเบื้องต้นในแชต พร้อมรายงานฉบับเต็ม',
        },
      ],
    },
    consignment: {
      h2: 'มีพระอยากปล่อย? ฝากขายกับ Ener Scan',
      desc: 'ให้เราช่วยดูแลตั้งแต่ประเมิน ลงประกาศ ไปจนถึงหาผู้สนใจ เพียงไม่กี่ขั้นตอน',
      steps: [
        {
          title: 'ส่งรูปใน LINE',
          desc: 'ถ่ายรูปพระที่อยากปล่อยให้ชัด แล้วทักมาที่ LINE',
        },
        {
          title: 'ประเมินและตกลงเงื่อนไข',
          desc: 'ทีมงานประเมินและแจ้งเงื่อนไขการฝากขายให้ทราบ',
        },
        {
          title: 'ลงประกาศและแจ้งผล',
          desc: 'ลงประกาศให้ และแจ้งทันทีเมื่อมีผู้สนใจ',
        },
      ],
      cta: 'สอบถามฝากขายพระ · ทัก LINE',
    },
    qr: {
      h2: 'สแกน QR เพื่อแอดเพื่อน LINE',
      desc: 'เปิดกล้องหรือแอป LINE แล้วสแกน QR ด้านข้าง หรือกดปุ่มเพื่อแอดเพื่อนได้ทันที',
      cta: 'แอดเพื่อน LINE',
      qrAlt: 'QR code สำหรับแอดเพื่อน LINE ของ Ener Scan',
    },
    news: {
      eyebrow: 'ข่าวสาร',
      h1a: 'ข่าวสารและประกาศจาก',
      desc: 'อัปเดตบริการ คู่มือการใช้งาน และโปรโมชันต่าง ๆ ของเรา',
      dateLocale: 'th-TH',
      ctaH2: 'พร้อมลองสแกนแล้วหรือยัง?',
      ctaDesc: 'แอดเพื่อน LINE เพื่อเริ่มอ่านพลังงานวัตถุของคุณได้ทันที',
      ctaBtn: 'แอดเพื่อน เริ่มสแกน',
    },
    about: {
      eyebrow: 'เกี่ยวกับเรา',
      h1a: 'รู้จัก',
      heroDesc:
        'ระบบวิเคราะห์พลังงานวัตถุแบบเฉพาะบุคคล และบริการเกี่ยวกับพระเครื่อง วัตถุมงคลไทย',
      ownerH2: 'เจ้าของกิจการ',
      ownerRole: 'เจ้าของกิจการ Ener Scan',
      ownerDesc:
        'ดำเนินธุรกิจอ่านพลังงานวัตถุและพระเครื่องวัตถุมงคลไทย ให้บริการลูกค้าทั้งในประเทศและต่างประเทศ',
      ownerPhotoAlt: 'Tanarit Apichokjirasin เจ้าของกิจการ Ener Scan กับตู้พระเครื่อง',
      contactH2: 'ติดต่อเรา',
      addressLabel: 'ที่อยู่',
      address:
        '42/281 หมู่บ้านอีโค่เฮ้าส์ ต.บึงคำพร้อย อ.ลำลูกกา จ.ปทุมธานี 12150 ประเทศไทย',
      phoneLabel: 'โทรศัพท์',
      emailLabel: 'อีเมล',
      websiteLabel: 'เว็บไซต์',
      servicesH2: 'บริการของเรา',
      services: [
        'รับอ่านพลังงานวัตถุเฉพาะบุคคล (พระเครื่อง เครื่องราง หิน/คริสตัล) ผ่าน LINE',
        'บริการรับฝากขายพระเครื่องและวัตถุมงคล',
        'จำหน่ายพระเครื่องและวัตถุมงคลไทยสำหรับนักสะสมทั้งในและต่างประเทศ (ผ่านแพลตฟอร์มออนไลน์ เช่น eBay)',
      ],
      disclaimer:
        'ผลการวิเคราะห์พลังงานเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณในการรับบริการ',
      cta: 'แอดเพื่อน เริ่มสแกน',
    },
  },
  en: {
    nav: {
      home: 'Home',
      news: 'News',
      about: 'About',
      switchLabel: 'ไทย',
      switchTitle: 'สลับเป็นภาษาไทย',
    },
    badge: 'Energy Reading · Amulet Consignment',
    footer: {
      tagline: 'Object Energy Analysis',
      ariaLabel: 'Footer links',
    },
    hero: {
      h1a: 'Wondering how well this object',
      h1b: 'matches',
      h1c: ' you?',
      sub1: 'Try a scan with',
      desc: 'Personalized object-energy analysis with instant summaries in LINE chat. We read Thai amulets, charms, and stones/crystals, and also offer an amulet consignment service.',
      ctaAdd: 'Add on LINE · Start scanning',
      ctaReport: 'View sample report',
      trust: [
        'Personalized analysis',
        'Results in LINE chat',
        `${freePerDay} free scans daily`,
      ],
      floatTitle: 'Report with energy chart',
      floatSub: 'Ener Scan Report',
      videoAria: 'Intro video for Ener Scan object energy analysis',
    },
    categories: {
      h2: 'What you can scan',
      desc: 'Send a photo of your sacred object and receive an energy analysis tailored to you.',
      items: [
        {
          title: 'Thai Amulets',
          desc: 'Analysis of protection, charm, and merit power, plus our amulet consignment service.',
        },
        {
          title: 'Charms & Talismans',
          desc: 'Read the dominant powers and the right timing to match your goals.',
        },
        {
          title: 'Stones / Crystals',
          desc: 'Assess how well they fit your destiny and the purpose you want to boost.',
        },
      ],
    },
    pricing: {
      h2: `${freePerDay} free scans every day`,
      desc: 'Try it free every day. Past the free quota, pay instantly via PromptPay right in LINE chat.',
      freeTitle: 'Free every day',
      freePrice: `${freePerDay} scans / day`,
      freeDesc: `Scan amulets, charms, or stones/crystals free ${freePerDay} times a day. Resets daily (local time).`,
      paidTitle: 'Beyond the free quota',
      paidPrice: `${paidPriceThb} THB`,
      paidSub: `${paidScanCount} scans / ${paidWindowHours} hr`,
      paidDesc: `Need more scans? The ${paidPriceThb} THB pack gives you ${paidScanCount} scans within ${paidWindowHours} hours. Pay via PromptPay and send the slip in LINE.`,
      cta: 'Add on LINE · Scan free',
    },
    howto: {
      h2: 'How to start',
      desc: 'Just 3 easy steps',
      steps: [
        {
          title: 'Add us on LINE',
          desc: 'Scan the QR code or tap the add-friend button to begin.',
        },
        {
          title: 'Send a clear photo',
          desc: 'One object per photo, shot clearly, for accurate results.',
        },
        {
          title: 'Get results in chat',
          desc: 'Receive an instant summary in chat, plus a full report.',
        },
      ],
    },
    consignment: {
      h2: 'Have an amulet to sell? Consign it with Ener Scan',
      desc: 'We take care of everything from appraisal and listing to finding interested buyers, all in just a few steps.',
      steps: [
        {
          title: 'Send photos via LINE',
          desc: 'Take clear photos of the amulet you want to sell and message us on LINE.',
        },
        {
          title: 'Appraisal & terms',
          desc: 'Our team appraises the piece and informs you of the consignment terms.',
        },
        {
          title: 'Listing & updates',
          desc: 'We list it for you and notify you as soon as someone is interested.',
        },
      ],
      cta: 'Ask about consignment · LINE',
    },
    qr: {
      h2: 'Scan the QR to add us on LINE',
      desc: 'Open your camera or the LINE app and scan the QR code, or tap the button to add us instantly.',
      cta: 'Add us on LINE',
      qrAlt: 'QR code to add Ener Scan on LINE',
    },
    news: {
      eyebrow: 'News',
      h1a: 'News & announcements from',
      desc: 'Service updates, how-to guides, and promotions.',
      dateLocale: 'en-GB',
      ctaH2: 'Ready to try a scan?',
      ctaDesc: 'Add us on LINE to start reading the energy of your objects right away.',
      ctaBtn: 'Add us on LINE · Start scanning',
    },
    about: {
      eyebrow: 'About Us',
      h1a: 'Meet',
      heroDesc:
        'Ener Scan is a personalized object-energy analysis service and a Thai amulet business based in Pathum Thani, Thailand.',
      ownerH2: 'Owner',
      ownerRole: 'Business Owner, Ener Scan',
      ownerDesc:
        'Operating an energy-reading and Thai amulet business, serving customers in Thailand and worldwide.',
      ownerPhotoAlt:
        'Tanarit Apichokjirasin, owner of Ener Scan, with an amulet display cabinet',
      contactH2: 'Contact',
      addressLabel: 'Address',
      address:
        '42/281 Eco-House Village, Bueng Kham Phroi, Lam Luk Ka, Pathum Thani 12150, Thailand',
      phoneLabel: 'Phone',
      emailLabel: 'Email',
      websiteLabel: 'Website',
      servicesH2: 'Our Services',
      services: [
        'Personalized energy reading for Thai amulets, charms, and stones/crystals via LINE chat',
        'Consignment service for Thai amulets and sacred objects',
        'Selling Thai amulets and collectible sacred objects to local and international collectors (via online marketplaces such as eBay)',
      ],
      disclaimer:
        'Energy readings are based on traditional beliefs and are provided for entertainment and collectible purposes.',
      cta: 'Add us on LINE',
    },
  },
} as const

export type Dict = (typeof dict)[Locale]

export function getDict(locale: Locale): Dict {
  return dict[locale]
}

export const newsItemsEn: Record<
  string,
  { tag: string; title: string; summary: string }
> = {
  'consignment-open': {
    tag: 'Service',
    title: 'Amulet consignment now open',
    summary:
      'Ener Scan now offers amulet consignment, from appraisal and listing to finding buyers. Send photos via LINE to get started.',
  },
  'service-launch': {
    tag: 'Announcement',
    title: 'Ener Scan launches energy readings via LINE',
    summary:
      'Our personalized object-energy analysis is now live. Thai amulets, charms, stones/crystals, with summaries right in LINE chat.',
  },
  'how-to-scan': {
    tag: 'Guide',
    title: 'How to start scanning',
    summary:
      'Just add us on LINE, send one clear photo per object, and receive an instant summary plus a full report in chat.',
  },
  'free-quota': {
    tag: 'Service',
    title: '2 free scans daily · 49 THB pack',
    summary:
      'Scan free twice a day. Past the quota, the 49 THB pack gives 4 scans per 24 hours. Pay via PromptPay in LINE chat.',
  },
}
