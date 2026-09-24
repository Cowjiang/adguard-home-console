import type zhDict from '../zh'
import common from './common'
import login from './login'
import dashboard from './dashboard'
import settings from './settings'
import units from './units'
import protection from './protection'
import nav from './nav'
import agh from './agh'
import charts from './charts'
import clients from './clients'
import querylog from './querylog'
import filters from './filters'
import stats from './stats'
import advanced from './advanced'

/** 与 zh 词典类型同构:缺 key 在 tsc 报错;en 可比 zh 多 key(结构检查不拒绝多余成员) */
const en: typeof zhDict = { common, login, dashboard, settings, units, protection, nav, agh, charts, clients, querylog, filters, stats, advanced }

export default en
