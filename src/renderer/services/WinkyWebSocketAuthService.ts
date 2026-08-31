import {AuthError, authClient} from './authClient';

type WebSocketTicketResponse = {
    access: string;
};

export class WinkyWebSocketAuthService {
    async create(endpoint: string, signal?: AbortSignal): Promise<WebSocket> {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        await authClient.loadSession();
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const response = await authClient.authenticatedRequest<WebSocketTicketResponse>({
            method: 'POST',
            url: 'auth/ws-ticket/',
            signal
        });
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const ticket = response.access.trim();
        if (!ticket) throw new AuthError('The server did not return a WebSocket ticket.');
        const configuredEndpoint = new URL(endpoint, authClient.getWsBaseUrl());
        const configuredOrigin = new URL(authClient.getWsBaseUrl());
        configuredEndpoint.protocol = configuredOrigin.protocol;
        configuredEndpoint.host = configuredOrigin.host;
        const socket = new WebSocket(configuredEndpoint.toString(), [`xexamai-ticket.${ticket}`]);
        if (signal?.aborted) {
            socket.close();
            throw new DOMException('Aborted', 'AbortError');
        }
        return socket;
    }
}

export const winkyWebSocketAuthService = new WinkyWebSocketAuthService();
