/** iOS 风格基础组件库 */
import {
  createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIsDesktop } from '../lib/useIsDesktop'

/* ---------- 页面容器与标题 ---------- */

export function Screen({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return (
    <div className={`page-in page-shell mx-auto w-full ${pad ? 'px-4' : ''}`}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const isDesktop = useIsDesktop()
  // 顶级页面(侧边栏/TabBar 直达)在桌面端不需要返回按钮,返回只属于二级页面
  const TOP_LEVEL = ['/', '/stats', '/protection', '/log', '/clients', '/settings']
  const isTopLevel = TOP_LEVEL.includes(pathname)
  const showBack = back && !(isDesktop && isTopLevel)
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {showBack && (
          <button
            onClick={() => nav(-1)}
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
  const id = useId()
  return (
    <div className={`glass flex rounded-full p-1 ${fit ? 'w-fit' : ''} ${size === 'sm' ? 'text-[12px]' : 'text-[13.5px]'}`}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={id + o.value}
            onClick={() => onChange(o.value)}
            className={`press ${fit ? '' : 'flex-1'} whitespace-nowrap rounded-full px-3 py-1.5 font-semibold transition-all ${active ? 'shadow-md' : 'text-t2'}`}
            style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)' } : undefined}
          >
            {o.label}
          </button>
        )
      })}
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
    requestAnimationFrame(() => setVisible(true))
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
          <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div
              onClick={close}
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-250"
              style={{ opacity: visible ? 1 : 0 }}
            />
            <div
              className="glass-strong specular relative m-3 w-full max-w-[536px] rounded-[28px] p-5 transition-all duration-300"
              style={{
                transform: visible ? 'translateY(0)' : 'translateY(60px)',
                opacity: visible ? 1 : 0,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <div className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20" />
              {title && <h3 className="mb-3 mt-1 text-center text-[16px] font-bold text-t1">{title}</h3>}
              {node}
            </div>
          </div>,
          document.body
        )}
    </SheetContext.Provider>
  )
}

/* ---------- 桌面下拉选择器(锚点定位;移动端回退底部弹窗) ---------- */

interface PickReq<T extends string | number> {
  options: { label: ReactNode; value: T }[]
  value?: T
  onPick: (value: T) => void
  /** 弹层标题(仅移动端底部弹窗显示) */
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
    const h = menuRef.current.offsetHeight
    const below = st.rect.bottom + 6
    const above = st.rect.top - 6 - h
    const top = below + h <= window.innerHeight - 8 || above < 8 ? below : Math.max(8, above)
    if (menuRef.current.style.top !== `${top}px`) menuRef.current.style.top = `${top}px`
  }, [st])

  return (
    <MenuContext.Provider value={{ open }}>
      {children}
      {st &&
        createPortal(
          <div
            ref={menuRef}
            className="glass-strong fixed z-[55] min-w-[160px] rounded-2xl p-1.5 shadow-2xl"
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

/** 单选选择器:桌面(≥lg)弹出锚点下拉菜单;移动端默认底部弹窗,传 menuOnMobile 则同样用锚点下拉 */
export function usePick(opts?: { menuOnMobile?: boolean }) {
  const sheet = useSheet()
  const menu = useContext(MenuContext)
  const isDesktop = useIsDesktop()
  const menuOnMobile = opts?.menuOnMobile ?? false
  return <T extends string | number>(req: PickReq<T>) => {
    if (isDesktop || menuOnMobile) {
      menu.open(req)
    } else {
      sheet.open(
        <div className="flex flex-col gap-2">
          {req.options.map((o) => (
            <Button
              key={o.value}
              variant="glass"
              size="lg"
              onClick={() => {
                sheet.close()
                req.onPick(o.value)
              }}
            >
              <span className={o.value === req.value ? 'text-accent' : ''}>{o.label}</span>
              {o.value === req.value && <Check size={16} className="text-accent" />}
            </Button>
          ))}
        </div>,
        { title: req.title }
      )
    }
  }
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

export function SearchBar({ value, onChange, placeholder = '搜索' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="glass flex items-center gap-2 rounded-full px-4 py-2.5">
      <Search size={16} className="flex-none text-t3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] text-t1 outline-none"
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
