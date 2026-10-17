/** Trend range selector shared by the traffic-trend and filtering-trend
 *  cards: anchored menu normally, native select overlay on Apple devices */
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { usePick, PickSelect } from '../ui/menu'
import { isAppleMobile } from '../../lib/native/shell'

// Values are bucket counts; AGH's `time_units` decides whether a bucket is an
// hour or a day, so the label follows the unit while the key stays fixed
const RANGE_OPTS = [
  { value: '6h', labelKey: 'dashboard.range6h', dayLabelKey: 'dashboard.range6d' },
  { value: '12h', labelKey: 'dashboard.range12h', dayLabelKey: 'dashboard.range12d' },
  { value: '24h', labelKey: 'dashboard.range24h', dayLabelKey: 'dashboard.range24d' },
] as const
export type RangeKey = (typeof RANGE_OPTS)[number]['value']

export function RangePicker({ value, onChange, units }: { value: RangeKey; onChange: (v: RangeKey) => void; units?: 'hours' | 'days' }) {
  const { t } = useTranslation()
  const pick = usePick()
  const keyOf = (o: (typeof RANGE_OPTS)[number]) => (units === 'days' ? o.dayLabelKey : o.labelKey)
  const options = RANGE_OPTS.map((o) => ({ label: t(keyOf(o)), value: o.value }))
  const opt = RANGE_OPTS.find((o) => o.value === value)
  const label = opt ? t(keyOf(opt)) : ''
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
