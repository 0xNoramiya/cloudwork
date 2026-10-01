import { createRoot } from 'react-dom/client'
import '@fontsource/fredoka/400.css'
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles/app.css'
import App from './App'
import { boot } from './boot'

void boot()
createRoot(document.getElementById('root')!).render(<App />)
