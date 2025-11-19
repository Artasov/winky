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

const baseOptions: ThemeOptions = {
    palette: {
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
            default: '#020617',
            paper: '#111827'
        },
        text: {
            primary: '#050505',
            secondary: '#888888'
        }
    },
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
                    backgroundColor: '#020617',
                    color: '#f8fafc'
                }
            }
        }
    }
};

let theme = createTheme(baseOptions);

theme = createTheme(theme, {
    components: {
        MuiButton: createButtonOverrides(theme),
        MuiDialog: createDialogOverrides(theme),
        MuiDialogTitle: createDialogTitleOverrides(theme),
        MuiDialogContent: createDialogContentOverrides(),
        MuiDialogActions: createDialogActionsOverrides(theme),
        MuiBackdrop: createBackdropOverrides(theme),
        MuiIconButton: createIconButtonOverrides(theme),
        MuiCheckbox: createCheckboxOverrides(theme),
        MuiFormControlLabel: createFormControlLabelOverrides(theme),
        MuiMenu: createMenuOverrides(theme),
        MuiMenuList: createMenuListOverrides(),
        MuiPaper: {
            styleOverrides: {
                root: {
                    '&.MuiMenu-paper, &.MuiPopover-paper': {
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#fb7185 rgba(244, 63, 94, 0.12)',
                        '&::-webkit-scrollbar': {
                            width: '10px'
                        },
                        '&::-webkit-scrollbar-track': {
                            background: 'linear-gradient(180deg, rgba(255, 241, 242, 0.95), rgba(254, 226, 226, 0.65))',
                            borderRadius: '9999px',
                            boxShadow: 'inset 0 0 0 1px rgba(244, 63, 94, 0.08)'
                        },
                        '&::-webkit-scrollbar-thumb': {
                            background: 'linear-gradient(180deg, #f43f5e, #fb7185) !important',
                            borderRadius: '9999px',
                            border: '2px solid rgba(255, 241, 242, 0.9) !important',
                            boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.4) !important',
                            transition: 'background 250ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1)'
                        },
                        '&::-webkit-scrollbar-thumb:hover': {
                            background: 'linear-gradient(180deg, #f43f5e, #fb7185) !important',
                            boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.5), 0 0 6px rgba(244, 63, 94, 0.15) !important'
                        }
                    }
                }
            }
        },
        ...createTextFieldOverrides(theme)
    }
});

export default theme;
