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
import proxy from './proxy'

/** zh 是基准语言:en 与本对象类型同构(en: typeof zh),en 缺 key 会在 tsc 报错 */
export default { common, login, dashboard, settings, units, protection, nav, agh, charts, clients, querylog, filters, stats, advanced, proxy }
