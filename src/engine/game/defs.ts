export interface AchievementDef {
  id: string
  title: string
  desc: string
  xp: number
  sparks: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_flight', title: 'First Flight', desc: 'Deliver your first project.', xp: 60, sparks: 30 },
  { id: 'parallel_play', title: 'Parallel Play', desc: 'Have 3 crew members working at the same moment.', xp: 30, sparks: 15 },
  { id: 'full_house', title: 'Full House', desc: 'Have 5 or more crew members busy at once.', xp: 60, sparks: 30 },
  { id: 'clean_sweep', title: 'Clean Sweep', desc: 'Deliver a project with no failures and no rework.', xp: 50, sparks: 25 },
  { id: 'quality_gate', title: 'Caught in the Act', desc: 'Rook catches failing tests, then the fix passes.', xp: 50, sparks: 25 },
  { id: 'bottleneck_buster', title: 'Bottleneck Buster', desc: 'Resolve a bottleneck by reassigning work.', xp: 40, sparks: 20 },
  { id: 'keeper_of_lore', title: 'Keeper of Lore', desc: 'Grow the Memory Tree to 25 memories.', xp: 60, sparks: 30 },
  { id: 'deja_vu', title: 'Déjà Vu', desc: 'A task draws on memory from an earlier session.', xp: 50, sparks: 25 },
  { id: 'green_light', title: 'Green Light', desc: 'Approve 10 proposed actions.', xp: 30, sparks: 15 },
  { id: 'careful_captain', title: 'Careful Captain', desc: 'Reject a proposed external action.', xp: 20, sparks: 10 },
  { id: 'speedrun', title: 'Tailwind', desc: 'Deliver a project in under 4 minutes.', xp: 40, sparks: 20 },
  { id: 'frugal', title: 'Penny Pincher', desc: 'Deliver a real-model project for under $0.05.', xp: 50, sparks: 25 },
  { id: 'synergy_surge', title: 'Best Buds', desc: 'Two crew members reach synergy level 3.', xp: 40, sparks: 20 },
  { id: 'decorator', title: 'Interior Decorator', desc: 'Place 5 decorations around the islands.', xp: 30, sparks: 15 },
  { id: 'time_traveler', title: 'Time Traveler', desc: 'Watch a project replay.', xp: 20, sparks: 10 },
  { id: 'curious_mind', title: 'Curious Mind', desc: 'Ask the crew 5 follow-up questions.', xp: 30, sparks: 15 },
  { id: 'redirector', title: 'Change of Course', desc: 'Redirect a crew member mid-task.', xp: 20, sparks: 10 },
  { id: 'byok_brigade', title: 'Mixed Crew', desc: 'Run a project using 2+ different model providers.', xp: 50, sparks: 25 },
  { id: 'streak', title: 'Regular', desc: 'Visit Cloudworks on 3 different days.', xp: 40, sparks: 20 },
  { id: 'momentum_max', title: 'On Fire', desc: 'Push workflow momentum above 90.', xp: 30, sparks: 15 },
  { id: 'patron', title: 'Crate Collector', desc: 'Open 5 supply crates.', xp: 30, sparks: 15 },
  { id: 'idea_machine', title: 'Idea Machine', desc: 'Pin 5 notes to the Idea Wall.', xp: 20, sparks: 10 },
]

export type UnlockKind = 'decor' | 'theme' | 'skin' | 'music' | 'facility'

export interface Unlockable {
  id: string
  kind: UnlockKind
  name: string
  desc: string
  level: number
  price?: number
}

export const UNLOCKABLES: Unlockable[] = [
  { id: 'theme-daybreak', kind: 'theme', name: 'Daybreak', desc: 'Soft morning sky.', level: 1 },
  { id: 'skin-parchment', kind: 'skin', name: 'Parchment', desc: 'Warm paper UI.', level: 1 },
  { id: 'music-drift', kind: 'music', name: 'Cloud Drift', desc: 'Gentle generative pads.', level: 1 },
  { id: 'decor-plant', kind: 'decor', name: 'Potted Fern', desc: 'A leafy friend.', level: 1, price: 0 },
  { id: 'decor-crates', kind: 'decor', name: 'Supply Crates', desc: 'Stacked, rustic.', level: 1, price: 0 },
  { id: 'decor-lantern', kind: 'decor', name: 'Paper Lanterns', desc: 'Glow softly at dusk.', level: 2, price: 40 },
  { id: 'theme-sunset', kind: 'theme', name: 'Golden Hour', desc: 'Warm sunset glow.', level: 2 },
  { id: 'music-breeze', kind: 'music', name: 'Sky Breeze', desc: 'Airy pentatonic plucks.', level: 2 },
  { id: 'decor-flowers', kind: 'decor', name: 'Flower Bed', desc: 'Pastel blooms.', level: 3, price: 50 },
  { id: 'skin-midnight', kind: 'skin', name: 'Midnight', desc: 'Deep-blue night UI.', level: 3 },
  { id: 'facility-balloon', kind: 'facility', name: 'Hot-air Balloon', desc: 'Floats around the islands.', level: 3 },
  { id: 'decor-windmill', kind: 'decor', name: 'Wind Turbine', desc: 'Spins with momentum.', level: 4, price: 80 },
  { id: 'theme-starlight', kind: 'theme', name: 'Starlight', desc: 'Night sky with fireflies.', level: 4 },
  { id: 'music-starlight', kind: 'music', name: 'Starlight Waltz', desc: 'Music-box lullaby.', level: 4 },
  { id: 'facility-fountain', kind: 'facility', name: 'Plaza Fountain', desc: 'Jets rise with momentum.', level: 5 },
  { id: 'skin-candy', kind: 'skin', name: 'Candy', desc: 'Bubblegum UI.', level: 5 },
  { id: 'decor-tree', kind: 'decor', name: 'Blossom Tree', desc: 'Sheds petals.', level: 6, price: 120 },
  { id: 'theme-blossom', kind: 'theme', name: 'Blossom', desc: 'Pink spring sky.', level: 6 },
  { id: 'facility-fairylights', kind: 'facility', name: 'Fairy-light Bridges', desc: 'Bridges sparkle.', level: 7 },
  { id: 'decor-telescope', kind: 'decor', name: 'Brass Telescope', desc: 'For stargazing breaks.', level: 7, price: 150 },
  { id: 'music-lofi', kind: 'music', name: 'Lo-fi Loft', desc: 'Dusty beats & keys.', level: 8 },
  { id: 'facility-rainbow', kind: 'facility', name: 'Rainbow Arch', desc: 'Over the Command Plaza.', level: 9 },
  { id: 'decor-statue', kind: 'decor', name: 'Crew Statue', desc: 'A golden monument.', level: 10, price: 300 },
]

export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(220 * (level - 1) ** 1.6)
}

export function levelForXp(xp: number): number {
  let l = 1
  while (xp >= xpForLevel(l + 1) && l < 50) l++
  return l
}

export const RANKS = [
  { name: 'Apprentice', xp: 0 },
  { name: 'Adept', xp: 60 },
  { name: 'Expert', xp: 180 },
  { name: 'Master', xp: 400 },
  { name: 'Legend', xp: 800 },
]

export function rankFor(xp: number): { index: number; name: string; next?: number } {
  let i = 0
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++
  return { index: i, name: RANKS[i].name, next: RANKS[i + 1]?.xp }
}

export function momentumTier(m: number): { label: string; color: string; mult: number } {
  if (m >= 75) return { label: 'On Fire', color: '#FF6B3D', mult: 1.5 }
  if (m >= 45) return { label: 'Flowing', color: '#2BB673', mult: 1.25 }
  if (m >= 20) return { label: 'Steady', color: '#4C8DFF', mult: 1.0 }
  return { label: 'Stalled', color: '#9AA3B2', mult: 0.9 }
}

export function synergyLevel(points: number): number {
  if (points >= 12) return 3
  if (points >= 6) return 2
  if (points >= 2) return 1
  return 0
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** Decoration slots per island. Positions are local to the island center. */
export const DECOR_SLOTS: { id: string; island: string; x: number; z: number }[] = [
  { id: 'plaza-a', island: 'planner', x: -3.2, z: 2.2 },
  { id: 'plaza-b', island: 'planner', x: 3.3, z: 2.0 },
  { id: 'plaza-c', island: 'planner', x: -2.6, z: -2.8 },
  { id: 'research-a', island: 'researcher', x: 2.0, z: 1.2 },
  { id: 'coder-a', island: 'coder', x: -1.9, z: 1.4 },
  { id: 'writer-a', island: 'writer', x: 1.8, z: 1.5 },
  { id: 'designer-a', island: 'designer', x: -1.7, z: 1.6 },
  { id: 'analyst-a', island: 'analyst', x: 1.8, z: 1.4 },
  { id: 'qa-a', island: 'qa', x: -1.9, z: 1.3 },
  { id: 'archive-a', island: 'archivist', x: 2.4, z: 1.6 },
  { id: 'dock-a', island: 'dock', x: -1.6, z: 1.2 },
]
