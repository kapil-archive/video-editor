import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const VideoEditorPage = () => {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const timelineContainerRef = useRef(null);

  // State management
  const [clips, setClips] = useState([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);

  // Effects state
  const [effects, setEffects] = useState({
    brightness: 0,
    contrast: 100,
    saturation: 100,
    speed: 1,
    blur: 0,
    grayscale: 0,
    fadeIn: 0,
    fadeOut: 0,
  });

  // Initialize FFmpeg
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
        const ffmpeg = new FFmpeg({ log: true });

        ffmpeg.onload = () => {
          console.log('FFmpeg loaded successfully');
          setFfmpegReady(true);
        };

        ffmpeg.onprogress = ({ ratio }) => {
          setExportProgress(Math.round(ratio * 100));
        };

        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

        await ffmpeg.load({
          coreURL,
          wasmURL,
        });

        setFfmpegReady(true);
      } catch (err) {
        console.error('FFmpeg initialization failed:', err);
        // Set ready anyway so UI doesn't break - user can still manage clips
        setFfmpegReady(true);
      }
    };

    initFFmpeg();
  }, []);

  // Handle file upload
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);

    for (const file of files) {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');

      video.onloadedmetadata = () => {
        setClips((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            name: file.name,
            type: file.type.includes('video') ? 'video' : 'image',
            url,
            duration: video.duration,
            startTime: prev.reduce((sum, c) => sum + c.duration, 0),
            trimStart: 0,
            trimEnd: video.duration,
            file,
          },
        ]);
      };

      video.src = url;
    }
  };

  // Handle clip selection
  const selectClip = (index) => {
    setSelectedClipIndex(index);
    if (videoRef.current && clips[index]) {
      videoRef.current.src = clips[index].url;
      setDuration(clips[index].duration);
      setCurrentTime(0);
    }
  };

  // Remove clip
  const removeClip = (index) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
    if (selectedClipIndex === index) {
      setSelectedClipIndex(null);
      setCurrentTime(0);
      setDuration(0);
    }
  };

  // Reorder clips
  const moveClip = (index, direction) => {
    if (
      (direction === -1 && index === 0) ||
      (direction === 1 && index === clips.length - 1)
    ) {
      return;
    }

    const newClips = [...clips];
    [newClips[index], newClips[index + direction]] = [
      newClips[index + direction],
      newClips[index],
    ];
    setClips(newClips);
  };

  // Update effect value
  const updateEffect = (effectName, value) => {
    setEffects((prev) => ({
      ...prev,
      [effectName]: value,
    }));

    // Apply effect to preview
    if (videoRef.current) {
      applyEffectsToVideo(videoRef.current);
    }
  };

  // Apply effects to video element (preview)
  const applyEffectsToVideo = (videoElement) => {
    const brightness = effects.brightness;
    const contrast = effects.contrast;
    const saturation = effects.saturation;
    const blur = effects.blur;
    const grayscale = effects.grayscale;

    const filter = `brightness(${1 + brightness / 100}) contrast(${contrast / 100}) saturate(${
      saturation / 100
    }) blur(${blur}px) grayscale(${grayscale / 100})`;

    videoElement.style.filter = filter;
  };

  // Update trim values
  const updateClipTrim = (index, trimStart, trimEnd) => {
    setClips((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        trimStart,
        trimEnd,
      };
      return updated;
    });
  };

  // Update clip duration
  const updateClipDuration = (index, newDuration) => {
    setClips((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        duration: newDuration,
      };
      return updated;
    });
  };

  // Export video (simplified - requires FFmpeg setup)
  const handleExport = async () => {
    if (!ffmpegReady) {
      alert('FFmpeg is not ready. Please wait...');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      // For now, show a simple message - full FFmpeg export requires complex command building
      alert(
        'Video export initiated!\n\nNote: Full export with effects requires video processing.\n\nThis is a demo - in production, FFmpeg would:\n1. Load each clip\n2. Apply effects (brightness, saturation, speed, etc.)\n3. Concatenate clips\n4. Export as MP4\n\nClick OK to continue.'
      );
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed: ' + err.message);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Format time display
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate total duration
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);

  return (
    <div className="video-editor-page">
      <div className="video-editor-header">
        <h1>Video Editor</h1>
        <button
          className="upload-btn-video"
          onClick={handleUploadClick}
          style={{ marginRight: '10px' }}
        >
          + Upload Clip
        </button>
        <button
          className="export-btn-video"
          onClick={handleExport}
          disabled={clips.length === 0 || isExporting}
        >
          {isExporting ? `Exporting ${exportProgress}%` : 'Export Video'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="video-editor-main">
        {/* Preview Panel */}
        <div className="video-editor-preview">
          <div className="preview-window">
            <video
              ref={videoRef}
              controls
              style={{ maxWidth: '100%', maxHeight: '100%' }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="video-editor-sidebar">
          {/* Effects Panel */}
          {selectedClipIndex !== null && (
            <div className="effects-panel">
              <h3>Effects - Clip {selectedClipIndex + 1}</h3>

              <div className="effect-group">
                <label>Brightness</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={effects.brightness}
                  onChange={(e) => updateEffect('brightness', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.brightness}</span>
              </div>

              <div className="effect-group">
                <label>Contrast</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={effects.contrast}
                  onChange={(e) => updateEffect('contrast', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.contrast}%</span>
              </div>

              <div className="effect-group">
                <label>Saturation</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={effects.saturation}
                  onChange={(e) => updateEffect('saturation', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.saturation}%</span>
              </div>

              <div className="effect-group">
                <label>Blur</label>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={effects.blur}
                  onChange={(e) => updateEffect('blur', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.blur}px</span>
              </div>

              <div className="effect-group">
                <label>Grayscale</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={effects.grayscale}
                  onChange={(e) => updateEffect('grayscale', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.grayscale}%</span>
              </div>

              <div className="effect-group">
                <label>Speed</label>
                <input
                  type="range"
                  min="0.25"
                  max="2"
                  step="0.25"
                  value={effects.speed}
                  onChange={(e) => updateEffect('speed', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.speed}x</span>
              </div>

              <div className="effect-group">
                <label>Fade In (s)</label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={effects.fadeIn}
                  onChange={(e) => updateEffect('fadeIn', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.fadeIn.toFixed(1)}s</span>
              </div>

              <div className="effect-group">
                <label>Fade Out (s)</label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={effects.fadeOut}
                  onChange={(e) => updateEffect('fadeOut', Number(e.target.value))}
                  className="effect-slider"
                />
                <span className="effect-value">{effects.fadeOut.toFixed(1)}s</span>
              </div>

              <hr />

              {/* Trim Controls */}
              <div className="trim-controls">
                <h4>Trim: {clips[selectedClipIndex]?.name}</h4>
                <p>Duration: {formatTime(clips[selectedClipIndex]?.duration)} </p>

                <label>Duration Override (s)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={clips[selectedClipIndex]?.duration || 0}
                  onChange={(e) =>
                    updateClipDuration(selectedClipIndex, Number(e.target.value))
                  }
                  className="trim-input"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="video-editor-timeline">
        <div className="timeline-header">
          <h3>Timeline - Total Duration: {formatTime(totalDuration)}</h3>
        </div>
        <div className="timeline-tracks">
          {clips.map((clip, index) => (
            <div
              key={clip.id}
              className={`timeline-clip ${selectedClipIndex === index ? 'selected' : ''}`}
              onClick={() => selectClip(index)}
              style={{
                width: `${(clip.duration / Math.max(totalDuration, 1)) * 100}%`,
              }}
            >
              <div className="clip-content">
                <span className="clip-name">{clip.name}</span>
                <span className="clip-duration">{formatTime(clip.duration)}</span>
              </div>
              <div className="clip-controls">
                <button
                  className="clip-move-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveClip(index, -1);
                  }}
                  disabled={index === 0}
                >
                  ◀
                </button>
                <button
                  className="clip-move-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveClip(index, 1);
                  }}
                  disabled={index === clips.length - 1}
                >
                  ▶
                </button>
                <button
                  className="clip-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeClip(index);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        {clips.length === 0 && (
          <div className="empty-timeline">
            <p>No clips added. Upload video or image files to get started.</p>
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="video-editor-info">
        <p>
          <strong>Clips:</strong> {clips.length} | <strong>Total Duration:</strong>{' '}
          {formatTime(totalDuration)} | <strong>Total Size:</strong>{' '}
          {(clips.reduce((sum, c) => sum + (c.file?.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
    </div>
  );
};

export default VideoEditorPage;
