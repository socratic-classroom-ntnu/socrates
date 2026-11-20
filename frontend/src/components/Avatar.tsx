export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return <span className={`app-shell__avatar app-shell__avatar--${size}`} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
}
