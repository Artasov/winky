import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';

let tray: Tray | null = null;

export const createTray = (onOpenSettings: () => void, onQuit?: () => void): Tray => {
  if (tray) {
    return tray;
  }

  const iconPath = path.resolve(__dirname, '../../build/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть настройки',
      click: () => {
        onOpenSettings();
      }
    },
    {
      label: 'Выйти',
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
