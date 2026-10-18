/** App update sheet (desktop): wraps the shared update content with the close
 *  footer. On mobile the same content opens as the /settings/about/update
 *  sub-page (see docs/web-interaction.md) */
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/primitives'
import { AppUpdateContent, type AppUpdateContentProps } from './AppUpdateContent'

export function AppUpdateSheet({ onClose, ...rest }: AppUpdateContentProps & { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <AppUpdateContent {...rest} />
      <div className="flex items-center justify-end border-t border-[var(--glass-border)] pt-3">
        <Button variant="glass" onClick={onClose} className="w-full sm:w-auto">
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
