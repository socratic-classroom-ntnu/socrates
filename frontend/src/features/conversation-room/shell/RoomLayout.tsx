import type { ReactNode } from 'react'

interface Props {
  history: ReactNode
  header: ReactNode
  avatar: ReactNode
  timeline: ReactNode
  composer: ReactNode
  railOpen: boolean
}

export function RoomLayout({ history, header, avatar, timeline, composer, railOpen }: Props) {
  return (
    <div
      className={`conversation-room ${railOpen ? 'room-rail-open' : ''}`}
      data-room-revision="ce-room-v1"
    >
      {history}
      <section className="room-workspace">
        {header}
        {avatar}
        {timeline}
        {composer}
      </section>
    </div>
  )
}
