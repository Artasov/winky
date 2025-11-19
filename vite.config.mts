import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const host = process.env.TAURI_DEV_HOST;
const rendererRoot = path.resolve(__dirname, 'src/renderer');

export default defineConfig(() => ({
    root: rendererRoot,
    publicDir: path.resolve(__dirname, 'public'),
    plugins: [react()],
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: 'ws',
                  host,
                  port: 1421
              }
            : undefined,
        watch: {
            ignored: ['**/src-tauri/**']
        }
    },
    build: {
        outDir: path.resolve(__dirname, 'dist/renderer'),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) {
                        return;
                    }

                    if (id.includes('@mui') || id.includes('@emotion')) {
                        return 'mui';
                    }

                    if (id.includes('react-router-dom')) {
                        return 'router';
                    }

                    if (id.includes('react-toastify')) {
                        return 'toastify';
                    }

                    if (id.includes('@tauri-apps')) {
                        return 'tauri-api';
                    }

                    return 'vendor';
                }
            }
        }
    },
    resolve: {
        alias: {
            '@renderer': path.resolve(__dirname, 'src/renderer'),
            '@shared': path.resolve(__dirname, 'src/shared')
        }
    }
}));
