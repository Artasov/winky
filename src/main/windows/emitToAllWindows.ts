import {BrowserWindow} from 'electron';

export const emitToAllWindows = (channel: string, payload?: any): void => {
    BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    });
};
