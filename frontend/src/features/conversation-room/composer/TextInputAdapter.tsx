export function TextInputAdapter({ value, enabled, onChange, onSubmit }) {
    return (<textarea className="room-text-input" value={value} disabled={!enabled} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSubmit();
            }
        }} placeholder="寫下你的想法…" aria-label="文字輸入" rows={2} maxLength={2000}/>);
}
