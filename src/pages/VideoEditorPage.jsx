import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { Canvas, FabricImage, Rect, Textbox } from 'fabric/es'
import './VideoEditorPage.css'

const STAGE_WIDTH = 1280
const STAGE_HEIGHT = 720
const PIXELS_PER_SECOND = 50

const TRACKS = [
  { id: 'video', label: 'Video' },
  { id: 'text', label: 'Text' },
  { id: 'overlay', label: 'Overlay' },
]

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const formatTime = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function VideoEditorPage() {
  const canvasElRef = useRef(null)
  const timelineRef = useRef(null)
  const canvasRef = useRef(null)
  const ffmpegRef = useRef(null)
  const previewVideoRef = useRef(null)
  const sourceVideoUrlRef = useRef(null)

  const [clipItems, setClipItems] = useState([
    {
      id: id('clip'),
      objectId: 'source-video',
      label: 'Main footage',
      track: 'video',
      start: 0,
      duration: 18,
      color: '#2f455c',
      type: 'video',
    },
  ])
  const [layers, setLayers] = useState([])
  const [selectedClipId, setSelectedClipId] = useState(null)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [sourceVideo, setSourceVideo] = useState(null)
  const [sourceVideoUrl, setSourceVideoUrl] = useState('')
  const [busyMessage, setBusyMessage] = useState('Idle')

  const selectedClip = useMemo(
    () => clipItems.find((clip) => clip.id === selectedClipId) ?? null,
    [clipItems, selectedClipId],
  )

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedObjectId) ?? null,
    [layers, selectedObjectId],
  )

  const timelineDuration = useMemo(() => {
    const end = clipItems.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0)
    return Math.max(30, Math.ceil(end + 2))
  }, [clipItems])

  const timelineWidth = timelineDuration * PIXELS_PER_SECOND

  const syncLayersFromCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const canvasObjects = canvas.getObjects().filter((object) => object.data?.kind !== 'stage')

    setLayers(
      canvasObjects
        .map((object) => ({
          id: object.data?.id,
          name: object.data?.name || object.type,
          type: object.type,
          fill: typeof object.fill === 'string' ? object.fill : '#ffffff',
          opacity: object.opacity ?? 1,
          angle: object.angle ?? 0,
        }))
        .reverse(),
    )
  }

  const applyPlaybackVisibility = useCallback((time) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const timeAtFrame = Number.isFinite(time) ? time : 0

    canvas.getObjects().forEach((object) => {
      const objectId = object.data?.id
      if (!objectId || object.data?.kind === 'stage') {
        return
      }

      const linked = clipItems.filter((clip) => clip.objectId === objectId)
      if (!linked.length) {
        object.set('visible', true)
        return
      }

      const visible = linked.some(
        (clip) => timeAtFrame >= clip.start && timeAtFrame <= clip.start + clip.duration,
      )
      object.set('visible', visible)
    })

    canvas.renderAll()
  }, [clipItems])

  useEffect(() => {
    const canvas = new Canvas(canvasElRef.current, {
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      selection: true,
    })
    canvasRef.current = canvas

    const stage = new Rect({
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      left: 0,
      top: 0,
      fill: 'transparent',
      selectable: false,
      evented: false,
    })
    stage.set('data', { kind: 'stage' })
    canvas.add(stage)

    const headline = new Textbox('Build your scene', {
      left: STAGE_WIDTH * 0.08,
      top: STAGE_HEIGHT * 0.1,
      width: STAGE_WIDTH * 0.7,
      fill: '#f3f5f7',
      fontFamily: 'Avenir Next',
      fontWeight: 700,
      fontSize: 72,
      lineHeight: 1,
      shadow: 'rgba(0,0,0,0.3) 0 8px 24px',
    })
    headline.set('data', { id: id('obj'), name: 'Headline text' })
    canvas.add(headline)

    const subtitle = new Textbox('Timeline + Fabric + FFmpeg export pipeline', {
      left: STAGE_WIDTH * 0.08,
      top: STAGE_HEIGHT * 0.26,
      width: STAGE_WIDTH * 0.64,
      fill: '#c5d0dd',
      fontFamily: 'Avenir Next',
      fontWeight: 500,
      fontSize: 30,
      lineHeight: 1.2,
    })
    subtitle.set('data', { id: id('obj'), name: 'Subtitle text' })
    canvas.add(subtitle)

    const headlineClip = {
      id: id('clip'),
      objectId: headline.data.id,
      label: 'Headline',
      track: 'text',
      start: 0,
      duration: 14,
      color: '#43807d',
      type: 'text',
    }

    const subtitleClip = {
      id: id('clip'),
      objectId: subtitle.data.id,
      label: 'Subtitle',
      track: 'text',
      start: 1,
      duration: 14,
      color: '#4f8b88',
      type: 'text',
    }

    setClipItems((prev) => [...prev, headlineClip, subtitleClip])

    const selectActive = () => {
      const active = canvas.getActiveObject()
      setSelectedObjectId(active?.data?.id ?? null)
    }

    canvas.on('selection:created', selectActive)
    canvas.on('selection:updated', selectActive)
    canvas.on('selection:cleared', () => setSelectedObjectId(null))
    canvas.on('object:modified', syncLayersFromCanvas)
    canvas.on('object:added', syncLayersFromCanvas)
    canvas.on('object:removed', syncLayersFromCanvas)

    syncLayersFromCanvas()

    return () => {
      if (sourceVideoUrlRef.current) {
        URL.revokeObjectURL(sourceVideoUrlRef.current)
      }

      canvas.dispose()
      canvasRef.current = null
    }
  }, [])

  useEffect(() => {
    applyPlaybackVisibility(playhead)
  }, [playhead, applyPlaybackVisibility])

  useEffect(() => {
    if (!isPlaying) {
      return undefined
    }

    let frame = 0
    let prev = performance.now()

    const tick = (now) => {
      const delta = (now - prev) / 1000
      prev = now

      setPlayhead((current) => {
        const next = current + delta
        if (next >= timelineDuration) {
          setIsPlaying(false)
          return timelineDuration
        }
        return next
      })

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, timelineDuration])

  useEffect(() => {
    const previewVideo = previewVideoRef.current
    if (!previewVideo) {
      return
    }

    if (isPlaying) {
      void previewVideo.play().catch(() => {
        setBusyMessage('Video autoplay blocked. Press play again after interacting with the page.')
      })
      return
    }

    previewVideo.pause()
  }, [isPlaying])

  useEffect(() => {
    const previewVideo = previewVideoRef.current
    if (!previewVideo || isPlaying) {
      return
    }

    const bounded = clamp(playhead, 0, Number.isFinite(previewVideo.duration) ? previewVideo.duration : playhead)
    if (Math.abs(previewVideo.currentTime - bounded) > 0.04) {
      previewVideo.currentTime = bounded
    }
  }, [playhead, isPlaying])

  const uploadSourceVideo = async (event) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }

    setBusyMessage('Preparing source video layer...')
    setIsPlaying(false)
    setSourceVideo(file)

    const sourceUrl = URL.createObjectURL(file)
    const probeVideo = document.createElement('video')
    probeVideo.src = sourceUrl
    probeVideo.playsInline = true
    probeVideo.muted = true
    probeVideo.preload = 'metadata'
    probeVideo.load()

    try {
      await new Promise((resolve, reject) => {
        probeVideo.onloadedmetadata = () => resolve()
        probeVideo.onerror = () => reject(new Error('Failed loading uploaded video'))
      })

      if (sourceVideoUrlRef.current) {
        URL.revokeObjectURL(sourceVideoUrlRef.current)
      }
      sourceVideoUrlRef.current = sourceUrl
      setSourceVideoUrl(sourceUrl)

      const clipDuration = Number.isFinite(probeVideo.duration) ? Math.max(1, Math.floor(probeVideo.duration)) : 18

      setClipItems((prev) => {
        const withoutSourceVideo = prev.filter((clip) => clip.objectId !== 'source-video' && clip.track !== 'video')
        return [
          {
            id: id('clip'),
            objectId: 'source-video',
            label: file.name.replace(/\.[^/.]+$/, '') || 'Main footage',
            track: 'video',
            start: 0,
            duration: clipDuration,
            color: '#2f455c',
            type: 'video',
          },
          ...withoutSourceVideo,
        ]
      })

      setSelectedObjectId(null)
      setPlayhead(0)
      setBusyMessage(`Video layer added: ${file.name}`)
    } catch {
      URL.revokeObjectURL(sourceUrl)
      setBusyMessage('Unable to load this video. Try MP4 (H.264) for browser compatibility.')
    } finally {
      event.target.value = ''
    }
  }

  const addTextLayer = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const objectId = id('obj')
    const text = new Textbox('New caption', {
      left: STAGE_WIDTH * 0.5,
      top: STAGE_HEIGHT * 0.5,
      width: STAGE_WIDTH * 0.5,
      originX: 'center',
      fill: '#ffffff',
      fontFamily: 'Avenir Next',
      fontSize: 56,
      fontWeight: 700,
      textAlign: 'center',
      shadow: 'rgba(0,0,0,0.36) 0 8px 30px',
    })
    text.set('data', { id: objectId, name: 'Caption text' })

    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.renderAll()

    setClipItems((prev) => [
      ...prev,
      {
        id: id('clip'),
        objectId,
        label: 'Caption',
        track: 'text',
        start: clamp(playhead, 0, timelineDuration - 3),
        duration: 6,
        color: '#4f8b88',
        type: 'text',
      },
    ])
    syncLayersFromCanvas()
  }

  const addShapeLayer = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const objectId = id('obj')
    const shape = new Rect({
      left: STAGE_WIDTH * 0.5,
      top: STAGE_HEIGHT * 0.5,
      width: 320,
      height: 180,
      originX: 'center',
      originY: 'center',
      rx: 18,
      ry: 18,
      fill: '#f3b57a',
      opacity: 0.92,
      shadow: 'rgba(0,0,0,0.2) 0 8px 24px',
    })
    shape.set('data', { id: objectId, name: 'Rounded card' })

    canvas.add(shape)
    canvas.setActiveObject(shape)
    canvas.renderAll()

    setClipItems((prev) => [
      ...prev,
      {
        id: id('clip'),
        objectId,
        label: 'Shape',
        track: 'overlay',
        start: clamp(playhead, 0, timelineDuration - 3),
        duration: 6,
        color: '#d58b4b',
        type: 'overlay',
      },
    ])
    syncLayersFromCanvas()
  }

  const addImageLayer = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const imageUrl = URL.createObjectURL(file)

    try {
      const image = await FabricImage.fromURL(imageUrl)
      const objectId = id('obj')
      const targetW = STAGE_WIDTH * 0.4
      const targetH = STAGE_HEIGHT * 0.4
      const scale = Math.min(
        targetW / Math.max(1, image.width || targetW),
        targetH / Math.max(1, image.height || targetH),
      )

      image.set({
        left: STAGE_WIDTH * 0.5,
        top: STAGE_HEIGHT * 0.54,
        originX: 'center',
        originY: 'center',
      })
      image.scale(scale)
      image.set('data', { id: objectId, name: file.name.replace(/\.[^/.]+$/, '') || 'Image layer' })

      canvas.add(image)
      canvas.setActiveObject(image)
      canvas.renderAll()

      setClipItems((prev) => [
        ...prev,
        {
          id: id('clip'),
          objectId,
          label: 'Image',
          track: 'overlay',
          start: clamp(playhead, 0, timelineDuration - 3),
          duration: 8,
          color: '#c9693e',
          type: 'image',
        },
      ])
      syncLayersFromCanvas()
    } finally {
      URL.revokeObjectURL(imageUrl)
      event.target.value = ''
    }
  }

  const seekTimeline = (event) => {
    const timeline = timelineRef.current
    if (!timeline) {
      return
    }

    const bounds = timeline.getBoundingClientRect()
    const cursorX = event.clientX - bounds.left + timeline.scrollLeft
    setPlayhead(clamp(cursorX / PIXELS_PER_SECOND, 0, timelineDuration))
  }

  const updateClip = (changes) => {
    if (!selectedClip) {
      return
    }

    setClipItems((prev) =>
      prev.map((clip) => {
        if (clip.id !== selectedClip.id) {
          return clip
        }

        const next = { ...clip, ...changes }
        next.start = clamp(next.start, 0, timelineDuration)
        next.duration = clamp(next.duration, 0.5, timelineDuration)
        return next
      }),
    )
  }

  const updateSelectedLayer = (changes) => {
    const canvas = canvasRef.current
    if (!canvas || !selectedObjectId) {
      return
    }

    const target = canvas.getObjects().find((object) => object.data?.id === selectedObjectId)
    if (!target) {
      return
    }

    target.set(changes)
    target.setCoords()
    canvas.renderAll()
    syncLayersFromCanvas()
  }

  const removeSelectedClip = () => {
    if (!selectedClip) {
      return
    }

    setClipItems((prev) => prev.filter((clip) => clip.id !== selectedClip.id))
    setSelectedClipId(null)
  }

  const moveLayer = (layerId, direction) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const objects = canvas.getObjects()
    const target = objects.find((object) => object.data?.id === layerId)
    if (!target) {
      return
    }

    const index = objects.indexOf(target)
    const nextIndex = clamp(index + direction, 1, objects.length - 1)
    canvas.moveObjectTo(target, nextIndex)
    canvas.renderAll()
    syncLayersFromCanvas()
  }

  const removeLayer = () => {
    const canvas = canvasRef.current
    if (!canvas || !selectedObjectId) {
      return
    }

    const target = canvas.getObjects().find((object) => object.data?.id === selectedObjectId)
    if (!target || target.data?.kind === 'stage') {
      return
    }

    canvas.remove(target)
    setClipItems((prev) => prev.filter((clip) => clip.objectId !== selectedObjectId))
    setSelectedObjectId(null)
    setSelectedClipId(null)
    canvas.renderAll()
    syncLayersFromCanvas()
  }

  const exportWithFfmpeg = async () => {
    if (!sourceVideo) {
      setBusyMessage('Upload a source video first to export.')
      return
    }

    try {
      setBusyMessage('Loading FFmpeg core (first time can take a while)...')

      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg()
      }

      if (!ffmpegRef.current.loaded) {
        await ffmpegRef.current.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
        })
      }

      const ffmpeg = ffmpegRef.current
      const inputName = `input-${Date.now()}.mp4`
      const outputName = `export-${Date.now()}.mp4`

      setBusyMessage('Writing source media into FFmpeg virtual FS...')
      await ffmpeg.writeFile(inputName, await fetchFile(sourceVideo))

      setBusyMessage('Rendering export clip...')
      await ffmpeg.exec([
        '-i',
        inputName,
        '-t',
        String(Math.max(1, Math.floor(timelineDuration))),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        outputName,
      ])

      const data = await ffmpeg.readFile(outputName)
      const blob = new Blob([data], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'canva-like-export.mp4'
      anchor.click()
      URL.revokeObjectURL(url)

      setBusyMessage('Export finished. File downloaded.')
    } catch {
      setBusyMessage('Export failed. Check browser memory limits and source media format.')
    }
  }

  return (
    <div className="ve-page">
      <header className="ve-topbar">
        <div>
          <p className="ve-eyebrow">Canva-like video architecture</p>
          <h1>Fabric scene graph + custom timeline + FFmpeg.wasm export</h1>
        </div>

        <div className="ve-topbar-actions">
          <Link to="/" className="ve-link ve-link-muted">Home</Link>
          <label className="ve-link ve-link-muted" htmlFor="video-source-input">Upload Source Video</label>
          <input
            id="video-source-input"
            type="file"
            accept="video/*"
            className="ve-hidden-input"
            onChange={uploadSourceVideo}
          />
          <button type="button" className="ve-link ve-link-primary" onClick={exportWithFfmpeg}>Export</button>
        </div>
      </header>

      <main className="ve-shell">
        <aside className="ve-tools">
          <h2>Composer</h2>
          <div className="ve-tools-grid">
            <button type="button" onClick={addTextLayer}>Add Text</button>
            <button type="button" onClick={addShapeLayer}>Add Shape</button>
            <label htmlFor="image-layer-input">Add Image</label>
            <input
              id="image-layer-input"
              type="file"
              accept="image/*"
              className="ve-hidden-input"
              onChange={addImageLayer}
            />
          </div>

          <p className="ve-status">{busyMessage}</p>

          <h3>Layers</h3>
          <div className="ve-layers">
            {layers.map((layer) => (
              <button
                type="button"
                key={layer.id}
                className={`ve-layer-row ${selectedObjectId === layer.id ? 'is-active' : ''}`}
                onClick={() => {
                  const canvas = canvasRef.current
                  const target = canvas
                    ?.getObjects()
                    .find((object) => object.data?.id === layer.id)
                  if (target && canvas) {
                    canvas.setActiveObject(target)
                    canvas.renderAll()
                  }
                  setSelectedObjectId(layer.id)
                }}
              >
                <span>{layer.name}</span>
                <small>{layer.type}</small>
              </button>
            ))}
          </div>

          <div className="ve-layer-actions">
            <button type="button" onClick={() => moveLayer(selectedObjectId, 1)} disabled={!selectedObjectId}>Send Back</button>
            <button type="button" onClick={() => moveLayer(selectedObjectId, -1)} disabled={!selectedObjectId}>Bring Front</button>
            <button type="button" onClick={removeLayer} disabled={!selectedObjectId}>Delete Layer</button>
          </div>
        </aside>

        <section className="ve-preview">
          <div className="ve-player-head">
            <div>
              <strong>{formatTime(playhead)}</strong>
              <span>/ {formatTime(timelineDuration)}</span>
            </div>
            <div className="ve-playback-actions">
              <button type="button" onClick={() => setPlayhead(0)}>Reset</button>
              <button type="button" onClick={() => setIsPlaying((prev) => !prev)}>{isPlaying ? 'Pause' : 'Play'}</button>
            </div>
          </div>
          <div className="ve-stage-wrap">
            <video
              ref={previewVideoRef}
              className={`ve-preview-video ${sourceVideoUrl ? 'is-visible' : ''}`}
              src={sourceVideoUrl || undefined}
              playsInline
              muted
              preload="auto"
              onEnded={() => {
                setIsPlaying(false)
                setPlayhead(timelineDuration)
              }}
            />
            <canvas ref={canvasElRef} />
          </div>
        </section>

        <aside className="ve-inspector">
          <h2>Inspector</h2>

          {!selectedLayer ? (
            <p>Select a layer on canvas to edit transform and style.</p>
          ) : (
            <div className="ve-form-grid">
              {selectedLayer.type === 'textbox' ? (
                <label>
                  Text
                  <input
                    type="text"
                    value={canvasRef.current
                      ?.getObjects()
                      .find((object) => object.data?.id === selectedLayer.id)?.text || ''}
                    onChange={(event) => updateSelectedLayer({ text: event.target.value })}
                  />
                </label>
              ) : null}

              <label>
                Fill
                <input
                  type="color"
                  value={selectedLayer.fill}
                  onChange={(event) => updateSelectedLayer({ fill: event.target.value })}
                />
              </label>

              <label>
                Opacity
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={selectedLayer.opacity}
                  onChange={(event) => updateSelectedLayer({ opacity: Number(event.target.value) })}
                />
              </label>

              <label>
                Rotation
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={selectedLayer.angle}
                  onChange={(event) => updateSelectedLayer({ angle: Number(event.target.value) })}
                />
              </label>
            </div>
          )}

          <h3>Clip settings</h3>
          {!selectedClip ? (
            <p>Select a timeline clip to edit timing and color.</p>
          ) : (
            <div className="ve-form-grid">
              <label>
                Label
                <input
                  type="text"
                  value={selectedClip.label}
                  onChange={(event) => updateClip({ label: event.target.value })}
                />
              </label>

              <label>
                Start (s)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  max={timelineDuration}
                  value={selectedClip.start}
                  onChange={(event) => updateClip({ start: Number(event.target.value) })}
                />
              </label>

              <label>
                Duration (s)
                <input
                  type="number"
                  min={0.5}
                  step={0.1}
                  max={timelineDuration}
                  value={selectedClip.duration}
                  onChange={(event) => updateClip({ duration: Number(event.target.value) })}
                />
              </label>

              <label>
                Color
                <input
                  type="color"
                  value={selectedClip.color}
                  onChange={(event) => updateClip({ color: event.target.value })}
                />
              </label>

              <button type="button" onClick={removeSelectedClip}>Delete Clip</button>
            </div>
          )}
        </aside>
      </main>

      <section className="ve-timeline-panel">
        <div className="ve-ruler" style={{ width: `${timelineWidth}px` }}>
          {Array.from({ length: timelineDuration + 1 }).map((_, second) => (
            <span key={`ruler-${second}`} style={{ left: `${second * PIXELS_PER_SECOND}px` }}>
              {second % 5 === 0 ? formatTime(second) : ''}
            </span>
          ))}
        </div>

        <div className="ve-timeline" ref={timelineRef} onClick={seekTimeline} role="presentation">
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
                        setSelectedClipId(clip.id)
                        if (clip.objectId) {
                          const canvas = canvasRef.current
                          const target = canvas
                            ?.getObjects()
                            .find((object) => object.data?.id === clip.objectId)
                          if (target && canvas) {
                            canvas.setActiveObject(target)
                            canvas.renderAll()
                            setSelectedObjectId(clip.objectId)
                          }
                        }
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
    </div>
  )
}

export default VideoEditorPage
