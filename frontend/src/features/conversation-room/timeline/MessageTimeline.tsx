import { useEffect, useRef } from 'react'
import type { MessageView } from '../model/types'

export function MessageTimeline({ messages }: { messages: MessageView[] }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [messages])

  return (
    <main className="message-timeline" aria-live="polite">
      <div className="timeline-date">本次對話</div>
      {messages.map((message) => (
        <article
          key={message.seq}
          className={`message-row ${message.role}`}
          data-message-role={message.role}
        >
          <div className="message-meta">
            <span>{message.role === 'tutor' ? '導師' : message.role === 'student' ? '你' : '系統'}</span>
            <span>#{message.seq + 1}</span>
          </div>
          <div className="message-bubble">{message.content}</div>
        </article>
      ))}
      <div ref={end} />
    </main>
  )
}
