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
        return `${base}\n\nContact: ${contact}`;
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
                'Failed to submit the report.';
            throw new Error(status ? `${message} (status ${status})` : message);
        }
        throw error instanceof Error ? error : new Error('Failed to submit the report.');
    }
};
