'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ScanLine, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDict, localePath, type Locale } from '@/lib/i18n'

export function SiteHeader({ locale = 'th' }: { locale?: Locale }) {
  const pathname = usePathname()
  const t = getDict(locale)

  const navLinks = [
    { href: localePath(locale, '/'), label: t.nav.home },
    { href: localePath(locale, '/news'), label: t.nav.news },
    { href: localePath(locale, '/about'), label: t.nav.about },
  ]

  // สลับภาษา: หา path เดียวกันในอีกภาษา
  const stripped = pathname.replace(/^\/en/, '') || '/'
  const switchHref =
    locale === 'en' ? stripped : `/en${stripped === '/' ? '' : stripped}` || '/en'

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:font-semibold focus:text-black"
      >
        {t.common.skip}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={localePath(locale, '/')}
          aria-label="Ener Scan home"
          className="flex items-center gap-2.5"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30">
            <ScanLine className="size-5 text-gold" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Ener <span className="text-gradient-gold">Scan</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main menu">
          {navLinks.map((link) => {
            const normalize = (p: string) =>
              p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p
            const active = normalize(pathname) === normalize(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-gold/20 font-semibold text-gold ring-1 ring-gold/40'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            )
          })}

          <Link
            href={switchHref}
            title={t.nav.switchTitle}
            className="ml-1 flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold-soft transition-colors hover:bg-gold/20"
          >
            <Languages className="size-4" aria-hidden="true" />
            {t.nav.switchLabel}
          </Link>
        </nav>

        <span className="hidden rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-soft lg:inline-block">
          {t.badge}
        </span>
      </div>
    </header>
  )
}
