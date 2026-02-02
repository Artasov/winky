import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import classNames from 'classnames';
import {Tooltip} from '@mui/material';
import type {SvgIconProps} from '@mui/material';
import {useConfig} from '../context/ConfigContext';
import {useUser} from '../context/UserContext';
import {useThemeMode} from '../context/ThemeModeContext';
import {useChats} from '../context/ChatsContext';
import BubbleChartRoundedIcon from '@mui/icons-material/BubbleChartRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import {useResult} from '../context/ResultContext';
import {updateWinkyChat} from '../services/winkyAiApi';
import SidebarChatActions from '../features/chats/components/SidebarChatActions';

const PANELS_STORAGE_KEY = 'winky_chat_panels';

interface NavItem {
    id: string;
    label: string;
    Icon: React.ComponentType<SvgIconProps>;
    path: string;
}

const navItems: NavItem[] = [
    {id: 'actions', label: 'Actions', Icon: BubbleChartRoundedIcon, path: '/actions'},
    {id: 'history', label: 'History', Icon: MenuBookRoundedIcon, path: '/history'},
    {id: 'notes', label: 'Notes', Icon: BookmarkBorderRoundedIcon, path: '/notes'},
    {id: 'chats', label: 'Chats', Icon: ChatRoundedIcon, path: '/chats'}
];

const iconOnlyItems: NavItem[] = [
    {id: 'me', label: 'Me', Icon: PersonRoundedIcon, path: '/me'},
    {id: 'settings', label: 'Settings', Icon: SettingsRoundedIcon, path: '/settings'},
    {id: 'info', label: 'Info', Icon: InfoRoundedIcon, path: '/info'}
];

interface PanelState {
    panelId: string;
    chatId: string;
    leafMessageId: string | null;
}

const getOpenPanelChatIds = (): Set<string> => {
    try {
        const stored = localStorage.getItem(PANELS_STORAGE_KEY);
        if (!stored) return new Set();
        const parsed = JSON.parse(stored) as PanelState[];
        if (Array.isArray(parsed)) {
            return new Set(parsed.map(p => p.chatId).filter(Boolean));
        }
        return new Set();
    } catch {
        return new Set();
    }
};

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
    const {isDark} = useThemeMode();
    const {isActive: hasResult} = useResult();
    const {chats, refreshChats, deleteChat: deleteChatFromContext} = useChats();
    const showAvatarVideo = config?.showAvatarVideo !== false && !isDark;

    // Отслеживаем открытые панели через localStorage
    const [openPanelChatIds, setOpenPanelChatIds] = useState<Set<string>>(() => getOpenPanelChatIds());

    // Подписываемся на изменения localStorage
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === PANELS_STORAGE_KEY) {
                setOpenPanelChatIds(getOpenPanelChatIds());
            }
        };

        // Также слушаем кастомное событие для обновления в той же вкладке
        const handlePanelsChange = () => {
            setOpenPanelChatIds(getOpenPanelChatIds());
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('chat-panels:changed', handlePanelsChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('chat-panels:changed', handlePanelsChange);
        };
    }, []);

    // Обновляем панели при навигации
    useEffect(() => {
        setOpenPanelChatIds(getOpenPanelChatIds());
    }, [location.pathname]);

    // Динамически добавляем Result если есть данные
    const dynamicNavItems = useMemo(() => {
        const items = [...navItems];
        if (hasResult) {
            items.push({id: 'result', label: 'Result', Icon: AutoAwesomeRoundedIcon, path: '/result'});
        }
        return items;
    }, [hasResult]);

    // Сортируем чаты: закреплённые сверху, потом по дате создания
    const sortedChats = useMemo(() => {
        return [...chats].sort((a, b) => {
            const aPinned = Boolean(a.pinned_at);
            const bPinned = Boolean(b.pinned_at);
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            // Внутри каждой группы сортируем по дате (новые сверху)
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [chats]);

    // Определяем находимся ли мы в многопанельном режиме (/chats/:chatId)
    const isInMultiPanelMode = location.pathname.startsWith('/chats/');

    const handleNavigation = (path: string) => {
        navigate(path);
    };

    const handleChatClick = useCallback((chatId: string) => {
        if (isInMultiPanelMode) {
            // Мы в многопанельном режиме - отправляем событие для замены панели
            window.dispatchEvent(new CustomEvent('chat-panels:open-single', {detail: {chatId}}));
            // Обновляем список открытых панелей
            setTimeout(() => setOpenPanelChatIds(getOpenPanelChatIds()), 50);
        } else {
            // Мы на странице списка чатов или любой другой - навигируем
            navigate(`/chats/${chatId}`);
        }
    }, [isInMultiPanelMode, navigate]);

    const handleAddChatToPanel = useCallback((chatId: string) => {
        // Добавляем чат как новую панель (не заменяем существующие)
        window.dispatchEvent(new CustomEvent('chat-panels:add', {detail: {chatId}}));
        // Обновляем список открытых панелей
        setTimeout(() => setOpenPanelChatIds(getOpenPanelChatIds()), 50);
    }, []);

    const handleTogglePin = useCallback(async (chatId: string, isPinned: boolean) => {
        const accessToken = config?.auth?.access || config?.auth?.accessToken || '';
        if (!accessToken) return;

        try {
            await updateWinkyChat(chatId, {pinned: !isPinned}, accessToken);
            await refreshChats();
        } catch (err) {
            console.error('[Sidebar] Failed to toggle pin:', err);
        }
    }, [config, refreshChats]);

    const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
        const accessToken = config?.auth?.access || config?.auth?.accessToken || '';
        if (!accessToken) return;

        try {
            await updateWinkyChat(chatId, {title: newTitle}, accessToken);
            await refreshChats();
        } catch (err) {
            console.error('[Sidebar] Failed to rename chat:', err);
            throw err;
        }
    }, [config, refreshChats]);

    const handleDeleteChat = useCallback(async (chatId: string) => {
        try {
            await deleteChatFromContext(chatId);
        } catch (err) {
            console.error('[Sidebar] Failed to delete chat:', err);
            throw err;
        }
    }, [deleteChatFromContext]);

    const handleNewChat = useCallback(() => {
        if (isInMultiPanelMode) {
            // Если в многопанельном режиме - добавляем новую панель
            window.dispatchEvent(new CustomEvent('chat-panels:add', {detail: {chatId: 'new'}}));
        } else {
            // Если нет - навигируем
            navigate('/chats/new');
        }
    }, [isInMultiPanelMode, navigate]);

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

    // Padding снизу в тёмной теме, если включен showAvatarVideo
    const darkAvatarPadding = isDark && config?.showAvatarVideo !== false;

    return (
        <aside
            className={`flex h-full w-64 flex-col border-r ${
                isDark
                    ? 'border-white/15 bg-transparent'
                    : 'border-primary-200/60 bg-white/95 backdrop-blur shadow-sm'
            }`}
            style={darkAvatarPadding ? {paddingBottom: 190} : undefined}
        >
            {/* Top navigation */}
            <nav className="fc gap-1 px-3 mt-4 flex-shrink-0">
                {dynamicNavItems.map((item) => {
                    const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                    const isChatsItem = item.id === 'chats';

                    return (
                        <div key={item.id} className="group/nav relative">
                            <button
                                type="button"
                                onClick={() => handleNavigation(item.path)}
                                className={classNames(
                                    'w-full flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium duration-base outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light',
                                    'transition-[background-color,border-color,box-shadow]',
                                    isDark
                                        ? isActive
                                            ? 'bg-primary-500/15 text-primary ring-1 ring-primary-500/30'
                                            : 'text-text-secondary hover:bg-white/10'
                                        : isActive
                                            ? 'active bg-primary-50 text-primary shadow-primary-sm ring-1 ring-primary-200'
                                            : 'text-text-secondary hover:bg-bg-tertiary',
                                )} aria-current={isActive ? 'page' : undefined}
                            >
                                <item.Icon sx={{
                                    fontSize: 24,
                                    transform: (item.id === 'actions' || item.id === 'notes')
                                        ? 'scale(1.12)' : 'none'
                                }}/>
                                <span className="truncate flex-1 text-left">{item.label}</span>
                            </button>
                            {/* Кнопка New Chat внутри вкладки Chats */}
                            {isChatsItem && (
                                <Tooltip title="New Chat" placement="right" arrow>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleNewChat();
                                        }}
                                        className={classNames(
                                            'absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full frcc transition-all',
                                            isDark
                                                ? 'bg-white/10 hover:bg-primary/20 text-primary hover:text-primary'
                                                : 'bg-primary-100 hover:bg-primary-200 text-primary hover:text-primary'
                                        )}
                                    >
                                        <AddRoundedIcon sx={{fontSize: 16}}/>
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* Chats list - scrollable section */}
            <div className="fc flex-1 min-h-0 mt-2">
                <div className={`mx-4 mb-2 border-t ${isDark ? 'border-white/15' : 'border-primary-200/60'}`}/>
                {sortedChats.length > 0 && (
                    <div className="flex-1 overflow-y-auto px-3">
                        <div className="fc gap-0.5">
                            {sortedChats.map((chat) => {
                                // Чат активен если он открыт в какой-либо панели (в многопанельном режиме)
                                // или если URL совпадает (в обычном режиме)
                                const isOpenInPanel = openPanelChatIds.has(chat.id);
                                const isUrlActive = location.pathname === `/chats/${chat.id}`;
                                const isActive = isInMultiPanelMode ? isOpenInPanel : isUrlActive;

                                const title = chat.title || 'Untitled chat';
                                const isPinned = Boolean(chat.pinned_at);

                                return (
                                    <div
                                        key={chat.id}
                                        className={classNames(
                                            'group frbc rounded-lg px-3 py-1.5 transition-all duration-base cursor-pointer',
                                            isDark
                                                ? isActive
                                                    ? 'bg-primary-500/15 text-primary'
                                                    : 'text-text-secondary bg-white/[0.03] hover:bg-white/10'
                                                : isActive
                                                    ? 'bg-primary-50 text-primary'
                                                    : 'text-text-secondary bg-black/[0.01] hover:bg-bg-tertiary',
                                        )}
                                        onClick={() => handleChatClick(chat.id)}
                                    >
                                        {/* Иконка закрепления - всегда видна если закреплён */}
                                        {isPinned && (
                                            <PushPinRoundedIcon
                                                sx={{fontSize: 12, mr: 0.5}}
                                                className="text-primary flex-shrink-0"
                                            />
                                        )}
                                        <span className="text-xs font-medium truncate flex-1">
                                            {title}
                                        </span>
                                        {/* Меню действий - видно при hover */}
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <SidebarChatActions
                                                chatId={chat.id}
                                                chatTitle={title}
                                                isPinned={isPinned}
                                                isInPanel={isOpenInPanel}
                                                showAddToPanel={isInMultiPanelMode}
                                                onRename={handleRenameChat}
                                                onDelete={handleDeleteChat}
                                                onTogglePin={handleTogglePin}
                                                onAddToPanel={handleAddChatToPanel}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom section */}
            <div className="fc flex-shrink-0 px-3">
                <div className={`my-3 mx-4 border-t ${isDark ? 'border-white/15' : 'border-primary-200/60'}`}/>
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
                                    isDark
                                        ? isActive
                                            ? 'bg-primary-500/15 text-primary'
                                            : 'text-text-secondary hover:bg-white/10 hover:text-primary'
                                        : isActive
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
            </div>

            {/* Avatar video */}
            {!isDark && (
                <div className="p-4 overflow-hidden flex-shrink-0">
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
            )}
        </aside>
    );
};

export default Sidebar;
