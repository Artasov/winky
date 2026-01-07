import React, {useCallback, useEffect, useRef} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import classNames from 'classnames';
import {useConfig} from '../context/ConfigContext';

interface NavItem {
    id: string;
    label: string;
    icon: string;
    path: string;
}

const navItems: NavItem[] = [
    {id: 'me', label: 'Me', icon: '👤', path: '/me'},
    {id: 'actions', label: 'Actions', icon: '⚡', path: '/actions'},
    {id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings'},
    {id: 'history', label: 'History', icon: '🕘', path: '/history'},
    {id: 'info', label: 'Info', icon: 'ℹ️', path: '/info'}
];

const Sidebar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const {config} = useConfig();
    const showAvatarVideo = config?.showAvatarVideo !== false;

    const handleNavigation = (path: string) => {
        navigate(path);
    };

    const shouldPlay = () => typeof document !== 'undefined' && !document.hidden;

    const ensurePlayback = useCallback(() => {
        if (!showAvatarVideo) {
            return;
        }
        const video = videoRef.current;
        if (!video || !shouldPlay()) {
            return;
        }
        if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            video.currentTime = video.currentTime >= video.duration ? 0 : video.currentTime;
            const playPromise = video.play();
            if (playPromise) {
                playPromise.catch(() => {
                    /* autoplay can fail silently; ignore */
                });
            }
        }
    }, [showAvatarVideo]);

    useEffect(() => {
        if (!showAvatarVideo) {
            const video = videoRef.current;
            if (video) {
                video.pause();
            }
            return;
        }
        const video = videoRef.current;
        if (!video) {
            return;
        }
        video.playbackRate = 1;
        video.playsInline = true;
        video.muted = true;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                video.pause();
                return;
            }
            ensurePlayback();
        };

        const handleCanPlay = () => {
            if (!document.hidden) {
                ensurePlayback();
            }
        };

        const handlePlaybackIssue = () => {
            if (!video || !shouldPlay() || document.hidden) {
                return;
            }
            if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
                video.pause();
                video.currentTime = 0;
            }
            ensurePlayback();
        };

        const monitoredEvents: Array<keyof HTMLMediaElementEventMap> = [
            'pause',
            'ended',
            'stalled',
            'suspend',
            'waiting',
            'error'
        ];

        video.addEventListener('canplay', handleCanPlay);
        monitoredEvents.forEach((event) => video.addEventListener(event, handlePlaybackIssue));
        document.addEventListener('visibilitychange', handleVisibilityChange);

        if (!document.hidden) {
            ensurePlayback();
        }

        return () => {
            video.removeEventListener('canplay', handleCanPlay);
            monitoredEvents.forEach((event) => video.removeEventListener(event, handlePlaybackIssue));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            video.pause();
        };
    }, [ensurePlayback, showAvatarVideo]);

    return (
        <aside className="flex h-full w-64 flex-col border-r border-primary-200/60 bg-white/95 backdrop-blur shadow-sm">
            <nav className="flex flex-1 flex-col gap-1 px-3 pb-6 mt-4">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNavigation(item.path)}
                            className={classNames(
                                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium duration-base outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light',
                                'transition-[background-color,border-color,box-shadow]',
                                isActive
                                    ? 'active bg-primary-50 text-primary shadow-primary-sm ring-1 ring-primary-200'
                                    : 'text-text-secondary hover:bg-bg-tertiary'
                            )}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className="text-xl">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                        </button>
                    );
                })}
            </nav>
            <div className="p-4 pt-20 overflow-hidden">
                {showAvatarVideo ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        disablePictureInPicture
                        className="w-full h-auto pointer-events-none select-none"
                        src="./resources/avatar.mp4"
                        style={{
                            imageRendering: '-webkit-optimize-contrast',
                            WebkitFontSmoothing: 'antialiased',
                            MozOsxFontSmoothing: 'grayscale',
                            transform: 'translateY(15px) scale(1.3)',
                            objectPosition: 'top',
                            backfaceVisibility: 'hidden',
                            perspective: 1000,
                            willChange: 'transform'
                        }}
                    />
                ) : null}
            </div>
        </aside>
    );
};

export default Sidebar;
