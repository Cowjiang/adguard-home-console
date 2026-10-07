/** Shared settings form field: label + textarea, for multiline values such as
 *  CIDR lists and upstream lists */
export function Field({ label, value, onChange, mono, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string; hint?: string }) {
  return (
    <div className="block">
      <span className="mb-1 block text-[12.5px] text-t2">{label}</span>
      <textarea
        className="field"
        style={mono ? undefined : { minHeight: 60 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      {hint && <span className="mt-1.5 block text-[11.5px] leading-relaxed text-t3">{hint}</span>}
    </div>
  )
}
