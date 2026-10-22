/** Demon Code's registered theme skins: token overrides plus a CSS-driven ambient wash. */
import type { ThemeDefinition } from './index.ts'

/** One skin: the registry definition and the gallery preview gradient. */
export interface DemonTheme extends ThemeDefinition {
  /** Short Chinese label used by the gallery row. */
  readonly label: string
  /** Gallery swatch gradient. */
  readonly preview: string
}

const BASE = {
  '--dsw-alias-bg-base': '#0b0b0e',
  '--dsw-alias-bg-layer-1': '#121216',
  '--dsw-alias-bg-layer-2': '#17171c',
  '--dsw-alias-bg-layer-3': '#1e1e25',
  '--dsw-alias-bg-overlay': '#202028',
  '--dsw-alias-border-l1': 'rgba(255, 255, 255, 0.08)',
  '--dsw-alias-border-l2': 'rgba(255, 255, 255, 0.14)',
  '--dsw-alias-border-l3': 'rgba(255, 255, 255, 0.22)',
  '--dsw-alias-label-primary': '#f2f2f4',
  '--dsw-alias-label-secondary': '#a7a7b2',
  '--dsw-alias-label-tertiary': '#7a7a86',
  '--dsw-specific-sidebar-fill': '#0e0e12',
  '--dsw-alias-brand-primary': '#ff5a4e',
  '--dsw-alias-state-business-primary': '#ff5a4e',
  '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.06)',
  '--dsw-alias-menu-bg': '#17171c',
} as const

/** Obsidian: the shipped near-black with one ember accent. */
const obsidian: DemonTheme = {
  id: 'obsidian',
  colorScheme: 'dark',
  label: '黑曜',
  preview: 'linear-gradient(135deg, #0b0b0e 35%, #ff5a4e 140%)',
  tokens: { ...BASE },
}

/** Ember: warm charcoal, copper accent, less blue in the shadows. */
const ember: DemonTheme = {
  id: 'ember',
  colorScheme: 'dark',
  label: '余烬',
  preview: 'linear-gradient(135deg, #120d0c 30%, #ff7a45 130%)',
  tokens: {
    ...BASE,
    '--dsw-alias-bg-base': '#120d0c',
    '--dsw-alias-bg-layer-1': '#1a1210',
    '--dsw-alias-bg-layer-2': '#221714',
    '--dsw-alias-bg-layer-3': '#2a1c18',
    '--dsw-alias-bg-overlay': '#301f1a',
    '--dsw-alias-border-l1': 'rgba(255, 210, 190, 0.09)',
    '--dsw-alias-border-l2': 'rgba(255, 210, 190, 0.16)',
    '--dsw-alias-border-l3': 'rgba(255, 210, 190, 0.24)',
    '--dsw-alias-label-primary': '#f7efea',
    '--dsw-alias-label-secondary': '#c4aaa0',
    '--dsw-alias-label-tertiary': '#94766b',
    '--dsw-specific-sidebar-fill': '#150f0d',
    '--dsw-alias-brand-primary': '#ff7a45',
    '--dsw-alias-state-business-primary': '#ff7a45',
    '--dsw-alias-interactive-bg-hover': 'rgba(255, 180, 150, 0.07)',
    '--dsw-alias-menu-bg': '#221714',
  },
}

/** Aurora: deep polar navy with a green-cyan accent. */
const aurora: DemonTheme = {
  id: 'aurora',
  colorScheme: 'dark',
  label: '极光',
  preview: 'linear-gradient(135deg, #080d12 25%, #55d6c2 120%, #7aa2ff 160%)',
  tokens: {
    ...BASE,
    '--dsw-alias-bg-base': '#080d12',
    '--dsw-alias-bg-layer-1': '#0d151c',
    '--dsw-alias-bg-layer-2': '#111c25',
    '--dsw-alias-bg-layer-3': '#16242f',
    '--dsw-alias-bg-overlay': '#1a2b38',
    '--dsw-alias-border-l1': 'rgba(180, 235, 240, 0.09)',
    '--dsw-alias-border-l2': 'rgba(180, 235, 240, 0.17)',
    '--dsw-alias-border-l3': 'rgba(180, 235, 240, 0.26)',
    '--dsw-alias-label-primary': '#eefbfa',
    '--dsw-alias-label-secondary': '#9fc3c5',
    '--dsw-alias-label-tertiary': '#6b8f93',
    '--dsw-specific-sidebar-fill': '#0a1117',
    '--dsw-alias-brand-primary': '#55d6c2',
    '--dsw-alias-state-business-primary': '#55d6c2',
    '--dsw-alias-interactive-bg-hover': 'rgba(150, 240, 230, 0.07)',
    '--dsw-alias-menu-bg': '#111c25',
  },
}

/** Graphite: cool neutral, low chroma, for long reading sessions. */
const graphite: DemonTheme = {
  id: 'graphite',
  colorScheme: 'dark',
  label: '石墨',
  preview: 'linear-gradient(135deg, #0d0e11 30%, #9aa7b8 140%)',
  tokens: {
    ...BASE,
    '--dsw-alias-bg-base': '#0d0e11',
    '--dsw-alias-bg-layer-1': '#15171b',
    '--dsw-alias-bg-layer-2': '#1b1e23',
    '--dsw-alias-bg-layer-3': '#23272d',
    '--dsw-alias-bg-overlay': '#282c33',
    '--dsw-alias-border-l1': 'rgba(220, 228, 240, 0.08)',
    '--dsw-alias-border-l2': 'rgba(220, 228, 240, 0.15)',
    '--dsw-alias-border-l3': 'rgba(220, 228, 240, 0.23)',
    '--dsw-alias-label-primary': '#f3f5f8',
    '--dsw-alias-label-secondary': '#b3bac6',
    '--dsw-alias-label-tertiary': '#7f8794',
    '--dsw-specific-sidebar-fill': '#101215',
    '--dsw-alias-brand-primary': '#9aa7b8',
    '--dsw-alias-state-business-primary': '#9aa7b8',
    '--dsw-alias-interactive-bg-hover': 'rgba(220, 228, 240, 0.06)',
    '--dsw-alias-menu-bg': '#1b1e23',
  },
}

/** Sakura: dark plum with a restrained pink accent. */
const sakura: DemonTheme = {
  id: 'sakura',
  colorScheme: 'dark',
  label: '夜樱',
  preview: 'linear-gradient(135deg, #120c11 25%, #ff7eb6 130%)',
  tokens: {
    ...BASE,
    '--dsw-alias-bg-base': '#120c11',
    '--dsw-alias-bg-layer-1': '#1a1119',
    '--dsw-alias-bg-layer-2': '#221620',
    '--dsw-alias-bg-layer-3': '#2b1c28',
    '--dsw-alias-bg-overlay': '#33202f',
    '--dsw-alias-border-l1': 'rgba(255, 205, 230, 0.09)',
    '--dsw-alias-border-l2': 'rgba(255, 205, 230, 0.16)',
    '--dsw-alias-border-l3': 'rgba(255, 205, 230, 0.25)',
    '--dsw-alias-label-primary': '#faeef4',
    '--dsw-alias-label-secondary': '#c9a8ba',
    '--dsw-alias-label-tertiary': '#967186',
    '--dsw-specific-sidebar-fill': '#150e13',
    '--dsw-alias-brand-primary': '#ff7eb6',
    '--dsw-alias-state-business-primary': '#ff7eb6',
    '--dsw-alias-interactive-bg-hover': 'rgba(255, 190, 220, 0.07)',
    '--dsw-alias-menu-bg': '#221620',
  },
}

/** Registration order used by the gallery. */
export const DEMON_THEMES: readonly DemonTheme[] = Object.freeze([
  obsidian, ember, aurora, graphite, sakura,
])
