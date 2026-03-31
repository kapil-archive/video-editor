
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import ImageEditorPage from './pages/ImageEditorPage'
import VideoEditorPage from './pages/VideoEditorPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/editor' element={<ImageEditorPage />} />
        <Route path='/video-editor' element={<VideoEditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
