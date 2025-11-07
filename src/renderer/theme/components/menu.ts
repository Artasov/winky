import {alpha, Components, Theme} from '@mui/material/styles';

export const createMenuOverrides = (theme: Theme): Components['MuiMenu'] => ({
    defaultProps: {
        disablePortal: false
    },
    styleOverrides: {
        paper: {
            borderRadius: theme.spacing(2),
            marginTop: theme.spacing(1),
            border: `2px solid ${alpha(theme.palette.primary.main, 1)}`,
            backgroundColor: '#ffffff',
            color: '#0f172a',
            boxShadow: '0 18px 40px rgba(15,23,42,0.18)'
        },
        list: {
            paddingTop: theme.spacing(1),
            paddingBottom: theme.spacing(1),
            '& .MuiMenuItem-root': {
                borderRadius: theme.spacing(1.2),
                margin: theme.spacing(0.25, 1),
                fontWeight: 500,
                fontSize: '0.92rem',
                '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.08)
                },
                '&.Mui-selected': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.12),
                    color: theme.palette.primary.main,
                    '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.18)
                    }
                }
            }
        }
    }
});
