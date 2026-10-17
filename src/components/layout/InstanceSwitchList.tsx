/** Instance switcher content (desktop sidebar card / mobile status pill):
 *  rows switch instantly — status/offline derive from the per-instance probe
 *  session and SWR keys hash by cfg content, so visited instances come back
 *  from cache without a reload. The sheet portals outside <BrowserRouter>,
 *  so navigation is injected via onManage instead of useNavigate */
import { Check, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/session/auth'
import { Button } from '../ui/primitives'
import { StatusDot } from '../ui/atoms'

export function InstanceSwitchList({ onClose, onManage }: { onClose: () => void; onManage: () => void }) {
  const { instances, activeId, switchInstance } = useAuth()
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      {/* Keep the sheet a small panel: the list scrolls once it approaches
          half the screen (mobile floating panels must stay small, see
          docs/web-interaction.md) */}
      <div className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
        {instances.map((it) => (
          <button
            key={it.id}
            className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left active:bg-white/5"
            onClick={() => {
              switchInstance(it.id)
              onClose()
            }}
          >
            <StatusDot online={it.online} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-t1">{it.label}</span>
              <span className="num block truncate text-[12px] text-t3">{it.url}</span>
            </span>
            {it.id === activeId && <Check size={17} className="flex-none text-accent" />}
          </button>
        ))}
      </div>
      <Button
        variant="glass"
        className="mt-2 w-full"
        onClick={() => {
          onClose()
          onManage()
        }}
      >
        <Settings2 size={15} /> {t('settings.instancesManage')}
      </Button>
    </div>
  )
}
