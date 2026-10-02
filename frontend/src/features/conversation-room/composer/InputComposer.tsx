import { DraftComposer } from '../../../shared/input/DraftComposer';
export function InputComposer({ value, busy, enabled, onChange, onListening, onTranscript, onSend }) { return <footer className="input-composer" data-sticky-composer="true"><DraftComposer value={value} busy={busy} enabled={enabled} onChange={onChange} onListening={onListening} onTranscript={(text, meta) => { if (meta.final)
    void onTranscript(text, meta.confidence); }} onSend={onSend}/></footer>; }
