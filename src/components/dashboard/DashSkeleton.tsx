/** First-load skeleton: mirrors the first screen; the root container stays mounted so data
 *  arrival only swaps content and does not replay the page animation */
import { useEnterSkip } from '../../lib/routeTransition'

export function DashSkeleton() {
  const block = 'glass specular rounded-3xl animate-pulse'
  const enterSkip = useEnterSkip()
  return (
    <div className={enterSkip ? '' : 'content-in'}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={`${block} h-[168px] lg:h-full`} />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${block} h-[78px]`} />
          ))}
        </div>
      </div>
      <div className={`${block} mt-4 h-[228px]`} />
      {/* Mobile: tabbed top lists + upstreams + server info */}
      <div className="mt-4 grid gap-4 lg:hidden">
        <div className={`${block} h-[300px]`} />
        <div className={`${block} h-[220px]`} />
        <div className={`${block} h-[92px]`} />
      </div>
      {/* Desktop: analysis skeleton (adaptive composition/trends pair, then
          two independent masonry ranking columns) */}
      <div className="mt-4 hidden items-start gap-4 lg:flex">
        <div className={`${block} h-[240px] w-[400px] flex-none`} />
        <div className={`${block} h-[240px] min-w-0 flex-1`} />
      </div>
      <div className="mt-4 hidden items-start gap-4 lg:grid lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className={`${block} h-[620px]`} />
          <div className={`${block} h-[500px]`} />
        </div>
        <div className="flex flex-col gap-4">
          <div className={`${block} h-[500px]`} />
          <div className={`${block} h-[400px]`} />
          <div className={`${block} h-[92px]`} />
        </div>
      </div>
    </div>
  )
}
