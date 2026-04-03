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
  { id: 'transition', label: 'Transition' },
  { id: 'text', label: 'Text' },
  { id: 'overlay', label: 'Overlay' },
]

const RESIZABLE_CLIP_TRACKS = ['video', 'text', 'transition', 'overlay']

const TRANSITION_PRESETS = {
  dipBlack: {
    label: 'Dip To Black',
    mode: 'symmetric',
    timelineColor: '#111827',
    ffmpegColor: 'black',
    previewColor: 'rgba(0, 0, 0, 1)',
  },
  dipWhite: {
    label: 'Dip To White',
    mode: 'symmetric',
    timelineColor: '#cbd5e1',
    ffmpegColor: 'white',
    previewColor: 'rgba(255, 255, 255, 1)',
  },
  dipWarm: {
    label: 'Dip To Warm',
    mode: 'symmetric',
    timelineColor: '#df6d3c',
    ffmpegColor: '0xDF6D3C',
    previewColor: 'rgba(223, 109, 60, 1)',
  },
  dipCool: {
    label: 'Dip To Cool',
    mode: 'symmetric',
    timelineColor: '#2f6f76',
    ffmpegColor: '0x2F6F76',
    previewColor: 'rgba(47, 111, 118, 1)',
  },
  fadeIn: {
    label: 'Fade In From Black',
    mode: 'fadeIn',
    timelineColor: '#334155',
    ffmpegColor: 'black',
    previewColor: 'rgba(0, 0, 0, 1)',
  },
  fadeOut: {
    label: 'Fade Out To Black',
    mode: 'fadeOut',
    timelineColor: '#475569',
    ffmpegColor: 'black',
    previewColor: 'rgba(0, 0, 0, 1)',
  },
  fadeInWhite: {
    label: 'Fade In From White',
    mode: 'fadeIn',
    timelineColor: '#e2e8f0',
    ffmpegColor: 'white',
    previewColor: 'rgba(255, 255, 255, 1)',
  },
  fadeOutWhite: {
    label: 'Fade Out To White',
    mode: 'fadeOut',
    timelineColor: '#dbe4ee',
    ffmpegColor: 'white',
    previewColor: 'rgba(255, 255, 255, 1)',
  },
  flashWhite: {
    label: 'Flash White',
    mode: 'symmetric',
    timelineColor: '#cbd5e1',
    ffmpegColor: 'white',
    previewColor: 'rgba(255, 255, 255, 1)',
  },
  flashRed: {
    label: 'Flash Red',
    mode: 'symmetric',
    timelineColor: '#ef4444',
    ffmpegColor: 'red',
    previewColor: 'rgba(239, 68, 68, 1)',
  },
  flashBlue: {
    label: 'Flash Blue',
    mode: 'symmetric',
    timelineColor: '#60a5fa',
    ffmpegColor: '0x60A5FA',
    previewColor: 'rgba(96, 165, 250, 1)',
  },
  wipeLeft: {
    label: 'Wipe Left',
    mode: 'wipeLeft',
    timelineColor: '#1d4ed8',
    ffmpegColor: '0x1D4ED8',
    previewColor: 'rgba(29, 78, 216, 1)',
  },
  wipeRight: {
    label: 'Wipe Right',
    mode: 'wipeRight',
    timelineColor: '#0f766e',
    ffmpegColor: '0x0F766E',
    previewColor: 'rgba(15, 118, 110, 1)',
  },
  wipeUp: {
    label: 'Wipe Up',
    mode: 'wipeUp',
    timelineColor: '#7c3aed',
    ffmpegColor: '0x7C3AED',
    previewColor: 'rgba(124, 58, 237, 1)',
  },
  wipeDown: {
    label: 'Wipe Down',
    mode: 'wipeDown',
    timelineColor: '#be123c',
    ffmpegColor: '0xBE123C',
    previewColor: 'rgba(190, 18, 60, 1)',
  },
  slideLeft: {
    label: 'Slide Left',
    mode: 'slideLeft',
    timelineColor: '#0f172a',
    ffmpegColor: '0x0F172A',
    previewColor: 'rgba(15, 23, 42, 1)',
  },
  slideRight: {
    label: 'Slide Right',
    mode: 'slideRight',
    timelineColor: '#1e293b',
    ffmpegColor: '0x1E293B',
    previewColor: 'rgba(30, 41, 59, 1)',
  },
  slideUp: {
    label: 'Slide Up',
    mode: 'slideUp',
    timelineColor: '#1d3557',
    ffmpegColor: '0x1D3557',
    previewColor: 'rgba(29, 53, 87, 1)',
  },
  slideDown: {
    label: 'Slide Down',
    mode: 'slideDown',
    timelineColor: '#7f1d1d',
    ffmpegColor: '0x7F1D1D',
    previewColor: 'rgba(127, 29, 29, 1)',
  },
  zoomFlash: {
    label: 'Zoom Flash',
    mode: 'zoomFlash',
    timelineColor: '#f8fafc',
    ffmpegColor: 'white',
    previewColor: 'rgba(255, 255, 255, 1)',
  },
}

const EXPORT_PROFILES = {
  fast: {
    label: 'Fast',
    fps: 24,
    preset: 'ultrafast',
    crf: '31',
    audioBitrate: '96k',
  },
  balanced: {
    label: 'Balanced',
    fps: 30,
    preset: 'veryfast',
    crf: '27',
    audioBitrate: '128k',
  },
  high: {
    label: 'High',
    fps: 30,
    preset: 'faster',
    crf: '23',
    audioBitrate: '160k',
  },
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const SNAP_THRESHOLD_SECONDS = 0.12

const snapToCandidates = (value, candidates, threshold = SNAP_THRESHOLD_SECONDS) => {
  if (!Number.isFinite(value) || !Array.isArray(candidates) || !candidates.length) {
    return value
  }

  let nearest = value
  let smallestDistance = Number.POSITIVE_INFINITY

  candidates.forEach((candidate) => {
    if (!Number.isFinite(candidate)) {
      return
    }
    const distance = Math.abs(candidate - value)
    if (distance < smallestDistance) {
      smallestDistance = distance
      nearest = candidate
    }
  })

  if (smallestDistance <= threshold) {
    return nearest
  }

  return value
}

const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const formatTime = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

const formatPreciseTime = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return safe.toFixed(2)
}

const getErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  if (error && typeof error === 'object') {
    const maybeMessage = error.message || error.reason || error.name
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage
    }
  }

  return 'Unknown error'
}

const getTransitionOpacityAtTime = (clip, time) => {
  if (!clip || !Number.isFinite(time) || time < clip.start || time > clip.start + clip.duration) {
    return 0
  }

  const progress = clip.duration > 0 ? clamp((time - clip.start) / clip.duration, 0, 1) : 0
  const preset = TRANSITION_PRESETS[clip.transitionKind] ?? TRANSITION_PRESETS.dipBlack

  switch (preset.mode) {
    case 'fadeIn':
      return 1 - progress
    case 'fadeOut':
      return progress
    default:
      return progress <= 0.5 ? progress * 2 : (1 - progress) * 2
  }
}

const getTransitionCoverageAtTime = (clip, time) => {
  if (!clip || !Number.isFinite(time) || time < clip.start || time > clip.start + clip.duration) {
    return 0
  }

  const progress = clip.duration > 0 ? clamp((time - clip.start) / clip.duration, 0, 1) : 0
  return progress <= 0.5 ? progress * 2 : (1 - progress) * 2
}

const getTransitionPreviewStyle = (clip, time) => {
  const preset = TRANSITION_PRESETS[clip.transitionKind] ?? TRANSITION_PRESETS.dipBlack
  const opacity = getTransitionOpacityAtTime(clip, time)
  const coverage = getTransitionCoverageAtTime(clip, time)
  const progress = clip.duration > 0 ? clamp((time - clip.start) / clip.duration, 0, 1) : 0
  const hiddenInset = `${Math.max(0, (1 - coverage) * 100)}%`
  const slideForward = progress <= 0.5
    ? 100 - (progress * 200)
    : -((progress - 0.5) * 200)
  const slideReverse = progress <= 0.5
    ? -100 + (progress * 200)
    : ((progress - 0.5) * 200)
  const zoomScale = 0.4 + (coverage * 0.9)

  switch (preset.mode) {
    case 'wipeLeft':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: `inset(0 ${hiddenInset} 0 0)`,
        transform: 'translate3d(0, 0, 0)',
      }
    case 'wipeRight':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: `inset(0 0 0 ${hiddenInset})`,
        transform: 'translate3d(0, 0, 0)',
      }
    case 'wipeUp':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: `inset(${hiddenInset} 0 0 0)`,
        transform: 'translate3d(0, 0, 0)',
      }
    case 'wipeDown':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: `inset(0 0 ${hiddenInset} 0)`,
        transform: 'translate3d(0, 0, 0)',
      }
    case 'slideLeft':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: 'inset(0 0 0 0)',
        transform: `translate3d(${slideForward}%, 0, 0)`,
      }
    case 'slideRight':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: 'inset(0 0 0 0)',
        transform: `translate3d(${slideReverse}%, 0, 0)`,
      }
    case 'slideUp':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: 'inset(0 0 0 0)',
        transform: `translate3d(0, ${slideReverse}%, 0)`,
      }
    case 'slideDown':
      return {
        opacity: 1,
        background: preset.previewColor,
        clipPath: 'inset(0 0 0 0)',
        transform: `translate3d(0, ${slideForward}%, 0)`,
      }
    case 'zoomFlash':
      return {
        opacity,
        background: preset.previewColor,
        clipPath: 'inset(0 0 0 0)',
        transform: `scale(${zoomScale})`,
      }
    default:
      return {
        opacity,
        background: preset.previewColor,
        clipPath: 'inset(0 0 0 0)',
        transform: 'translate3d(0, 0, 0)',
      }
  }
}

const FFMPEG_CORE_SOURCES = [
  {
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.wasm',
  },
  {
    coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.wasm',
  },
]

const canvasToPngBlob = (canvasEl, width = canvasEl.width, height = canvasEl.height) => new Promise((resolve, reject) => {
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = width
  exportCanvas.height = height

  const context = exportCanvas.getContext('2d')
  if (!context) {
    reject(new Error('Unable to initialize export canvas.'))
    return
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(canvasEl, 0, 0, width, height)

  exportCanvas.toBlob((blob) => {
    if (blob) {
      resolve(blob)
      return
    }
    reject(new Error('Unable to serialize overlay frame.'))
  }, 'image/png')
})

function VideoEditorPage() {
  const canvasElRef = useRef(null)
  const timelineRef = useRef(null)
  const canvasRef = useRef(null)
  const ffmpegRef = useRef(null)
  const previewVideoRef = useRef(null)
  const sourceVideosRef = useRef([])
  const playheadRef = useRef(0)

  const [clipItems, setClipItems] = useState([])
  const [layers, setLayers] = useState([])
  const [selectedClipId, setSelectedClipId] = useState(null)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [sourceVideos, setSourceVideos] = useState([])
  const [busyMessage, setBusyMessage] = useState('Idle')
  const [exportProfile, setExportProfile] = useState('balanced')
  const [exportProgress, setExportProgress] = useState(null)
  const [transitionPreset, setTransitionPreset] = useState('dipBlack')
  const [clipResizeState, setClipResizeState] = useState(null)
  const [timelineClipDragState, setTimelineClipDragState] = useState(null)
  const [videoFramePreviews, setVideoFramePreviews] = useState({})

  useEffect(() => {
    sourceVideosRef.current = sourceVideos
  }, [sourceVideos])

  useEffect(() => {
    playheadRef.current = playhead
  }, [playhead])

  const selectedClip = useMemo(
    () => clipItems.find((clip) => clip.id === selectedClipId) ?? null,
    [clipItems, selectedClipId],
  )

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedObjectId) ?? null,
    [layers, selectedObjectId],
  )

  const sourceVideoClips = useMemo(
    () => clipItems.filter((clip) => clip.track === 'video' && clip.sourceId),
    [clipItems],
  )

  const extractVideoFrames = useCallback((videoUrl, frameCount = 16) => new Promise((resolve, reject) => {
    const probeVideo = document.createElement('video')
    const exportCanvas = document.createElement('canvas')
    const context = exportCanvas.getContext('2d')

    if (!context) {
      reject(new Error('Failed to initialize frame extraction context.'))
      return
    }

    const cleanup = () => {
      probeVideo.src = ''
      probeVideo.removeAttribute('src')
    }

    probeVideo.preload = 'metadata'
    probeVideo.muted = true
    probeVideo.playsInline = true
    probeVideo.src = videoUrl

    probeVideo.onloadedmetadata = async () => {
      try {
        const duration = Number.isFinite(probeVideo.duration) ? probeVideo.duration : 0
        const width = Math.max(1, probeVideo.videoWidth || 160)
        const height = Math.max(1, probeVideo.videoHeight || 90)

        exportCanvas.width = width
        exportCanvas.height = height

        if (duration <= 0) {
          cleanup()
          resolve([])
          return
        }

        const captureTimes = Array.from({ length: frameCount }, (_, index) => {
          const position = (index + 0.5) / frameCount
          return Math.max(0, Math.min(duration, duration * position))
        })

        const frames = []
        for (const time of captureTimes) {
          await new Promise((next, fail) => {
            probeVideo.onseeked = () => next()
            probeVideo.onerror = () => fail(new Error('Failed to seek video frame.'))
            probeVideo.currentTime = time
          })

          context.drawImage(probeVideo, 0, 0, width, height)
          frames.push(exportCanvas.toDataURL('image/jpeg', 0.72))
        }

        cleanup()
        resolve(frames)
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    probeVideo.onerror = () => {
      cleanup()
      reject(new Error('Failed to decode source video frames.'))
    }
  }), [])

  useEffect(() => {
    const sourceIds = new Set(sourceVideos.map((item) => item.id))
    setVideoFramePreviews((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([sourceId]) => sourceIds.has(sourceId)),
      )
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [sourceVideos])

  useEffect(() => {
    let cancelled = false

    const missingSources = sourceVideos.filter((item) => !videoFramePreviews[item.id])
    if (!missingSources.length) {
      return undefined
    }

    const generate = async () => {
      for (const source of missingSources) {
        try {
          const frames = await extractVideoFrames(source.url)
          if (cancelled) {
            return
          }

          setVideoFramePreviews((prev) => {
            if (prev[source.id]) {
              return prev
            }
            return {
              ...prev,
              [source.id]: frames,
            }
          })
        } catch {
          if (cancelled) {
            return
          }

          setVideoFramePreviews((prev) => ({
            ...prev,
            [source.id]: [],
          }))
        }
      }
    }

    void generate()

    return () => {
      cancelled = true
    }
  }, [sourceVideos, videoFramePreviews, extractVideoFrames])

  const activeSourceVideoClip = useMemo(() => {
    return sourceVideoClips
      .filter((clip) => playhead >= clip.start && playhead <= clip.start + clip.duration)
      .sort((left, right) => left.start - right.start)[0] ?? null
  }, [playhead, sourceVideoClips])

  const activeSourceVideo = useMemo(() => {
    return sourceVideos.find((item) => item.id === activeSourceVideoClip?.sourceId) ?? null
  }, [sourceVideos, activeSourceVideoClip])

  const transitionClips = useMemo(
    () => clipItems.filter((clip) => clip.type === 'transition'),
    [clipItems],
  )

  const activeTransitionVisual = useMemo(() => {
    return transitionClips.reduce((activeTransition, clip) => {
      const previewStyle = getTransitionPreviewStyle(clip, playhead)
      if (previewStyle.opacity <= 0) {
        return activeTransition
      }

      if (!activeTransition || previewStyle.opacity > activeTransition.opacity) {
        return {
          ...previewStyle,
        }
      }

      return activeTransition
    }, null)
  }, [playhead, transitionClips])

  const selectedExportProfile = EXPORT_PROFILES[exportProfile] ?? EXPORT_PROFILES.balanced

  const getFfmpeg = useCallback(async () => {
    if (!ffmpegRef.current) {
      ffmpegRef.current = new FFmpeg()
    }

    if (!ffmpegRef.current.loaded) {
      let lastError = null

      for (const source of FFMPEG_CORE_SOURCES) {
        try {
          const ffmpeg = new FFmpeg()
          await ffmpeg.load({
            coreURL: source.coreURL,
            wasmURL: source.wasmURL,
          })
          ffmpegRef.current = ffmpeg
          break
        } catch (error) {
          lastError = error
        }
      }

      if (!ffmpegRef.current?.loaded) {
        try {
          const ffmpeg = new FFmpeg()
          await ffmpeg.load()
          ffmpegRef.current = ffmpeg
        } catch (fallbackError) {
          throw new Error(`Failed to load FFmpeg core. ${getErrorMessage(lastError || fallbackError)}`)
        }
      }
    }

    return ffmpegRef.current
  }, [])

  const updateExportProgress = useCallback((label, percent) => {
    setExportProgress({
      label,
      percent: clamp(Math.round(percent), 0, 100),
    })
  }, [])

  const clearExportProgress = useCallback(() => {
    setExportProgress(null)
  }, [])

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
      sourceVideosRef.current.forEach((item) => {
        URL.revokeObjectURL(item.url)
      })

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

  const syncPreviewVideoTime = useCallback((previewVideo, clip, time, threshold = 0.04) => {
    if (!previewVideo || !clip) {
      return
    }

    const clipOffset = clip.sourceOffset || 0
    const clipDuration = clip.sourceDuration || clip.duration
    const clipOut = clipOffset + clipDuration
    const maxPlayable = Number.isFinite(previewVideo.duration)
      ? Math.min(previewVideo.duration, clipOut)
      : clipOut
    const localTime = clipOffset + (time - clip.start)
    const bounded = clamp(localTime, clipOffset, maxPlayable)

    if (Math.abs(previewVideo.currentTime - bounded) > threshold) {
      previewVideo.currentTime = bounded
    }
  }, [])

  useEffect(() => {
    const previewVideo = previewVideoRef.current
    if (!previewVideo) {
      return
    }

    if (isPlaying && activeSourceVideo?.url) {
      const startPlayback = () => {
        if (activeSourceVideoClip) {
          syncPreviewVideoTime(previewVideo, activeSourceVideoClip, playheadRef.current, 0)
        }

        void previewVideo.play().catch(() => {
          setBusyMessage('Video autoplay blocked. Press play again after interacting with the page.')
        })
      }

      if (previewVideo.readyState >= 1) {
        startPlayback()
        return
      }

      previewVideo.addEventListener('loadedmetadata', startPlayback, { once: true })
      return () => {
        previewVideo.removeEventListener('loadedmetadata', startPlayback)
      }
    }

    previewVideo.pause()
  }, [isPlaying, activeSourceVideo, activeSourceVideoClip, syncPreviewVideoTime])

  useEffect(() => {
    const previewVideo = previewVideoRef.current
    if (!previewVideo || !activeSourceVideoClip) {
      return
    }

    const alignToPlayhead = () => {
      const threshold = isPlaying ? 0.12 : 0.04
      syncPreviewVideoTime(previewVideo, activeSourceVideoClip, playhead, threshold)
    }

    if (Number.isFinite(previewVideo.duration) && previewVideo.duration > 0) {
      alignToPlayhead()
      return
    }

    previewVideo.addEventListener('loadedmetadata', alignToPlayhead, { once: true })
    return () => {
      previewVideo.removeEventListener('loadedmetadata', alignToPlayhead)
    }
  }, [playhead, isPlaying, activeSourceVideoClip, syncPreviewVideoTime])

  const uploadSourceVideo = async (event) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) {
      return
    }

    setBusyMessage(`Preparing ${files.length} source video layer(s)...`)
    setIsPlaying(false)
    const loadedSources = []

    for (const file of files) {
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

        loadedSources.push({
          id: id('source'),
          file,
          url: sourceUrl,
          duration: Number.isFinite(probeVideo.duration) ? Math.max(0.5, Number(probeVideo.duration.toFixed(2))) : 18,
        })
      } catch {
        URL.revokeObjectURL(sourceUrl)
      }
    }

    if (!loadedSources.length) {
      setBusyMessage('Unable to load selected video files. Try MP4 (H.264) for browser compatibility.')
      event.target.value = ''
      return
    }

    setSourceVideos((prev) => [...prev, ...loadedSources])

    setClipItems((prev) => {
      const currentVideoTrackEnd = prev
        .filter((clip) => clip.track === 'video')
        .reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0)

      let nextStart = currentVideoTrackEnd
      const newVideoClips = loadedSources.map((source) => {
        const nextClip = {
          id: id('clip'),
          objectId: `source-video-${source.id}`,
          sourceId: source.id,
          label: source.file.name.replace(/\.[^/.]+$/, '') || 'Main footage',
          track: 'video',
          start: nextStart,
          duration: source.duration,
          sourceOffset: 0,
          sourceDuration: source.duration,
          color: '#2f455c',
          type: 'video',
        }
        nextStart += source.duration
        return nextClip
      })

      return [...prev, ...newVideoClips]
    })

    setSelectedObjectId(null)
    setPlayhead(0)
    setBusyMessage(`Added ${loadedSources.length} source video layer(s).`)
    event.target.value = ''
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

  const addTransitionClip = () => {
    const preset = TRANSITION_PRESETS[transitionPreset] ?? TRANSITION_PRESETS.dipBlack

    setClipItems((prev) => [
      ...prev,
      {
        id: id('clip'),
        objectId: null,
        label: preset.label,
        track: 'transition',
        start: clamp(playhead, 0, Math.max(0, timelineDuration - 1.2)),
        duration: 1.2,
        color: preset.timelineColor,
        type: 'transition',
        transitionKind: transitionPreset,
      },
    ])
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

  const autoScrollTimelineAtClientX = useCallback((clientX) => {
    const timeline = timelineRef.current
    if (!timeline) {
      return
    }

    const bounds = timeline.getBoundingClientRect()
    const edgeZone = 44
    const step = 18

    if (clientX < bounds.left + edgeZone) {
      timeline.scrollLeft = Math.max(0, timeline.scrollLeft - step)
      return
    }

    if (clientX > bounds.right - edgeZone) {
      timeline.scrollLeft = Math.min(timeline.scrollWidth - timeline.clientWidth, timeline.scrollLeft + step)
    }
  }, [])

  const getTrackSnapCandidates = useCallback((trackId, clipId) => {
    const points = [0, timelineDuration]

    clipItems.forEach((clip) => {
      if (clip.id === clipId || clip.track !== trackId) {
        return
      }
      points.push(clip.start)
      points.push(clip.start + clip.duration)
    })

    return points
  }, [clipItems, timelineDuration])

  const startClipResize = useCallback((event, clip, edge) => {
    if (!RESIZABLE_CLIP_TRACKS.includes(clip.track)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    setSelectedClipId(clip.id)
    setClipResizeState({
      clipId: clip.id,
      track: clip.track,
      edge,
      initialClientX: event.clientX,
      initialScrollLeft: timelineRef.current?.scrollLeft ?? 0,
      initialStart: clip.start,
      initialDuration: clip.duration,
      initialSourceOffset: clip.sourceOffset || 0,
      initialSourceDuration: clip.sourceDuration || clip.duration,
      maxSourceDuration: sourceVideosRef.current.find((item) => item.id === clip.sourceId)?.duration
        || clip.sourceDuration
        || clip.duration,
    })
  }, [])

  useEffect(() => {
    if (!clipResizeState) {
      return undefined
    }

    const onPointerMove = (event) => {
      autoScrollTimelineAtClientX(event.clientX)

      const currentScrollLeft = timelineRef.current?.scrollLeft ?? clipResizeState.initialScrollLeft
      const deltaSeconds = (
        (event.clientX - clipResizeState.initialClientX)
        + (currentScrollLeft - clipResizeState.initialScrollLeft)
      ) / PIXELS_PER_SECOND
      const snapCandidates = getTrackSnapCandidates(clipResizeState.track, clipResizeState.clipId)

      setClipItems((prev) => prev.map((clip) => {
        if (clip.id !== clipResizeState.clipId) {
          return clip
        }

        if (clip.track === 'video') {
          const maxSourceDuration = clipResizeState.maxSourceDuration || clipResizeState.initialSourceDuration
          const minDuration = 0.5

          if (clipResizeState.edge === 'right') {
            const maxTimelineDuration = Math.max(minDuration, timelineDuration - clipResizeState.initialStart)
            const maxDurationFromSource = Math.max(
              minDuration,
              maxSourceDuration - clipResizeState.initialSourceOffset,
            )
            const nextDuration = clamp(
              clipResizeState.initialDuration + deltaSeconds,
              minDuration,
              Math.min(maxTimelineDuration, maxDurationFromSource),
            )
            const snappedEnd = snapToCandidates(
              clipResizeState.initialStart + nextDuration,
              snapCandidates,
            )
            const snappedDuration = clamp(
              snappedEnd - clipResizeState.initialStart,
              minDuration,
              Math.min(maxTimelineDuration, maxDurationFromSource),
            )

            return {
              ...clip,
              duration: snappedDuration,
              sourceDuration: snappedDuration,
            }
          }

          const minStart = Math.max(0, clipResizeState.initialStart - clipResizeState.initialSourceOffset)
          const maxStart = clipResizeState.initialStart + clipResizeState.initialDuration - minDuration
          const rawStart = clamp(clipResizeState.initialStart + deltaSeconds, minStart, maxStart)
          const nextStart = clamp(snapToCandidates(rawStart, snapCandidates), minStart, maxStart)
          const startDelta = nextStart - clipResizeState.initialStart
          const nextDuration = clipResizeState.initialDuration - startDelta
          const nextSourceOffset = clamp(
            clipResizeState.initialSourceOffset + startDelta,
            0,
            Math.max(0, maxSourceDuration - minDuration),
          )

          return {
            ...clip,
            start: nextStart,
            duration: nextDuration,
            sourceOffset: nextSourceOffset,
            sourceDuration: nextDuration,
          }
        }

        if (clipResizeState.edge === 'right') {
          const maxDuration = Math.min(
            clipResizeState.initialDuration,
            timelineDuration - clipResizeState.initialStart
          )
          const snappedEnd = snapToCandidates(
            clipResizeState.initialStart + clamp(clipResizeState.initialDuration + deltaSeconds, 0.5, maxDuration),
            snapCandidates,
          )
          return {
            ...clip,
            duration: clamp(snappedEnd - clipResizeState.initialStart, 0.5, maxDuration),
          }
        }

        const clipEnd = clipResizeState.initialStart + clipResizeState.initialDuration
        const nextStart = clamp(snapToCandidates(
          clamp(clipResizeState.initialStart + deltaSeconds, 0, clipEnd - 0.5),
          snapCandidates,
        ), 0, clipEnd - 0.5)
        return {
          ...clip,
          start: nextStart,
          duration: clipEnd - nextStart,
        }
      }))
    }

    const onPointerUp = () => {
      setClipResizeState(null)
      setBusyMessage('Clip duration updated.')
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)

    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }
  }, [clipResizeState, timelineDuration, autoScrollTimelineAtClientX, getTrackSnapCandidates])

  useEffect(() => {
    if (!timelineClipDragState) {
      return undefined
    }

    const onPointerMove = (event) => {
      autoScrollTimelineAtClientX(event.clientX)

      const currentScrollLeft = timelineRef.current?.scrollLeft ?? timelineClipDragState.initialScrollLeft
      const deltaSeconds = (
        (event.clientX - timelineClipDragState.initialClientX)
        + (currentScrollLeft - timelineClipDragState.initialScrollLeft)
      ) / PIXELS_PER_SECOND
      const hasMoved = Math.abs(deltaSeconds) > 0.01

      if (hasMoved && !timelineClipDragState.hasMoved) {
        setTimelineClipDragState((current) => (current ? { ...current, hasMoved: true } : current))
      }

      const snapCandidates = getTrackSnapCandidates(
        timelineClipDragState.track,
        timelineClipDragState.clipId,
      )

      setClipItems((prev) => prev.map((clip) => {
        if (clip.id !== timelineClipDragState.clipId) {
          return clip
        }

        const rawStart = clamp(
          timelineClipDragState.initialStart + deltaSeconds,
          0,
          Math.max(0, timelineDuration - clip.duration),
        )

        const snappedStart = snapToCandidates(rawStart, snapCandidates)

        return {
          ...clip,
          start: clamp(snappedStart, 0, Math.max(0, timelineDuration - clip.duration)),
        }
      }))
    }

    const onPointerUp = () => {
      const moved = timelineClipDragState.hasMoved
      setTimelineClipDragState(null)
      if (moved) {
        setBusyMessage('Clip position updated.')
      }
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)

    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }
  }, [timelineClipDragState, timelineDuration, autoScrollTimelineAtClientX, getTrackSnapCandidates])

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

        if (clip.track === 'video') {
          const source = sourceVideosRef.current.find((item) => item.id === clip.sourceId)
          const maxSourceDuration = source?.duration || clip.sourceDuration || clip.duration
          const nextOffset = clamp(
            Number.isFinite(next.sourceOffset) ? next.sourceOffset : (clip.sourceOffset || 0),
            0,
            Math.max(0, maxSourceDuration - 0.5),
          )

          next.sourceOffset = nextOffset
          next.duration = Math.min(next.duration, maxSourceDuration - nextOffset)
          next.sourceDuration = next.duration
        }

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

    if (selectedClip.track === 'video' && selectedClip.sourceId) {
      const stillReferenced = clipItems.some(
        (clip) => clip.id !== selectedClip.id && clip.sourceId === selectedClip.sourceId,
      )

      if (!stillReferenced) {
        setSourceVideos((prev) => {
          const target = prev.find((item) => item.id === selectedClip.sourceId)
          if (target) {
            URL.revokeObjectURL(target.url)
          }
          return prev.filter((item) => item.id !== selectedClip.sourceId)
        })
      }
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
    if (!sourceVideoClips.length || !sourceVideos.length) {
      setBusyMessage('Upload at least one source video first to export.')
      return
    }

    updateExportProgress('Preparing export', 0)

    const stageCanvas = canvasRef.current
    if (!stageCanvas) {
      setBusyMessage('Export failed: stage canvas is not ready.')
      return
    }

    const orderedVideoClips = [...sourceVideoClips].sort((left, right) => left.start - right.start)
    const baseTimelineStart = orderedVideoClips[0]?.start ?? 0
    const baseTimelineEnd = orderedVideoClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0)
    const baseTimelineDuration = Math.max(0.5, baseTimelineEnd - baseTimelineStart)
    const hasVisualEdits = stageCanvas
      .getObjects()
      .some((object) => object.data?.kind !== 'stage')
    const hasTransitions = transitionClips.length > 0
    const earliestClip = orderedVideoClips[0]
    const earliestSource = sourceVideos.find((item) => item.id === earliestClip?.sourceId) ?? null
    const sourceExtension = earliestSource?.file.name.split('.').pop()?.toLowerCase() || ''
    const isSourceMp4 = earliestSource?.file.type === 'video/mp4' || sourceExtension === 'mp4'
    const sourceInputOffset = orderedVideoClips.length === 1
      ? (orderedVideoClips[0]?.sourceOffset || 0)
      : 0
    const trimStart = 0
    const trimDuration = baseTimelineDuration
    const isFullLengthExport =
      orderedVideoClips.length === 1
      && Number.isFinite(earliestSource?.duration)
      && baseTimelineStart <= 0.05
      && Math.abs(trimDuration - earliestSource.duration) <= 0.35

    if (!hasVisualEdits && !hasTransitions && isSourceMp4 && isFullLengthExport && earliestSource) {
      const sourceUrl = URL.createObjectURL(earliestSource.file)
      const anchor = document.createElement('a')
      anchor.href = sourceUrl
      anchor.download = 'canva-like-export.mp4'
      anchor.click()
      URL.revokeObjectURL(sourceUrl)
      setBusyMessage('Export finished instantly using original MP4 source.')
      updateExportProgress('Completed', 100)
      setTimeout(() => {
        clearExportProgress()
      }, 800)
      return
    }

    try {
      setBusyMessage('Loading FFmpeg core (first time can take a while)...')
      updateExportProgress('Loading encoder', 5)
      const ffmpeg = await getFfmpeg()
      const inputName = `input-${Date.now()}.mp4`
      const outputName = `export-${Date.now()}.mp4`
      const tempFrameNames = []
      const renderedOverlayCache = new Map()
      const frameRate = selectedExportProfile.fps || 30
      const outputWidth = STAGE_WIDTH
      const outputHeight = STAGE_HEIGHT
      const originalPlayhead = playhead
      const activeObject = stageCanvas.getActiveObject() ?? null

      stageCanvas.getObjects().forEach((object) => {
        if (typeof object.exitEditing === 'function' && object.isEditing) {
          object.exitEditing()
        }
      })
      stageCanvas.discardActiveObject()
      stageCanvas.renderAll()

      setBusyMessage('Writing source media into FFmpeg virtual FS...')
      updateExportProgress('Preparing media', 10)

      if (orderedVideoClips.length === 1) {
        const source = sourceVideos.find((item) => item.id === orderedVideoClips[0].sourceId)
        if (!source) {
          throw new Error('Missing source media for video clip.')
        }
        await ffmpeg.writeFile(inputName, await fetchFile(source.file))
      } else {
        const segmentInputs = []
        const concatParts = []

        let timelineCursor = baseTimelineStart
        for (const clip of orderedVideoClips) {
          const clipStart = Math.max(baseTimelineStart, clip.start)
          const gapDuration = clipStart - timelineCursor

          if (gapDuration > 0.02) {
            concatParts.push({ type: 'gap', duration: gapDuration })
          }

          concatParts.push({ type: 'clip', clip })
          timelineCursor = Math.max(timelineCursor, clip.start + clip.duration)
        }

        const stitchedArgs = []
        concatParts.forEach((part, partIndex) => {
          if (part.type === 'gap') {
            stitchedArgs.push(
              '-f',
              'lavfi',
              '-t',
              String(part.duration),
              '-i',
              `color=c=black:s=${outputWidth}x${outputHeight}:r=${frameRate}`,
            )
            return
          }

          const source = sourceVideos.find((item) => item.id === part.clip.sourceId)
          if (!source) {
            return
          }

          const extension = source.file.name.split('.').pop()?.toLowerCase() || 'mp4'
          const safeExtension = /^[a-z0-9]{2,5}$/.test(extension) ? extension : 'mp4'
          const clipInputName = `source-${String(partIndex).padStart(3, '0')}.${safeExtension}`
          segmentInputs.push({ name: clipInputName, sourceFile: source.file })
          stitchedArgs.push(
            '-ss',
            String(part.clip.sourceOffset || 0),
            '-t',
            String(part.clip.sourceDuration || part.clip.duration),
            '-i',
            clipInputName,
          )
        })

        await Promise.all(
          segmentInputs.map(async (segment) => {
            await ffmpeg.writeFile(segment.name, await fetchFile(segment.sourceFile))
          }),
        )

        const filterParts = []
        const concatInputs = []
        concatParts.forEach((part, index) => {
          filterParts.push(`[${index}:v]scale=${outputWidth}:${outputHeight},fps=${frameRate},format=yuv420p,setsar=1[v${index}]`)
          concatInputs.push(`[v${index}]`)
        })
        filterParts.push(`${concatInputs.join('')}concat=n=${concatParts.length}:v=1:a=0[vout]`)

        await ffmpeg.exec([
          ...stitchedArgs,
          '-filter_complex',
          filterParts.join(';'),
          '-map',
          '[vout]',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '24',
          '-pix_fmt',
          'yuv420p',
          inputName,
        ])

        await Promise.allSettled(segmentInputs.map((segment) => ffmpeg.deleteFile(segment.name)))
      }

      const overlaySegments = []
      const normalizedTransitionClips = transitionClips
        .map((clip) => {
          const relativeStart = clip.start - baseTimelineStart
          const relativeEnd = (clip.start + clip.duration) - baseTimelineStart
          const boundedStart = clamp(relativeStart, trimStart, trimStart + trimDuration)
          const boundedEnd = clamp(relativeEnd, trimStart, trimStart + trimDuration)
          const duration = boundedEnd - boundedStart

          if (duration <= 0.001) {
            return null
          }

          return {
            ...clip,
            start: boundedStart,
            duration,
            end: boundedEnd,
          }
        })
        .filter(Boolean)

      if (hasVisualEdits) {
        setIsPlaying(false)
        setBusyMessage('Rendering overlay segments for direct MP4 export...')

        const trimEnd = trimStart + trimDuration
        const changePoints = new Set([trimStart, trimEnd])

        clipItems.forEach((clip) => {
          if (clip.track === 'video') {
            return
          }

          const clipStart = clamp(clip.start - baseTimelineStart, trimStart, trimEnd)
          const clipEnd = clamp((clip.start + clip.duration) - baseTimelineStart, trimStart, trimEnd)
          changePoints.add(clipStart)
          changePoints.add(clipEnd)
        })

        const sortedPoints = [...changePoints].sort((left, right) => left - right)

        for (let segmentIndex = 0; segmentIndex < sortedPoints.length - 1; segmentIndex += 1) {
          const segmentStart = sortedPoints[segmentIndex]
          const segmentEnd = sortedPoints[segmentIndex + 1]
          const segmentDuration = segmentEnd - segmentStart

          if (segmentDuration <= 0.001) {
            continue
          }

          const timelineTime = baseTimelineStart + segmentStart + (segmentDuration / 2)
          applyPlaybackVisibility(timelineTime)
          stageCanvas.renderAll()

          const visibleOverlayObjects = stageCanvas
            .getObjects()
            .filter((object) => object.data?.kind !== 'stage' && object.visible !== false)

          const hasVisibleOverlay = visibleOverlayObjects.length > 0

          if (!hasVisibleOverlay) {
            const segmentProgress = ((segmentIndex + 1) / Math.max(1, sortedPoints.length - 1)) * 30
            updateExportProgress('Rendering overlays', 10 + segmentProgress)
            continue
          }

          const overlaySignature = visibleOverlayObjects
            .map((object) => object.data?.id || object.type)
            .join('|')

          let frameName = renderedOverlayCache.get(overlaySignature)

          if (!frameName) {
            const frameBlob = await canvasToPngBlob(stageCanvas.lowerCanvasEl, outputWidth, outputHeight)
            frameName = `overlay-segment-${String(tempFrameNames.length).padStart(4, '0')}.png`
            tempFrameNames.push(frameName)
            await ffmpeg.writeFile(frameName, await fetchFile(frameBlob))
            renderedOverlayCache.set(overlaySignature, frameName)
          }

          overlaySegments.push({
            name: frameName,
            start: segmentStart,
            end: segmentEnd,
            duration: segmentDuration,
          })

          const segmentProgress = ((segmentIndex + 1) / Math.max(1, sortedPoints.length - 1)) * 30
          updateExportProgress('Rendering overlays', 10 + segmentProgress)
        }

        setPlayhead(originalPlayhead)
        applyPlaybackVisibility(originalPlayhead)
        stageCanvas.renderAll()
      }

      const mergedOverlaySegments = overlaySegments.reduce((segments, segment) => {
        const previousSegment = segments[segments.length - 1]

        if (
          previousSegment
          && previousSegment.name === segment.name
          && Math.abs(previousSegment.end - segment.start) <= 0.001
        ) {
          previousSegment.end = segment.end
          previousSegment.duration = previousSegment.end - previousSegment.start
          return segments
        }

        segments.push({ ...segment })
        return segments
      }, [])

      const ffmpegProgressHandler = ({ progress }) => {
        if (mergedOverlaySegments.length > 0 || normalizedTransitionClips.length > 0) {
          updateExportProgress('Encoding direct MP4', 40 + progress * 60)
          return
        }
        updateExportProgress('Processing export', 10 + progress * 90)
      }
      ffmpeg.on('progress', ffmpegProgressHandler)

      try {
        if (mergedOverlaySegments.length > 0 || normalizedTransitionClips.length > 0) {
          setBusyMessage('Encoding overlays and source directly to MP4...')
          const filterParts = [`[0:v]scale=${outputWidth}:${outputHeight}[v0]`]
          let previousStream = 'v0'

          mergedOverlaySegments.forEach((segment, index) => {
            const inputIndex = index + 1
            const outputStream = `v${index + 1}`
            const safeEnd = Math.max(segment.start, segment.end - 0.001)

            filterParts.push(
              `[${inputIndex}:v]format=rgba[ov${index}]`,
              `[${previousStream}][ov${index}]overlay=0:0:format=auto:enable='between(t,${segment.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
            )
            previousStream = outputStream
          })

          const ffmpegArgs = [
            '-ss',
            String(sourceInputOffset + trimStart),
            '-t',
            String(trimDuration),
            '-i',
            inputName,
          ]

          mergedOverlaySegments.forEach((segment) => {
            ffmpegArgs.push(
              '-loop',
              '1',
              '-t',
              String(segment.duration),
              '-i',
              segment.name,
            )
          })

          normalizedTransitionClips.forEach((clip) => {
            const preset = TRANSITION_PRESETS[clip.transitionKind] ?? TRANSITION_PRESETS.dipBlack
            ffmpegArgs.push(
              '-f',
              'lavfi',
              '-t',
              String(clip.duration),
              '-i',
              `color=c=${preset.ffmpegColor}:s=${outputWidth}x${outputHeight}:r=${frameRate}`,
            )
          })

          normalizedTransitionClips.forEach((clip, index) => {
            const inputIndex = mergedOverlaySegments.length + index + 1
            const outputStream = `v${mergedOverlaySegments.length + index + 1}`
            const fadeDuration = Math.max(0.01, clip.duration / 2)
            const safeEnd = Math.max(clip.start, clip.end - 0.001)
            const preset = TRANSITION_PRESETS[clip.transitionKind] ?? TRANSITION_PRESETS.dipBlack

            if (preset.mode === 'fadeIn') {
              filterParts.push(
                `[${inputIndex}:v]format=rgba,fade=t=out:st=0:d=${clip.duration}:alpha=1[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=0:0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'fadeOut') {
              filterParts.push(
                `[${inputIndex}:v]format=rgba,fade=t=in:st=0:d=${clip.duration}:alpha=1[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=0:0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'wipeLeft') {
              filterParts.push(
                `[${inputIndex}:v]crop=w='max(1,in_w*(if(lt(t,${fadeDuration.toFixed(3)}),t/${fadeDuration.toFixed(3)},max(0,(${clip.duration.toFixed(3)}-t)/${fadeDuration.toFixed(3)}))))':h=in_h:x=0:y=0[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=0:0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'wipeRight') {
              filterParts.push(
                `[${inputIndex}:v]crop=w='max(1,in_w*(if(lt(t,${fadeDuration.toFixed(3)}),t/${fadeDuration.toFixed(3)},max(0,(${clip.duration.toFixed(3)}-t)/${fadeDuration.toFixed(3)}))))':h=in_h:x='in_w-out_w':y=0[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=W-w:0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'wipeUp') {
              filterParts.push(
                `[${inputIndex}:v]crop=w=in_w:h='max(1,in_h*(if(lt(t,${fadeDuration.toFixed(3)}),t/${fadeDuration.toFixed(3)},max(0,(${clip.duration.toFixed(3)}-t)/${fadeDuration.toFixed(3)}))))':x=0:y='in_h-out_h'[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=0:H-h:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'wipeDown') {
              filterParts.push(
                `[${inputIndex}:v]crop=w=in_w:h='max(1,in_h*(if(lt(t,${fadeDuration.toFixed(3)}),t/${fadeDuration.toFixed(3)},max(0,(${clip.duration.toFixed(3)}-t)/${fadeDuration.toFixed(3)}))))':x=0:y=0[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=0:0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'slideLeft') {
              filterParts.push(
                `[${inputIndex}:v]format=rgba[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=x='if(lt(t,${fadeDuration.toFixed(3)}),W-(t/${fadeDuration.toFixed(3)})*W,-((t-${fadeDuration.toFixed(3)})/${fadeDuration.toFixed(3)})*W)':y=0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'slideRight') {
              filterParts.push(
                `[${inputIndex}:v]format=rgba[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=x='if(lt(t,${fadeDuration.toFixed(3)}),-W+(t/${fadeDuration.toFixed(3)})*W,((t-${fadeDuration.toFixed(3)})/${fadeDuration.toFixed(3)})*W)':y=0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'slideUp') {
              filterParts.push(
                `[${inputIndex}:v]format=rgba[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=x=0:y='if(lt(t,${fadeDuration.toFixed(3)}),-H+(t/${fadeDuration.toFixed(3)})*H,((t-${fadeDuration.toFixed(3)})/${fadeDuration.toFixed(3)})*H)':format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'slideDown') {
              filterParts.push(
                `[${inputIndex}:v]format=rgba[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=x=0:y='if(lt(t,${fadeDuration.toFixed(3)}),H-(t/${fadeDuration.toFixed(3)})*H,-((t-${fadeDuration.toFixed(3)})/${fadeDuration.toFixed(3)})*H)':format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else if (preset.mode === 'zoomFlash') {
              filterParts.push(
                `[${inputIndex}:v]format=rgba,fade=t=in:st=0:d=${fadeDuration}:alpha=1,fade=t=out:st=${Math.max(0, clip.duration - fadeDuration)}:d=${fadeDuration}:alpha=1,scale=w='iw*(0.4+0.9*(if(lt(t,${fadeDuration.toFixed(3)}),t/${fadeDuration.toFixed(3)},max(0,(${clip.duration.toFixed(3)}-t)/${fadeDuration.toFixed(3)}))))':h='ih*(0.4+0.9*(if(lt(t,${fadeDuration.toFixed(3)}),t/${fadeDuration.toFixed(3)},max(0,(${clip.duration.toFixed(3)}-t)/${fadeDuration.toFixed(3)}))))'[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=(W-w)/2:(H-h)/2:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            } else {
              filterParts.push(
                `[${inputIndex}:v]format=rgba,fade=t=in:st=0:d=${fadeDuration}:alpha=1,fade=t=out:st=${Math.max(0, clip.duration - fadeDuration)}:d=${fadeDuration}:alpha=1[tr${index}]`,
                `[${previousStream}][tr${index}]overlay=0:0:format=auto:enable='between(t,${clip.start.toFixed(3)},${safeEnd.toFixed(3)})'[${outputStream}]`,
              )
            }

            previousStream = outputStream
          })

          ffmpegArgs.push(
            '-filter_complex',
            filterParts.join(';'),
            '-map',
            `[${previousStream}]`,
            '-map',
            '0:a?',
            '-r',
            String(frameRate),
            '-c:v',
            'libx264',
            '-preset',
            selectedExportProfile.preset,
            '-crf',
            selectedExportProfile.crf,
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            selectedExportProfile.audioBitrate,
            '-shortest',
            outputName,
          )

          await ffmpeg.exec(ffmpegArgs)
        } else {
          // Fast path: stream copy avoids re-encoding and is usually much faster.
          setBusyMessage('Fast export: trying stream copy (no re-encode)...')
          try {
            await ffmpeg.exec([
              '-ss',
              String(sourceInputOffset + trimStart),
              '-t',
              String(trimDuration),
              '-i',
              inputName,
              '-map',
              '0:v:0',
              '-map',
              '0:a?',
              '-c',
              'copy',
              '-movflags',
              '+faststart',
              outputName,
            ])
          } catch {
            // Fallback: ultrafast encode for files/codecs that cannot be stream-copied.
            setBusyMessage('Fast copy failed. Falling back to ultrafast encode...')
            await ffmpeg.exec([
              '-ss',
              String(sourceInputOffset + trimStart),
              '-t',
              String(trimDuration),
              '-i',
              inputName,
              '-c:v',
              'libx264',
              '-preset',
              selectedExportProfile.preset,
              '-crf',
              selectedExportProfile.crf,
              '-pix_fmt',
              'yuv420p',
              '-c:a',
              'aac',
              '-b:a',
              selectedExportProfile.audioBitrate,
              outputName,
            ])
          }
        }
      } finally {
        ffmpeg.off('progress', ffmpegProgressHandler)
      }
      updateExportProgress('Processing export', 100)

      const data = await ffmpeg.readFile(outputName)
      const blob = new Blob([data], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'canva-like-export.mp4'
      anchor.click()
      URL.revokeObjectURL(url)

      await Promise.allSettled([
        ffmpeg.deleteFile(inputName),
        ffmpeg.deleteFile(outputName),
        ...tempFrameNames.map((name) => ffmpeg.deleteFile(name)),
      ])

      if (activeObject) {
        stageCanvas.setActiveObject(activeObject)
        stageCanvas.renderAll()
      }

      setBusyMessage(`Export finished (${selectedExportProfile.label}).`) 
      updateExportProgress('Completed', 100)
      setTimeout(() => {
        clearExportProgress()
      }, 1200)
    } catch (error) {
      const activeObject = stageCanvas.getObjects().find((object) => object.data?.id === selectedObjectId) ?? null
      if (activeObject) {
        stageCanvas.setActiveObject(activeObject)
        stageCanvas.renderAll()
      }
      const details = getErrorMessage(error)
      setBusyMessage(`Export failed: ${details}`)
      clearExportProgress()
    }
  }

  return (
    <div className="ve-page">
      <header className="ve-topbar">
     
        <div className="ve-topbar-actions">
          <Link to="/" className="ve-link ve-link-muted">Home</Link>
          <label className="ve-link ve-link-muted" htmlFor="video-source-input">Upload Source Video(s)</label>
          <input
            id="video-source-input"
            type="file"
            accept="video/*"
            multiple
            className="ve-hidden-input"
            onChange={uploadSourceVideo}
          />
          <label className="ve-export-profile" htmlFor="export-profile-select">Quality
            <select
              id="export-profile-select"
              value={exportProfile}
              onChange={(event) => setExportProfile(event.target.value)}
            >
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="high">High</option>
            </select>
          </label>
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
          <div className="ve-transition-controls">
            <label className="ve-transition-picker" htmlFor="transition-preset-select">Transition
              <select
                id="transition-preset-select"
                value={transitionPreset}
                onChange={(event) => setTransitionPreset(event.target.value)}
              >
                {Object.entries(TRANSITION_PRESETS).map(([presetId, preset]) => (
                  <option key={presetId} value={presetId}>{preset.label}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={addTransitionClip}>Add Transition</button>
          </div>

          <p className="ve-status">{busyMessage}</p>
          {exportProgress ? (
            <div className="ve-progress-wrap" role="status" aria-live="polite">
              <div className="ve-progress-meta">
                <span>{exportProgress.label}</span>
                <strong>{exportProgress.percent}%</strong>
              </div>
              <progress className="ve-progress" max={100} value={exportProgress.percent} />
            </div>
          ) : null}

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
              className={`ve-preview-video ${activeSourceVideo?.url ? 'is-visible' : ''}`}
              src={activeSourceVideo?.url || undefined}
              playsInline
              muted
              preload="auto"
              onEnded={() => {
                setIsPlaying(false)
                setPlayhead(timelineDuration)
              }}
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

              {selectedClip.type === 'transition' ? (
                <label>
                  Transition
                  <select
                    value={selectedClip.transitionKind || 'dipBlack'}
                    onChange={(event) => {
                      const nextKind = event.target.value
                      const preset = TRANSITION_PRESETS[nextKind] ?? TRANSITION_PRESETS.dipBlack
                      updateClip({
                        transitionKind: nextKind,
                        label: preset.label,
                        color: preset.timelineColor,
                      })
                    }}
                  >
                    {Object.entries(TRANSITION_PRESETS).map(([presetId, preset]) => (
                      <option key={presetId} value={presetId}>{preset.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {selectedClip.type !== 'transition' ? (
                <label>
                  Color
                  <input
                    type="color"
                    value={selectedClip.color}
                    onChange={(event) => updateClip({ color: event.target.value })}
                  />
                </label>
              ) : null}

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
              <div
                className="ve-track-lane"
                style={{ width: `${timelineWidth}px` }}
              >
                {clipItems
                  .filter((clip) => clip.track === track.id)
                  .map((clip) => (
                    <button
                      type="button"
                      className={`ve-clip ${selectedClipId === clip.id ? 'is-active' : ''} ${clip.track === 'video' ? 'is-video' : ''} ${RESIZABLE_CLIP_TRACKS.includes(clip.track) ? 'is-resizable' : ''} ${clipResizeState?.clipId === clip.id ? 'is-resizing' : ''} ${timelineClipDragState?.clipId === clip.id ? 'is-dragging' : ''}`}
                      key={clip.id}
                      style={{
                        left: `${clip.start * PIXELS_PER_SECOND}px`,
                        width: `${Math.max(44, clip.duration * PIXELS_PER_SECOND)}px`,
                        background: clip.color,
                        position: 'relative',
                      }}
                      onMouseDown={(event) => {
                        if (event.button !== 0) {
                          return
                        }

                        const targetElement = event.target
                        if (!(targetElement instanceof HTMLElement)) {
                          return
                        }

                        if (
                          targetElement.closest('.ve-clip-handle')
                          || targetElement.closest('.ve-clip-reset-btn')
                        ) {
                          return
                        }

                        event.preventDefault()

                        setTimelineClipDragState({
                          clipId: clip.id,
                          track: clip.track,
                          initialClientX: event.clientX,
                          initialScrollLeft: timelineRef.current?.scrollLeft ?? 0,
                          initialStart: clip.start,
                          hasMoved: false,
                        })
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
                        } else {
                          canvasRef.current?.discardActiveObject()
                          canvasRef.current?.renderAll()
                          setSelectedObjectId(null)
                        }
                      }}
                    >
                      {clip.track === 'video' && (clipResizeState?.clipId === clip.id || timelineClipDragState?.clipId === clip.id) ? (
                        <span className="ve-clip-time-hint">
                          {`Start ${formatPreciseTime(clip.start)}s | End ${formatPreciseTime(clip.start + clip.duration)}s | In ${formatPreciseTime(clip.sourceOffset || 0)}s | Out ${formatPreciseTime((clip.sourceOffset || 0) + (clip.sourceDuration || clip.duration))}s`}
                        </span>
                      ) : null}

                      {clip.track === 'video' && ((clip.sourceOffset || 0) > 0 || Math.abs((clip.sourceDuration || clip.duration) - (sourceVideos.find((item) => item.id === clip.sourceId)?.duration || clip.duration)) > 0.02) && (
                        <button
                          type="button"
                          className="ve-clip-reset-btn"
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            zIndex: 2,
                            fontSize: 10,
                            padding: '2px 6px',
                            background: '#fff',
                            border: '1px solid #ccc',
                            borderRadius: 3,
                            cursor: 'pointer',
                          }}
                          title="Reset to original duration"
                          onClick={e => {
                            e.stopPropagation()
                            setClipItems((prev) => prev.map((c) => {
                              if (c.id !== clip.id) {
                                return c
                              }

                              const originalDuration = sourceVideos.find((item) => item.id === c.sourceId)?.duration || c.duration
                              return {
                                ...c,
                                sourceOffset: 0,
                                sourceDuration: originalDuration,
                                duration: originalDuration,
                              }
                            }))
                          }}
                        >
                          Reset
                        </button>
                      )}
                      {clip.track === 'video' && videoFramePreviews[clip.sourceId]?.length ? (
                        <span className="ve-clip-frame-strip" aria-hidden="true">
                          {(() => {
                            const source = sourceVideos.find((item) => item.id === clip.sourceId)
                            const sourceDuration = source?.duration || clip.duration
                            const sourceFrames = videoFramePreviews[clip.sourceId]
                            const startOffset = clip.sourceOffset || 0
                            const visibleDuration = clip.sourceDuration || clip.duration
                            const slotCount = Math.max(6, Math.min(30, Math.round((clip.duration * PIXELS_PER_SECOND) / 24)))

                            return Array.from({ length: slotCount }, (_, frameIndex) => {
                              const sampleTime = startOffset + ((frameIndex + 0.5) / slotCount) * visibleDuration
                              const ratio = sourceDuration > 0 ? sampleTime / sourceDuration : 0
                              const sourceIndex = clamp(
                                Math.round(ratio * (sourceFrames.length - 1)),
                                0,
                                sourceFrames.length - 1,
                              )
                              const frameSrc = sourceFrames[sourceIndex]

                              return <img key={`${clip.id}-frame-${frameIndex}`} src={frameSrc} alt="" />
                            })
                          })()}
                        </span>
                      ) : null}
                      {RESIZABLE_CLIP_TRACKS.includes(clip.track) ? (
                        <span
                          className="ve-clip-handle ve-clip-handle-left"
                          onMouseDown={(event) => startClipResize(event, clip, 'left')}
                        />
                      ) : null}
                      {clip.track !== 'video' ? (
                        <span className="ve-clip-label">{clip.label}</span>
                      ) : null}
                      {RESIZABLE_CLIP_TRACKS.includes(clip.track) ? (
                        <span
                          className="ve-clip-handle ve-clip-handle-right"
                          onMouseDown={(event) => startClipResize(event, clip, 'right')}
                        />
                      ) : null}
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
