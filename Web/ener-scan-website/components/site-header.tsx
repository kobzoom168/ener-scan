'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ScanLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navLinks } from '@/lib/site'

export function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30">
            <ScanLine className="size-5 text-gold" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Ener <span className="text-gradient-gold">Scan</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="เมนูหลัก">
          {navLinks.map((link) => {
            const active =
              link.href === '/'
                ? pathname === '/'
                : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-gold/15 text-gold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <span className="hidden rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-soft md:inline-block">
          รับอ่านพลังงาน · รับฝากขายพระ
        </span>
      </div>
    </header>
  )
}
