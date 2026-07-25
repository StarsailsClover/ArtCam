import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Welcome from '@/pages/Welcome'
import CanvasPage from '@/pages/CanvasPage'
import GalleryPage from '@/pages/GalleryPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
