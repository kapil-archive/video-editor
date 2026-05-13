import { PIXELS_PER_SECOND, TRACKS } from '../constants'
import { formatTime } from '../utils'

function TimelinePanel({
  timelineWidth,
  timelineDuration,
  timelineRef,
  playhead,
  onSeek,
  clipItems,
  selectedClipId,
  onSelectClip,
}) {
  return (
    <section className="ve-timeline-panel">
      <div className="ve-ruler" style={{ width: `${timelineWidth}px` }}>
        {Array.from({ length: timelineDuration + 1 }).map((_, second) => (
          <span key={`ruler-${second}`} style={{ left: `${second * PIXELS_PER_SECOND}px` }}>
            {second % 5 === 0 ? formatTime(second) : ''}
          </span>
        ))}
      </div>

      <div className="ve-timeline" ref={timelineRef} onClick={onSeek} role="presentation">
        <div className="ve-playhead" style={{ left: `${playhead * PIXELS_PER_SECOND}px` }} />

        {TRACKS.map((track) => (
          <div className="ve-track" key={track.id}>
            <div className="ve-track-label">{track.label}</div>
            <div className="ve-track-lane" style={{ width: `${timelineWidth}px` }}>
              {clipItems
                .filter((clip) => clip.track === track.id)
                .map((clip) => (
                  <button
                    type="button"
                    className={`ve-clip ${selectedClipId === clip.id ? 'is-active' : ''}`}
                    key={clip.id}
                    style={{
                      left: `${clip.start * PIXELS_PER_SECOND}px`,
                      width: `${Math.max(44, clip.duration * PIXELS_PER_SECOND)}px`,
                      background: clip.color,
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectClip(clip)
                    }}
                  >
                    {clip.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TimelinePanel
