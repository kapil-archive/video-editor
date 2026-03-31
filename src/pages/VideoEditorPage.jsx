import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const DEFAULT_IMAGE_DURATION = 3;
const MIN_CLIP_DURATION = 0.2;
const EXPORT_WIDTH = 960;
const EXPORT_HEIGHT = 540;
const EXPORT_FPS = 24;
const EXPORT_PRESET = 'ultrafast';
const EXPORT_CRF = 30;
const TRANSITIONS = {
  cut: { name: 'Cut', duration: 0 },
  fade: { name: 'Fade', duration: 0.5 },
  dissolve: { name: 'Dissolve', duration: 0.8 },
};

const createDefaultEffects = () => ({
  brightness: 0,
  contrast: 100,
  saturation: 100,
  speed: 1,
  blur: 0,
  grayscale: 0,
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

const buildVideoFilter = (clip, outputDuration) => {
  const effects = clip.effects;
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

  if (clip.type === 'video' && effects.speed !== 1) {
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

  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] : null;
  const selectedPreviewFilter = selectedClip
    ? `brightness(${1 + selectedClip.effects.brightness / 100}) contrast(${selectedClip.effects.contrast / 100}) saturate(${selectedClip.effects.saturation / 100}) blur(${selectedClip.effects.blur}px) grayscale(${selectedClip.effects.grayscale / 100})`
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
    videoElement.playbackRate = selectedClip.effects.speed;
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
  }, [selectedClip, selectedPreviewFilter]);

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
    fileInputRef.current?.click();
  };

  const appendClip = (clip) => {
    setClips((prev) => [...prev, clip]);
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files ?? []);

    await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const url = URL.createObjectURL(file);

            if (file.type.startsWith('image/')) {
              const image = new Image();
              image.onload = () => {
                appendClip({
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
                  transition: 'cut',
                  effects: createDefaultEffects(),
                });
                resolve();
              };
              image.onerror = resolve;
              image.src = url;
              return;
            }

            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
              const safeDuration = Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : DEFAULT_IMAGE_DURATION;

              appendClip({
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
                transition: 'cut',
                effects: createDefaultEffects(),
              });
              resolve();
            };
            video.onerror = resolve;
            video.src = url;
          })
      )
    );

    event.target.value = '';
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
    setPreviewTime(0);
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

  const updateClipEffect = (index, effectName, value) => {
    updateClip(index, (clip) => ({
      ...clip,
      effects: {
        ...clip.effects,
        [effectName]: value,
      },
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

  const renderSegment = async (ffmpeg, clip, index) => {
    const extension = getFileExtension(clip.file);
    const inputName = `input-${index}.${extension}`;
    const outputName = `segment-${index}.mp4`;
    const fileData = new Uint8Array(await clip.file.arrayBuffer());
    await ffmpeg.writeFile(inputName, fileData);

    const outputDuration = getRenderedClipDuration(clip);
    const videoFilter = buildVideoFilter(clip, outputDuration);

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
      const renderedSegments = [];

      for (let index = 0; index < clips.length; index += 1) {
        setExportStatus(`Rendering clip ${index + 1} of ${clips.length}`);
        const segmentPath = await renderSegment(ffmpeg, clips[index], index);
        renderedSegments.push(segmentPath);
      }

      const concatFile = renderedSegments.map((segmentPath) => `file '${segmentPath}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatFile);

      setExportStatus('Merging rendered clips...');
      const mergeExitCode = await ffmpeg.exec([
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
                <h4>Clip Effects</h4>

                <div className="effect-group">
                  <label>Brightness</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="-100"
                    max="100"
                    value={selectedClip.effects.brightness}
                    onChange={(event) =>
                      updateClipEffect(selectedClipIndex, 'brightness', Number(event.target.value))
                    }
                  />
                  <span className="effect-value">{selectedClip.effects.brightness}</span>
                </div>

                <div className="effect-group">
                  <label>Contrast</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="200"
                    value={selectedClip.effects.contrast}
                    onChange={(event) =>
                      updateClipEffect(selectedClipIndex, 'contrast', Number(event.target.value))
                    }
                  />
                  <span className="effect-value">{selectedClip.effects.contrast}%</span>
                </div>

                <div className="effect-group">
                  <label>Saturation</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="200"
                    value={selectedClip.effects.saturation}
                    onChange={(event) =>
                      updateClipEffect(selectedClipIndex, 'saturation', Number(event.target.value))
                    }
                  />
                  <span className="effect-value">{selectedClip.effects.saturation}%</span>
                </div>

                <div className="effect-group">
                  <label>Blur</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="20"
                    value={selectedClip.effects.blur}
                    onChange={(event) =>
                      updateClipEffect(selectedClipIndex, 'blur', Number(event.target.value))
                    }
                  />
                  <span className="effect-value">{selectedClip.effects.blur}px</span>
                </div>

                <div className="effect-group">
                  <label>Grayscale</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={selectedClip.effects.grayscale}
                    onChange={(event) =>
                      updateClipEffect(selectedClipIndex, 'grayscale', Number(event.target.value))
                    }
                  />
                  <span className="effect-value">{selectedClip.effects.grayscale}%</span>
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
                      value={selectedClip.effects.speed}
                      onChange={(event) =>
                        updateClipEffect(selectedClipIndex, 'speed', Number(event.target.value))
                      }
                    />
                    <span className="effect-value">{selectedClip.effects.speed}x</span>
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
                    value={selectedClip.effects.fadeIn}
                    onChange={(event) =>
                      updateClipEffect(selectedClipIndex, 'fadeIn', Number(event.target.value))
                    }
                  />
                  <span className="effect-value">{selectedClip.effects.fadeIn.toFixed(1)}s</span>
                </div>

                <div className="effect-group">
                  <label>Fade Out</label>
                  <input
                    className="effect-slider"
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={selectedClip.effects.fadeOut}
                    onChange={(event) =>
                      updateClipEffect(selectedClipIndex, 'fadeOut', Number(event.target.value))
                    }
                  />
                  <span className="effect-value">{selectedClip.effects.fadeOut.toFixed(1)}s</span>
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
          {clips.map((clip, index) => {
            const range = timelineData[index];
            return (
              <div
                key={clip.id}
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
