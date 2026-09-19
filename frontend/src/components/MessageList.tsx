import type { SessionDetail } from '../api/client'

type Message = SessionDetail['messages'][number]

export default function MessageList({ messages }: { messages: readonly Message[] }) {
  return (
    <div>
      {messages.map((message) => (
        <div key={message.seq} className={`message message--${message.role}`}>
          {message.content}
        </div>
      ))}
    </div>
  )
}
