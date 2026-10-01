import { Balloon, Candy, CloudSun, Droplets, Flower, Flower2, Lamp, Lightbulb, MoonStar, Music, Music2, Music4, Package, Radio, Rainbow, ScrollText, Sparkles, Sprout, Sunset, Telescope, TreeDeciduous, Trophy, Wind } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'theme-daybreak': CloudSun,
  'theme-sunset': Sunset,
  'theme-starlight': Sparkles,
  'theme-blossom': Flower2,
  'skin-parchment': ScrollText,
  'skin-midnight': MoonStar,
  'skin-candy': Candy,
  'music-drift': Music,
  'music-breeze': Music2,
  'music-starlight': Music4,
  'music-lofi': Radio,
  'decor-plant': Sprout,
  'decor-crates': Package,
  'decor-lantern': Lamp,
  'decor-flowers': Flower,
  'decor-windmill': Wind,
  'decor-tree': TreeDeciduous,
  'decor-telescope': Telescope,
  'decor-statue': Trophy,
  'facility-balloon': Balloon,
  'facility-fountain': Droplets,
  'facility-fairylights': Lightbulb,
  'facility-rainbow': Rainbow,
}

/** One icon set for every unlockable (themes, skins, music, decorations, facilities). */
export function UnlockIcon({ id, size = 15 }: { id: string; size?: number }) {
  const Icon = ICONS[id]
  return <Icon size={size} aria-hidden className="unlock-icon" />
}
