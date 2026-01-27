import React, {useCallback, useEffect, useRef} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import classNames from 'classnames';
import type {SvgIconProps} from '@mui/material';
import {useConfig} from '../context/ConfigContext';
import {useUser} from '../context/UserContext';
import BubbleChartRoundedIcon from '@mui/icons-material/BubbleChartRounded';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';

interface NavItem {
    id: string;
    label: string;
    Icon: React.ComponentType<SvgIconProps>;
    path: string;
}

const navItems: NavItem[] = [
    {id: 'actions', label: 'Actions', Icon: BubbleChartRoundedIcon, path: '/actions'},
    {id: 'history', label: 'History', Icon: MenuBookRoundedIcon, path: '/history'},
    {id: 'notes', label: 'Notes', Icon: BookmarkBorderRoundedIcon, path: '/notes'}
];

const iconOnlyItems: NavItem[] = [
    {id: 'me', label: 'Me', Icon: PersonRoundedIcon, path: '/me'},
    {id: 'settings', label: 'Settings', Icon: SettingsRoundedIcon, path: '/settings'},
    {id: 'info', label: 'Info', Icon: InfoRoundedIcon, path: '/info'}
];

const Sidebar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const lastProgressTimeRef = useRef<number>(0);
    const lastProgressAtRef = useRef<number>(0);
    const stallTimeoutRef = useRef<number | null>(null);
    const frameCallbackIdRef = useRef<number | null>(null);
    const {config} = useConfig();
    const {user} = useUser();
    const showAvatarVideo = config?.showAvatarVideo !== false;

    const handleNavigation = (path: string) => {
        navigate(path);
    };

    const shouldPlay = () => typeof document !== 'undefined' && !document.hidden;

    const restartPlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video || !shouldPlay()) {
            return;
        }
        video.pause();
        video.currentTime = 0;
        const playPromise = video.play();
        if (playPromise) {
            playPromise.catch(() => {
                /* autoplay can fail silently; ignore */
            });
        }
    }, []);

    const keepPlayback = useCallback(() => {
        if (!showAvatarVideo) {
            return;
        }
        const video = videoRef.current;
        if (!video || !shouldPlay()) {
            return;
        }
        if (video.ended || video.currentTime >= video.duration) {
            restartPlayback();
            return;
        }
        if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            const playPromise = video.play();
            if (playPromise) {
                playPromise.catch(() => {
                    /* autoplay can fail silently; ignore */
                });
            }
        }
    }, [restartPlayback, showAvatarVideo]);

    useEffect(() => {
        const STALL_TIMEOUT_MS = 6000;

        if (!showAvatarVideo) {
            const video = videoRef.current;
            if (video) {
                video.pause();
            }
            if (stallTimeoutRef.current) {
                window.clearTimeout(stallTimeoutRef.current);
                stallTimeoutRef.current = null;
            }
            if (frameCallbackIdRef.current && video && typeof video.cancelVideoFrameCallback === 'function') {
                video.cancelVideoFrameCallback(frameCallbackIdRef.current);
                frameCallbackIdRef.current = null;
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
        video.loop = true;

        const armStallTimeout = () => {
            if (stallTimeoutRef.current) {
                window.clearTimeout(stallTimeoutRef.current);
            }
            stallTimeoutRef.current = window.setTimeout(() => {
                if (!video || !shouldPlay() || document.hidden) {
                    return;
                }
                const stalledForMs = Date.now() - lastProgressAtRef.current;
                if (!video.paused && stalledForMs >= STALL_TIMEOUT_MS) {
                    restartPlayback();
                    lastProgressTimeRef.current = video.currentTime;
                    lastProgressAtRef.current = Date.now();
                    armStallTimeout();
                }
            }, STALL_TIMEOUT_MS);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                video.pause();
                if (stallTimeoutRef.current) {
                    window.clearTimeout(stallTimeoutRef.current);
                    stallTimeoutRef.current = null;
                }
                if (frameCallbackIdRef.current && typeof video.cancelVideoFrameCallback === 'function') {
                    video.cancelVideoFrameCallback(frameCallbackIdRef.current);
                    frameCallbackIdRef.current = null;
                }
                return;
            }
            restartPlayback();
            lastProgressTimeRef.current = video.currentTime;
            lastProgressAtRef.current = Date.now();
            armStallTimeout();
            trackFrames();
        };

        const handleCanPlay = () => {
            if (!document.hidden) {
                keepPlayback();
                armStallTimeout();
                trackFrames();
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
            keepPlayback();
            armStallTimeout();
            trackFrames();
        };

        const handleProgress = () => {
            if (!video) {
                return;
            }
            lastProgressTimeRef.current = video.currentTime;
            lastProgressAtRef.current = Date.now();
            armStallTimeout();
        };

        const trackFrames = () => {
            if (!video || document.hidden || !shouldPlay()) {
                return;
            }
            if (typeof video.requestVideoFrameCallback !== 'function') {
                return;
            }
            frameCallbackIdRef.current = video.requestVideoFrameCallback(() => {
                handleProgress();
                trackFrames();
            });
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
        video.addEventListener('playing', handleProgress);
        video.addEventListener('timeupdate', handleProgress);
        monitoredEvents.forEach((event) => video.addEventListener(event, handlePlaybackIssue));
        document.addEventListener('visibilitychange', handleVisibilityChange);

        if (!document.hidden) {
            handleProgress();
            keepPlayback();
            trackFrames();
        }

        armStallTimeout();

        return () => {
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('playing', handleProgress);
            video.removeEventListener('timeupdate', handleProgress);
            monitoredEvents.forEach((event) => video.removeEventListener(event, handlePlaybackIssue));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (stallTimeoutRef.current) {
                window.clearTimeout(stallTimeoutRef.current);
                stallTimeoutRef.current = null;
            }
            if (frameCallbackIdRef.current && typeof video.cancelVideoFrameCallback === 'function') {
                video.cancelVideoFrameCallback(frameCallbackIdRef.current);
                frameCallbackIdRef.current = null;
            }
            video.pause();
        };
    }, [keepPlayback, restartPlayback, showAvatarVideo]);

    return (
        <aside className="flex h-full w-64 flex-col border-r border-primary-200/60 bg-white/95 backdrop-blur shadow-sm">
            <nav className="flex flex-1 flex-col gap-1 px-3 mt-4">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNavigation(item.path)}
                            className={classNames(
                                'flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium duration-base outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light',
                                'transition-[background-color,border-color,box-shadow]',
                                isActive
                                    ? 'active bg-primary-50 text-primary shadow-primary-sm ring-1 ring-primary-200'
                                    : 'text-text-secondary hover:bg-bg-tertiary',
                            )} aria-current={isActive ? 'page' : undefined}
                        >
                            <item.Icon sx={{
                                fontSize: 24,
                                transform: (item.id === 'actions' || item.id === 'notes')
                                    ? 'scale(1.12)' : 'none'
                            }}/>
                            <span className="truncate">{item.label}</span>
                        </button>
                    );
                })}
                <div className="my-3 mx-4 border-t border-primary-200/60"></div>
                <div className="frcc gap-2 pb-2">
                    {iconOnlyItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        const isMeTab = item.id === 'me';
                        const hasAvatar = isMeTab && user?.avatar;

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleNavigation(item.path)}
                                className={classNames(
                                    'flex h-10 w-10 items-center justify-center rounded-full transition-all duration-base focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light',
                                    isActive
                                        ? 'bg-primary-100 text-primary'
                                        : 'text-text-secondary hover:bg-bg-tertiary hover:text-primary',
                                )}
                                aria-label={item.label}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {hasAvatar && user?.avatar ? (
                                    <div className="w-7 h-7 rounded-full overflow-hidden">
                                        <img
                                            src={user.avatar}
                                            alt="Avatar"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <item.Icon sx={{fontSize: 22}}/>
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>
            <div className="p-4 overflow-hidden">
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
