'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

const VIDEO_SRC = '/videos/ener-scan-hero.mp4'

export function HeroVideo({
  ariaLabel = 'วิดีโอแนะนำ Ener Scan ระบบวิเคราะห์พลังงานวัตถุ',
  playLabel = 'เล่นวิดีโอ',
  pauseLabel = 'หยุดวิดีโอ',
}: {
  ariaLabel?: string
  playLabel?: string
  pauseLabel?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const userPausedRef = useRef(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function ensurePlay() {
      if (!video || userPausedRef.current) return
      video.muted = true
      video.defaultMuted = true
      video.playsInline = true
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      if (video.paused) {
        const p = video.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      }
    }

    const events = ['loadeddata', 'canplay', 'playing'] as const
    events.forEach((evt) => video.addEventListener(evt, ensurePlay))

    const onVisibility = () => {
      if (!document.hidden) ensurePlay()
    }
    document.addEventListener('visibilitychange', onVisibility)

    let tries = 0
    const timer = setInterval(() => {
      ensurePlay()
      tries += 1
      if (tries >= 8 || !video.paused) clearInterval(timer)
    }, 500)
    ensurePlay()

    return () => {
      events.forEach((evt) => video.removeEventListener(evt, ensurePlay))
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
    }
  }, [])

  function toggle() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      userPausedRef.current = false
      const p = video.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
      setPaused(false)
    } else {
      userPausedRef.current = true
      video.pause()
      setPaused(true)
    }
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        id="ener-hero-video"
        src={VIDEO_SRC}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        disablePictureInPicture
        controlsList="nofullscreen noremoteplayback nodownload noplaybackrate"
        aria-label={ariaLabel}
        className="pointer-events-none aspect-[27/50] h-auto w-full select-none object-cover"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={paused ? playLabel : pauseLabel}
        title={paused ? playLabel : pauseLabel}
        className="absolute bottom-3 right-3 z-10 flex size-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/50 backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        {paused ? (
          <Play className="size-5 fill-current" aria-hidden="true" />
        ) : (
          <Pause className="size-5 fill-current" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
