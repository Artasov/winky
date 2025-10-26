import {app, Menu, nativeImage, Tray} from 'electron';
import path from 'path';

let tray: Tray | null = null;

export const createTray = (onOpenSettings: () => void, onQuit?: () => void): Tray => {
    if (tray) {
        return tray;
    }

  const isDev = process.env.NODE_ENV === 'development';
  const iconPath = isDev
    ? path.resolve(__dirname, '../../public/resources/logo-rounded.png')
    : path.join(process.resourcesPath, 'resources', 'logo-rounded.png');
  
  console.log('[createTray] icon path:', iconPath);
  const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Winky',
            click: () => {
                onOpenSettings();
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
