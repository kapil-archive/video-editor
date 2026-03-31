import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const DEFAULT_IMAGE_DURATION = 3;
const MIN_CLIP_DURATION = 0.2;
const DEFAULT_FRAME_RATE = 30;
const EXPORT_WIDTH = 960;
const EXPORT_HEIGHT = 540;
const EXPORT_FPS = 24;
const EXPORT_PRESET = 'ultrafast';
const EXPORT_CRF = 30;
const TRANSITIONS = {
  cut: { name: 'Cut', duration: 0 },
  fade: { name: 'Fade', duration: 0.5 },
  dissolve: { name: 'Dissolve', duration: 0.8 },
  wipeLeft: { name: 'Wipe Left', duration: 0.7 },
  wipeRight: { name: 'Wipe Right', duration: 0.7 },
  slideUp: { name: 'Slide Up', duration: 0.6 },
  zoomIn: { name: 'Zoom In', duration: 0.5 },
  flash: { name: 'Flash', duration: 0.25 },
};

const TRANSITION_TO_XFADE = {
  cut: 'fade',
  fade: 'fade',
  dissolve: 'dissolve',
  wipeLeft: 'wipeleft',
  wipeRight: 'wiperight',
  slideUp: 'slideup',
  zoomIn: 'circleopen',
  flash: 'fadewhite',
};

const createDefaultEffects = () => ({
  brightness: 0,
  contrast: 100,
  saturation: 100,
  speed: 1,
  blur: 0,
  grayscale: 0,
  hue: 0,
  sepia: 0,
  invert: 0,
  sharpen: 0,
  fadeIn: 0,
  fadeOut: 0,
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00.0';
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
};

const getBaseClipDuration = (clip) => {
  if (!clip) {
    return 0;
  }

  if (clip.type === 'image') {
    return Math.max(MIN_CLIP_DURATION, clip.duration ?? DEFAULT_IMAGE_DURATION);
  }

  return Math.max(MIN_CLIP_DURATION, (clip.trimEnd ?? 0) - (clip.trimStart ?? 0));
};

const getRenderedClipDuration = (clip) => {
  if (!clip) {
    return 0;
  }

  if (clip.type === 'image') {
    return Math.max(MIN_CLIP_DURATION, clip.duration ?? DEFAULT_IMAGE_DURATION);
  }

  const speed = Math.max(0.25, clip.effects?.speed ?? 1);
  return Math.max(MIN_CLIP_DURATION, getBaseClipDuration(clip) / speed);
};

const getFileExtension = (file) => {
  const fromName = file?.name?.split('.').pop()?.toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file?.type?.includes('png')) return 'png';
  if (file?.type?.includes('jpeg') || file?.type?.includes('jpg')) return 'jpg';
  if (file?.type?.includes('webp')) return 'webp';
  if (file?.type?.includes('gif')) return 'gif';
  if (file?.type?.includes('quicktime')) return 'mov';
  if (file?.type?.includes('webm')) return 'webm';
  return 'mp4';
};

const getClipFrameRate = (clip) => clip?.frameRate ?? DEFAULT_FRAME_RATE;

const roundToFrameTime = (time, frameRate) => {
  const fps = Math.max(1, frameRate || DEFAULT_FRAME_RATE);
  return Math.round(time * fps) / fps;
};

const getEffectsAtTime = (clip, time) => {
  if (!clip?.keyframes?.length) {
    return clip.effects;
  }

  const sortedKeyframes = [...clip.keyframes].sort((left, right) => left.time - right.time);
  let activeEffects = clip.effects;

  for (const keyframe of sortedKeyframes) {
    if (keyframe.time <= time + 0.0001) {
      activeEffects = keyframe.effects;
    }
  }

  return activeEffects;
};

const buildVideoFilterFromEffects = (clipType, effects, outputDuration) => {
  const filters = [
    `scale=${EXPORT_WIDTH}:${EXPORT_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${EXPORT_WIDTH}:${EXPORT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `eq=brightness=${(effects.brightness / 100).toFixed(2)}:contrast=${Math.max(
      0,
      effects.contrast / 100
    ).toFixed(2)}:saturation=${Math.max(0, effects.saturation / 100).toFixed(2)}`,
  ];

  if (effects.blur > 0) {
    filters.push(`boxblur=${effects.blur}`);
  }

  if (effects.grayscale > 0) {
    filters.push('hue=s=0');
  }

  if (effects.hue !== 0) {
    filters.push(`hue=h=${effects.hue}`);
  }

  if (effects.sepia > 0) {
    // ffmpeg sepia is approximated via colorchannelmixer and blended by amount.
    filters.push(
      `colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0:0:0:0:1`
    );
  }

  if (effects.invert > 0) {
    filters.push('negate');
  }

  if (effects.sharpen > 0) {
    const amount = Math.max(1, Math.round(effects.sharpen));
    filters.push(`unsharp=5:5:${amount}:5:5:0`);
  }

  if (clipType === 'video' && effects.speed !== 1) {
    filters.push(`setpts=${(1 / effects.speed).toFixed(4)}*PTS`);
  }

  if (effects.fadeIn > 0) {
    filters.push(`fade=t=in:st=0:d=${Math.min(effects.fadeIn, outputDuration).toFixed(2)}`);
  }

  if (effects.fadeOut > 0 && outputDuration > effects.fadeOut) {
    filters.push(
      `fade=t=out:st=${Math.max(0, outputDuration - effects.fadeOut).toFixed(2)}:d=${effects.fadeOut.toFixed(2)}`
    );
  }

  filters.push(`fps=${EXPORT_FPS}`);
  return filters.join(',');
};

const hasVisualEdits = (clip) => {
  if (!clip || clip.type !== 'video') {
    return true;
  }

  const effects = clip.effects;
  return (
    (clip.keyframes?.length ?? 0) > 0 ||
    effects.brightness !== 0 ||
    effects.contrast !== 100 ||
    effects.saturation !== 100 ||
    effects.speed !== 1 ||
    effects.blur !== 0 ||
    effects.grayscale !== 0 ||
    effects.hue !== 0 ||
    effects.sepia !== 0 ||
    effects.invert !== 0 ||
    effects.sharpen !== 0 ||
    effects.fadeIn !== 0 ||
    effects.fadeOut !== 0 ||
    clip.transition !== 'cut'
  );
};

const isUntrimmedVideo = (clip) => {
  if (!clip || clip.type !== 'video') {
    return false;
  }

  return Math.abs(clip.trimStart) < 0.01 && Math.abs((clip.sourceDuration ?? clip.duration) - clip.trimEnd) < 0.01;
};

const canUseFastConcat = (clips) => {
  if (clips.length === 0) {
    return false;
  }

  return clips.every((clip) => clip.type === 'video' && isUntrimmedVideo(clip) && !hasVisualEdits(clip));
};

const upsertKeyframe = (keyframes, nextKeyframe) => {
  const nextList = [...(keyframes ?? [])];
  const index = nextList.findIndex((keyframe) => Math.abs(keyframe.time - nextKeyframe.time) < 0.001);

  if (index >= 0) {
    nextList[index] = nextKeyframe;
  } else {
    nextList.push(nextKeyframe);
  }

  nextList.sort((left, right) => left.time - right.time);
  return nextList;
};

function VideoEditorPage() {
  const previewVideoRef = useRef(null);
  const mergedVideoRef = useRef(null);
  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(null);
  const clipsRef = useRef([]);
  const mergedVideoUrlRef = useRef(null);

  const [clips, setClips] = useState([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [exportStatus, setExportStatus] = useState('Loading video engine...');
  const [mergedVideoUrl, setMergedVideoUrl] = useState(null);
  const [editorEffects, setEditorEffects] = useState(createDefaultEffects());
  const [insertAtIndex, setInsertAtIndex] = useState(null);
  const [frameThumbnails, setFrameThumbnails] = useState([]);
  const [frameSampleStep, setFrameSampleStep] = useState(1);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);

  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] : null;
  const selectedFrameRate = getClipFrameRate(selectedClip);
  const selectedStartFrame = selectedClip?.type === 'video'
    ? Math.round((selectedClip.trimStart ?? 0) * selectedFrameRate)
    : 0;
  const selectedEndFrame = selectedClip?.type === 'video'
    ? Math.max(
        selectedStartFrame,
        Math.round((selectedClip.trimEnd ?? selectedClip.sourceDuration ?? 0) * selectedFrameRate)
      )
    : 0;
  const selectedFrameNumber = Math.max(0, Math.round(previewTime * selectedFrameRate));
  const selectedClipKeyframes = useMemo(
    () => (selectedClip?.keyframes ? [...selectedClip.keyframes].sort((left, right) => left.time - right.time) : []),
    [selectedClip]
  );
  const selectedPreviewFilter = selectedClip
    ? `brightness(${1 + editorEffects.brightness / 100}) contrast(${editorEffects.contrast / 100}) saturate(${editorEffects.saturation / 100}) blur(${editorEffects.blur}px) grayscale(${editorEffects.grayscale / 100}) sepia(${editorEffects.sepia / 100}) invert(${editorEffects.invert / 100}) hue-rotate(${editorEffects.hue}deg)`
    : 'none';

  const timelineData = useMemo(() => {
    let cursor = 0;
    return clips.map((clip) => {
      const renderedDuration = getRenderedClipDuration(clip);
      const item = {
        start: cursor,
        end: cursor + renderedDuration,
        renderedDuration,
      };
      cursor += renderedDuration;
      return item;
    });
  }, [clips]);

  const totalDuration = timelineData.at(-1)?.end ?? 0;

  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on('progress', (event) => {
          const progress = typeof event.progress === 'number' ? event.progress : event.ratio ?? 0;
          setExportProgress(Math.round(progress * 100));
        });

        ffmpeg.on('log', (event) => {
          if (event.message?.includes('time=')) {
            setExportStatus(`Processing... ${event.message}`);
          }
        });

        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

        await ffmpeg.load({ coreURL, wasmURL });
        setFfmpegReady(true);
        setExportStatus('Video engine ready');
      } catch (error) {
        console.error('FFmpeg initialization failed:', error);
        setFfmpegReady(false);
        setExportStatus('Video engine failed to load');
      }
    };

    initFFmpeg();

    return () => {
      if (ffmpegRef.current) {
        ffmpegRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    if (!previewVideoRef.current || !selectedClip || selectedClip.type !== 'video') {
      return undefined;
    }

    const videoElement = previewVideoRef.current;
    videoElement.playbackRate = editorEffects.speed;
    videoElement.style.filter = selectedPreviewFilter;
    videoElement.load();

    const handleLoadedMetadata = () => {
      videoElement.currentTime = selectedClip.trimStart;
      setPreviewDuration(videoElement.duration);
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [selectedClip, selectedPreviewFilter, editorEffects.speed]);

  useEffect(() => {
    if (!selectedClip) {
      setEditorEffects(createDefaultEffects());
      return;
    }

    setEditorEffects(selectedClip.effects);
    setPreviewTime(selectedClip.type === 'video' ? selectedClip.trimStart : 0);
  }, [selectedClip]);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    mergedVideoUrlRef.current = mergedVideoUrl;
  }, [mergedVideoUrl]);

  useEffect(() => {
    return () => {
      clipsRef.current.forEach((clip) => {
        URL.revokeObjectURL(clip.url);
      });

      if (mergedVideoUrlRef.current) {
        URL.revokeObjectURL(mergedVideoUrlRef.current);
      }
    };
  }, []);

  const handleUploadClick = () => {
    setInsertAtIndex(null);
    fileInputRef.current?.click();
  };

  const handleInsertClick = (index) => {
    setInsertAtIndex(index);
    fileInputRef.current?.click();
  };

  const createClipFromFile = (file) =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);

      if (file.type.startsWith('image/')) {
        const image = new Image();
        image.onload = () => {
          resolve({
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            type: 'image',
            url,
            file,
            width: image.naturalWidth,
            height: image.naturalHeight,
            duration: DEFAULT_IMAGE_DURATION,
            trimStart: 0,
            trimEnd: DEFAULT_IMAGE_DURATION,
            sourceDuration: DEFAULT_IMAGE_DURATION,
            frameRate: DEFAULT_FRAME_RATE,
            transition: 'cut',
            effects: createDefaultEffects(),
            keyframes: [],
          });
        };
        image.onerror = () => resolve(null);
        image.src = url;
        return;
      }

      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const safeDuration =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : DEFAULT_IMAGE_DURATION;

        resolve({
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          type: 'video',
          url,
          file,
          width: video.videoWidth,
          height: video.videoHeight,
          duration: safeDuration,
          trimStart: 0,
          trimEnd: safeDuration,
          sourceDuration: safeDuration,
          frameRate: DEFAULT_FRAME_RATE,
          transition: 'cut',
          effects: createDefaultEffects(),
          keyframes: [],
        });
      };
      video.onerror = () => resolve(null);
      video.src = url;
    });

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files ?? []);

    const parsedClips = (await Promise.all(files.map((file) => createClipFromFile(file)))).filter(Boolean);

    if (parsedClips.length > 0) {
      const insertionIndex =
        insertAtIndex === null ? clips.length : clamp(insertAtIndex, 0, clips.length);

      setClips((prev) => {
        const next = [...prev];
        next.splice(insertionIndex, 0, ...parsedClips);
        return next;
      });

      setSelectedClipIndex(insertionIndex);
    }

    event.target.value = '';
    setInsertAtIndex(null);
  };

  const updateClip = (index, updater) => {
    setClips((prev) => {
      const next = [...prev];
      next[index] = updater(next[index]);
      return next;
    });
  };

  const selectClip = (index) => {
    setSelectedClipIndex(index);
    setPreviewTime(clips[index]?.type === 'video' ? clips[index].trimStart : 0);
  };

  const moveClip = (index, direction) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === clips.length - 1)) {
      return;
    }

    setClips((prev) => {
      const next = [...prev];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
    setSelectedClipIndex(index + direction);
  };

  const removeClip = (index) => {
    setClips((prev) => {
      const clipToRemove = prev[index];
      if (clipToRemove) {
        URL.revokeObjectURL(clipToRemove.url);
      }

      return prev.filter((_, clipIndex) => clipIndex !== index);
    });

    if (selectedClipIndex === index) {
      setSelectedClipIndex(null);
      setPreviewTime(0);
      setPreviewDuration(0);
    } else if (selectedClipIndex !== null && selectedClipIndex > index) {
      setSelectedClipIndex(selectedClipIndex - 1);
    }
  };

  const updateEditorEffect = (effectName, value) => {
    setEditorEffects((prev) => ({
      ...prev,
      [effectName]: value,
    }));
  };

  const applyEditorEffectsToClip = () => {
    if (selectedClipIndex === null) {
      return;
    }

    updateClip(selectedClipIndex, (clip) => ({
      ...clip,
      effects: { ...editorEffects },
    }));
  };

  const updateClipTransition = (index, transition) => {
    updateClip(index, (clip) => ({
      ...clip,
      transition,
    }));
  };

  const updateImageDuration = (index, nextDuration) => {
    const safeDuration = Math.max(MIN_CLIP_DURATION, nextDuration);
    updateClip(index, (clip) => ({
      ...clip,
      duration: safeDuration,
      trimEnd: safeDuration,
      sourceDuration: safeDuration,
    }));
  };

  const updateTrimValue = (index, field, rawValue) => {
    updateClip(index, (clip) => {
      if (clip.type !== 'video') {
        return clip;
      }

      const sourceDuration = clip.sourceDuration ?? clip.duration;
      const nextValue = clamp(rawValue, 0, sourceDuration);
      let nextTrimStart = field === 'trimStart' ? nextValue : clip.trimStart;
      let nextTrimEnd = field === 'trimEnd' ? nextValue : clip.trimEnd;

      if (nextTrimEnd - nextTrimStart < MIN_CLIP_DURATION) {
        if (field === 'trimStart') {
          nextTrimStart = Math.max(0, nextTrimEnd - MIN_CLIP_DURATION);
        } else {
          nextTrimEnd = Math.min(sourceDuration, nextTrimStart + MIN_CLIP_DURATION);
        }
      }

      return {
        ...clip,
        trimStart: nextTrimStart,
        trimEnd: nextTrimEnd,
      };
    });
  };

  const markCurrentTime = (field) => {
    if (!selectedClip || selectedClip.type !== 'video' || !previewVideoRef.current) {
      return;
    }

    updateTrimValue(selectedClipIndex, field, previewVideoRef.current.currentTime);
  };

  const stepPreviewFrame = (delta) => {
    if (!selectedClip || selectedClip.type !== 'video' || !previewVideoRef.current) {
      return;
    }

    const frameDuration = 1 / selectedFrameRate;
    const nextTime = clamp(
      roundToFrameTime(previewVideoRef.current.currentTime + delta * frameDuration, selectedFrameRate),
      selectedClip.trimStart,
      selectedClip.trimEnd
    );

    previewVideoRef.current.currentTime = nextTime;
    setPreviewTime(nextTime);
  };

  const jumpToFrame = (frameNumber) => {
    if (!selectedClip || selectedClip.type !== 'video' || !previewVideoRef.current) {
      return;
    }

    const nextTime = clamp(frameNumber / selectedFrameRate, selectedClip.trimStart, selectedClip.trimEnd);
    previewVideoRef.current.currentTime = nextTime;
    setPreviewTime(nextTime);
  };

  const saveKeyframeAtCurrentTime = () => {
    if (!selectedClip || selectedClip.type !== 'video' || selectedClipIndex === null) {
      return;
    }

    const currentTime = previewVideoRef.current ? previewVideoRef.current.currentTime : previewTime;
    const keyframeTime = clamp(
      roundToFrameTime(currentTime, selectedFrameRate),
      selectedClip.trimStart,
      selectedClip.trimEnd
    );

    updateClip(selectedClipIndex, (clip) => {
      const nextKeyframe = { time: keyframeTime, effects: { ...editorEffects } };

      return {
        ...clip,
        keyframes: upsertKeyframe(clip.keyframes, nextKeyframe),
      };
    });
  };

  const applyEffectsToCurrentFrameOnly = () => {
    if (!selectedClip || selectedClip.type !== 'video' || selectedClipIndex === null) {
      return;
    }

    const currentTime = previewVideoRef.current ? previewVideoRef.current.currentTime : previewTime;
    const fps = getClipFrameRate(selectedClip);
    const frameDuration = 1 / fps;
    const frameStart = clamp(
      roundToFrameTime(currentTime, fps),
      selectedClip.trimStart,
      selectedClip.trimEnd
    );
    const nextFrameStart = clamp(
      roundToFrameTime(frameStart + frameDuration, fps),
      selectedClip.trimStart,
      selectedClip.trimEnd
    );

    updateClip(selectedClipIndex, (clip) => {
      const restoreEffects = getEffectsAtTime(clip, Math.min(nextFrameStart + 0.0001, clip.trimEnd));
      let nextKeyframes = upsertKeyframe(clip.keyframes, {
        time: frameStart,
        effects: { ...editorEffects },
      });

      if (nextFrameStart > frameStart + 0.0001) {
        nextKeyframes = upsertKeyframe(nextKeyframes, {
          time: nextFrameStart,
          effects: { ...restoreEffects },
        });
      }

      return {
        ...clip,
        keyframes: nextKeyframes,
      };
    });
  };

  const loadKeyframeIntoEditor = (keyframe) => {
    if (!selectedClip || selectedClip.type !== 'video' || !previewVideoRef.current) {
      return;
    }

    setEditorEffects({ ...keyframe.effects });
    previewVideoRef.current.currentTime = keyframe.time;
    setPreviewTime(keyframe.time);
  };

  const deleteKeyframe = (time) => {
    if (selectedClipIndex === null) {
      return;
    }

    updateClip(selectedClipIndex, (clip) => ({
      ...clip,
      keyframes: (clip.keyframes ?? []).filter((keyframe) => Math.abs(keyframe.time - time) >= 0.001),
    }));
  };

  const splitSelectedClipAtCurrentFrame = () => {
    if (
      selectedClipIndex === null ||
      !selectedClip ||
      selectedClip.type !== 'video' ||
      !previewVideoRef.current
    ) {
      return;
    }

    const splitTime = roundToFrameTime(
      clamp(previewVideoRef.current.currentTime, selectedClip.trimStart, selectedClip.trimEnd),
      selectedFrameRate
    );

    if (splitTime - selectedClip.trimStart < MIN_CLIP_DURATION || selectedClip.trimEnd - splitTime < MIN_CLIP_DURATION) {
      return;
    }

    const leftClip = {
      ...selectedClip,
      id: `${Date.now()}-${Math.random()}`,
      name: `${selectedClip.name} (Part 1)`,
      trimEnd: splitTime,
      keyframes: (selectedClip.keyframes ?? []).filter((keyframe) => keyframe.time <= splitTime),
    };

    const rightClip = {
      ...selectedClip,
      id: `${Date.now()}-${Math.random()}`,
      name: `${selectedClip.name} (Part 2)`,
      trimStart: splitTime,
      keyframes: (selectedClip.keyframes ?? []).filter((keyframe) => keyframe.time >= splitTime),
    };

    setClips((prev) => {
      const next = [...prev];
      next.splice(selectedClipIndex, 1, leftClip, rightClip);
      return next;
    });
    setSelectedClipIndex(selectedClipIndex + 1);
  };

  useEffect(() => {
    let cancelled = false;

    const buildFrameThumbnails = async () => {
      if (!selectedClip || selectedClip.type !== 'video') {
        setFrameThumbnails([]);
        setFrameSampleStep(1);
        return;
      }

      setIsGeneratingFrames(true);
      const fps = getClipFrameRate(selectedClip);
      const startFrame = Math.max(0, Math.floor(selectedClip.trimStart * fps));
      const endFrame = Math.max(startFrame, Math.floor(selectedClip.trimEnd * fps));
      const totalFrames = Math.max(1, endFrame - startFrame + 1);
      const maxFramesToRender = 220;
      const sampleStep = Math.max(1, Math.ceil(totalFrames / maxFramesToRender));
      setFrameSampleStep(sampleStep);

      const helperVideo = document.createElement('video');
      helperVideo.src = selectedClip.url;
      helperVideo.preload = 'auto';
      helperVideo.muted = true;

      await new Promise((resolve) => {
        helperVideo.onloadedmetadata = resolve;
        helperVideo.onerror = resolve;
      });

      if (cancelled) {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 68;
      const context = canvas.getContext('2d');
      if (!context) {
        setFrameThumbnails([]);
        setIsGeneratingFrames(false);
        return;
      }

      const thumbnails = [];

      for (let frame = startFrame; frame <= endFrame; frame += sampleStep) {
        const time = clamp(frame / fps, selectedClip.trimStart, selectedClip.trimEnd);

        await new Promise((resolve) => {
          const onSeeked = () => {
            helperVideo.removeEventListener('seeked', onSeeked);
            resolve();
          };
          helperVideo.addEventListener('seeked', onSeeked);
          helperVideo.currentTime = time;
        });

        if (cancelled) {
          break;
        }

        context.drawImage(helperVideo, 0, 0, canvas.width, canvas.height);
        thumbnails.push({
          frame,
          time,
          src: canvas.toDataURL('image/jpeg', 0.68),
        });
      }

      if (!cancelled) {
        setFrameThumbnails(thumbnails);
        setIsGeneratingFrames(false);
      }
    };

    buildFrameThumbnails();

    return () => {
      cancelled = true;
    };
  }, [selectedClip]);

  const buildRenderSlices = (clip) => {
    if (clip.type !== 'video') {
      return [];
    }

    const boundaries = [clip.trimStart];
    const relevantKeyframes = (clip.keyframes ?? [])
      .map((keyframe) => roundToFrameTime(keyframe.time, getClipFrameRate(clip)))
      .filter((time) => time > clip.trimStart && time < clip.trimEnd)
      .sort((left, right) => left - right);

    for (const time of relevantKeyframes) {
      if (boundaries.at(-1) !== time) {
        boundaries.push(time);
      }
    }

    boundaries.push(clip.trimEnd);

    const slices = [];
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      if (end - start < MIN_CLIP_DURATION / 2) {
        continue;
      }

      slices.push({
        start,
        end,
        effects: getEffectsAtTime(clip, start),
      });
    }

    return slices;
  };

  const renderSegment = async (ffmpeg, clip, index) => {
    const extension = getFileExtension(clip.file);
    const inputName = `input-${index}.${extension}`;
    const outputName = `segment-${index}.mp4`;
    const fileData = new Uint8Array(await clip.file.arrayBuffer());
    await ffmpeg.writeFile(inputName, fileData);

    const outputDuration = getRenderedClipDuration(clip);
    const videoFilter = buildVideoFilterFromEffects(clip.type, clip.effects, outputDuration);

    if (clip.type === 'image') {
      const args = [
        '-loop',
        '1',
        '-t',
        `${outputDuration}`,
        '-i',
        inputName,
        '-vf',
        videoFilter,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        EXPORT_PRESET,
        '-crf',
        `${EXPORT_CRF}`,
        '-pix_fmt',
        'yuv420p',
        outputName,
      ];

      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error(`Failed rendering image clip ${clip.name}`);
      }
      return outputName;
    }

    const slices = buildRenderSlices(clip);

    if (slices.length <= 1) {
      const trimmedDuration = getBaseClipDuration(clip);
      const args = [
        '-ss',
        `${clip.trimStart}`,
        '-t',
        `${trimmedDuration}`,
        '-i',
        inputName,
        '-vf',
        videoFilter,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        EXPORT_PRESET,
        '-crf',
        `${EXPORT_CRF}`,
        '-pix_fmt',
        'yuv420p',
        outputName,
      ];

      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error(`Failed rendering video clip ${clip.name}`);
      }
      return outputName;
    }

    const partPaths = [];
    for (let partIndex = 0; partIndex < slices.length; partIndex += 1) {
      const slice = slices[partIndex];
      const sourceDuration = slice.end - slice.start;
      const renderedDuration = sourceDuration / Math.max(0.25, slice.effects.speed);
      const partName = `segment-${index}-part-${partIndex}.mp4`;
      const partFilter = buildVideoFilterFromEffects('video', slice.effects, renderedDuration);
      const exitCode = await ffmpeg.exec([
        '-ss',
        `${slice.start}`,
        '-t',
        `${sourceDuration}`,
        '-i',
        inputName,
        '-vf',
        partFilter,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        EXPORT_PRESET,
        '-crf',
        `${EXPORT_CRF}`,
        '-pix_fmt',
        'yuv420p',
        partName,
      ]);

      if (exitCode !== 0) {
        throw new Error(`Failed rendering frame slice ${partIndex + 1} for ${clip.name}`);
      }
      partPaths.push(partName);
    }

    await ffmpeg.writeFile(
      `segment-${index}-concat.txt`,
      partPaths.map((partPath) => `file '${partPath}'`).join('\n')
    );

    const concatExitCode = await ffmpeg.exec([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      `segment-${index}-concat.txt`,
      '-c',
      'copy',
      outputName,
    ]);

    if (concatExitCode !== 0) {
      throw new Error(`Failed joining frame slices for ${clip.name}`);
    }

    return outputName;
  };

  const handleExport = async () => {
    if (!ffmpegReady || !ffmpegRef.current || clips.length === 0) {
      setExportStatus('Video engine not ready or no clips selected');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Preparing clips...');

    try {
      const ffmpeg = ffmpegRef.current;

      if (canUseFastConcat(clips)) {
        setExportStatus('Using fast merge path...');

        const concatEntries = [];
        for (let index = 0; index < clips.length; index += 1) {
          const clip = clips[index];
          const extension = getFileExtension(clip.file);
          const inputName = `fast-input-${index}.${extension}`;
          const fileData = new Uint8Array(await clip.file.arrayBuffer());
          await ffmpeg.writeFile(inputName, fileData);
          concatEntries.push(`file '${inputName}'`);
        }

        await ffmpeg.writeFile('concat.txt', concatEntries.join('\n'));

        const fastMergeExitCode = await ffmpeg.exec([
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          'concat.txt',
          '-c',
          'copy',
          'merged-output.mp4',
        ]);

        if (fastMergeExitCode === 0) {
          const mergedData = await ffmpeg.readFile('merged-output.mp4');
          const nextMergedUrl = URL.createObjectURL(
            new Blob([mergedData.buffer], { type: 'video/mp4' })
          );

          if (mergedVideoUrl) {
            URL.revokeObjectURL(mergedVideoUrl);
          }

          setMergedVideoUrl(nextMergedUrl);
          setExportStatus('Fast merged video ready');

          const link = document.createElement('a');
          link.href = nextMergedUrl;
          link.download = `merged-video-${Date.now()}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setIsExporting(false);
          return;
        }

        setExportStatus('Fast merge failed, falling back to full render...');
      }

      const renderedSegments = [];
      const renderedDurations = [];

      for (let index = 0; index < clips.length; index += 1) {
        setExportStatus(`Rendering clip ${index + 1} of ${clips.length}`);
        const segmentPath = await renderSegment(ffmpeg, clips[index], index);
        renderedSegments.push(segmentPath);
        renderedDurations.push(getRenderedClipDuration(clips[index]));
      }

      const hasTransitionEffects = clips.slice(0, -1).some((clip) => clip.transition !== 'cut');

      let mergeExitCode = 0;
      if (!hasTransitionEffects || renderedSegments.length === 1) {
        const concatFile = renderedSegments.map((segmentPath) => `file '${segmentPath}'`).join('\n');
        await ffmpeg.writeFile('concat.txt', concatFile);

        setExportStatus('Merging rendered clips...');
        mergeExitCode = await ffmpeg.exec([
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          'concat.txt',
          '-c',
          'copy',
          'merged-output.mp4',
        ]);
      } else {
        setExportStatus('Applying transitions and merging clips...');

        const inputs = [];
        renderedSegments.forEach((segmentPath) => {
          inputs.push('-i', segmentPath);
        });

        const filterParts = [];
        let cumulativeDuration = renderedDurations[0];
        let previousLabel = '[0:v]';

        for (let index = 1; index < renderedSegments.length; index += 1) {
          const transitionKey = clips[index - 1].transition;
          const transitionType = TRANSITION_TO_XFADE[transitionKey] || 'fade';
          const configuredDuration = TRANSITIONS[transitionKey]?.duration ?? 0;
          const maxDuration = Math.max(
            0.05,
            Math.min(renderedDurations[index - 1], renderedDurations[index]) - 0.05
          );
          const duration = transitionKey === 'cut'
            ? 0.001
            : clamp(configuredDuration, 0.05, maxDuration);

          const offset = Math.max(0, cumulativeDuration - duration);
          const outputLabel = index === renderedSegments.length - 1 ? '[vout]' : `[vx${index}]`;

          filterParts.push(
            `${previousLabel}[${index}:v]xfade=transition=${transitionType}:duration=${duration.toFixed(
              3
            )}:offset=${offset.toFixed(3)}${outputLabel}`
          );

          previousLabel = outputLabel;
          cumulativeDuration = cumulativeDuration + renderedDurations[index] - duration;
        }

        mergeExitCode = await ffmpeg.exec([
          ...inputs,
          '-filter_complex',
          filterParts.join(';'),
          '-map',
          '[vout]',
          '-an',
          '-c:v',
          'libx264',
          '-preset',
          EXPORT_PRESET,
          '-crf',
          `${EXPORT_CRF}`,
          '-pix_fmt',
          'yuv420p',
          'merged-output.mp4',
        ]);
      }

      if (mergeExitCode !== 0) {
        throw new Error('Final merge failed');
      }

      const mergedData = await ffmpeg.readFile('merged-output.mp4');
      const nextMergedUrl = URL.createObjectURL(
        new Blob([mergedData.buffer], { type: 'video/mp4' })
      );

      if (mergedVideoUrl) {
        URL.revokeObjectURL(mergedVideoUrl);
      }

      setMergedVideoUrl(nextMergedUrl);
      setExportStatus('Merged video ready');

      const link = document.createElement('a');
      link.href = nextMergedUrl;
      link.download = `merged-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="video-editor-page">
      <div className="video-editor-header">
        <h1>Video Editor</h1>
        <div className="header-buttons">
          <button className="upload-btn-video" onClick={handleUploadClick}>
            Add Video or Image
          </button>
          <button
            className="export-btn-video"
            onClick={handleExport}
            disabled={!ffmpegReady || isExporting || clips.length === 0}
          >
            {isExporting ? `Exporting ${exportProgress}%` : 'Merge and Export MP4'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="export-status">{exportStatus}</div>

      <div className="video-editor-main">
        <section className="video-editor-preview">
          <div className="preview-header">
            <h3>Selected Clip Preview</h3>
            {selectedClip ? (
              <span className="preview-timestamp">
                Preview {formatTime(previewTime)} / {formatTime(previewDuration)}
              </span>
            ) : null}
          </div>

          <div className="preview-window">
            {selectedClip ? (
              selectedClip.type === 'video' ? (
                <div className="preview-video-stack">
                  <video
                    key={selectedClip.id}
                    ref={previewVideoRef}
                    src={selectedClip.url}
                    preload="metadata"
                    controls
                    style={{ filter: selectedPreviewFilter }}
                    onTimeUpdate={(event) => setPreviewTime(event.currentTarget.currentTime)}
                    onLoadedMetadata={(event) => setPreviewDuration(event.currentTarget.duration)}
                  />
                  <div className="frame-toolbar">
                    <button className="stamp-action" onClick={() => stepPreviewFrame(-1)}>
                      Prev Frame
                    </button>
                    <div className="frame-readout">
                      <span>Frame</span>
                      <strong>{selectedFrameNumber}</strong>
                    </div>
                    <button className="stamp-action" onClick={() => stepPreviewFrame(1)}>
                      Next Frame
                    </button>
                    <button className="stamp-action" onClick={splitSelectedClipAtCurrentFrame}>
                      Split at Frame
                    </button>
                    <div className="frame-slider-group">
                      <div className="frame-slider-labels">
                        <label htmlFor="frame-slider">Frame Slider</label>
                        <span>
                          {selectedStartFrame} - {selectedEndFrame}
                        </span>
                      </div>
                      <input
                        id="frame-slider"
                        className="frame-slider"
                        type="range"
                        min={selectedStartFrame}
                        max={selectedEndFrame}
                        step="1"
                        value={Math.min(selectedEndFrame, Math.max(selectedStartFrame, selectedFrameNumber))}
                        onChange={(event) => jumpToFrame(Number(event.target.value))}
                      />
                    </div>
                  </div>

                  <div className="frame-strip-panel">
                    <div className="frame-strip-header">
                      <span>Frames ({frameSampleStep === 1 ? 'every frame' : `every ${frameSampleStep} frames`})</span>
                      {isGeneratingFrames ? <span>Generating...</span> : null}
                    </div>
                    <div className="frame-strip-list">
                      {frameThumbnails.map((thumbnail) => (
                        <button
                          key={`${thumbnail.frame}-${thumbnail.time}`}
                          className={`frame-thumb ${Math.abs(thumbnail.time - previewTime) < 0.02 ? 'active' : ''}`}
                          onClick={() => jumpToFrame(thumbnail.frame)}
                        >
                          <img src={thumbnail.src} alt={`Frame ${thumbnail.frame}`} />
                          <span>{thumbnail.frame}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <img className="preview-image" src={selectedClip.url} alt={selectedClip.name} />
              )
            ) : (
              <div className="preview-placeholder">Select a timeline clip to preview and edit</div>
            )}
          </div>

          {mergedVideoUrl ? (
            <div className="merged-preview-panel">
              <div className="preview-header">
                <h3>Merged Output</h3>
              </div>
              <div className="preview-window preview-window-merged">
                <video ref={mergedVideoRef} src={mergedVideoUrl} controls />
              </div>
            </div>
          ) : null}
        </section>

        <aside className="video-editor-sidebar">
          {selectedClip ? (
            <div className="effects-panel">
              <h3>Edit Clip</h3>
              <p className="clip-name-display">{selectedClip.name}</p>

              <div className="effects-section">
                <h4>Timeline Timestamps</h4>
                <div className="timeline-stamp-grid">
                  <div className="stamp-card">
                    <span>Timeline Start</span>
                    <strong>{formatTime(timelineData[selectedClipIndex]?.start ?? 0)}</strong>
                  </div>
                  <div className="stamp-card">
                    <span>Timeline End</span>
                    <strong>{formatTime(timelineData[selectedClipIndex]?.end ?? 0)}</strong>
                  </div>
                </div>
              </div>

              <div className="effects-section">
                <h4>Trim by Timestamp</h4>
                {selectedClip.type === 'video' ? (
                  <>
                    <div className="time-input-row">
                      <label htmlFor="trim-start">Start</label>
                      <input
                        id="trim-start"
                        className="time-input"
                        type="number"
                        min="0"
                        max={selectedClip.sourceDuration}
                        step="0.1"
                        value={selectedClip.trimStart}
                        onChange={(event) =>
                          updateTrimValue(
                            selectedClipIndex,
                            'trimStart',
                            Number(event.target.value)
                          )
                        }
                      />
                      <button className="stamp-action" onClick={() => markCurrentTime('trimStart')}>
                        Use Preview Time
                      </button>
                    </div>
                    <div className="time-input-row">
                      <label htmlFor="trim-end">End</label>
                      <input
                        id="trim-end"
                        className="time-input"
                        type="number"
                        min="0"
                        max={selectedClip.sourceDuration}
                        step="0.1"
                        value={selectedClip.trimEnd}
                        onChange={(event) =>
                          updateTrimValue(
                            selectedClipIndex,
                            'trimEnd',
                            Number(event.target.value)
                          )
                        }
                      />
                      <button className="stamp-action" onClick={() => markCurrentTime('trimEnd')}>
                        Use Preview Time
                      </button>
                    </div>
                    <p className="trim-summary">
                      Clip Length {formatTime(getBaseClipDuration(selectedClip))}
                    </p>
                  </>
                ) : (
                  <div className="time-input-row single-row">
                    <label htmlFor="image-duration">Image Duration</label>
                    <input
                      id="image-duration"
                      className="time-input"
                      type="number"
                      min={MIN_CLIP_DURATION}
                      step="0.1"
                      value={selectedClip.duration}
                      onChange={(event) =>
                        updateImageDuration(selectedClipIndex, Number(event.target.value))
                      }
                    />
                  </div>
                )}
              </div>

              <div className="effects-section">
                <h4>Frame Keyframes</h4>
                {selectedClip.type === 'video' ? (
                  <>
                    <div className="keyframe-actions">
                      <div className="stamp-card">
                        <span>Current Frame</span>
                        <strong>{selectedFrameNumber}</strong>
                      </div>
                      <button className="stamp-action" onClick={saveKeyframeAtCurrentTime}>
                        Add or Update Keyframe
                      </button>
                      <button className="stamp-action" onClick={applyEffectsToCurrentFrameOnly}>
                        Apply to Current Frame Only
                      </button>
                      <button className="stamp-action" onClick={applyEditorEffectsToClip}>
                        Apply to Whole Clip
                      </button>
                    </div>
                    <div className="keyframe-list">
                      {selectedClipKeyframes.length > 0 ? (
                        selectedClipKeyframes.map((keyframe) => (
                          <div key={keyframe.time} className="keyframe-item">
                            <button
                              className="keyframe-load"
                              onClick={() => loadKeyframeIntoEditor(keyframe)}
                            >
                              Frame {Math.round(keyframe.time * selectedFrameRate)} at {formatTime(keyframe.time)}
                            </button>
                            <button
                              className="keyframe-delete"
                              onClick={() => deleteKeyframe(keyframe.time)}
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="trim-summary">No frame keyframes yet</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="trim-summary">Frame keyframes are available for video clips only</p>
                )}
              </div>

              <div className="effects-section">
                <h4>Clip Effects</h4>

                <div className="effect-group">
                  <label>Brightness</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="-100"
                    max="100"
                    value={editorEffects.brightness}
                    onChange={(event) => updateEditorEffect('brightness', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.brightness}</span>
                </div>

                <div className="effect-group">
                  <label>Contrast</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="200"
                    value={editorEffects.contrast}
                    onChange={(event) => updateEditorEffect('contrast', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.contrast}%</span>
                </div>

                <div className="effect-group">
                  <label>Saturation</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="200"
                    value={editorEffects.saturation}
                    onChange={(event) => updateEditorEffect('saturation', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.saturation}%</span>
                </div>

                <div className="effect-group">
                  <label>Blur</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="20"
                    value={editorEffects.blur}
                    onChange={(event) => updateEditorEffect('blur', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.blur}px</span>
                </div>

                <div className="effect-group">
                  <label>Grayscale</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={editorEffects.grayscale}
                    onChange={(event) => updateEditorEffect('grayscale', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.grayscale}%</span>
                </div>

                <div className="effect-group">
                  <label>Hue</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="-180"
                    max="180"
                    value={editorEffects.hue}
                    onChange={(event) => updateEditorEffect('hue', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.hue}deg</span>
                </div>

                <div className="effect-group">
                  <label>Sepia</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={editorEffects.sepia}
                    onChange={(event) => updateEditorEffect('sepia', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.sepia}%</span>
                </div>

                <div className="effect-group">
                  <label>Invert</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={editorEffects.invert}
                    onChange={(event) => updateEditorEffect('invert', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.invert}%</span>
                </div>

                <div className="effect-group">
                  <label>Sharpen</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    value={editorEffects.sharpen}
                    onChange={(event) => updateEditorEffect('sharpen', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.sharpen}</span>
                </div>

                {selectedClip.type === 'video' ? (
                  <div className="effect-group">
                    <label>Speed</label>
                    <input
                      className="effect-slider"
                      type="range"
                      min="0.25"
                      max="2"
                      step="0.25"
                      value={editorEffects.speed}
                      onChange={(event) => updateEditorEffect('speed', Number(event.target.value))}
                    />
                    <span className="effect-value">{editorEffects.speed}x</span>
                  </div>
                ) : null}

                <div className="effect-group">
                  <label>Fade In</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={editorEffects.fadeIn}
                    onChange={(event) => updateEditorEffect('fadeIn', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.fadeIn.toFixed(1)}s</span>
                </div>

                <div className="effect-group">
                  <label>Fade Out</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={editorEffects.fadeOut}
                    onChange={(event) => updateEditorEffect('fadeOut', Number(event.target.value))}
                  />
                  <span className="effect-value">{editorEffects.fadeOut.toFixed(1)}s</span>
                </div>
              </div>

              <div className="effects-section">
                <h4>Transition</h4>
                <div className="transition-options">
                  {Object.entries(TRANSITIONS).map(([key, transition]) => (
                    <button
                      key={key}
                      className={`transition-btn ${selectedClip.transition === key ? 'active' : ''}`}
                      onClick={() => updateClipTransition(selectedClipIndex, key)}
                    >
                      {transition.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="clip-info">
                <h4>Clip Info</h4>
                <p>
                  <strong>Rendered Length:</strong> {formatTime(getRenderedClipDuration(selectedClip))}
                </p>
                <p>
                  <strong>Resolution:</strong>{' '}
                  {selectedClip.width ? `${selectedClip.width}x${selectedClip.height}` : 'Unknown'}
                </p>
                <p>
                  <strong>Type:</strong> {selectedClip.type}
                </p>
              </div>
            </div>
          ) : (
            <div className="no-selection">Select a clip to edit timestamps, trim, and effects</div>
          )}
        </aside>
      </div>

      <section className="video-editor-timeline">
        <div className="timeline-header">
          <h3>Timeline</h3>
          <span className="timeline-total">Total {formatTime(totalDuration)}</span>
        </div>

        <div className="timeline-tracks">
          <button className="timeline-insert-btn" onClick={() => handleInsertClick(0)}>
            + Insert media at start
          </button>

          {clips.map((clip, index) => {
            const range = timelineData[index];
            return (
              <React.Fragment key={clip.id}>
                <div
                  className={`timeline-clip ${selectedClipIndex === index ? 'selected' : ''}`}
                  onClick={() => selectClip(index)}
                  style={{ flex: getRenderedClipDuration(clip) }}
                >
                  <div className="clip-content">
                    <span className="clip-name">{clip.name}</span>
                    <span className="clip-duration">{formatTime(getRenderedClipDuration(clip))}</span>
                    <span className="clip-timestamps">
                      {formatTime(range.start)} - {formatTime(range.end)}
                    </span>
                  </div>

                  <div className="clip-controls">
                    <button
                      className="clip-move-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveClip(index, -1);
                      }}
                      disabled={index === 0}
                    >
                      ◀
                    </button>
                    <button
                      className="clip-move-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveClip(index, 1);
                      }}
                      disabled={index === clips.length - 1}
                    >
                      ▶
                    </button>
                    <button
                      className="clip-delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeClip(index);
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {index < clips.length - 1 ? (
                    <div className="transition-indicator">{TRANSITIONS[clip.transition].name}</div>
                  ) : null}
                </div>

                <button className="timeline-insert-btn" onClick={() => handleInsertClick(index + 1)}>
                  + Insert media after this clip
                </button>
              </React.Fragment>
            );
          })}

          {clips.length === 0 ? (
            <div className="empty-timeline">
              <p>Add clips to build a merged timeline</p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="video-editor-info">
        <div className="info-row">
          <span>
            <strong>Clips:</strong> {clips.length}
          </span>
          <span>
            <strong>Timeline Length:</strong> {formatTime(totalDuration)}
          </span>
          <span>
            <strong>Output:</strong> MP4 quick export {EXPORT_WIDTH}x{EXPORT_HEIGHT} @ {EXPORT_FPS}fps
          </span>
        </div>
      </div>
    </div>
  );
}

export default VideoEditorPage;
