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
        ...createTextFieldOverrides(theme)
    }
});

export default theme;
