import {Components, Theme} from '@mui/material/styles';

export const createDialogOverrides = (theme: Theme): Components['MuiDialog'] => ({
    defaultProps: {
        fullWidth: true,
        slotProps: {
            transition: {timeout: 200},
            backdrop: {timeout: 200}
        }
    },
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
            py: 0,
            px: 3,
            overflowY: 'auto',
            '&::-webkit-scrollbar': {
                width: 6
            },
            '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'rgba(244,63,94,0.4)',
                borderRadius: 999
            },
            '&::-webkit-scrollbar-track': {
                background: 'rgba(15,23,42,0.05)'
            }
        },
        dividers: {
            borderTop: 'none',
            borderBottom: 'none'
        },
    }
});

export const createDialogTitleOverrides = (theme: Theme): Components['MuiDialogTitle'] => ({
    styleOverrides: {
        root: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
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
