import { Anchor } from 'lucide-react'
import { ROLE_IDS, type RoleId } from '../engine/types'
import { useWorld } from '../state/store'
import { AgentInspector } from './AgentInspector'
import { ArtifactView } from './ArtifactView'
import { ApprovalCard, CaptainDesk } from './Desk'
import { TaskInspector } from './TaskInspector'
import { PanelHead } from './common'
import { closeSheets, useCompact } from './layout'
import { Sheet } from './Sheets'

function ApprovalView({ id }: { id: string }) {
  const a = useWorld((s) => s.approvals[id])
  return (
    <>
      <PanelHead title="Sky Dock request" icon={<Anchor size={18} />} />
      <div className="rightpanel-body scroll">{a ? <ApprovalCard a={a} /> : null}</div>
    </>
  )
}

export function RightPanel() {
  const sel = useWorld((s) => s.ui.selection)
  const deskSheet = useWorld((s) => s.ui.sheet === 'desk')
  const compact = useCompact()
  let body
  if (sel.kind === 'agent' && sel.id && ROLE_IDS.includes(sel.id as RoleId)) body = <AgentInspector key={sel.id} role={sel.id as RoleId} />
  else if (sel.kind === 'task' && sel.id) body = <TaskInspector id={sel.id} />
  else if (sel.kind === 'artifact' && sel.id) body = <ArtifactView id={sel.id} />
  else if (sel.kind === 'approval' && sel.id) body = <ApprovalView id={sel.id} />
  else
    body = (
      <>
        <PanelHead title="Captain's desk" icon={<Anchor size={18} />} />
        <CaptainDesk />
      </>
    )
  if (compact) {
    // Phones: the inspector is a bottom sheet that only opens when something is selected (or the desk is asked for).
    if (!sel.kind && !deskSheet) return null
    return (
      <Sheet label="Inspector" onClose={closeSheets} className="inspector-sheet">
        {body}
      </Sheet>
    )
  }
  return (
    <aside className="rightpanel panel" aria-label="Inspector" data-tour="desk">
      {body}
    </aside>
  )
}
