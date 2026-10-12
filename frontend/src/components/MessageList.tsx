export default function MessageList({ messages }) {
    return (<div>
      {messages.map((message) => (<div key={message.seq} className={`message message--${message.role}`}>
          {message.content}
        </div>))}
    </div>);
}
