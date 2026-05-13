export const STAGE_WIDTH = 1280
export const STAGE_HEIGHT = 720
export const PIXELS_PER_SECOND = 50

export const TRACKS = [
  { id: 'video', label: 'Video' },
  { id: 'transition', label: 'Transition' },
  { id: 'text', label: 'Text' },
  { id: 'overlay', label: 'Overlay' },
]

export const TRANSITION_PRESETS = {
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

export const EXPORT_PROFILES = {
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

export const FFMPEG_CORE_SOURCES = [
  {
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.wasm',
  },
  {
    coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.wasm',
  },
]
