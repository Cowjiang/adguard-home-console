/** Running status / DNS port / uptime, shared by the mobile right column and
 *  the desktop analysis right column */
import { useTranslation } from 'react-i18next'
import { Laptop, Timer, Zap } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { fmtUptime } from '../../lib/format'
import { Card } from '../ui/primitives'
import { InfoCell } from './InfoCell'

export function ServerInfoCard() {
  const { status } = useAuth()
  const { t } = useTranslation()
  if (!status) return null
  return (
    <Card className="p-4">
      <div className="grid grid-cols-3 gap-y-3 text-center">
        <InfoCell icon={<Zap size={14} />} label={t('dashboard.status')} value={status.running ? t('dashboard.running') : t('dashboard.stopped')} good={status.running} />
        <InfoCell icon={<Laptop size={14} />} label={t('dashboard.dnsPort')} value={String(status.dns_port)} />
        <InfoCell icon={<Timer size={14} />} label={t('dashboard.uptime')} value={fmtUptime(status.start_time)} />
      </div>
    </Card>
  )
}
