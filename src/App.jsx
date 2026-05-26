import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import RegisterPerson from './components/RegisterPerson'
import RecognizeLive  from './components/RecognizeLive'
import './App.css'

function Navbar() {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <span className="nav-icon">⬡</span>
        <span className="nav-name">Face ID</span>
      </div>
      <div className="nav-links">
        <NavLink to="/"          className={({ isActive }) => isActive ? 'nl active' : 'nl'}>Registrar</NavLink>
        <NavLink to="/reconocer" className={({ isActive }) => isActive ? 'nl active' : 'nl'}>Reconocer</NavLink>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"          element={<RegisterPerson />} />
        <Route path="/reconocer" element={<RecognizeLive />} />
      </Routes>
    </BrowserRouter>
  )
}
