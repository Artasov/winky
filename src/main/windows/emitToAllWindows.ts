import {BrowserWindow} from 'electron';

export const emitToAllWindows = (channel: string, payload?: any): void => {
    BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed() && win.isVisible()) {
            win.webContents.send(channel, payload);
        }
    });
};
