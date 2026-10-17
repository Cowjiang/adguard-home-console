/** Duration and relative-time units (consumed by format.ts) */

const enUnits = {
  now: 'just now',
  never: 'never',
  disabled: 'Disabled',
  day_one: '{{count}} day',
  day_other: '{{count}} days',
  hour_one: '{{count}} hour',
  hour_other: '{{count}} hours',
  minute_one: '{{count}} minute',
  minute_other: '{{count}} minutes',
  second_one: '{{count}} second',
  second_other: '{{count}} seconds',
  secAgo_one: '{{count}} second ago',
  secAgo_other: '{{count}} seconds ago',
  minAgo_one: '{{count}} minute ago',
  minAgo_other: '{{count}} minutes ago',
  hourAgo_one: '{{count}} hour ago',
  hourAgo_other: '{{count}} hours ago',
  dayAgo_one: '{{count}} day ago',
  dayAgo_other: '{{count}} days ago',
  // Compact forms for stat tiles: the caption ("Last update") already scopes
  // the value, so it stays unit-abbreviated and fits the narrow column beside
  // the refresh button ("26h", "3d")
  nowShort: 'now',
  secShort: '{{count}}s',
  minShort: '{{count}}m',
  hourShort: '{{count}}h',
  dayShort: '{{count}}d',
  // Unit labels for frames like "Auto-refresh every {{interval}}": English
  // drops the count ("every day"), Chinese keeps it ("每 1 天自动更新")
  hourEvery: 'hour',
  dayEvery: 'day',
}

export default enUnits
