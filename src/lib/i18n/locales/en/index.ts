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

/** Type-isomorphic to the zh dictionary: missing keys fail tsc; en may have
 *  extra keys (structural typing doesn't reject extras) */
const en: typeof zhDict = { common, login, dashboard, settings, units, protection, nav, agh, charts, clients, querylog, filters, stats, advanced }

export default en
