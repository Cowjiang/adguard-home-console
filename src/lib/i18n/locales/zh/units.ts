/** 时长与相对时间单位(format.ts 消费);zh 基数复数恒为 other,_one 仅与 en 保持类型同构 */

const zhUnits = {
  now: '刚刚',
  never: '从未',
  disabled: '已禁用',
  day_one: '{{count}} 天',
  day_other: '{{count}} 天',
  hour_one: '{{count}} 小时',
  hour_other: '{{count}} 小时',
  minute_one: '{{count}} 分钟',
  minute_other: '{{count}} 分钟',
  second_one: '{{count}} 秒',
  second_other: '{{count}} 秒',
  secAgo_one: '{{count}} 秒前',
  secAgo_other: '{{count}} 秒前',
  minAgo_one: '{{count}} 分钟前',
  minAgo_other: '{{count}} 分钟前',
  hourAgo_one: '{{count}} 小时前',
  hourAgo_other: '{{count}} 小时前',
  dayAgo_one: '{{count}} 天前',
  dayAgo_other: '{{count}} 天前',
}

export default zhUnits
