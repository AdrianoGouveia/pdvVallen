export function PageHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-vallen-border">
      <h1 className="text-xl font-bold text-vallen-white">{title}</h1>
      {action}
    </div>
  )
}
