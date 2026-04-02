import { TRANSITION_PRESETS } from '../constants'

function InspectorPanel({
  selectedLayer,
  selectedLayerText,
  onUpdateSelectedLayer,
  selectedClip,
  timelineDuration,
  onUpdateClip,
  onRemoveSelectedClip,
}) {
  return (
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
                value={selectedLayerText}
                onChange={(event) => onUpdateSelectedLayer({ text: event.target.value })}
              />
            </label>
          ) : null}

          <label>
            Fill
            <input
              type="color"
              value={selectedLayer.fill}
              onChange={(event) => onUpdateSelectedLayer({ fill: event.target.value })}
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
              onChange={(event) => onUpdateSelectedLayer({ opacity: Number(event.target.value) })}
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
              onChange={(event) => onUpdateSelectedLayer({ angle: Number(event.target.value) })}
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
              onChange={(event) => onUpdateClip({ label: event.target.value })}
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
              onChange={(event) => onUpdateClip({ start: Number(event.target.value) })}
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
              onChange={(event) => onUpdateClip({ duration: Number(event.target.value) })}
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
                  onUpdateClip({
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
                onChange={(event) => onUpdateClip({ color: event.target.value })}
              />
            </label>
          ) : null}

          <button type="button" onClick={onRemoveSelectedClip}>Delete Clip</button>
        </div>
      )}
    </aside>
  )
}

export default InspectorPanel
