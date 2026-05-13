import { Link } from 'react-router-dom'

function TopBar({ exportProfile, onExportProfileChange, onUploadVideos, onExport }) {
  return (
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
          onChange={onUploadVideos}
        />
        <label className="ve-export-profile" htmlFor="export-profile-select">Quality
          <select
            id="export-profile-select"
            value={exportProfile}
            onChange={(event) => onExportProfileChange(event.target.value)}
          >
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="high">High</option>
          </select>
        </label>
        <button type="button" className="ve-link ve-link-primary" onClick={onExport}>Export</button>
      </div>
    </header>
  )
}

export default TopBar
