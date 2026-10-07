/** Trend range selector shared by the traffic-trend and filtering-trend
 *  cards: anchored menu normally, native select overlay on Apple devices */
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { usePick, PickSelect } from '../ui/menu'
import { isAppleMobile } from '../../lib/native/shell'

const RANGE_OPTS = [
  { value: '6h', labelKey: 'dashboard.range6h' },
  { value: '12h', labelKey: 'dashboard.range12h' },
  { value: '24h', labelKey: 'dashboard.range24h' },
] as const
export type RangeKey = (typeof RANGE_OPTS)[number]['value']

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const { t } = useTranslation()
  const pick = usePick()
  const options = RANGE_OPTS.map((o) => ({ label: t(o.labelKey), value: o.value }))
  const opt = RANGE_OPTS.find((o) => o.value === value)
  const label = opt ? t(opt.labelKey) : ''
  const open = (e: React.MouseEvent<HTMLElement>) => {
    pick({
      title: t('dashboard.rangeTitle'),
      anchor: e.currentTarget,
      align: 'right',
      value,
      options,
      onPick: onChange,
    })
  }
  if (isAppleMobile()) {
    return (
      <span className="press glass relative flex h-[30px] flex-none items-center gap-1 rounded-full pl-3 pr-7 text-[12.5px] font-semibold text-t1">
        <PickSelect
          className="absolute inset-0 h-[30px] w-full cursor-pointer appearance-none bg-transparent text-transparent"
          value={value}
          options={options}
          onPick={onChange}
        />
        <span className="pointer-events-none">{label}</span>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 text-t2" />
      </span>
    )
  }
  return (
    <button
      onClick={open}
      className="press glass flex flex-none items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-t1"
    >
      {label}
      <ChevronDown size={14} className="text-t2" />
    </button>
  )
}
