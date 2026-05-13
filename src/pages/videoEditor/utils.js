import { TRANSITION_PRESETS } from './constants'

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

export const formatTime = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export const getErrorMessage = (error) => {
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

export const getTransitionOpacityAtTime = (clip, time) => {
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

export const getTransitionCoverageAtTime = (clip, time) => {
  if (!clip || !Number.isFinite(time) || time < clip.start || time > clip.start + clip.duration) {
    return 0
  }

  const progress = clip.duration > 0 ? clamp((time - clip.start) / clip.duration, 0, 1) : 0
  return progress <= 0.5 ? progress * 2 : (1 - progress) * 2
}

export const getTransitionPreviewStyle = (clip, time) => {
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

export const canvasToPngBlob = (canvasEl, width = canvasEl.width, height = canvasEl.height) => new Promise((resolve, reject) => {
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
