import type zhDict from '../zh'
import common from './common'
import login from './login'
import dashboard from './dashboard'
import settings from './settings'
import units from './units'
import protection from './protection'

/** 与 zh 词典类型同构:缺 key 在 tsc 报错;en 可比 zh 多 key(结构检查不拒绝多余成员) */
const en: typeof zhDict = { common, login, dashboard, settings, units, protection }

export default en
