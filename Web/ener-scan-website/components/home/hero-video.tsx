import Script from 'next/script'

const VIDEO_SRC = '/videos/ener-scan-hero.mp4'

export function HeroVideo() {
  return (
    <>
      <video
        id="ener-hero-video"
        src={VIDEO_SRC}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        disablePictureInPicture
        controlsList="nofullscreen noremoteplayback nodownload noplaybackrate"
        aria-label="วิดีโอแนะนำ Ener Scan ระบบวิเคราะห์พลังงานวัตถุ"
        className="pointer-events-none aspect-[27/50] h-auto w-full select-none object-cover"
      />
      <Script id="ener-hero-video-play" strategy="afterInteractive">
        {`(function () {
  var video = document.getElementById('ener-hero-video');
  if (!video) return;

  function ensurePlay() {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    if (video.paused) {
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  }

  ['loadeddata', 'canplay', 'playing'].forEach(function (evt) {
    video.addEventListener(evt, ensurePlay);
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) ensurePlay();
  });

  var tries = 0;
  var timer = setInterval(function () {
    ensurePlay();
    tries += 1;
    if (tries >= 8 || !video.paused) clearInterval(timer);
  }, 500);

  ensurePlay();
})();`}
      </Script>
    </>
  )
}
