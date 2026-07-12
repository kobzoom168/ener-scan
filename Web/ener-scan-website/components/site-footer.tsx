import Link from 'next/link'
import { ScanLine } from 'lucide-react'
import { siteConfig } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/30">
            <ScanLine className="size-4 text-gold" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Ener Scan · ระบบวิเคราะห์พลังงานวัตถุ
          </p>
        </div>

        <nav
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
          aria-label="ลิงก์ส่วนท้าย"
        >
          <Link
            href="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            หน้าแรก
          </Link>
          <Link
            href="/news"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            ข่าวสาร
          </Link>
          <a
            href={siteConfig.reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            scan.my-ener.uk
          </a>
        </nav>
      </div>
    </footer>
  )
}
