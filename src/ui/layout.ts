import { useSyncExternalStore } from 'react'
import { mutate } from '../state/store'

function mediaQuery(query: string) {
  const mq = window.matchMedia(query)
  const matches = () => mq.matches
  const subscribe = (cb: () => void) => {
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
  }
  return { matches, useMatches: () => useSyncExternalStore(subscribe, matches) }
}

// Phones, portrait small tablets and landscape phones get the compact layout: a tab bar and bottom sheets
// instead of side panels. Keep in sync with the `.hud.compact` rules in app.css.
const compact = mediaQuery('(max-width: 820px), (max-height: 520px)')
export const isCompact = compact.matches
export const useCompact = compact.useMatches

/** Narrow desktops keep the inspector but tuck the crew roster behind a "Crew" button. */
export const useNarrow = mediaQuery('(max-width: 1100px)').useMatches

/** Open a compact-layout sheet (or close it if it's already open). */
export function toggleSheet(sheet: 'crew' | 'desk' | 'more' | 'menu') {
  mutate((s) => {
    const open = s.ui.sheet === sheet
    s.ui.sheet = open ? null : sheet
    // On phones the inspector sheet shows whatever is selected, so opening any sheet (desk included) clears the selection.
    if (!open && isCompact()) s.ui.selection = { kind: null, id: null }
  })
}

/** Close the inspector sheet and any other sheet. */
export function closeSheets() {
  mutate((s) => {
    s.ui.sheet = null
    s.ui.selection = { kind: null, id: null }
  })
}
