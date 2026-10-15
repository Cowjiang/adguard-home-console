/** Settings hub + general settings + system management + appearance / instances / about */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import {
  ScrollText, Network, Lock, Wifi, Wrench,
  Trash, RotateCcw, DownloadCloud, Server, Plus, SunMoon,
  Info, Eraser, ShieldQuestion, Layers,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/session/auth'
import { activeEndpoint, labelFromUrl } from '../lib/session/instances'
import { api, swrFetcher, type QueryLogConfig, type StatsConfig, type VersionInfo } from '../lib/api'
import { setAppLang, getLangSetting, type LangSetting } from '../lib/i18n'
import { PageHeader, Screen, Card, Group, GroupTitle, Rows, Row, Switch, Button } from '../components/ui/primitives'
import { useConfirm } from '../components/ui/sheet'
import { toast } from '../components/ui/toast'
import { Badge, Loading, ErrorBox } from '../components/ui/atoms'
import { usePick, PickSelect } from '../components/ui/menu'
import { IconBubble } from '../components/ui/atoms'
import { isAppleMobile } from '../lib/native/shell'
import { hoursLabel, fmtDate } from '../lib/format'
import { APP_NAME, APP_VERSION } from '../lib/constants'
import { useIsDesktop } from '../lib/useIsDesktop'

/* ================= Settings hub ================= */

export default function Settings() {
  const nav = useNavigate()
  const { t } = useTranslation()
  const isDesktop = useIsDesktop()
  const { offline } = useAuth()

  const serverItems = [
    { icon: <ScrollText size={17} />, color: 'var(--accent-2)', title: t('settings.itemQueryStats'), desc: t('settings.itemQueryStatsDesc'), to: '/settings/general' },
    { icon: <Network size={17} />, color: 'var(--accent)', title: t('settings.itemDns'), desc: t('settings.itemDnsDesc'), to: '/settings/dns' },
    { icon: <Wrench size={17} />, color: 'var(--violet)', title: t('settings.itemAccess'), desc: t('settings.itemAccessDesc'), to: '/settings/access' },
    { icon: <Lock size={17} />, color: 'var(--warn)', title: t('settings.itemEncryption'), desc: t('settings.itemEncryptionDesc'), to: '/settings/encryption' },
    { icon: <Wifi size={17} />, color: 'var(--ok)', title: t('settings.itemDhcp'), desc: t('settings.itemDhcpDesc'), to: '/settings/dhcp' },
    { icon: <Layers size={17} />, color: 'var(--accent)', title: t('settings.itemSnapshots'), desc: t('settings.itemSnapshotsDesc'), to: '/settings/snapshots' },
    { icon: <ShieldQuestion size={17} />, color: 'var(--danger)', title: t('settings.itemSystem'), desc: t('settings.itemSystemDesc'), to: '/settings/system' },
  ]
  const appItems = [
    { icon: <SunMoon size={17} />, color: 'var(--accent-2)', title: t('settings.appearance'), desc: t('settings.itemAppearanceDesc'), to: '/settings/appearance' },
    { icon: <Server size={17} />, color: 'var(--accent)', title: t('settings.itemServer'), desc: t('settings.itemServerDesc'), to: '/settings/server' },
    { icon: <Info size={17} />, color: 'var(--violet)', title: t('settings.itemAbout'), desc: `${APP_NAME} v${APP_VERSION}`, to: '/settings/about' },
  ]

  // Hide the AGH-server-dependent "server settings" group while offline, keeping the page
  // usable: the user may need to change the server address via "server connection";
  // the group comes back automatically once offline resets on reconnect
  const groups = [
    ...(!offline ? [{ title: t('settings.groupServer'), items: serverItems }] : []),
    { title: t('settings.groupApp'), items: appItems },
  ]

  return (
    <Screen>
      <PageHeader title={t('settings.title')} />

      <div className={isDesktop ? 'grid grid-cols-2 items-start gap-x-4' : ''}>
        {groups.map((g) => (
          <div key={g.title}>
            <GroupTitle>{g.title}</GroupTitle>
            <Group>
              <Rows>
                {g.items.map((it, i) => (
                  <Row
                    key={it.to}
                    icon={<IconBubble color={it.color} bg="color-mix(in srgb, currentColor 12%, transparent)">{it.icon}</IconBubble>}
                    title={it.title}
                    subtitle={it.desc}
                    onClick={() => nav(it.to)}
                    last={i === g.items.length - 1}
                  />
                ))}
              </Rows>
            </Group>
          </div>
        ))}
      </div>
    </Screen>
  )
}
