import {app, BrowserWindow} from 'electron';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import {spawn, type SpawnOptionsWithoutStdio} from 'child_process';
import axios from 'axios';
import {
    FAST_WHISPER_BASE_URL,
    FAST_WHISPER_HEALTH_ENDPOINT,
    FAST_WHISPER_PORT,
    FAST_WHISPER_REPO_NAME,
    FAST_WHISPER_REPO_URL
} from '@shared/constants';
import type {FastWhisperStatus} from '@shared/types';
import {emitToAllWindows} from '../../windows/emitToAllWindows';

type FastWhisperAction = 'install' | 'start' | 'restart' | 'reinstall';

const HEALTH_TIMEOUT = 120_000;
const HEALTH_INTERVAL = 2_000;
const STOP_TIMEOUT = 30_000;
const MAX_LOG_LINE_LENGTH = 180;

const SUCCESS_MESSAGES: Record<FastWhisperAction, string> = {
    install: 'Server installed and running',
    start: 'Server started',
    restart: 'Server restarted',
    reinstall: 'Server reinstalled'
};

const initialStatus: FastWhisperStatus = {
    installed: false,
    running: false,
    phase: 'not-installed',
    message: 'Local server is not installed.',
    updatedAt: Date.now()
};

export class FastWhisperManager {
    private status: FastWhisperStatus = initialStatus;
    private locked = false;
    private statusBroadcastTimeout: NodeJS.Timeout | null = null;
    private lastStatusBroadcastAt = 0;

    async getStatus(): Promise<FastWhisperStatus> {
        await this.refreshEnvironmentState();
        return this.status;
    }

    async installAndStart(): Promise<FastWhisperStatus> {
        return this.executeExclusive(async () => {
            await this.refreshEnvironmentState();
            if (this.status.running) {
                this.setStatus({
                    message: 'Server is already running.',
                    lastAction: 'install',
                    lastSuccessAt: Date.now()
                });
                return;
            }
            const installedNow = await this.ensureRepository();
            await this.startServer(installedNow ? 'install' : 'start');
        });
    }

    async startExisting(): Promise<FastWhisperStatus> {
        return this.executeExclusive(async () => {
            await this.refreshEnvironmentState();
            if (this.status.running) {
                this.setStatus({
                    message: 'Server is already running.',
                    lastAction: 'start',
                    lastSuccessAt: Date.now()
                });
                return;
            }
            const installedNow = await this.ensureRepository();
            await this.startServer(installedNow ? 'install' : 'start');
        });
    }

    async restart(): Promise<FastWhisperStatus> {
        return this.executeExclusive(async () => {
            await this.ensureRepository();
            await this.stopServer();
            await this.startServer('restart');
        });
    }

    async reinstall(): Promise<FastWhisperStatus> {
        return this.executeExclusive(async () => {
            await this.stopServer();
            await this.ensureRepository(true);
            await this.startServer('reinstall');
        });
    }

    async stop(): Promise<FastWhisperStatus> {
        return this.executeExclusive(async () => {
            await this.stopServer();
        });
    }

    private async executeExclusive(operation: () => Promise<void>): Promise<FastWhisperStatus> {
        if (this.locked) {
            throw new Error('An operation is already running. Please wait until it finishes.');
        }
        this.locked = true;
        try {
            await operation();
            return this.status;
        } catch (error: any) {
            const message = error?.message || 'Local server failed.';
            this.setStatus({
                phase: 'error',
                error: message,
                message
            });
            throw error;
        } finally {
            this.locked = false;
        }
    }

    private async refreshEnvironmentState(): Promise<void> {
        const installed = await this.isRepositoryPresent();
        let running = false;
        if (installed) {
            running = await this.checkHealth();
        }
        const phase: FastWhisperStatus['phase'] = running ? 'running' : installed ? 'idle' : 'not-installed';
        const message = running
            ? 'Server is running.'
            : installed
                ? 'Server is stopped.'
                : 'Local server is not installed.';
        this.setStatus({
            installed,
            running,
            phase,
            message,
            error: undefined,
            lastAction: running ? this.status.lastAction : undefined,
            lastSuccessAt: running ? this.status.lastSuccessAt : undefined
        });
    }

    private async ensureRepository(forceReclone: boolean = false): Promise<boolean> {
        const exists = await this.isRepositoryPresent();
        if (exists && !forceReclone) {
            this.setStatus({installed: true});
            return false;
        }
        if (exists && forceReclone) {
            await this.removeRepository();
        }
        await fsPromises.mkdir(this.getInstallRoot(), {recursive: true});
        this.setStatus({
            installed: false,
            running: false,
            phase: 'installing',
            message: 'Please wait for installation…',
            error: undefined,
            logLine: ''
        });
        await this.cloneRepository();
        if (process.platform !== 'win32') {
            await this.makeScriptsExecutable(['start-unix.sh', 'stop-unix.sh']);
        }
        this.setStatus({installed: true});
        return true;
    }

    private async cloneRepository(): Promise<void> {
        await this.runCommand(
            'git',
            ['clone', FAST_WHISPER_REPO_URL, FAST_WHISPER_REPO_NAME],
            {
                cwd: this.getInstallRoot(),
                env: process.env
            },
            'git'
        );
    }

    private async removeRepository(): Promise<void> {
        const repoPath = this.getRepoPath();
        try {
            await fsPromises.rm(repoPath, {recursive: true, force: true});
        } catch (error: any) {
            throw new Error(`Failed to remove existing repository: ${error?.message || error}`);
        }
    }

    private async startServer(action: FastWhisperAction): Promise<void> {
        await this.ensurePreviousProcessStopped();
        this.setStatus({
            phase: 'starting',
            running: false,
            message: 'Starting local server…',
            error: undefined,
            logLine: ''
        });

        const {command, args} = this.getStartCommand();
        let startError: unknown = null;
        try {
            await this.runCommand(
                command,
                args,
                {
                    cwd: this.getRepoPath(),
                    env: this.buildScriptEnv()
                },
                'start'
            );
        } catch (error) {
            startError = error;
        }

        this.setStatus({
            phase: 'starting',
            running: false,
            message: 'Verifying server health…',
            error: undefined
        });

        try {
            await this.waitForHealth(true, HEALTH_TIMEOUT);
        } catch (healthError) {
            if (startError) {
                throw startError;
            }
            throw healthError;
        }

        if (startError) {
            this.publishLogLine('Server is running. Previous warnings can be ignored.', 'start');
        }

        this.setStatus({
            phase: 'running',
            running: true,
            message: SUCCESS_MESSAGES[action],
            error: undefined,
            lastAction: action,
            lastSuccessAt: Date.now()
        });
    }

    private async stopServer(): Promise<void> {
        const repoPresent = await this.isRepositoryPresent();
        if (!repoPresent) {
            this.setStatus({
                installed: false,
                running: false,
                phase: 'not-installed',
                message: 'Local server is not installed.'
            });
            return;
        }

        const pidExists = await this.hasPidFile();
        const alreadyDown = !(await this.checkHealth());
        if (!pidExists && alreadyDown) {
            this.setStatus({
                running: false,
                phase: 'idle',
                message: 'Server is stopped.'
            });
            return;
        }

        this.setStatus({
            phase: 'stopping',
            message: 'Stopping local server…'
        });

        const {command, args} = this.getStopCommand();
        try {
            await this.runCommand(
                command,
                args,
                {
                    cwd: this.getRepoPath(),
                    env: this.buildScriptEnv()
                },
                'stop'
            );
        } catch {
            this.publishLogLine('stop script returned an error, waiting for server shutdown…', 'stop');
        }

        await this.waitForHealth(false, STOP_TIMEOUT).catch(() => {
            /* continue even if health endpoint is still up */
        });

        this.setStatus({
            running: false,
            phase: 'idle',
            message: 'Server is stopped.'
        });
    }

    private async waitForHealth(expectUp: boolean, timeoutMs: number): Promise<void> {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const healthy = await this.checkHealth();
            if (expectUp && healthy) {
                return;
            }
            if (!expectUp && !healthy) {
                return;
            }
            await this.delay(HEALTH_INTERVAL);
        }
        if (expectUp) {
            throw new Error(`Server did not respond at ${FAST_WHISPER_BASE_URL}/health in time.`);
        } else {
            throw new Error('Server is still responding after stop attempt.');
        }
    }

    private async runCommand(
        command: string,
        args: readonly string[],
        options: SpawnOptionsWithoutStdio & { cwd: string },
        label?: string
    ): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(command, args, {
                ...options,
                env: {...process.env, ...options.env},
                stdio: ['inherit', 'pipe', 'pipe'],
                shell: false,
                windowsHide: true
            });
            let buffer = '';
            const handleChunk = (chunk: Buffer) => {
                buffer += chunk.toString('utf8').replace(/\r/g, '\n');
                let newlineIndex = buffer.indexOf('\n');
                while (newlineIndex >= 0) {
                    const line = buffer.slice(0, newlineIndex);
                    this.publishLogLine(line, label);
                    buffer = buffer.slice(newlineIndex + 1);
                    newlineIndex = buffer.indexOf('\n');
                }
            };
            child.stdout?.on('data', handleChunk);
            child.stderr?.on('data', handleChunk);
            child.once('error', reject);
            child.once('close', (code) => {
                if (buffer.trim().length) {
                    this.publishLogLine(buffer, label);
                }
                child.stdout?.off('data', handleChunk);
                child.stderr?.off('data', handleChunk);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
                }
            });
        });
    }

    private getStartCommand(): { command: string; args: string[] } {
        if (process.platform === 'win32') {
            return {command: 'cmd.exe', args: ['/d', '/s', '/c', 'call', 'start.bat']};
        }
        return {command: 'bash', args: [path.join(this.getRepoPath(), 'start-unix.sh')]};
    }

    private getStopCommand(): { command: string; args: string[] } {
        if (process.platform === 'win32') {
            return {command: 'cmd.exe', args: ['/d', '/s', '/c', 'call', 'stop.bat']};
        }
        return {command: 'bash', args: [path.join(this.getRepoPath(), 'stop-unix.sh')]};
    }

    private async ensurePreviousProcessStopped(): Promise<void> {
        if (!(await this.isRepositoryPresent())) {
            return;
        }
        const pidExists = await this.hasPidFile();
        const running = await this.checkHealth();
        if (!pidExists && !running) {
            return;
        }
        this.publishLogLine('Stopping previous server instance before start…', 'start');
        try {
            const {command, args} = this.getStopCommand();
            await this.runCommand(
                command,
                args,
                {
                    cwd: this.getRepoPath(),
                    env: this.buildScriptEnv()
                },
                'stop'
            );
        } catch (error) {
            this.publishLogLine(`Pre-start stop failed: ${(error as Error)?.message || error}`, 'stop');
        }
        await this.waitForHealth(false, STOP_TIMEOUT).catch(() => {
            /* ignore */
        });
    }

    private async isRepositoryPresent(): Promise<boolean> {
        try {
            await fsPromises.access(this.getRepoPath(), fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    private getRepoPath(): string {
        return path.join(this.getInstallRoot(), FAST_WHISPER_REPO_NAME);
    }

    private getPidFilePath(): string {
        return path.join(this.getRepoPath(), '.fast-fast-whisper.pid');
    }

    private getInstallRoot(): string {
        if (app.isPackaged) {
            return path.dirname(app.getPath('exe'));
        }
        return process.cwd();
    }

    private async checkHealth(): Promise<boolean> {
        try {
            const response = await axios.get(FAST_WHISPER_HEALTH_ENDPOINT, {timeout: 2_000});
            return response.status >= 200 && response.status < 300;
        } catch {
            return false;
        }
    }

    private async makeScriptsExecutable(files: string[]): Promise<void> {
        await Promise.all(files.map(async (file) => {
            const scriptPath = path.join(this.getRepoPath(), file);
            try {
                await fsPromises.chmod(scriptPath, 0o755);
            } catch {
                /* ignore */
            }
        }));
    }

    private async hasPidFile(): Promise<boolean> {
        try {
            await fsPromises.access(this.getPidFilePath(), fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    private async delay(ms: number): Promise<void> {
        await new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    private setStatus(partial: Partial<FastWhisperStatus>): void {
        const merged: FastWhisperStatus = {
            ...this.status,
            ...partial,
            updatedAt: Date.now()
        };
        this.status = merged;
        this.scheduleStatusBroadcast();
    }

    private publishLogLine(rawLine: string | Buffer, label?: string): void {
        const text = typeof rawLine === 'string' ? rawLine : rawLine.toString('utf8');
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (!normalized) {
            return;
        }
        const prefixed = label ? `[${label}] ${normalized}` : normalized;
        const truncated =
            prefixed.length > MAX_LOG_LINE_LENGTH ? `${prefixed.slice(0, MAX_LOG_LINE_LENGTH - 1)}…` : prefixed;
        console.log(`[FAST-WHISPER] ${truncated}`);
        this.setStatus({logLine: truncated});
    }

    private buildScriptEnv(): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = {...process.env};
        env.PAUSE_SECONDS = '0';
        if (!env.FAST_FAST_WHISPER_PORT && !env.PORT) {
            env.FAST_FAST_WHISPER_PORT = String(FAST_WHISPER_PORT);
        }
        return env;
    }

    private scheduleStatusBroadcast(): void {
        const visibleWindows = BrowserWindow.getAllWindows().filter(win => !win.isDestroyed() && win.isVisible());
        if (visibleWindows.length === 0) {
            // Останавливаем broadcast если нет видимых окон
            if (this.statusBroadcastTimeout) {
                clearTimeout(this.statusBroadcastTimeout);
                this.statusBroadcastTimeout = null;
            }
            return;
        }
        
        if (this.statusBroadcastTimeout) {
            return;
        }
        const now = Date.now();
        const elapsed = now - this.lastStatusBroadcastAt;
        if (elapsed >= 200) {
            this.broadcastStatus();
            return;
        }
        this.statusBroadcastTimeout = setTimeout(() => {
            this.statusBroadcastTimeout = null;
            this.broadcastStatus();
        }, 200 - elapsed);
    }
    
    stopBroadcasting(): void {
        if (this.statusBroadcastTimeout) {
            clearTimeout(this.statusBroadcastTimeout);
            this.statusBroadcastTimeout = null;
        }
    }

    private broadcastStatus(): void {
        const visibleWindows = BrowserWindow.getAllWindows().filter(win => !win.isDestroyed() && win.isVisible());
        if (visibleWindows.length === 0) {
            return;
        }
        this.lastStatusBroadcastAt = Date.now();
        emitToAllWindows('local-speech:status', this.status);
    }
}

export const fastWhisperManager = new FastWhisperManager();
void fastWhisperManager.getStatus().catch(() => {});
