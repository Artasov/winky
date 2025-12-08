import axios from 'axios';
import {createApiClient} from '@shared/api';

export type BugReportPayload = {
    subject: string;
    message: string;
    telegram?: string;
    files: File[];
};

const buildMessage = (payload: BugReportPayload): string => {
    const base = payload.message.trim();
    const contact = payload.telegram?.trim();
    if (contact) {
        return `${base}\n\nTelegram: ${contact}`;
    }
    return base;
};

export const submitBugReport = async (payload: BugReportPayload, accessToken?: string): Promise<void> => {
    const client = createApiClient(accessToken);
    const formData = new FormData();
    formData.append('subject', payload.subject.trim());
    formData.append('message', buildMessage(payload));
    payload.files.forEach((file) => {
        formData.append('files', file);
    });

    try {
        await client.post('issues/create/', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const message =
                (typeof error.response?.data === 'string' && error.response.data) ||
                error.response?.statusText ||
                error.message ||
                'Не удалось отправить отчёт.';
            throw new Error(status ? `${message} (статус ${status})` : message);
        }
        throw error instanceof Error ? error : new Error('Не удалось отправить отчёт.');
    }
};
