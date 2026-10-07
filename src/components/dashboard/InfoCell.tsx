/** One cell of the server info strip: icon + label + value, green when good */
import type React from 'react'

export function InfoCell({ icon, label, value, good }: { icon: React.ReactNode; label: string; value: string; good?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex items-center gap-1 text-[11.5px] text-t3">
        {icon} {label}
      </span>
      <span className="text-[14px] font-semibold num" style={{ color: good ? 'var(--ok)' : 'var(--t1)' }}>
        {value}
      </span>
    </div>
  )
}
