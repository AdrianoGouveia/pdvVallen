export function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-vallen-muted mb-1">{label}</label>
      {children}
    </div>
  )
}

export const inputCls = "w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-sm text-vallen-white focus:outline-none focus:border-vallen-green"

export function Btn({ children, variant = 'primary', ...props }) {
  const cls = {
    primary:  'bg-vallen-green hover:bg-vallen-greenLight text-white',
    danger:   'bg-red-700 hover:bg-red-600 text-white',
    ghost:    'bg-vallen-dark border border-vallen-border text-vallen-muted hover:text-vallen-white',
  }
  return (
    <button {...props}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${cls[variant]} ${props.className||''}`}>
      {children}
    </button>
  )
}
