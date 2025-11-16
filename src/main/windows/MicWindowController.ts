import {
    BrowserWindow,
    BrowserWindowConstructorOptions,
    screen
} from 'electron';
import type {MicAnchor} from '@shared/types';
import type {ConfigRepository} from '../services/config/ConfigRepository';
import type {WindowController} from './WindowController';

export type MicVisibilityReason = 'shortcut' | 'taskbar' | 'auto' | 'system' | 'manual' | 'renderer' | 'action';

const MIC_WINDOW_WIDTH = 300;
const MIC_WINDOW_HEIGHT = 300;
const MIC_WINDOW_MARGIN = 24;

type MicWindowDeps = {
    isDev: boolean;
    preloadPath: string;
    rendererPath: string;
    sendLog: (type: string, payload: unknown) => void;
    configRepository: ConfigRepository;
};

type MicAnchorPosition = { x: number; y: number };

export class MicWindowController implements WindowController {
    readonly id = 'mic';

    private window: BrowserWindow | null = null;
    private visible = false;
    private autoShowDisabled = false;
    private interactive = false;
    private createPromise: Promise<BrowserWindow | null> | null = null;
    private micAutoStartEnabled = false;
    private positionPersistTimeout: NodeJS.Timeout | null = null;
    private pendingPosition: MicAnchorPosition | null = null;

    constructor(private readonly deps: MicWindowDeps) {
        void this.refreshMicAutoStart();
    }

    getWindow(): BrowserWindow | null {
        return this.window;
    }

    async ensureWindow(): Promise<BrowserWindow | null> {
        if (this.window && !this.window.isDestroyed()) {
            if (this.createPromise) {
                await this.createPromise;
            }
            return this.window;
        }

        if (!this.createPromise) {
            this.createPromise = this.createWindow().finally(() => {
                this.createPromise = null;
            });
        }

        const instance = await this.createPromise;
        return instance;
    }

    async toggle(reason: MicVisibilityReason = 'manual'): Promise<void> {
        if (!this.window || this.window.isDestroyed()) {
            await this.ensureWindow();
        }

        if (!this.window) {
            return;
        }

        if (this.visible) {
            this.hide(reason, {disableAutoShow: reason === 'shortcut'});
            return;
        }

        this.autoShowDisabled = false;
        this.show(reason);
    }

    show(reason: MicVisibilityReason = 'system'): void {
        this.deps.sendLog('MIC_WINDOW', `[MicWindowController] show called with reason=${reason}`);
        if (!this.window || this.window.isDestroyed()) {
            return;
        }

        this.autoShowDisabled = false;
        this.window.setOpacity(0);

        const performShow = () => {
            if (!this.window || this.window.isDestroyed()) {
                return;
            }
            this.window.webContents.send('mic:prepare-recording');
            if (process.platform === 'darwin') {
                this.window.showInactive();
            } else {
                this.window.show();
            }
            this.window.setSkipTaskbar(true);
            this.visible = true;
            this.ensureOnTop();
            this.setInteractive(false);
            this.window.webContents.send('mic:start-fade-in');
            setTimeout(() => {
                if (!this.window || this.window.isDestroyed() || !this.visible) {
                    return;
                }
                this.window.setOpacity(1);
                this.ensureOnTop();
            }, 16);
            this.sendVisibilityChange(true, reason);
            this.scheduleAutoStart(reason);
        };

        if (this.window.webContents.isLoading()) {
            this.window.webContents.once('did-finish-load', () => performShow());
        } else {
            performShow();
        }
    }

    hide(reason: MicVisibilityReason = 'system', options: { disableAutoShow?: boolean } = {}): void {
        if (!this.window || this.window.isDestroyed()) {
            return;
        }
        const {disableAutoShow = false} = options;
        this.visible = false;
        if (disableAutoShow) {
            this.autoShowDisabled = true;
        }
        this.setInteractive(false);
        this.window.webContents.send('mic:start-fade-out');
        this.window.setOpacity(0);
        this.window.hide();
        this.sendVisibilityChange(false, reason);
    }

    setInteractive(interactive: boolean): void {
        if (!this.window || this.window.isDestroyed()) {
            this.interactive = false;
            return;
        }
        if (interactive && (!this.visible || this.autoShowDisabled)) {
            return;
        }

        const platform = process.platform;
        if (interactive) {
            if (this.interactive) {
                return;
            }
            this.interactive = true;
            this.window.setIgnoreMouseEvents(false);
            if (platform === 'darwin') {
                this.window.setFocusable(true);
            }
            this.ensureOnTop();
            this.window.flashFrame(false);
            return;
        }

        this.interactive = false;
        this.window.setIgnoreMouseEvents(true, {forward: true});
        if (platform === 'darwin') {
            this.window.setFocusable(false);
            this.window.blur();
        }
    }

    moveTo(x: number, y: number): void {
        if (!this.window || this.window.isDestroyed()) {
            return;
        }
        const targetX = Math.round(x);
        const targetY = Math.round(y);
        if (process.platform === 'win32') {
            this.window.setPosition(targetX, targetY, false);
        } else {
            this.window.setBounds({x: targetX, y: targetY, width: MIC_WINDOW_WIDTH, height: MIC_WINDOW_HEIGHT}, false);
            const [actualX, actualY] = this.window.getPosition();
            if (actualX !== targetX || actualY !== targetY) {
                this.window.setPosition(targetX, targetY, false);
            }
        }
        this.ensureOnTop();
    }

    moveBy(dx: number, dy: number): void {
        if (!this.window || this.window.isDestroyed()) {
            return;
        }
        const [currentX, currentY] = this.window.getPosition();
        this.moveTo(currentX + dx, currentY + dy);
    }

    async applyAnchor(anchor?: MicAnchor, persist = false): Promise<MicAnchorPosition> {
        const targetDisplay = await this.resolveTargetDisplay();
        const effectiveAnchor = anchor || (await this.deps.configRepository.getMicAnchor()) || 'bottom-right';
        const position = this.computeAnchorPosition(effectiveAnchor, targetDisplay);
        this.deps.sendLog('MIC_WINDOW', {
            message: 'Applying anchor',
            anchor: effectiveAnchor,
            position,
            displayId: targetDisplay.id,
            displayBounds: targetDisplay.workArea
        });
        if (this.window && !this.window.isDestroyed()) {
            this.moveTo(position.x, position.y);
        }
        if (persist) {
            await this.deps.configRepository.update({
                micAnchor: effectiveAnchor,
                micWindowPosition: position
            });
        }
        return position;
    }

    getPosition(): { x: number; y: number } {
        if (!this.window || this.window.isDestroyed()) {
            return {x: 0, y: 0};
        }
        const [x, y] = this.window.getPosition();
        return {x, y};
    }

    getCursorScreenPoint(): { x: number; y: number } {
        const point = screen.getCursorScreenPoint();
        return {x: point.x, y: point.y};
    }

    destroy(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
        this.window = null;
        this.visible = false;
        this.interactive = false;
        this.createPromise = null;
        void this.flushPendingPositionSave();
    }

    setMicAutoStart(enabled: boolean): void {
        this.micAutoStartEnabled = Boolean(enabled);
    }

    async refreshMicAutoStart(): Promise<void> {
        try {
            const config = await this.deps.configRepository.get();
            this.micAutoStartEnabled = Boolean(config.micAutoStartRecording);
        } catch (error) {
            this.deps.sendLog('MIC_WINDOW', `Failed to refresh mic auto-start flag: ${error}`);
        }
    }

    private async createWindow(): Promise<BrowserWindow | null> {
        if (this.window && !this.window.isDestroyed()) {
            return this.window;
        }

        const storePosition = await this.deps.configRepository.getMicWindowPosition();
        const safePosition = this.ensureWindowWithinBounds(storePosition, MIC_WINDOW_WIDTH, MIC_WINDOW_HEIGHT);
        const isMac = process.platform === 'darwin';

        const windowOptions: BrowserWindowConstructorOptions = {
            width: MIC_WINDOW_WIDTH,
            height: MIC_WINDOW_HEIGHT,
            resizable: false,
            movable: true,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            frame: false,
            transparent: true,
            hasShadow: false,
            show: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            useContentSize: process.platform !== 'win32',
            backgroundColor: '#00000000',
            type: isMac ? 'panel' : 'toolbar',
            webPreferences: {
                preload: this.deps.preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
                devTools: this.deps.isDev,
                sandbox: false,
                webSecurity: false
            }
        };

        const window = new BrowserWindow(windowOptions);
        this.window = window;

        window.setMenuBarVisibility(false);
        window.setHasShadow(false);
        window.setSkipTaskbar(true);
        window.setBackgroundColor('#00000000');

        if (isMac) {
            window.setAlwaysOnTop(true, 'floating', 1);
            window.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
            window.setFocusable(false);
        } else {
            window.setAlwaysOnTop(true, 'screen-saver', 1);
            window.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
            window.setFocusable(true);
        }

        window.setIgnoreMouseEvents(true, {forward: true});
        if (safePosition) {
            window.setPosition(Math.round(safePosition.x), Math.round(safePosition.y));
        }

        try {
            if (this.deps.isDev) {
                await window.loadURL('http://localhost:5173/?window=mic#/mic');
            } else {
                await window.loadFile(this.deps.rendererPath, {hash: '/mic', query: {window: 'mic'}});
            }
        } catch (error) {
            window.destroy();
            this.window = null;
            throw error;
        }

        this.window.on('show', () => {
            this.visible = true;
        });

        this.window.on('hide', () => {
            this.visible = false;
            this.setInteractive(false);
            if (this.window && !this.window.isDestroyed()) {
                this.window.setOpacity(0);
            }
        });

        this.window.on('closed', () => {
            this.visible = false;
            this.window = null;
            this.createPromise = null;
            void this.flushPendingPositionSave();
        });

        this.window.on('move', () => {
            if (this.window && !this.window.isDestroyed()) {
                const [x, y] = this.window.getPosition();
                this.schedulePositionSave({x, y});
            }
        });

        this.window.on('blur', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.ensureOnTop();
                if (isMac) {
                    this.window.setIgnoreMouseEvents(true, {forward: true});
                    this.window.setFocusable(false);
                }
            }
        });

        return this.window;
    }

    private ensureOnTop(): void {
        if (!this.window || this.window.isDestroyed()) {
            return;
        }
        if (process.platform === 'darwin') {
            this.window.setAlwaysOnTop(true, 'floating', 1);
        } else {
            this.window.setAlwaysOnTop(true, 'screen-saver', 1);
        }
    }

    private sendVisibilityChange(visible: boolean, reason: MicVisibilityReason): void {
        if (!this.window || this.window.isDestroyed()) {
            return;
        }
        const payload = {visible, reason};
        if (this.window.webContents.isLoading()) {
            this.window.webContents.once('did-finish-load', () => {
                if (!this.window || this.window.isDestroyed()) {
                    return;
                }
                this.window.webContents.send('mic:visibility-change', payload);
            });
            return;
        }
        this.window.webContents.send('mic:visibility-change', payload);
    }

    private scheduleAutoStart(reason: MicVisibilityReason): void {
        if (reason !== 'shortcut' && reason !== 'taskbar') {
            return;
        }
        if (!this.micAutoStartEnabled) {
            return;
        }
        if (!this.window || this.window.isDestroyed()) {
            return;
        }
        this.window.webContents.send('mic:start-recording');
    }

    private async resolveTargetDisplay(): Promise<Electron.Display> {
        if (this.window && !this.window.isDestroyed()) {
            const bounds = this.window.getBounds();
            if (bounds.width > 0 && bounds.height > 0) {
                return screen.getDisplayMatching(bounds);
            }
        }
        const savedPosition = await this.deps.configRepository.getMicWindowPosition();
        if (savedPosition) {
            return screen.getDisplayNearestPoint(savedPosition);
        }
        return screen.getPrimaryDisplay();
    }

    private computeAnchorPosition(anchor: MicAnchor, display: Electron.Display): MicAnchorPosition {
        const {workArea} = display;
        const x = workArea.x;
        const y = workArea.y;
        const width = workArea.width;
        const height = workArea.height;

        const centerX = x + width / 2;
        const centerY = y + height / 2;

        switch (anchor) {
            case 'top-left':
                return {
                    x: x + MIC_WINDOW_MARGIN,
                    y: y + MIC_WINDOW_MARGIN
                };
            case 'top-right':
                return {
                    x: x + width - MIC_WINDOW_WIDTH - MIC_WINDOW_MARGIN,
                    y: y + MIC_WINDOW_MARGIN
                };
            case 'bottom-left':
                return {
                    x: x + MIC_WINDOW_MARGIN,
                    y: y + height - MIC_WINDOW_HEIGHT - MIC_WINDOW_MARGIN
                };
            case 'bottom-right':
            default:
                return {
                    x: x + width - MIC_WINDOW_WIDTH - MIC_WINDOW_MARGIN,
                    y: y + height - MIC_WINDOW_HEIGHT - MIC_WINDOW_MARGIN
                };
        }
    }

    private ensureWindowWithinBounds(
        savedPosition: MicAnchorPosition | undefined,
        windowWidth: number,
        windowHeight: number
    ): MicAnchorPosition | undefined {
        if (!savedPosition) {
            return undefined;
        }
        const {x, y} = savedPosition;
        const display = screen.getDisplayNearestPoint({x, y});
        const {bounds} = display;
        const EDGE_MARGIN = 10;

        let correctedX = x;
        if (x < bounds.x + EDGE_MARGIN) {
            correctedX = bounds.x + EDGE_MARGIN;
        } else if (x + windowWidth > bounds.x + bounds.width - EDGE_MARGIN) {
            correctedX = bounds.x + bounds.width - windowWidth - EDGE_MARGIN;
        }

        let correctedY = y;
        if (y < bounds.y + EDGE_MARGIN) {
            correctedY = bounds.y + EDGE_MARGIN;
        } else if (y + windowHeight > bounds.y + bounds.height - EDGE_MARGIN) {
            correctedY = bounds.y + bounds.height - windowHeight - EDGE_MARGIN;
        }

        if (correctedX !== x || correctedY !== y) {
            this.deps.sendLog('MIC_WINDOW', `📐 Position corrected: (${x}, ${y}) → (${correctedX}, ${correctedY})`);
        }

        return {x: correctedX, y: correctedY};
    }

    private schedulePositionSave(position: MicAnchorPosition): void {
        this.pendingPosition = position;
        if (this.positionPersistTimeout) {
            return;
        }
        this.positionPersistTimeout = setTimeout(() => {
            this.positionPersistTimeout = null;
            void this.persistPendingPosition();
        }, 150);
    }

    private async persistPendingPosition(): Promise<void> {
        const next = this.pendingPosition;
        this.pendingPosition = null;
        if (!next) {
            return;
        }
        try {
            await this.deps.configRepository.setMicWindowPosition(next);
        } catch (error) {
            this.deps.sendLog('MIC_WINDOW', `Failed to persist mic window position: ${error}`);
        }
    }

    private async flushPendingPositionSave(): Promise<void> {
        if (this.positionPersistTimeout) {
            clearTimeout(this.positionPersistTimeout);
            this.positionPersistTimeout = null;
        }
        await this.persistPendingPosition();
    }
}
