import { cn } from '@/lib/utils'
import { siteConfig } from '@/lib/site'

function LineGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.5c-5.79 0-10.5 3.81-10.5 8.5 0 4.2 3.73 7.72 8.78 8.39.34.07.8.22.92.51.1.27.07.69.03.96l-.15.9c-.04.27-.21 1.05.92.57s6.1-3.59 8.32-6.15c1.53-1.68 2.18-3.38 2.18-5.18 0-4.69-4.71-8.5-10.5-8.5ZM7.6 13.6H5.5a.55.55 0 0 1-.55-.55V9a.55.55 0 0 1 1.1 0v3.5h1.55a.55.55 0 0 1 0 1.1Zm2.05-.55a.55.55 0 0 1-1.1 0V9a.55.55 0 0 1 1.1 0v4.05Zm4.62 0a.55.55 0 0 1-.38.52.56.56 0 0 1-.17.03.55.55 0 0 1-.44-.22l-2.07-2.82v2.49a.55.55 0 0 1-1.1 0V9a.55.55 0 0 1 .38-.52.55.55 0 0 1 .61.19l2.07 2.82V9a.55.55 0 0 1 1.1 0v4.05Zm3.07-2.58a.55.55 0 0 1 0 1.1h-1.55v.93h1.55a.55.55 0 0 1 0 1.1h-2.1a.55.55 0 0 1-.55-.55V9a.55.55 0 0 1 .55-.55h2.1a.55.55 0 0 1 0 1.1h-1.55v.92h1.55Z" />
    </svg>
  )
}

export function LineButton({
  children,
  className,
  variant = 'solid',
  href = siteConfig.lineUrl,
}: {
  children: React.ReactNode
  className?: string
  variant?: 'solid' | 'outline'
  href?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold transition-all',
        variant === 'solid'
          ? 'bg-line text-white shadow-lg shadow-line/25 hover:brightness-110'
          : 'border border-border bg-card/60 text-foreground hover:border-gold/40 hover:bg-card',
        className,
      )}
    >
      {variant === 'solid' && <LineGlyph className="size-5" />}
      {children}
    </a>
  )
}
