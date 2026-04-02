import { TRANSITION_PRESETS } from '../constants'

function ComposerPanel({
  onAddText,
  onAddShape,
  onAddImage,
  transitionPreset,
  onTransitionPresetChange,
  onAddTransition,
  busyMessage,
  exportProgress,
  layers,
  selectedObjectId,
  onSelectLayer,
  onSendLayerBack,
  onBringLayerFront,
  onDeleteLayer,
}) {
  return (
    <aside className="ve-tools">
      <h2>Composer</h2>
      <div className="ve-tools-grid">
        <button type="button" onClick={onAddText}>Add Text</button>
        <button type="button" onClick={onAddShape}>Add Shape</button>
        <label htmlFor="image-layer-input">Add Image</label>
        <input
          id="image-layer-input"
          type="file"
          accept="image/*"
          className="ve-hidden-input"
          onChange={onAddImage}
        />
      </div>

      <div className="ve-transition-controls">
        <label className="ve-transition-picker" htmlFor="transition-preset-select">Transition
          <select
            id="transition-preset-select"
            value={transitionPreset}
            onChange={(event) => onTransitionPresetChange(event.target.value)}
          >
            {Object.entries(TRANSITION_PRESETS).map(([presetId, preset]) => (
              <option key={presetId} value={presetId}>{preset.label}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onAddTransition}>Add Transition</button>
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
            onClick={() => onSelectLayer(layer.id)}
          >
            <span>{layer.name}</span>
            <small>{layer.type}</small>
          </button>
        ))}
      </div>

      <div className="ve-layer-actions">
        <button type="button" onClick={onSendLayerBack} disabled={!selectedObjectId}>Send Back</button>
        <button type="button" onClick={onBringLayerFront} disabled={!selectedObjectId}>Bring Front</button>
        <button type="button" onClick={onDeleteLayer} disabled={!selectedObjectId}>Delete Layer</button>
      </div>
    </aside>
  )
}

export default ComposerPanel
