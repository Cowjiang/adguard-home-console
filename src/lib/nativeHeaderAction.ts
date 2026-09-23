/**
 * 顶栏右侧操作按钮的原生液态玻璃版(iOS 壳,tauri-plugin-system-components 的
 * createComponent)。交接约定:
 *
 * - 页面就绪(前进/后退转场结束)后原地淡入,不跟随页面滑动;离开(含卸载)先淡出再移除;
 * - 原生接管期间自定义(CSS)按钮一律不显示(只保留布局占位),避免两种按钮同时出现;
 * - 侧滑手势期间原生按钮让位(不淡入),手势结束后再淡入;
 * - 不依赖 Router 上下文:弹层(sheet)是在 Router 之外渲染的,任何 Router hook
 *   在这里都会以 null context 抛错(添加租约/添加过滤器弹层曾因此整页报错)。
 *
 * 原生不可用或创建失败时静默回落到 CSS 按钮。
 */
import { useEffect, useRef, useState } from 'react'
import { isTauriIOS, useGestureActive, useTransitionHalfBusy, TRANSITION_HALF_MS } from './routeTransition'
import { useIsDesktop } from './useIsDesktop'
import { consumeGestureCommit } from './routeTransition'
import { FADE_IN_S, FADE_OUT_S, accentHex } from './nativeGlass'

const BTN_ID = 'nav-action'
/** 图标按钮的正方形边长(对齐 CSS 胶囊 h-11 w-11) */
const ICON_SIZE = 44
const HEIGHT = 44
/** 与 CSS 导航条同一条垂直带:插件按 safe-area + margin(16) 定位,dy=-8 对齐胶囊顶 */
const DY = -8
const plugin = () => import('@sosweetham/tauri-plugin-system-components-api')
/** 当前持有顶栏原生组件的实例;只有持有者才能动它(同屏两个实例时不互删) */
let owner: symbol | null = null

export interface NativeHeaderSpec {
  /** 按钮文字(带文字的操作);与 sfSymbol 至少给一个 */
  label?: string
  /** 图标 SF Symbol */
  sfSymbol?: string
  /** 文字与图标颜色;'accent' 取当前主题强调色,不传用系统默认 */
  foreground?: string | 'accent'
  /** 图标按钮:正方形 44×44(与 CSS 圆形胶囊同形) */
  iconOnly?: boolean
}

/** 原生按钮是否已接管(自定义按钮据此隐藏,只留占位) */
export function useNativeHeaderAction(
  spec: NativeHeaderSpec | undefined,
  onPress: (() => void) | undefined,
  enabled: boolean
): boolean {
  const isDesktop = useIsDesktop()
  const gesturing = useGestureActive()
  // 转场前半程内不出场:等到过半(≈170ms)再淡入,与页面落位同步
  const halfBusy = useTransitionHalfBusy()
  // 原生路径一旦成立,自定义按钮就永远不显示(手势/转场间隙同样不显示 —— 否则
  // 侧滑过程中会冒出 CSS 胶囊,与原生按钮同框);仅当创建失败才回退到 CSS。
  const [failed, setFailed] = useState(false)
  const pressRef = useRef(onPress)
  pressRef.current = onPress
  const tokenRef = useRef<symbol | null>(null)
  if (tokenRef.current === null) tokenRef.current = Symbol('header-action')

  const label = spec?.label
  const sfSymbol = spec?.sfSymbol
  const foreground = spec?.foreground
  const iconOnly = spec?.iconOnly ?? false
  const active = enabled && !isDesktop && isTauriIOS() && (!!label || !!sfSymbol)

  // 点击 → 页面自己的 handler(ref 取最新,监听只挂一次)
  useEffect(() => {
    if (!active) return
    let disposed = false
    let un: (() => void) | undefined
    plugin()
      .then(async (p) => {
        const l = await p.onComponentEvent((e) => {
          if (e.id !== BTN_ID || e.event !== 'click') return
          pressRef.current?.()
        })
        if (disposed) {
          void l.unregister()
          return
        }
        un = () => void l.unregister()
      })
      .catch(() => {})
    return () => {
      disposed = true
      un?.()
    }
  }, [active])

  // 转场结束 → 淡入;转场中/手势中/未激活 → 淡出移除
  useEffect(() => {
    // 非顶栏槽位的普通 Button(enabled=false)完全不参与,否则会误删同页顶栏的组件
    if (!enabled) return
    const mine = tokenRef.current
    const fadeOutRemove = () => {
      if (owner !== mine) return
      owner = null
      void plugin()
        .then(async (p) => {
          await p.updateComponent(BTN_ID, { alpha: 0, appearDuration: FADE_OUT_S }).catch(() => {})
          setTimeout(() => void p.removeComponent(BTN_ID).catch(() => {}), FADE_OUT_S * 1000 + 40)
        })
        .catch(() => {})
    }
    const ready = active && !gesturing && !halfBusy
    if (!ready) {
      fadeOutRemove()
      return
    }
    const color = foreground === 'accent' ? accentHex() : foreground
    let cancelled = false
    plugin()
      .then((p) => {
        if (cancelled) return
        return p
          .createComponent({
            id: BTN_ID,
            kind: 'button',
            props: {
              label,
              sfSymbol,
              foreground: color,
              ...(iconOnly ? { width: ICON_SIZE } : {}),
              height: HEIGHT,
              // 原地淡入(插件原生入场:淡入 + 轻微缩放),不跟随页面滑动
              appearAnimation: true,
              appearDuration: FADE_IN_S,
            },
            anchor: 'topTrailing',
            dx: 0,
            dy: DY,
          })
          .then(() => {
            if (!cancelled) owner = mine
          })
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
    }
  }, [enabled, active, gesturing, halfBusy, label, sfSymbol, foreground, iconOnly])

  // 卸载:退场过半再淡出,不留残影(侧滑提交没有 CSS 退场动画,立即淡出)
  const commitSeen = useRef(0)
  useEffect(
    () => () => {
      const mine = tokenRef.current
      if (owner !== mine) return
      owner = null
      const delay = consumeGestureCommit(commitSeen) ? 0 : TRANSITION_HALF_MS
      setTimeout(() => {
        // 期间若有新实例接管(同页重建/新页进场),不要删它的按钮
        if (owner !== null) return
        void plugin()
          .then(async (p) => {
            await p.updateComponent(BTN_ID, { alpha: 0, appearDuration: FADE_OUT_S }).catch(() => {})
            setTimeout(() => void p.removeComponent(BTN_ID).catch(() => {}), FADE_OUT_S * 1000 + 40)
          })
          .catch(() => {})
      }, delay)
    },
    []
  )

  return active && !failed
}
