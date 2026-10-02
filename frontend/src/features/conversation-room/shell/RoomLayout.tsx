export function RoomLayout({ history, header, avatar, timeline, composer, railOpen }) {
    return (<div className={`conversation-room ${railOpen ? 'room-rail-open' : ''}`} data-room-revision="ce-room-v1">
      {history}
      <section className="room-workspace">
        {header}
        {avatar}
        {timeline}
        {composer}
      </section>
    </div>);
}
