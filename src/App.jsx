
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import ImageEditorPage from './pages/ImageEditorPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/editor' element={<ImageEditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
