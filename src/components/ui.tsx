/** iOS 风格基础组件库 */
import {
  createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, Search, X,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIsDesktop } from '../lib/useIsDesktop'
import { TAB_ROOT_ROUTES, TOP_LEVEL_ROUTES } from '../lib/routes'
import { useRouteTransition, useEnterSkip } from '../lib/routeTransition'
import { useNativeBackShown } from '../lib/nativeBackButton'
import { navBack } from '../lib/backNav'
import { copyText } from '../lib/clipboard'

/* ---------- 页面容器与标题 ---------- */

/** 顶级路由定义在 lib/routes.ts,此处 re-export 供旧引用方兼容 */
export { TOP_LEVEL_ROUTES, TAB_ROOT_ROUTES }

/** page-in 闩:滑动转场进行中跳过 page-in 淡入,避免与平移叠加;闩住一次性,
 *  防止转场结束后 dir 归零时 page-in 类重新补挂导致动画重播。
 *  页面根节点(无论是否经 Screen)统一用它挂 page-in。 */
export function usePageInClass(): string {
  const t = useRouteTransition()
  const noAnim = useRef(false)
  if (t.dir) noAnim.current = true
  return noAnim.current ? '' : 'page-in'
}

export function Screen({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return (
    <div className={`page-shell mx-auto w-full ${pad ? 'px-4' : ''} ${usePageInClass()}`}>
      {children}
    </div>
  )
}

/** 顶部滚动边缘渐变遮罩:内容滚入状态栏/导航栏区时淡出,纯渐变不用 backdrop-filter(避开 iOS 发烫红线) */
export function NavScrim({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 ${className}`}
      style={{
        // Tailwind 任意值类名带空格不会生成,高度用 inline style
        height: 'calc(env(safe-area-inset-top, 0px) + 72px)',
        background: 'linear-gradient(to bottom, color-mix(in srgb, var(--bg) 98%, transparent) 58%, transparent)',
      }}
    />
  )
}

export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const isDesktop = useIsDesktop()
  // iOS 壳内原生液态玻璃返回按钮接管时,CSS 胶囊让位(避免双按钮)
  const nativeBack = useNativeBackShown()
  const transition = useRouteTransition()
  // 顶级页面(侧边栏/TabBar 直达)在桌面端不需要返回按钮,返回只属于二级页面
  const isTopLevel = TOP_LEVEL_ROUTES.includes(pathname)
  const showBack = back && !(isDesktop && isTopLevel)
  // 移动端二级页:返回胶囊 + 居中标题固定在左上角,内容从下方滚过(对齐 iOS 26 液态玻璃导航栏)
  const floating = showBack && !isDesktop

  const goBack = () => navBack(nav, pathname)

  if (floating) {
    // 固定导航条与页面层做同步平移(push/pop),转场时随页面滑动。
    // 旧页的导航条由退场快照克隆携带滑出,存活的新页导航条永远拿 IN 动画
    // (拿 OUT 会反向平移后再跳回 = 前进穿帮);原生手势转场无 CSS 动画,不加类
    const barAnim = transition.exiting
      ? transition.dir === 'push'
        ? 'rt-push-in'
        : 'rt-pop-in'
      : ''
    return createPortal(
      <div
        data-floating-nav
        className={`pointer-events-none fixed inset-x-0 top-0 z-40 lg:hidden ${barAnim}`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
      >
        {/* 滚动边缘渐变遮罩:见 NavScrim 注释 */}
        <NavScrim />
        <div className="relative flex h-12 items-center px-4">
          {/* 原生玻璃按钮接管时仅视觉隐藏:转场快照克隆此条时补回按钮,
              避免滑出的旧页在按钮位留洞(原生控件瞬时移除,无法随页面滑动) */}
          <button
            data-back-btn
            onClick={goBack}
            style={nativeBack ? { visibility: 'hidden' } : undefined}
            className="press glass specular pointer-events-auto flex h-11 w-11 flex-none items-center justify-center rounded-full text-t2"
            aria-label="返回"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="pointer-events-none absolute left-1/2 w-full max-w-[min(58vw, 240px)] -translate-x-1/2 truncate text-center text-[17px] font-semibold text-t1">
            {title}
          </div>
          {right && <div className="pointer-events-auto ml-auto flex flex-none items-center gap-2">{right}</div>}
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {showBack && (
          <button
            onClick={goBack}
            className="press glass flex h-9 w-9 flex-none items-center justify-center rounded-full text-t2"
            aria-label="返回"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-t1">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-t2">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  )
}

/* ---------- 卡片与列表 ---------- */

export function Card({ children, className = '', strong = false, onClick }: { children: ReactNode; className?: string; strong?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`specular relative overflow-hidden rounded-3xl ${strong ? 'glass-strong' : 'glass'} ${onClick ? 'press cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function GroupTitle({ children, right, className = '' }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`mb-1.5 mt-5 flex items-baseline justify-between px-2 ${className}`}>
      <span className="text-[13px] font-semibold uppercase tracking-wide text-t3">{children}</span>
      {right}
    </div>
  )
}

export function Group({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Card className={`!rounded-[22px] ${className}`}><div>{children}</div></Card>
}

export function Row({
  icon, title, subtitle, value, right, onClick, danger, last,
}: {
  icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; value?: ReactNode
  right?: ReactNode; onClick?: (e: RMouseEvent<HTMLElement>) => void; danger?: boolean; last?: boolean
}) {
  const Comp: any = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${onClick ? 'active:bg-white/5' : ''}`}
      style={{ textAlign: 'left' }}
    >
      {icon && <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[15.5px] font-medium ${danger ? 'text-danger' : 'text-t1'}`}>{title}</div>
        {subtitle && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-t2">{subtitle}</div>}
      </div>
      {value !== undefined && <div className="flex-none text-[14px] text-t2">{value}</div>}
      {right !== undefined ? (
        right
      ) : onClick ? (
        <ChevronRight size={17} className="flex-none text-t3" />
      ) : null}
      {!last && <div className="sep absolute" style={{ display: 'none' }} />}
    </Comp>
  )
}

export function Rows({ children }: { children: ReactNode }) {
  // 给除最后一个之外的孩子加分隔线
  const arr = Array.isArray(children) ? children : [children]
  return (
    <div>
      {arr.map((c: any, i: number) => (
        <div key={c?.key ?? i}>
          {c}
          {i < arr.length - 1 && <div className="mx-4 h-px" style={{ background: 'var(--glass-border)' }} />}
        </div>
      ))}
    </div>
  )
}

/* ---------- 开关 ---------- */

export function Switch({ on, onChange, danger, disabled, loading }: { on: boolean; onChange: (v: boolean, e: RMouseEvent<HTMLButtonElement>) => void; danger?: boolean; disabled?: boolean; loading?: boolean }) {
  const inert = disabled || loading
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={inert}
      data-on={on}
      data-danger={danger}
      className="switch"
      style={inert ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
      onClick={(e: any) => {
        e.stopPropagation()
        onChange(!on, e)
      }}
    >
      <span className="knob" />
    </button>
  )
}

/* ---------- 按钮 ---------- */

export function Button({
  children, onClick, variant = 'primary', size = 'md', loading, disabled, className = '', type, label,
}: {
  children: ReactNode; onClick?: (e: RMouseEvent<HTMLButtonElement>) => void; variant?: 'primary' | 'glass' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'; loading?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit'; label?: string
}) {
  const base = 'press inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none'
  const sizes = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-10 px-5 text-[14.5px]', lg: 'h-12 px-6 text-[16px]' }[size]
  const variants = {
    primary: 'text-white shadow-lg',
    glass: 'glass text-t1',
    danger: 'bg-danger text-white',
    ghost: 'text-accent',
  }[variant]
  const style =
    variant === 'primary'
      ? { background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-2)))', boxShadow: '0 8px 24px -8px color-mix(in srgb, var(--accent) 60%, transparent)' }
      : variant === 'danger'
        ? { background: 'var(--danger)', boxShadow: '0 8px 24px -8px color-mix(in srgb, var(--danger) 55%, transparent)' }
        : undefined
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      className={`${base} ${sizes} ${variants} ${disabled || loading ? 'opacity-50' : ''} ${className}`}
      style={style}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

/* ---------- 分段控件 ---------- */

export function Segmented<T extends string>({
  options, value, onChange, size = 'md', fit = false,
}: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'
  /** true = 收缩为内容宽度(用于卡片内局部选择器);默认通栏 */
  fit?: boolean
}) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>())
  // 滑动指示块:像 tabbar 一样在激活项之间左右平移,而非每项各自闪现
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const measure = () => {
      const el = refs.current.get(value)
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [value, options.length])

  return (
    <div className={`glass relative flex rounded-full p-1 ${fit ? 'w-fit' : ''} ${size === 'sm' ? 'text-[12px]' : 'text-[13.5px]'}`}>
      {ind && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 top-1 rounded-full transition-[left,width] duration-300"
          style={{
            left: ind.left,
            width: ind.width,
            background: 'var(--accent-soft)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)',
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      )}
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current.set(o.value, el) }}
            onClick={() => onChange(o.value)}
            className={`press relative z-10 ${fit ? '' : 'flex-1'} whitespace-nowrap rounded-full px-3 py-1.5 font-semibold transition-colors ${active ? '' : 'text-t2'}`}
            style={active ? { color: 'var(--accent)' } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Tab 切换内容动画 ---------- */

/** 包一层 tab-in 动画:value 变化时重挂载子节点,重播切换动画(配合 Segmented / Chip 使用)。
 *  挂载于滑动转场中则跳过本次入场(手势期间动画挂起 → fill both 首帧透明 = 整页空白);
 *  闩只影响挂载那次,之后由用户触发的 value 切换照常播。 */
export function TabContent<T extends string | number>({
  value, children, className = '',
}: { value: T; children: ReactNode; className?: string }) {
  const skip = useEnterSkip()
  const first = useRef(true)
  const lastValue = useRef<T>(value)
  let animate: boolean
  if (first.current) {
    animate = !skip
    first.current = false
  } else {
    animate = value !== lastValue.current
  }
  lastValue.current = value
  return (
    <div key={String(value)} className={`${animate ? 'tab-in ' : ''}${className}`}>
      {children}
    </div>
  )
}

/* ---------- 底部浮层 ---------- */

interface SheetCtx {
  open: (node: ReactNode, opts?: { title?: string }) => void
  close: () => void
}
const SheetContext = createContext<SheetCtx>({ open: () => {}, close: () => {} })
export const useSheet = () => useContext(SheetContext)

export function SheetProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode | null>(null)
  const [title, setTitle] = useState<string | undefined>()
  const [visible, setVisible] = useState(false)

  const open = (n: ReactNode, opts?: { title?: string }) => {
    setTitle(opts?.title)
    setNode(n)
    // 双 rAF:必须让浏览器先把初始态(透明+缩放)绘制出来再切 visible,
    // transition 才会播放;单层 rAF 会与首帧合并导致弹窗"闪现无动画"
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  const close = () => {
    setVisible(false)
    setTimeout(() => setNode(null), 260)
  }

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [visible])

  return (
    <SheetContext.Provider value={{ open, close }}>
      <MenuHost>{children}</MenuHost>
      {node &&
        createPortal(
          // 项目红线(2026-09-23 用户定稿):任何弹窗一律屏幕居中出现,禁止从底部上升——
          // iOS 原生 tabbar 会挡住底部浮层。确认框/表单/详情全走此处,天然统一。
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              onClick={close}
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-250"
              style={{ opacity: visible ? 1 : 0 }}
            />
            <div
              className="glass-strong specular relative m-3 w-full max-w-[536px] rounded-[28px] p-5 transition-all duration-250"
              style={{
                transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.95)',
                opacity: visible ? 1 : 0,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {title && <h3 className="mb-3 text-center text-[16px] font-bold text-t1">{title}</h3>}
              {node}
            </div>
          </div>,
          document.body
        )}
    </SheetContext.Provider>
  )
}

/* ---------- 单选下拉菜单(锚点定位:苹果设备原生 select,其余自绘锚定下拉) ---------- */

interface PickReq<T extends string | number> {
  options: { label: ReactNode; value: T }[]
  value?: T
  onPick: (value: T) => void
  /** 弹层标题(锚定下拉菜单目前不展示,保留字段兼容) */
  title?: string
  /** 触发元素,桌面下拉以其矩形定位 */
  anchor: HTMLElement
  align?: 'left' | 'right'
}

interface MenuState {
  req: PickReq<any>
  rect: DOMRect
  visible: boolean
}

interface MenuCtx {
  open: <T extends string | number>(req: PickReq<T>) => void
}
const MenuContext = createContext<MenuCtx>({ open: () => {} })

function MenuHost({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const reqRef = useRef<PickReq<any> | null>(null)

  const close = () => {
    setSt((s) => (s ? { ...s, visible: false } : s))
    setTimeout(() => {
      setSt(null)
      reqRef.current = null
    }, 140)
  }

  const open = <T extends string | number>(req: PickReq<T>) => {
    // 同一触发元素再次点击 = 关闭(toggle);换锚点则切换到新菜单
    setSt((prev) => {
      if (prev && reqRef.current?.anchor === req.anchor) {
        reqRef.current = null
        return null
      }
      reqRef.current = req
      return { req, rect: req.anchor.getBoundingClientRect(), visible: false }
    })
    requestAnimationFrame(() => setSt((s) => (s ? { ...s, visible: true } : s)))
  }

  useEffect(() => {
    if (!st) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || reqRef.current?.anchor.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    // 滚动/缩放时直接关,不做跟随重定位
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.req])

  // 渲染后测量菜单高度:默认展开在锚点下方,放不下则翻转到上方
  useLayoutEffect(() => {
    if (!st || !menuRef.current) return
    const el = menuRef.current
    const h = el.offsetHeight
    const w = el.offsetWidth
    const below = st.rect.bottom + 6
    const above = st.rect.top - 6 - h
    const top = below + h <= window.innerHeight - 8 || above < 8 ? below : Math.max(8, above)
    const left = st.req.align === 'left'
      ? Math.min(st.rect.left, window.innerWidth - w - 8)
      : Math.max(8, Math.min(st.rect.right - w, window.innerWidth - w - 8))
    if (el.style.top !== `${top}px`) el.style.top = `${top}px`
    if (el.style.left !== `${left}px`) el.style.left = `${left}px`
  }, [st])

  return (
    <MenuContext.Provider value={{ open }}>
      {children}
      {st &&
        createPortal(
          <div
            ref={menuRef}
            className="glass-strong fixed z-[55] min-w-[160px] max-w-[calc(100vw-16px)] rounded-2xl p-1.5 shadow-2xl"
            style={{
              // top 由 useLayoutEffect 按菜单实际高度计算
              top: st.rect.bottom + 6,
              left: st.req.align === 'left' ? st.rect.left : Math.min(st.rect.right - 160, window.innerWidth - 168),
              opacity: st.visible ? 1 : 0,
              transform: st.visible ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.98)',
              transformOrigin: 'top',
              transition: 'opacity 0.14s ease, transform 0.14s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {st.req.options.map((o: { label: ReactNode; value: string | number }) => {
              const active = o.value === st.req.value
              return (
                <button
                  key={o.value}
                  onClick={() => {
                    close()
                    st.req.onPick(o.value)
                  }}
                  className={`menu-item flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-left text-[13.5px] font-medium ${active ? 'font-semibold text-accent' : 'text-t1'}`}
                >
                  {o.label}
                  {active && <Check size={15} className="flex-none" />}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </MenuContext.Provider>
  )
}

/**
 * 单选选择器:一律自绘锚定下拉菜单。
 * 苹果设备的原生选择器不走本函数——WebKit 未实现 <select> 的 showPicker()
 * (Safari 仅在预览版置于开关后),原生入口必须是真实渲染的 <select> 覆盖层,
 * 见 PickSelect 与各页面的 isAppleMobile() 分支。
 */
export function usePick() {
  const menu = useContext(MenuContext)
  return <T extends string | number>(req: PickReq<T>) => menu.open(req)
}

function pickText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(pickText).join('')
  const props = (node as { props?: { children?: ReactNode } }).props
  return props ? pickText(props.children) : ''
}

/** 苹果移动设备用的真实原生 <select>:点击即弹系统选择器,无任何 JS 介入 */
export function PickSelect<T extends string | number>({
  value, options, onPick, className, placeholder, ariaLabel,
}: {
  value?: T
  options: { label: ReactNode; value: T }[]
  onPick: (v: T) => void
  className?: string
  placeholder?: string
  ariaLabel?: string
}) {
  const current = value != null ? String(value) : (placeholder ?? '')
  return (
    <select
      className={`appearance-none outline-none ${className ?? ''}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label={ariaLabel}
      value={current}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value)
        if (o) onPick(o.value)
        if (value == null && placeholder != null) e.currentTarget.value = placeholder
      }}
    >
      {value == null && placeholder != null && <option value={placeholder}>{placeholder}</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>{pickText(o.label)}</option>
      ))}
    </select>
  )
}

/* ---------- 徽标 / 标签 ---------- */

export function Badge({ children, kind = 'ok' }: { children: ReactNode; kind?: 'ok' | 'blocked' | 'warn' | 'rewrite' | 'info' }) {
  const map = {
    ok: { c: 'var(--ok)', bg: 'var(--ok-soft)' },
    blocked: { c: 'var(--danger)', bg: 'var(--danger-soft)' },
    warn: { c: 'var(--warn)', bg: 'var(--warn-soft)' },
    rewrite: { c: 'var(--violet)', bg: 'var(--violet-soft)' },
    info: { c: 'var(--accent-2)', bg: 'color-mix(in srgb, var(--accent-2) 14%, transparent)' },
  }[kind]
  return (
    <span
      className="inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: map.c, background: map.bg }}
    >
      {children}
    </span>
  )
}

/* ---------- 源徽标(客户端来源,不同来源不同色) ---------- */

const SOURCE_STYLE: Record<string, { c: string; bg: string }> = {
  ARP: { c: 'var(--accent-2)', bg: 'color-mix(in srgb, var(--accent-2) 14%, transparent)' },
  DHCP: { c: 'var(--violet)', bg: 'var(--violet-soft)' },
  rDNS: { c: 'var(--warn)', bg: 'var(--warn-soft)' },
  WHOIS: { c: 'var(--ok)', bg: 'var(--ok-soft)' },
  'etc/hosts': { c: 'var(--t2)', bg: 'var(--glass)' },
}

export function SourceBadge({ source }: { source: string }) {
  const st = SOURCE_STYLE[source] ?? { c: 'var(--t2)', bg: 'var(--glass)' }
  return (
    <span
      className="inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: st.c, background: st.bg }}
    >
      {source}
    </span>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`press flex-none rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${active ? 'font-semibold' : 'glass text-t2'}`}
      style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}
    >
      {children}
    </button>
  )
}

/* ---------- 搜索框 ---------- */

export function SearchBar({ value, onChange, placeholder = '搜索', className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`glass flex items-center gap-2 rounded-full px-4 py-2.5 ${className}`}>
      <Search size={16} className="flex-none text-t3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-[15px] text-t1 outline-none"
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="search"
      />
      {value && (
        <button onClick={() => onChange('')} className="press flex-none text-t3" aria-label="清空">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

/* ---------- 复制按钮 ---------- */

/** 图标复制按钮:点击复制文本,成功后短暂变对勾;用于详情页 IP/WHOIS 等行尾 */
export function CopyIconButton({ text, label = '', className = '' }: { text?: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  if (!text) return null
  return (
    <button
      onClick={async (e: any) => {
        e.stopPropagation()
        const ok = await copyText(text)
        if (ok) {
          setDone(true)
          toast('已复制' + (label || '内容'))
          setTimeout(() => setDone(false), 1500)
        } else {
          toast('复制失败', 'err')
        }
      }}
      className={`press flex-none text-t3 transition-colors hover:text-accent ${className}`}
      aria-label={'复制' + (label || '内容')}
      title={'复制' + (label || '内容')}
    >
      {done ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
    </button>
  )
}

/* ---------- 分页器 ---------- */

/**
 * 轻量分页:双端通用的上一页/下一页 + 页码;桌面端额外显示总条数与每页条数选择。
 * 仅一页时不渲染(mobile);桌面端传 total 时仍显示汇总行。
 */
export function Pagination({
  page, pages, onChange, total, pageSize, onPageSize,
}: {
  page: number
  pages: number
  onChange: (p: number) => void
  total?: number
  pageSize?: number
  onPageSize?: (n: number) => void
}) {
  const pick = usePick()
  const pagesSafe = Math.max(1, pages)
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 lg:justify-between">
      <p className="hidden text-[12px] text-t3 lg:block">
        共 {total ?? 0} 条{pagesSafe > 1 ? ` · 第 ${page} / ${pagesSafe} 页` : ''}
      </p>
      {pagesSafe > 1 && (
        <div className="glass flex items-center gap-0.5 rounded-full p-1">
          <button
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="press flex h-7 w-7 items-center justify-center rounded-full text-t2 disabled:opacity-30"
            aria-label="上一页"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="num px-1.5 text-[12.5px] text-t2">{page} / {pagesSafe}</span>
          <button
            onClick={() => onChange(Math.min(pagesSafe, page + 1))}
            disabled={page >= pagesSafe}
            className="press flex h-7 w-7 items-center justify-center rounded-full text-t2 disabled:opacity-30"
            aria-label="下一页"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      {onPageSize && pageSize != null && (
        <button
          onClick={(e: any) =>
            pick({
              options: [20, 50, 100].map((n) => ({ value: n, label: `每页 ${n} 条` })),
              value: pageSize,
              title: '每页条数',
              anchor: e.currentTarget,
              onPick: onPageSize,
            })
          }
          className="press glass hidden items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-t2 lg:inline-flex"
        >
          每页 {pageSize} 条 <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}

/* ---------- 状态小组件 ---------- */

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-t2" />
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-t2">
      <Spinner size={24} />
      <span className="text-[13px]">{text}</span>
    </div>
  )
}

export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="mb-1 opacity-60">{icon}</div>}
      <p className="text-[15px] font-semibold text-t2">{title}</p>
      {subtitle && <p className="max-w-[280px] text-[13px] text-t3">{subtitle}</p>}
    </div>
  )
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="glass flex items-center justify-between gap-3 rounded-2xl border-l-4 px-4 py-3" style={{ borderLeftColor: 'var(--danger)' }}>
      <span className="text-[13.5px] text-t2">{children}</span>
      {onRetry && (
        <button onClick={onRetry} className="press flex-none text-[13px] font-semibold text-accent">
          重试
        </button>
      )}
    </div>
  )
}

/* ---------- 轻提示 ---------- */

let toastFn: ((msg: string, kind?: 'ok' | 'err') => void) | null = null
export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  toastFn?.(msg, kind)
}

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([])
  const seq = useRef(0)
  useEffect(() => {
    toastFn = (msg, kind = 'ok') => {
      const id = ++seq.current
      setItems((s) => [...s, { id, msg, kind }])
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 2600)
    }
    return () => {
      toastFn = null
    }
  }, [])
  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 z-[60] flex w-max max-w-[86vw] -translate-x-1/2 flex-col items-center gap-2"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
    >
      {items.map((i) => (
        <div
          key={i.id}
          className="glass-strong rise-in rounded-full px-4 py-2.5 text-[13.5px] font-medium shadow-xl"
          style={{ color: i.kind === 'err' ? 'var(--danger)' : 'var(--t1)' }}
        >
          {i.msg}
        </div>
      ))}
    </div>,
    document.body
  )
}

/* ---------- 确认对话框 ---------- */

export function useConfirm() {
  const sheet = useSheet()
  return (opts: {
    title: string
    message?: string
    confirmText?: string
    destructive?: boolean
    onConfirm: () => void | Promise<void>
  }) => {
    let busy = false
    sheet.open(
      <div>
        <p className="mb-1 text-center text-[17px] font-bold text-t1">{opts.title}</p>
        {opts.message && <p className="mb-4 text-center text-[13.5px] leading-relaxed text-t2">{opts.message}</p>}
        <div className="mt-4 flex gap-2.5">
          <Button variant="glass" className="flex-1" onClick={sheet.close}>
            取消
          </Button>
          <Button
            variant={opts.destructive ? 'danger' : 'primary'}
            className="flex-1"
            loading={busy}
            onClick={async () => {
              busy = true
              try {
                await opts.onConfirm()
                sheet.close()
              } finally {
                busy = false
              }
            }}
          >
            {opts.confirmText ?? '确认'}
          </Button>
        </div>
      </div>
    )
  }
}
