/** Theme skin gallery row: registered Demon palettes with their ambient preview. */
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppearanceRowInjected } from './AppearanceRow.tsx'
import type { createAppearanceRowStore } from './settings-store.ts'
import { DEMON_THEMES } from './demon-themes.ts'
import type { ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import css from './ThemeGalleryRow.module.css'

/** One skin's localized label key. */
const LABEL: Readonly<Record<string, ThemeKey>> = {
  obsidian: 'appearance.obsidian',
  ember: 'appearance.ember',
  aurora: 'appearance.aurora',
  graphite: 'appearance.graphite',
  sakura: 'appearance.sakura',
}

/** Full component props: runtime share + store share + locale seat + injected write. */
export type ThemeGalleryRowProps =
  & PropsRuntime<'settings.general.item'>
  & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'>
  & AppearanceRowInjected

/**
 * Render the skin gallery.
 * @param props - composed slot props.
 * @returns the gallery row.
 */
export function ThemeGalleryRow({ t, setTheme, useStore }: ThemeGalleryRowProps) {
  const preference = useStore(state => state.preference)
  return (
    <div className={css.group}>
      <div className={css.titleRow}>
        <span className={css.title}>{t('appearance.themes')}</span>
        <span className={css.hint}>{t('appearance.themes.description')}</span>
      </div>
      <div className={css.grid}>
        {DEMON_THEMES.map((theme) => {
          const selected = preference === theme.id
          const key = LABEL[theme.id]
          const label = key === undefined ? theme.label : t(key)
          return (
            <button
              key={theme.id}
              type="button"
              className={clsx(css.swatch, selected && css.selected)}
              aria-pressed={selected}
              title={label}
              onClick={() => { setTheme(theme.id as ThemePreference) }}
            >
              <span className={css.preview} style={{ backgroundImage: theme.preview }} aria-hidden />
              <span className={css.name}>{label}</span>
              {selected ? <span className={css.dot} aria-hidden /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
