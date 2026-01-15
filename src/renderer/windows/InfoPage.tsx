import React, {useEffect, useState} from 'react';
import {getVersion} from '@tauri-apps/api/app';
import {open} from '@tauri-apps/plugin-shell';
import {APP_NAME} from '@shared/constants';
import ReactMarkdown from 'react-markdown';

const COMMUNITY_LINKS = [
    {id: 'x', label: 'X', icon: '/resources/community/x.svg', href: 'https://x.com/winky_ai', invert: true},
    {id: 'github', label: 'GitHub', icon: '/resources/community/github.svg', href: 'https://github.com/Artasov/winky', invert: true},
    {id: 'telegram', label: 'Telegram', icon: '/resources/community/telegram.svg', href: 'https://t.me/winky_ai'},
    {id: 'discord', label: 'Discord', icon: '/resources/community/discrod.svg', href: 'https://discord.com/invite/QRgh2zxJX2'},
    {id: 'linkedin', label: 'LinkedIn', icon: '/resources/community/linkedin.svg', href: 'https://www.linkedin.com/in/xlartas/', invert: true},
    {id: 'dexscreener', label: 'Dexscreener', icon: '/resources/community/dexscreener.svg', href: 'https://dexscreener.com/solana/8ARxY7YrVBNhSGkSjQjgzbU9uCRyX67vBfM6mAuMpump', invert: true},
    {id: 'pumpfun', label: 'Pump.fun', icon: '/resources/community/pumpfun.webp', href: 'https://pump.fun/coin/8ARxY7YrVBNhSGkSjQjgzbU9uCRyX67vBfM6mAuMpump'}
] as const;

const USAGE_GUIDE_MARKDOWN = `
## Usage Guide

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

### Model setup
- In Settings, set API keys for \`OpenAi\` and/or \`GoogleAi\`, and choose \`Speech / LLM\` modes.
- For local **Speech**, enable \`Auto-start local Whisper server\` or start the server manually.
`;

const InfoPage: React.FC = () => {
    const [version, setVersion] = useState<string>('...');

    useEffect(() => {
        getVersion()
            .then(setVersion)
            .catch(() => {
                // Fallback если Tauri API недоступен
                setVersion('0.0.0');
            });
    }, []);

    return (
        <div className="fc mx-auto h-full w-full max-w-4xl gap-4 px-8 py-6">
            <div className="fc gap-1">
                <h1 className="text-3xl font-semibold text-text-primary">Information</h1>
                <p className="text-sm text-text-secondary">Help and information about {APP_NAME}.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <section className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">

                    <h2 className="text-2xl font-bold text-text-primary mb-2">{APP_NAME}</h2>
                    <dl className="fc text-sm">
                        <div className="frbc border-b border-primary-100 py-2">
                            <dt className="text-text-secondary">Version</dt>
                            <dd className="font-mono text-text-primary">{version}</dd>
                        </div>
                        <div className="frbc border-b border-primary-100 py-2">
                            <dt className="text-text-secondary">Platform</dt>
                            <dd className="text-text-primary">Tauri + React</dd>
                        </div>
                        <div className="frbc py-2">
                            <dt className="text-text-secondary">Status</dt>
                            <dd className="flex items-center gap-2 text-primary">
                                <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse-soft"
                                      aria-hidden="true"/>
                                Running
                            </dd>
                        </div>
                    </dl>
                </section>

                <section className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
                    <h3 className="mb-4 text-lg font-semibold text-text-primary">Community</h3>
                    <div className="flex flex-wrap gap-3">
                        {COMMUNITY_LINKS.map((link) => (
                            <button
                                key={link.id}
                                type="button"
                                onClick={() => void open(link.href)}
                                className="community-link group flex h-11 w-11 items-center justify-center rounded-xl border border-primary-100 bg-bg-secondary/70 shadow-primary-sm hover:border-primary-200 hover:bg-primary-50"
                                aria-label={`Open ${link.label}`}
                            >
                                <img
                                    src={link.icon}
                                    alt={link.label}
                                    className={`community-link-icon h-6 w-6 object-contain ${link.invert ? 'invert' : ''}`}
                                />
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            <section className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
                <div className="markdown-compact text-text-primary">
                    <ReactMarkdown>{USAGE_GUIDE_MARKDOWN}</ReactMarkdown>
                </div>
            </section>
        </div>
    );
};

export default InfoPage;

