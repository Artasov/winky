import {app} from 'electron';
import path from 'node:path';
import os from 'node:os';
import {mkdir, writeFile, unlink} from 'node:fs/promises';
import {APP_NAME} from '@shared/constants';

const sanitizeAppName = (value: string): string => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const linuxDesktopFileName = `${sanitizeAppName(APP_NAME) || 'winky'}-autostart.desktop`;
const linuxAutostartPath = path.join(os.homedir(), '.config', 'autostart', linuxDesktopFileName);

const ensureAppReady = async (): Promise<void> => {
    if (app.isReady()) {
        return;
    }
    try {
        await app.whenReady();
    } catch {
        // Игнорируем — если app не готов, setLoginItemSettings все равно бросит
    }
};

const linuxDesktopEntry = (execPath: string): string => {
    const escapedExec = execPath.includes(' ') ? `"${execPath.replace(/"/g, '\\"')}"` : execPath;
    return [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        `Name=${APP_NAME}`,
        `Comment=Auto-start ${APP_NAME}`,
        `Exec=${escapedExec}`,
        'X-GNOME-Autostart-enabled=true',
        'Terminal=false'
    ].join('\n') + '\n';
};

export const syncAutoLaunchSetting = async (enabled: boolean): Promise<void> => {
    await ensureAppReady();

    if (process.platform === 'darwin' || process.platform === 'win32') {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            openAsHidden: process.platform === 'darwin' ? true : undefined,
            path: process.execPath,
            args: []
        });
        return;
    }

    if (process.platform === 'linux') {
        if (enabled) {
            await mkdir(path.dirname(linuxAutostartPath), {recursive: true});
            await writeFile(linuxAutostartPath, linuxDesktopEntry(process.execPath), {encoding: 'utf8', mode: 0o744});
        } else {
            try {
                await unlink(linuxAutostartPath);
            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    throw error;
                }
            }
        }
    }
};
