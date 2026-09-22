interface Props {
  value: string
  enabled: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export function TextInputAdapter({ value, enabled, onChange, onSubmit }: Props) {
  return (
    <textarea
      className="room-text-input"
      value={value}
      disabled={!enabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSubmit()
        }
      }}
      placeholder="寫下你的想法…"
      aria-label="文字輸入"
      rows={2}
      maxLength={2000}
    />
  )
}
