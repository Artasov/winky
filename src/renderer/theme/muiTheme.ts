import {createTheme, type ThemeOptions} from '@mui/material/styles';
import {createButtonOverrides} from './components/button';
import {
    createDialogActionsOverrides,
    createDialogContentOverrides,
    createDialogOverrides,
    createDialogTitleOverrides
} from './components/dialog';
import {createBackdropOverrides} from './components/backdrop';
import {createTextFieldOverrides} from './components/textField';
import {createIconButtonOverrides} from './components/iconButton';
import {createCheckboxOverrides} from './components/checkbox';
import {createFormControlLabelOverrides} from './components/formControlLabel';
import {createMenuOverrides, createMenuListOverrides} from './components/menu';
import type {ThemeMode} from '../context/ThemeModeContext';

const lightPalette: ThemeOptions['palette'] = {
    mode: 'light',
    primary: {
        main: '#e11d48',
        dark: '#be123c',
        light: '#fb7185'
    },
    secondary: {
        main: '#fb7185'
    },
    background: {
        default: '#ffffff',
        paper: '#ffffff'
    },
    text: {
        primary: '#1e293b',
        secondary: '#64748b'
    },
    divider: '#fecdd3'
};

const darkPalette: ThemeOptions['palette'] = {
    mode: 'dark',
    primary: {
        main: '#f43f5e',
        dark: '#e11d48',
        light: '#fb7185'
    },
    secondary: {
        main: '#fb7185'
    },
    background: {
        default: '#000000',
        paper: '#0b0b0b'
    },
    text: {
        primary: '#f8fafc',
        secondary: '#e2e8f0'
    },
    divider: '#3a0f1c'
};

const buildBaseOptions = (themeMode: ThemeMode): ThemeOptions => {
    const palette = themeMode === 'dark' ? darkPalette : lightPalette;
    return {
        palette,
        shape: {
            borderRadius: 10
        },
        typography: {
            fontFamily: '"Inter", "Segoe UI", sans-serif',
            button: {
                fontWeight: 600
            }
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    body: {
                        backgroundColor: palette.background?.default,
                        color: palette.text?.primary
                    }
                }
            }
        }
    };
};

export const createMuiTheme = (themeMode: ThemeMode) => {
    const baseOptions = buildBaseOptions(themeMode);
    let theme = createTheme(baseOptions);

    const isDark = theme.palette.mode === 'dark';
    const scrollbarTrackBackground = isDark
        ? 'linear-gradient(180deg, rgba(15, 15, 15, 0.95), rgba(9, 9, 11, 0.85))'
        : 'linear-gradient(180deg, rgba(255, 241, 242, 0.95), rgba(254, 226, 226, 0.65))';
    const scrollbarBorder = isDark ? '1px solid rgba(244, 63, 94, 0.12)' : '2px solid rgba(255, 241, 242, 0.9)';
    const scrollbarInsetShadow = isDark
        ? 'inset 0 0 0 1px rgba(244, 63, 94, 0.12)'
        : 'inset 0 1px 2px rgba(255, 255, 255, 0.4)';
    const scrollbarHoverShadow = isDark
        ? 'inset 0 0 0 1px rgba(244, 63, 94, 0.2), 0 0 6px rgba(244, 63, 94, 0.2)'
        : 'inset 0 1px 2px rgba(255, 255, 255, 0.5), 0 0 6px rgba(244, 63, 94, 0.15)';
    const scrollbarColor = isDark ? '#f43f5e rgba(244, 63, 94, 0.16)' : '#fb7185 rgba(244, 63, 94, 0.12)';

    theme = createTheme(theme, {
        components: {
            MuiButton: createButtonOverrides(theme),
            MuiDialog: createDialogOverrides(theme),
            MuiDialogTitle: createDialogTitleOverrides(theme),
            MuiDialogContent: createDialogContentOverrides(theme),
            MuiDialogActions: createDialogActionsOverrides(theme),
            MuiBackdrop: createBackdropOverrides(theme),
            MuiIconButton: createIconButtonOverrides(theme),
            MuiCheckbox: createCheckboxOverrides(theme),
            MuiFormControlLabel: createFormControlLabelOverrides(theme),
            MuiMenu: createMenuOverrides(theme),
            MuiMenuList: createMenuListOverrides(theme),
            MuiPaper: {
                styleOverrides: {
                    root: {
                        '&.MuiMenu-paper, &.MuiPopover-paper': {
                            scrollbarWidth: 'thin',
                            scrollbarColor,
                            '&::-webkit-scrollbar': {
                                width: '10px'
                            },
                            '&::-webkit-scrollbar-track': {
                                background: scrollbarTrackBackground,
                                borderRadius: '9999px',
                                boxShadow: 'inset 0 0 0 1px rgba(244, 63, 94, 0.08)'
                            },
                            '&::-webkit-scrollbar-thumb': {
                                background: 'linear-gradient(180deg, #f43f5e, #fb7185) !important',
                                borderRadius: '9999px',
                                border: `${scrollbarBorder} !important`,
                                boxShadow: `${scrollbarInsetShadow} !important`,
                                transition: 'background 250ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1)'
                            },
                            '&::-webkit-scrollbar-thumb:hover': {
                                background: 'linear-gradient(180deg, #f43f5e, #fb7185) !important',
                                boxShadow: `${scrollbarHoverShadow} !important`
                            }
                        }
                    }
                }
            },
            ...createTextFieldOverrides(theme)
        }
    });

    return theme;
};

const theme = createMuiTheme('light');

export default theme;
