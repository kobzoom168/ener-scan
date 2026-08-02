'use client'

import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { getDict, type Locale } from '@/lib/i18n'

function YoutubeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.2C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z" />
    </svg>
  )
}

type YtVideo = { id: string; title: string; published: string }
type YtFeed = { channel: string; updatedAt: string; videos: YtVideo[] }

const CHANNEL_URL = 'https://www.youtube.com/@Ener-scan/shorts'

function ThumbCard({ video }: { video: YtVideo }) {
  // hqdefault มีเสมอทุกคลิป (Shorts เป็นภาพแนวตั้งใน 16:9 pillarbox —
  // object-cover 9:16 ครอปข้างดำออกพอดี) · oardefault ใช้ไม่ได้: 404 แต่แถมรูปเทา
  const [src, setSrc] = useState(
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
  )

  return (
    <a
      href={`https://www.youtube.com/shorts/${video.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="border-gold-hairline group/card relative block w-40 shrink-0 overflow-hidden rounded-2xl bg-card sm:w-44"
      title={video.title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={video.title}
        loading="lazy"
        onError={() => setSrc(`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`)}
        className="aspect-[9/16] w-full object-cover transition-transform duration-300 group-hover/card:scale-105"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/40 transition-colors group-hover/card:bg-red-600">
        <Play className="size-5 fill-current" aria-hidden="true" />
      </span>
      <span className="absolute inset-x-0 bottom-0 p-2.5 text-xs font-medium leading-snug text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
        {video.title}
      </span>
    </a>
  )
}

export function YoutubeSection({ locale = 'th' }: { locale?: Locale }) {
  const t = getDict(locale).youtube
  const [videos, setVideos] = useState<YtVideo[]>([])

  useEffect(() => {
    fetch('/data/yt-latest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: YtFeed | null) => {
        if (data?.videos?.length) setVideos(data.videos)
      })
      .catch(() => {})
  }, [])

  if (!videos.length) return null

  // วนลูป: ทำซ้ำลิสต์ 2 รอบ แล้วเลื่อน -50% แบบ infinite
  const loop = [...videos, ...videos]

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="text-center">
        <span className="eyebrow">
          <YoutubeGlyph className="size-3.5" />
          Ener Scan Channel
        </span>
        <h2 className="mt-4 text-balance text-2xl font-bold sm:text-3xl">
          {t.h2}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
          {t.desc}
        </p>
      </div>

      <div className="group relative mt-10 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background to-transparent" />
        <div className="yt-marquee flex w-max gap-4 group-hover:[animation-play-state:paused]">
          {loop.map((v, i) => (
            <ThumbCard key={`${v.id}-${i}`} video={v} />
          ))}
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <a
          href={CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-red-600/25 transition-all hover:brightness-110"
        >
          <YoutubeGlyph className="size-5" />
          {t.cta}
        </a>
      </div>

      <style>{`
        .yt-marquee {
          animation: yt-scroll 45s linear infinite;
        }
        @keyframes yt-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .yt-marquee { animation: none; }
        }
      `}</style>
    </section>
  )
}
