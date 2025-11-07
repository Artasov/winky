import {Components, Theme} from '@mui/material/styles';

export const createDialogOverrides = (theme: Theme): Components['MuiDialog'] => ({
    styleOverrides: {
        paper: {
            borderRadius: theme.spacing(3.5),
            border: '1px solid rgba(15, 23, 42, 0.08)',
            boxShadow: '0 30px 70px rgba(2, 6, 23, 0.55)',
            backgroundColor: '#ffffff',
            color: '#0f172a'
        }
    }
});

export const createDialogContentOverrides = (): Components['MuiDialogContent'] => ({
    styleOverrides: {
        root: {
            padding: 0
        },
        dividers: {
            borderTop: 'none',
            borderBottom: 'none'
        }
    }
});

export const createDialogTitleOverrides = (theme: Theme): Components['MuiDialogTitle'] => ({
    styleOverrides: {
        root: {
            padding: theme.spacing(3),
            paddingBottom: theme.spacing(2)
        }
    }
});

export const createDialogActionsOverrides = (theme: Theme): Components['MuiDialogActions'] => ({
    styleOverrides: {
        root: {
            padding: theme.spacing(3),
            paddingTop: theme.spacing(2)
        }
    }
});
