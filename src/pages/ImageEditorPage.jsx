import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas, FabricImage, Textbox, filters } from 'fabric/es'
import heroImage from '../assets/hero.png'

const CANVAS_WIDTH = 920
const CANVAS_HEIGHT = 580

const DEFAULT_FILTERS = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  grayscale: false,
}

const DEFAULT_TEXT = {
  value: 'Double-click to edit',
  color: '#fff7ed',
  fontSize: 54,
}

function ImageEditorPage() {
  const canvasElementRef = useRef(null)
  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const objectUrlRef = useRef(null)

  const [filterValues, setFilterValues] = useState(DEFAULT_FILTERS)
  const [textValue, setTextValue] = useState(DEFAULT_TEXT.value)
  const [textColor, setTextColor] = useState(DEFAULT_TEXT.color)
  const [fontSize, setFontSize] = useState(DEFAULT_TEXT.fontSize)
  const [hasImage, setHasImage] = useState(false)
  const [selectedText, setSelectedText] = useState(false)
  const [imageName, setImageName] = useState('Sample artwork')
  const [previewImageUrl, setPreviewImageUrl] = useState(heroImage)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [uploadError, setUploadError] = useState('')

  const loadImageFromUrl = async (url, name) => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    try {
      const nextImage = await FabricImage.fromURL(url)
      const availableWidth = CANVAS_WIDTH - 72
      const availableHeight = CANVAS_HEIGHT - 72
      const width = nextImage.width || 1
      const height = nextImage.height || 1
      const scale = Math.min(availableWidth / width, availableHeight / height)

      if (imageRef.current) {
        canvas.remove(imageRef.current)
      }

      nextImage.set({
        left: CANVAS_WIDTH / 2,
        top: CANVAS_HEIGHT / 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      })
      nextImage.scale(scale)

      imageRef.current = nextImage
      canvas.add(nextImage)
      canvas.sendObjectToBack(nextImage)
      canvas.renderAll()

      setHasImage(true)
      setImageName(name)
      setPreviewImageUrl(url)
      setImageDimensions({ width, height })
      setUploadError('')
      setFilterValues(DEFAULT_FILTERS)
    } catch {
      setUploadError('The selected image could not be loaded.')
    }
  }

  useEffect(() => {
    const canvas = new Canvas(canvasElementRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      preserveObjectStacking: true,
      backgroundColor: '#f6efe6',
    })

    const syncSelectionState = () => {
      const activeObject = canvas.getActiveObject()

      if (activeObject?.type === 'textbox') {
        setSelectedText(true)
        setTextValue(activeObject.text ?? DEFAULT_TEXT.value)
        setTextColor(activeObject.fill ?? DEFAULT_TEXT.color)
        setFontSize(Math.round(activeObject.fontSize ?? DEFAULT_TEXT.fontSize))
        return
      }

      setSelectedText(false)
    }

    canvas.on('selection:created', syncSelectionState)
    canvas.on('selection:updated', syncSelectionState)
    canvas.on('selection:cleared', syncSelectionState)

    canvasRef.current = canvas

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }

      canvas.dispose()
      canvasRef.current = null
    }
  }, [])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void loadImageFromUrl(heroImage, 'Sample artwork')
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current

    if (!canvas || !image) {
      return
    }

    const nextFilters = []

    if (filterValues.grayscale) {
      nextFilters.push(new filters.Grayscale())
    }

    if (filterValues.brightness !== 0) {
      nextFilters.push(new filters.Brightness({ brightness: filterValues.brightness }))
    }

    if (filterValues.contrast !== 0) {
      nextFilters.push(new filters.Contrast({ contrast: filterValues.contrast }))
    }

    if (filterValues.saturation !== 0) {
      nextFilters.push(new filters.Saturation({ saturation: filterValues.saturation }))
    }

    if (filterValues.blur !== 0) {
      nextFilters.push(new filters.Blur({ blur: filterValues.blur }))
    }

    image.filters = nextFilters
    image.applyFilters()
    canvas.renderAll()
  }, [filterValues])

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
    }

    const nextUrl = URL.createObjectURL(file)
    objectUrlRef.current = nextUrl

    await loadImageFromUrl(nextUrl, file.name)

    event.target.value = ''
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const addTextLayer = () => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const textLayer = new Textbox(textValue || DEFAULT_TEXT.value, {
      left: CANVAS_WIDTH / 2,
      top: CANVAS_HEIGHT / 2,
      originX: 'center',
      originY: 'center',
      width: CANVAS_WIDTH * 0.7,
      fontSize,
      fill: textColor,
      fontFamily: 'Georgia',
      fontWeight: 700,
      textAlign: 'center',
      shadow: 'rgba(0, 0, 0, 0.18) 0 12px 22px',
    })

    canvas.add(textLayer)
    canvas.setActiveObject(textLayer)
    canvas.bringObjectToFront(textLayer)
    canvas.renderAll()
    setSelectedText(true)
  }

  const updateActiveTextbox = (updates) => {
    const canvas = canvasRef.current
    const activeObject = canvas?.getActiveObject()

    if (!canvas || activeObject?.type !== 'textbox') {
      return
    }

    activeObject.set(updates)
    activeObject.setCoords()
    canvas.renderAll()
  }

  const handleTextValueChange = (event) => {
    const nextValue = event.target.value
    setTextValue(nextValue)
    updateActiveTextbox({ text: nextValue || ' ' })
  }

  const handleTextColorChange = (event) => {
    const nextColor = event.target.value
    setTextColor(nextColor)
    updateActiveTextbox({ fill: nextColor })
  }

  const handleFontSizeChange = (event) => {
    const nextSize = Number(event.target.value)
    setFontSize(nextSize)
    updateActiveTextbox({ fontSize: nextSize })
  }

  const deleteSelectedText = () => {
    const canvas = canvasRef.current
    const activeObject = canvas?.getActiveObject()

    if (!canvas || activeObject?.type !== 'textbox') {
      return
    }

    canvas.remove(activeObject)
    canvas.discardActiveObject()
    canvas.renderAll()
    setSelectedText(false)
  }

  const exportComposition = () => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2,
    })

    const downloadLink = document.createElement('a')
    downloadLink.href = dataUrl
    downloadLink.download = 'canvas-studio-export.png'
    downloadLink.click()
  }

  const resetFilters = () => {
    setFilterValues(DEFAULT_FILTERS)
  }

  const updateFilter = (key, value) => {
    setFilterValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  return (
    <main className='editor-page'>
      <header className='editor-header'>
        <div className='editor-header-actions'>
          <Link className='secondary-link' to='/'>
            Back home
          </Link>
          <button className='primary-button' onClick={exportComposition} type='button'>
            Export PNG
          </button>
        </div>
      </header>

      <section className='editor-layout'>
        <aside className='editor-sidebar'>
          <div className='editor-panel'>
            <div className='panel-heading'>
              <h2>Image</h2>
              <span>{imageName}</span>
            </div>

            <div className='upload-field'>
              <span>Upload image</span>
              <input
                accept='image/*'
                className='sr-only-file-input'
                onChange={handleImageUpload}
                ref={fileInputRef}
                type='file'
              />
              <button className='ghost-button upload-trigger' onClick={openFilePicker} type='button'>
                Choose image from device
              </button>
            </div>

            <div className='image-preview-box'>
              {hasImage ? (
                <img alt={imageName} className='image-preview' src={previewImageUrl} />
              ) : (
                <div className='image-preview-placeholder'>No image selected</div>
              )}
            </div>

            {hasImage ? (
              <div className='image-meta'>
                <span className='image-meta-label'>Dimensions</span>
                <span>{imageDimensions.width} x {imageDimensions.height}px</span>
              </div>
            ) : null}

            {uploadError ? <p className='upload-error'>{uploadError}</p> : null}

            <button className='ghost-button sample-button' onClick={() => void loadImageFromUrl(heroImage, 'Sample artwork')} type='button'>
              Use sample image
            </button>
          </div>

          <div className='editor-panel'>
            <div className='panel-heading'>
              <h2>Filters</h2>
              <button className='text-button' onClick={resetFilters} type='button'>
                Reset
              </button>
            </div>

            <label className='control-row'>
              <span>Brightness</span>
              <input
                max='1'
                min='-1'
                onChange={(event) => updateFilter('brightness', Number(event.target.value))}
                step='0.01'
                type='range'
                value={filterValues.brightness}
              />
            </label>

            <label className='control-row'>
              <span>Contrast</span>
              <input
                max='1'
                min='-1'
                onChange={(event) => updateFilter('contrast', Number(event.target.value))}
                step='0.01'
                type='range'
                value={filterValues.contrast}
              />
            </label>

            <label className='control-row'>
              <span>Saturation</span>
              <input
                max='1'
                min='-1'
                onChange={(event) => updateFilter('saturation', Number(event.target.value))}
                step='0.01'
                type='range'
                value={filterValues.saturation}
              />
            </label>

            <label className='control-row'>
              <span>Blur</span>
              <input
                max='1'
                min='0'
                onChange={(event) => updateFilter('blur', Number(event.target.value))}
                step='0.01'
                type='range'
                value={filterValues.blur}
              />
            </label>

            <label className='toggle-row'>
              <span>Grayscale</span>
              <input
                checked={filterValues.grayscale}
                onChange={(event) => updateFilter('grayscale', event.target.checked)}
                type='checkbox'
              />
            </label>
          </div>

          <div className='editor-panel'>
            <div className='panel-heading'>
              <h2>Text</h2>
              <span>{selectedText ? 'Live editing selected layer' : 'Add a new layer'}</span>
            </div>

            <label className='stacked-field'>
              <span>Copy</span>
              <textarea
                onChange={handleTextValueChange}
                placeholder='Write your message'
                rows='4'
                value={textValue}
              />
            </label>

            <div className='dual-field'>
              <label className='stacked-field'>
                <span>Color</span>
                <input onChange={handleTextColorChange} type='color' value={textColor} />
              </label>

              <label className='stacked-field'>
                <span>Size</span>
                <input
                  max='120'
                  min='18'
                  onChange={handleFontSizeChange}
                  type='range'
                  value={fontSize}
                />
              </label>
            </div>

            <div className='editor-actions'>
              <button className='primary-button' onClick={addTextLayer} type='button'>
                Add text
              </button>
              <button className='ghost-button' onClick={deleteSelectedText} type='button'>
                Delete selected
              </button>
            </div>
          </div>
        </aside>

        <section className='editor-stage'>
          <div className='stage-frame'>
            <div className='stage-toolbar'>
              <span>{hasImage ? 'Canvas ready' : 'Upload an image to begin'}</span>
              <span>Drag text to position it</span>
            </div>
            <canvas ref={canvasElementRef} />
          </div>
        </section>
      </section>
    </main>
  )
}

export default ImageEditorPage