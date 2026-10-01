import { Html } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { mutate, useWorld } from '../state/store'
import { agentPositions } from './Agent'

/** Floating "+32 XP" / "7/7 ✓" numbers that rise from a crew member and fade out. */
export function Pops() {
  const pops = useWorld((s) => s.ui.pops)
  useEffect(() => {
    if (!pops.length) return
    const t = window.setTimeout(() => mutate((s) => void (s.ui.pops = s.ui.pops.filter((p) => Date.now() - p.at < 2400))), 2500)
    return () => window.clearTimeout(t)
  }, [pops])
  return (
    <>
      {pops.map((p) => (
        <Pop key={p.id} role={p.role} text={p.text} tone={p.tone} />
      ))}
    </>
  )
}

function Pop({ role, text, tone }: { role: keyof typeof agentPositions; text: string; tone: string }) {
  // Anchor where the crew member stood when it happened; the CSS animation handles the rise.
  const pos = useMemo(() => agentPositions[role].clone().setY(agentPositions[role].y + 2.4), [role])
  return (
    <Html position={pos} center zIndexRange={[45, 40]} style={{ pointerEvents: 'none' }}>
      <div className={`pop pop-${tone}`}>{text}</div>
    </Html>
  )
}
