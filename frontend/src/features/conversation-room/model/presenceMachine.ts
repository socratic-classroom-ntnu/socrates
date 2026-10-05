export function projectPresence(inputState, tutorState) {
    if (inputState === 'listening' || inputState === 'transcribing')
        return 'listening';
    if (tutorState === 'thinking')
        return 'thinking';
    if (tutorState === 'speaking')
        return 'speaking';
    return 'idle';
}
