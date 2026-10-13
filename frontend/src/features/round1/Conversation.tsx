import { useParams } from 'react-router-dom';
import { ConversationRoom } from '../conversation-room/shell/ConversationRoom';
export default function Conversation() {
    const { sessionId = '' } = useParams();
    return <ConversationRoom sessionId={sessionId}/>;
}
