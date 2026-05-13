import { formatTime } from '../utils'

function PreviewPanel({
  playhead,
  timelineDuration,
  isPlaying,
  onReset,
  onTogglePlay,
  previewVideoRef,
  previewVideoSrc,
  onVideoEnded,
  canvasElRef,
  activeTransitionVisual,
}) {
  return (
    <section className="ve-preview">
      <div className="ve-player-head">
        <div>
          <strong>{formatTime(playhead)}</strong>
          <span>/ {formatTime(timelineDuration)}</span>
        </div>
        <div className="ve-playback-actions">
          <button type="button" onClick={onReset}>Reset</button>
          <button type="button" onClick={onTogglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
        </div>
      </div>
      <div className="ve-stage-wrap">
        <video
          ref={previewVideoRef}
          className={`ve-preview-video ${previewVideoSrc ? 'is-visible' : ''}`}
          src={previewVideoSrc || undefined}
          playsInline
          muted
          preload="auto"
          onEnded={onVideoEnded}
        />
        <canvas ref={canvasElRef} />
        <div
          className="ve-transition-overlay"
          style={{
            opacity: activeTransitionVisual?.opacity ?? 0,
            background: activeTransitionVisual?.background ?? 'rgba(0, 0, 0, 0)',
            clipPath: activeTransitionVisual?.clipPath ?? 'inset(0 0 0 0)',
          }}
        />
      </div>
    </section>
  )
}

export default PreviewPanel
