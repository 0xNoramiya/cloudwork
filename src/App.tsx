import { ErrorBoundary } from './ui/ErrorBoundary'
import { Hud } from './ui/Hud'
import { useWorld } from './state/store'
import World from './world/World'

export default function App() {
  const skin = useWorld((s) => s.game.skin.replace('skin-', ''))
  return (
    <div className={`app skin-${skin}`}>
      <div className="world-layer">
        <ErrorBoundary area="3D world">
          <World />
        </ErrorBoundary>
      </div>
      <ErrorBoundary area="interface">
        <Hud />
      </ErrorBoundary>
    </div>
  )
}
