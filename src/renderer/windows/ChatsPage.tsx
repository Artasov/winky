import React, {useCallback, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {alpha, useTheme} from '@mui/material/styles';
import {Button, TextField} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import {useChats} from '../context/ChatsContext';
import LoadingSpinner from '../components/LoadingSpinner';
import {updateWinkyChat} from '../services/winkyAiApi';
import ChatActions from '../features/chats/components/ChatActions';

const formatDate = (value: string): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
};

const ChatsPage: React.FC = () => {
    const navigate = useNavigate();
    const {showToast} = useToast();
    const {config} = useConfig();
    const {chats, loading, updateChat, deleteChat} = useChats();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.12);
    const darkSurfaceSoft = alpha('#6f6f6f', 0.1);

    const [searchQuery, setSearchQuery] = useState('');

    const accessToken = config?.auth?.access || config?.auth?.accessToken || '';

    const handleCreateChat = useCallback(() => {
        navigate('/chats/new');
    }, [navigate]);

    const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
        if (!accessToken) return;
        try {
            const updated = await updateWinkyChat(chatId, {title: newTitle}, accessToken);
            updateChat(chatId, updated);
            showToast('Chat renamed.', 'success');
        } catch (error) {
            console.error('[ChatsPage] Failed to rename chat', error);
            showToast('Failed to rename chat.', 'error');
            throw error;
        }
    }, [accessToken, showToast, updateChat]);

    const handleDeleteChat = useCallback(async (chatId: string) => {
        try {
            await deleteChat(chatId);
            showToast('Chat deleted.', 'success');
        } catch (error) {
            console.error('[ChatsPage] Failed to delete chat', error);
            showToast('Failed to delete chat.', 'error');
            throw error;
        }
    }, [showToast, deleteChat]);

    const handleChatClick = useCallback((chatId: string) => {
        navigate(`/chats/${chatId}`);
    }, [navigate]);

    const filteredChats = searchQuery.trim()
        ? chats.filter((chat) =>
            chat.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : chats;

    return (
        <div className="mx-auto fc h-full w-full max-w-5xl gap-3 px-8 py-6 overflow-x-hidden box-border">
            <div className="frbc flex-wrap gap-3">
                <div className="fc gap-1 w-full">
                    <div className="frbc w-full">
                        <h1 className="text-3xl font-semibold text-text-primary">Chats</h1>
                        <div className="frsc flex-wrap gap-3">
                            <div
                                className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary shadow-primary-sm"
                                style={isDark ? {
                                    backgroundColor: darkSurfaceSoft,
                                    border: `1px solid ${darkSurface}`,
                                    color: theme.palette.text.primary
                                } : undefined}
                            >
                                {chats.length} chats
                            </div>
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<AddRoundedIcon/>}
                                onClick={handleCreateChat}
                                disabled={!accessToken}
                                sx={{borderRadius: 3, px: 2}}
                            >
                                New Chat
                            </Button>
                        </div>
                    </div>
                    <p className="text-sm text-text-secondary">
                        Your conversations with Winky AI.
                    </p>
                </div>
            </div>

            <TextField
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="small"
                fullWidth
                sx={{maxWidth: 400}}
            />

            {loading ? (
                <div className="flex flex-1 items-center justify-center">
                    <LoadingSpinner size="medium"/>
                </div>
            ) : !accessToken ? (
                <div className="flex flex-1 items-center justify-center">
                    <div
                        className="max-w-lg rounded-2xl border border-dashed border-primary-200 bg-bg-secondary p-8 text-center"
                        style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurface} : undefined}
                    >
                        <h2 className="text-lg font-semibold text-text-primary">Authentication required</h2>
                        <p className="mt-2 text-sm text-text-secondary">
                            Please log in to use Winky AI chats.
                        </p>
                    </div>
                </div>
            ) : filteredChats.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                    <div
                        className="max-w-lg rounded-2xl border border-dashed border-primary-200 bg-bg-secondary p-8 text-center"
                        style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurface} : undefined}
                    >
                        <h2 className="text-lg font-semibold text-text-primary">
                            {searchQuery ? 'No chats found' : 'No chats yet'}
                        </h2>
                        <p className="mt-2 text-sm text-text-secondary">
                            {searchQuery
                                ? 'Try a different search term.'
                                : 'Create a new chat to get started with Winky AI.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="fc gap-2 pb-6">
                    {filteredChats.map((chat) => (
                        <div
                            key={chat.id}
                            onClick={() => handleChatClick(chat.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleChatClick(chat.id);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer rounded-2xl border border-primary-200 shadow-primary-sm p-4 frbc gap-3 transition-colors duration-base"
                            style={{
                                borderColor: isDark ? darkSurface : undefined,
                                backgroundColor: isDark ? darkSurface : '#ffffff',
                                boxShadow: isDark ? 'none' : undefined
                            }}
                        >
                            <div className="fc gap-1 min-w-0 flex-1">
                                <h2 className="text-base font-semibold text-text-primary truncate">
                                    {chat.title || 'Untitled Chat'}
                                </h2>
                                <div className="frsc gap-3 text-xs text-text-tertiary">
                                    <span>{chat.message_count} messages</span>
                                    <span>{formatDate(chat.updated_at)}</span>
                                </div>
                            </div>
                            <ChatActions
                                chatTitle={chat.title || 'Untitled Chat'}
                                onRename={(newTitle) => handleRenameChat(chat.id, newTitle)}
                                onDelete={() => handleDeleteChat(chat.id)}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChatsPage;
