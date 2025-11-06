import {app, Menu, nativeImage, Tray} from 'electron';
import path from 'path';

let tray: Tray | null = null;

export const createTray = (onOpenWindow: (route?: string) => void | Promise<void>, onQuit?: () => void, onOpenMic?: () => void): Tray => {
    if (tray) {
        return tray;
    }

  const isDev = process.env.NODE_ENV === 'development';
  const iconPath = isDev
    ? path.resolve(__dirname, '../../public/resources/logo-rounded.png')
    : path.join(process.resourcesPath, 'resources', 'logo-rounded.png');
  
  const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Winky',
            click: () => {
                // Не передаем маршрут, чтобы showMainWindow сама определила правильный
                void onOpenWindow();
            }
        },
        {
            label: 'Mic',
            enabled: Boolean(onOpenMic),
            click: () => {
                if (onOpenMic) {
                    onOpenMic();
                }
            }
        },
        {
            label: 'Bye Winky',
            click: () => {
                if (onQuit) {
                    onQuit();
                }
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Winky');
    tray.setContextMenu(contextMenu);

    return tray;
};

export const destroyTray = () => {
    if (tray) {
        tray.destroy();
        tray = null;
    }
};
