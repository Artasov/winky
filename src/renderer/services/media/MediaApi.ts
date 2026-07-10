import axios from 'axios';
import {createApiClient} from '@shared/api';

export interface MediaFile {
    id: number;
    url?: string | null;
    original_name: string;
    content_type: string;
    size: number;
    sha256: string;
    visibility: 'private' | 'public';
    status: string;
}

interface MediaDirectUploadResponse {
    media_file: MediaFile;
    upload_url?: string | null;
    upload_method: 'PUT';
    upload_headers: Record<string, string>;
    already_uploaded: boolean;
    expires_in: number;
}

interface UploadMediaFileOptions {
    namespace: string;
    visibility?: 'private' | 'public';
}

const getSha256 = async (file: Blob): Promise<string> => {
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
};

export const uploadMediaFile = async (
    file: File,
    accessToken: string,
    options: UploadMediaFileOptions
): Promise<MediaFile> => {
    const client = createApiClient(accessToken);
    const sha256 = await getSha256(file);
    const {data: upload} = await client.post<MediaDirectUploadResponse>('/media/uploads/', {
        namespace: options.namespace,
        original_name: file.name || 'file',
        content_type: file.type || 'application/octet-stream',
        size: file.size,
        sha256,
        visibility: options.visibility || 'private'
    });

    if (upload.already_uploaded) return upload.media_file;
    if (!upload.upload_url) throw new Error('Direct media upload URL is missing.');

    await axios.put(upload.upload_url, file, {
        headers: upload.upload_headers,
        timeout: Math.max(30_000, upload.expires_in * 1000),
        withCredentials: false
    });

    const {data} = await client.post<MediaFile>(
        `/media/uploads/${upload.media_file.id}/complete/`,
        {},
        {timeout: 300_000}
    );
    return data;
};
