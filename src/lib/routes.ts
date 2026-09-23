/** 桌面侧边栏根路由;二级页面才有返回语义,供 PageHeader(桌面隐藏返回胶囊)判定 */
export const TOP_LEVEL_ROUTES = ['/', '/stats', '/protection', '/log', '/clients', '/settings']

/**
 * 移动端 tab 根路由(iOS 原生 TabBar / Web 浮动标签栏的 4 个 tab)。
 * 「是否 tab 根」在移动端决定三件事:不显示返回按钮、不显示顶部状态条、
 * push 落地不播转场;`/clients`、`/stats` 只是桌面根,移动端走二级页语义。
 */
export const TAB_ROOT_ROUTES = ['/', '/protection', '/log', '/settings']
