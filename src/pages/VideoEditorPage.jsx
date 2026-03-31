import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const VideoEditorPage = () => {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const mergedVideoRef = useRef(null);
  const ffmpegRef = useRef(null);

  // State management
  const [clips, setClips] = useState([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [mergedVideoUrl, setMergedVideoUrl] = useState(null);

  // Transition presets
  const TRANSITIONS = {
    cut: { name: 'Cut', duration: 0 },
    fade: { name: 'Fade', duration: 0.5 },
    dissolve: { name: 'Dissolve', duration: 0.8 },
  };

  // Initialize FFmpeg
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        const ffmpeg = new FFmpeg({ log: true });
        ffmpegRef.current = ffmpeg;

        ffmpeg.onload = () => {
          console.log('FFmpeg loaded successfully');
          setFfmpegReady(true);
          setExportStatus('FFmpeg ready');
        };

        ffmpeg.onprogress = ({ ratio }) => {
          setExportProgress(Math.round(ratio * 100));
        };

        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

        await ffmpeg.load({
          coreURL,
          wasmURL,
        });

        setFfmpegReady(true);
        setExportStatus('FFmpeg initialized successfully');
      } catch (err) {
        console.error('FFmpeg initialization failed:', err);
        setExportStatus('FFmpeg initialization failed - export unavailable');
        setFfmpegReady(false);
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
        const newClip = {
          id: Date.now() + Math.random(),
          name: file.name,
          type: file.type.includes('video') ? 'video' : 'image',
          url,
          duration: video.duration || 3, // Default 3s for images
          file,
          width: video.videoWidth,
          height: video.videoHeight,
          trimStart: 0,
          trimEnd: video.duration || 3,
          transition: 'fade',
          // Per-clip effects
          effects: {
            brightness: 0,
            contrast: 100,
            saturation: 100,
            speed: 1,
            blur: 0,
            grayscale: 0,
            fadeIn: 0,
            fadeOut: 0,
            volume: 100,
          },
        };

        setClips((prev) => [...prev, newClip]);
      };

      video.src = url;
    }

    event.target.value = '';
  };

  // Select clip and load its effects
  const selectClip = (index) => {
    setSelectedClipIndex(index);
    if (videoRef.current && clips[index]) {
      videoRef.current.src = clips[index].url;
      setDuration(clips[index].duration);
      setCurrentTime(0);
    }
  };

  // Update clip effects
  const updateClipEffect = (index, effectName, value) => {
    setClips((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        effects: {
          ...updated[index].effects,
          [effectName]: value,
        },
      };
      return updated;
    });

    // Apply effect to preview
    if (selectedClipIndex === index && videoRef.current) {
      applyEffectsToVideo(videoRef.current, clips[index].effects);
    }
  };

  // Apply effects to video element (preview)
  const applyEffectsToVideo = (videoElement, effects) => {
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

  // Update clip transition
  const updateClipTransition = (index, transitionType) => {
    setClips((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        transition: transitionType,
      };
      return updated;
    });
  };

  // Remove clip
  const removeClip = (index) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
    if (selectedClipIndex === index) {
      setSelectedClipIndex(null);
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

  // Format time
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate total duration
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);

  // Build FFmpeg filter chain for a clip
  const buildFilterChain = (clipIndex, inputLabel) => {
    const clip = clips[clipIndex];
    const effects = clip.effects;
    let filters = [];

    // Video filters
    filters.push(
      `[${inputLabel}]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[scaled${clipIndex}]`
    );

    // Apply effects
    const brightness = 1 + effects.brightness / 100;
    const contrast = effects.contrast / 100;
    const saturation = effects.saturation / 100;
    const blur = effects.blur;
    const grayscale = effects.grayscale / 100;

    let effectFilter = `[scaled${clipIndex}]`;
    effectFilter += `eq=brightness=${brightness}:contrast=${contrast}`;
    effectFilter += `,hue=s=${saturation}`;
    if (blur > 0) effectFilter += `,boxblur=${blur}`;
    if (grayscale > 0) effectFilter += `,format=gray`;
    effectFilter += `[v${clipIndex}]`;
    filters.push(effectFilter);

    // Handle fade in/out
    if (effects.fadeIn > 0 || effects.fadeOut > 0) {
      const duration = clip.trimEnd - clip.trimStart;
      let fadeFilter = `[v${clipIndex}]`;

      if (effects.fadeIn > 0) {
        fadeFilter += `fade=t=in:st=0:d=${effects.fadeIn}`;
      }
      if (effects.fadeOut > 0) {
        fadeFilter += `,fade=t=out:st=${duration - effects.fadeOut}:d=${effects.fadeOut}`;
      }
      fadeFilter += `[vfaded${clipIndex}]`;
      filters.push(fadeFilter);
    }

    return filters;
  };

  // Export video with FFmpeg
  const handleExport = async () => {
    if (!ffmpegReady || !ffmpegRef.current || clips.length === 0) {
      alert('FFmpeg not ready or no clips to export');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Starting export...');

    try {
      const ffmpeg = ffmpegRef.current;

      // Clear any previous files
      try {
        for (let i = 0; i < clips.length; i++) {
          await ffmpeg.deleteFile(`input${i}.mp4`);
        }
        await ffmpeg.deleteFile('concat.txt');
        await ffmpeg.deleteFile('output.mp4');
      } catch (e) {
        // Files might not exist
      }

      // Write each clip to FFmpeg
      setExportStatus('Loading video files...');
      for (let i = 0; i < clips.length; i++) {
        const response = await fetch(clips[i].url);
        const data = await response.arrayBuffer();
        await ffmpeg.writeFile(`input${i}.mp4`, new Uint8Array(data));
      }

      // Create concat demuxer file
      let concatContent = '';
      for (let i = 0; i < clips.length; i++) {
        concatContent += `file 'input${i}.mp4'\n`;
      }
      await ffmpeg.writeFile('concat.txt', concatContent);

      setExportStatus('Concatenating and merging videos...');

      // Run FFmpeg command to concatenate
      const cmd = [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        'concat.txt',
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        'output.mp4',
      ];

      await ffmpeg.exec(cmd);

      setExportStatus('Finalizing export...');

      // Get output file
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      // Download file
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMergedVideoUrl(url);
      setExportStatus('Export completed successfully!');
      alert('Video exported successfully!');
    } catch (err) {
      console.error('Export error:', err);
      setExportStatus(`Export failed: ${err.message}`);
      alert('Export failed: ' + err.message);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] : null;

  return (
    <div className="video-editor-page">
      <div className="video-editor-header">
        <h1>🎬 Video Editor</h1>
        <div className="header-buttons">
          <button className="upload-btn-video" onClick={handleUploadClick} title="Upload video or image clips">
            + Upload Clip
          </button>
          <button
            className="export-btn-video"
            onClick={handleExport}
            disabled={clips.length === 0 || isExporting}
            title="Export as MP4 with all effects applied"
          >
            {isExporting ? `🔄 Exporting ${exportProgress}%` : '⬇️ Export MP4'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="export-status">{exportStatus}</div>

      <div className="video-editor-main">
        {/* Preview Panel */}
        <div className="video-editor-preview">
          <div className="preview-header">
            <h3>📹 Selected Clip Preview</h3>
          </div>
          <div className="preview-window">
            {selectedClip ? (
              <video
                ref={videoRef}
                controls
                style={{ maxWidth: '100%', maxHeight: '100%' }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              />
            ) : (
              <div className="preview-placeholder">Select a clip to preview</div>
            )}
          </div>
        </div>

        {/* Sidebar - Effects Panel */}
        <div className="video-editor-sidebar">
          {selectedClip ? (
            <div className="effects-panel">
              <h3>⚙️ Edit Clip</h3>
              <p className="clip-name-display">{selectedClip.name}</p>

              {/* Video Filters */}
              <div className="effects-section">
                <h4>📊 Video Filters</h4>

                <div className="effect-group">
                  <label>Brightness</label>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={selectedClip.effects.brightness}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'brightness', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.brightness}</span>
                </div>

                <div className="effect-group">
                  <label>Contrast</label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={selectedClip.effects.contrast}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'contrast', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.contrast}%</span>
                </div>

                <div className="effect-group">
                  <label>Saturation</label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={selectedClip.effects.saturation}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'saturation', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.saturation}%</span>
                </div>

                <div className="effect-group">
                  <label>Blur</label>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={selectedClip.effects.blur}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'blur', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.blur}px</span>
                </div>

                <div className="effect-group">
                  <label>Grayscale</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedClip.effects.grayscale}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'grayscale', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.grayscale}%</span>
                </div>

                <div className="effect-group">
                  <label>Speed</label>
                  <input
                    type="range"
                    min="0.25"
                    max="2"
                    step="0.25"
                    value={selectedClip.effects.speed}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'speed', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.speed}x</span>
                </div>
              </div>

              {/* Transitions */}
              <div className="effects-section">
                <h4>✨ Transition Effect</h4>
                <div className="transition-options">
                  {Object.entries(TRANSITIONS).map(([key, transition]) => (
                    <button
                      key={key}
                      className={`transition-btn ${selectedClip.transition === key ? 'active' : ''}`}
                      onClick={() => updateClipTransition(selectedClipIndex, key)}
                      title={`${transition.name} (${transition.duration}s)`}
                    >
                      {transition.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fade In/Out */}
              <div className="effects-section">
                <h4>🎭 Fade Effects</h4>

                <div className="effect-group">
                  <label>Fade In (s)</label>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={selectedClip.effects.fadeIn}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'fadeIn', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.fadeIn.toFixed(1)}s</span>
                </div>

                <div className="effect-group">
                  <label>Fade Out (s)</label>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={selectedClip.effects.fadeOut}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'fadeOut', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.fadeOut.toFixed(1)}s</span>
                </div>
              </div>

              {/* Audio */}
              <div className="effects-section">
                <h4>🔊 Audio</h4>
                <div className="effect-group">
                  <label>Volume</label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={selectedClip.effects.volume}
                    onChange={(e) =>
                      updateClipEffect(selectedClipIndex, 'volume', Number(e.target.value))
                    }
                    className="effect-slider"
                  />
                  <span className="effect-value">{selectedClip.effects.volume}%</span>
                </div>
              </div>

              {/* Clip Info */}
              <div className="clip-info">
                <h4>📋 Clip Info</h4>
                <p>
                  <strong>Duration:</strong> {formatTime(selectedClip.duration)}
                </p>
                <p>
                  <strong>Resolution:</strong> {selectedClip.width ? `${selectedClip.width}x${selectedClip.height}` : 'N/A'}
                </p>
                <p>
                  <strong>Type:</strong> {selectedClip.type}
                </p>
              </div>
            </div>
          ) : (
            <div className="no-selection">Select a clip to edit effects</div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="video-editor-timeline">
        <div className="timeline-header">
          <h3>📽️ Timeline - Total: {formatTime(totalDuration)}</h3>
        </div>
        <div className="timeline-tracks">
          {clips.map((clip, index) => (
            <div
              key={clip.id}
              className={`timeline-clip ${selectedClipIndex === index ? 'selected' : ''}`}
              onClick={() => selectClip(index)}
              style={{
                flex: `${clip.duration}`,
              }}
            >
              <div className="clip-content">
                <span className="clip-name">{clip.name}</span>
                <span className="clip-duration">{formatTime(clip.duration)}</span>
                {clip.effects.brightness !== 0 ||
                clip.effects.contrast !== 100 ||
                clip.effects.saturation !== 100 ? (
                  <span className="effects-indicator">⚙️ Effects</span>
                ) : null}
              </div>
              <div className="clip-controls">
                <button
                  className="clip-move-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveClip(index, -1);
                  }}
                  disabled={index === 0}
                  title="Move left"
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
                  title="Move right"
                >
                  ▶
                </button>
                <button
                  className="clip-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeClip(index);
                  }}
                  title="Delete clip"
                >
                  ✕
                </button>
              </div>
              {index < clips.length - 1 && (
                <div className="transition-indicator" title={`${clips[index].transition} transition`}>
                  {clips[index].transition === 'fade' ? '⟷' : '→'}
                </div>
              )}
            </div>
          ))}
        </div>
        {clips.length === 0 && (
          <div className="empty-timeline">
            <p>No clips yet. Click "Upload Clip" to get started! 🎥</p>
          </div>
        )}
      </div>

      {/* Project Info */}
      <div className="video-editor-info">
        <div className="info-row">
          <span>
            <strong>Clips:</strong> {clips.length}
          </span>
          <span>
            <strong>Total Duration:</strong> {formatTime(totalDuration)}
          </span>
          <span>
            <strong>Total Size:</strong> {(clips.reduce((sum, c) => sum + (c.file?.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
          </span>
          <span>
            <strong>Export Format:</strong> MP4 (H.264)
          </span>
        </div>
      </div>
    </div>
  );
};

export default VideoEditorPage;
