import React, {useEffect, useState} from 'react';
import {getVersion} from '@tauri-apps/api/app';
import {open} from '@tauri-apps/plugin-shell';
import ReactMarkdown from 'react-markdown';
import {alpha, useTheme} from '@mui/material/styles';

const COMMUNITY_LINKS: Array<{
    id: string;
    label: string;
    icon: string;
    href: string;
    invert?: boolean;
}> = [
    {id: 'x', label: 'X', icon: '/resources/community/x.svg', href: 'https://x.com/winky_ai', invert: true},
    {
        id: 'github',
        label: 'GitHub',
        icon: '/resources/community/github.svg',
        href: 'https://github.com/Artasov/winky',
        invert: true
    },
    {id: 'telegram', label: 'Telegram', icon: '/resources/community/telegram.svg', href: 'https://t.me/winky_ai'},
    {
        id: 'discord',
        label: 'Discord',
        icon: '/resources/community/discrod.svg',
        href: 'https://discord.com/invite/QRgh2zxJX2'
    },
    {
        id: 'linkedin',
        label: 'LinkedIn',
        icon: '/resources/community/linkedin.svg',
        href: 'https://www.linkedin.com/in/xlartas/',
        invert: true
    },
    {
        id: 'dexscreener',
        label: 'Dexscreener',
        icon: '/resources/community/dexscreener.svg',
        href: 'https://dexscreener.com/solana/8ARxY7YrVBNhSGkSjQjgzbU9uCRyX67vBfM6mAuMpump',
        invert: true
    },
    {
        id: 'pumpfun',
        label: 'Pump.fun',
        icon: '/resources/community/pumpfun.webp',
        href: 'https://pump.fun/coin/8ARxY7YrVBNhSGkSjQjgzbU9uCRyX67vBfM6mAuMpump'
    }
];

const DARK_ICON_IDS = new Set(['x', 'github', 'linkedin', 'dexscreener']);

const USAGE_GUIDE_MARKDOWN = `
## Usage Guide

This guide covers the essential features and explains things that might not be immediately obvious. **Keep in mind** that the app offers more functionality than what's described here, so we recommend exploring all sections - especially the Settings tab to discover everything available.

### Model setup
- In Settings, set API keys for [OpenAI](https://platform.openai.com/api-keys) and/or [Google AI](https://aistudio.google.com/app/apikey), and choose \`Speech / LLM\` modes.
- For local **Speech**, enable \`Auto-start local Whisper server\` or start the server manually.

### The most important thing - how to start recording
1. **Open the mic**: click \`Mic\` in the system tray or use the hotkey (default \`Alt+Q\`).
2. **Start/stop recording**: click the mic button in the overlay.

### What you will see in the overlay
- There are action icons around the mic (Actions).
- By default there are 3 example actions:
  - **Question**: answers your question and shows the result in a separate window.
  - **Translator**: translates your speech to Chinese and copies it to the clipboard without opening the result window.
  - **Literally**: transcribes your speech and copies the raw text to the clipboard without opening the result window.
- These actions demonstrate the core capabilities of Actions. We strongly recommend trying them and tweaking the default Actions to fit your workflow on the Actions tab.
- Each action has its own HotKey.
 
### What is an Action
- An Action is a scenario for processing your speech.
- Press the mic hotkey, say what you want, then press the action hotkey to get the result.
- This helps you speed up small recurring tasks.
- Each Action decides whether to show the \`Result\` window, copy the response, and play a completion sound based on its settings.

### Microphone hotkey
- Change it in Settings -> Mic Overlay -> Toggle Hotkey.
- When you enable the mic, recording can start automatically. Check \`Settings -> Mic Overlay\` and the \`Start recording automatically\` option.

### History tab
- Stores completed actions and results **locally** and fully private.

### Notes
- The storage mode \`Local / API\` is toggled at the top of the **Notes** page. You can keep notes private/locally or store them on the server - whatever is convenient for you.
`;

const InfoPage: React.FC = () => {
    const [version, setVersion] = useState<string>('...');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.3);

    useEffect(() => {
        getVersion()
            .then(setVersion)
            .catch(() => {
                // Fallback if Tauri API is unavailable.
                setVersion('0.0.0');
            });
    }, []);

    return (
        <div className="fc mx-auto w-full max-w-4xl gap-1 px-8 py-6">
            <section
                className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-bg-elevated shadow-primary-sm p-4"
                style={isDark ? {borderColor: darkSurface, backgroundColor: theme.palette.background.default, boxShadow: 'none'} : undefined}
            >
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-text-primary">Community</h3>
                    <div className="flex flex-nowrap gap-2">
                        {COMMUNITY_LINKS.map((link) => {
                            const shouldInvert = !isDark && DARK_ICON_IDS.has(link.id);
                            return (
                                <button
                                    key={link.id}
                                    type="button"
                                    onClick={() => void open(link.href)}
                                    className={`community-link group flex h-9 w-9 items-center justify-center rounded-lg border border-primary-100 bg-bg-secondary/70 shadow-primary-sm ${isDark ? '' : 'hover:border-primary-200 hover:bg-primary-50'}`}
                                    aria-label={`Open ${link.label}`}
                                    style={isDark ? {borderColor: darkSurface, backgroundColor: theme.palette.background.default, boxShadow: 'none'} : undefined}
                                >
                                    <img
                                        src={link.icon}
                                        alt={link.label}
                                        className="community-link-icon h-5 w-5 object-contain"
                                        style={shouldInvert ? {filter: 'brightness(0)'} : undefined}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="fc rounded-2xl py-1 px-3">
                <div className="frec gap-4 text-sm">
                    <button
                        type="button"
                        onClick={() => void open('https://winky.pro/winky/privacy-policy')}
                        className="text-primary-600 hover:text-primary-700 hover:underline underline-offset-2 transition-colors"
                    >
                        Privacy Policy
                    </button>
                    <span className="text-text-tertiary">|</span>
                    <button
                        type="button"
                        onClick={() => void open('https://winky.pro/winky/terms-of-service')}
                        className="text-primary-600 hover:text-primary-700 hover:underline underline-offset-2 transition-colors"
                    >
                        Terms and Conditions
                    </button>
                </div>
            </section>

            <section
                className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-bg-elevated shadow-primary-sm p-6"
                style={isDark ? {borderColor: darkSurface, backgroundColor: theme.palette.background.default, boxShadow: 'none'} : undefined}
            >
                <div className="markdown-compact text-text-primary">
                    <ReactMarkdown
                        components={{
                            a: ({href, children}) => (
                                <button
                                    type="button"
                                    onClick={() => href && void open(href)}
                                    className="text-primary-600 hover:text-primary-700 underline underline-offset-2 cursor-pointer transition-colors"
                                >
                                    {children}
                                </button>
                            )
                        }}
                    >
                        {USAGE_GUIDE_MARKDOWN}
                    </ReactMarkdown>
                </div>
            </section>
        </div>
    );
};

export default InfoPage;


