import type {WinkyChatMessage} from '@shared/types';

const formatRoleLabel = (role: WinkyChatMessage['role']): string => role === 'assistant' ? 'Assistant' : 'User';

export const buildChatPrompt = (additionalContext: string, messages: WinkyChatMessage[]): string => {
    const trimmedAdditionalContext = additionalContext.trim();
    const history = messages
        .filter((message) => !message.id.startsWith('temp-'))
        .map((message) => ({
            role: message.role,
            content: message.content.trim()
        }))
        .filter((message) => message.content.length > 0);

    const sections: string[] = [];
    if (trimmedAdditionalContext) {
        sections.push(trimmedAdditionalContext);
    }
    if (history.length > 0) {
        sections.push(
            [
                'Previous conversation messages. Use them as context and continue the same chat naturally.',
                ...history.map((message) => `${formatRoleLabel(message.role)}:\n${message.content}`)
            ].join('\n\n')
        );
    }
    return sections.join('\n\n').trim();
};
