
type AvatarProps = {
  name: string
  size?: 'md' | 'lg'
  src?: string | null
}

export function Avatar({ name, size = 'md', src }: AvatarProps) {
  return (
    <span
      className={`app-shell__avatar app-shell__avatar--${size}`}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 'inherit',
            objectFit: 'cover',
          }}
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}
