import {alpha, Components, Theme} from '@mui/material/styles';

export const createIconButtonOverrides = (theme: Theme): Components['MuiIconButton'] => ({
    styleOverrides: {
        root: {
            ...(theme.palette.mode === 'dark'
                ? {
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.55)'
                }
                : {
                    backgroundColor: 'rgba(15, 23, 42, 0.04)',
                    boxShadow: '0 6px 20px rgba(15, 23, 42, 0.08)'
                }),
            color: theme.palette.text.primary,
            borderRadius: '50%',
            padding: theme.spacing(1),
            transition: 'background-color 260ms ease, color 260ms ease, border-color 260ms ease, box-shadow 260ms ease',
            '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.16),
                color: theme.palette.primary.main,
                boxShadow: theme.palette.mode === 'dark'
                    ? `0 14px 32px ${alpha(theme.palette.primary.main, 0.35)}`
                    : '0 10px 26px rgba(244, 63, 94, 0.2)'
            },
            '&.MuiIconButton-colorPrimary': {
                color: theme.palette.primary.main,
                backgroundColor: alpha(theme.palette.primary.main, 0.12),
                '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.2)
                }
            },
            '&.MuiIconButton-colorSecondary': {
                color: theme.palette.secondary.main,
                backgroundColor: alpha(theme.palette.secondary.main, 0.12),
                '&:hover': {
                    backgroundColor: alpha(theme.palette.secondary.main, 0.2)
                }
            },
            '&.MuiIconButton-colorError': {
                color: theme.palette.error.main,
                backgroundColor: alpha(theme.palette.error.main, 0.12),
                '&:hover': {
                    backgroundColor: alpha(theme.palette.error.main, 0.22)
                }
            },
            '&.MuiIconButton-colorInherit, &.MuiIconButton-colorDefault': {
                color: theme.palette.text.primary
            },
            '&.Mui-disabled': {
                opacity: 0.5,
                boxShadow: 'none',
                backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(148, 163, 184, 0.12)'
            }
        },
        sizeSmall: {
            padding: theme.spacing(0.75)
        },
        sizeLarge: {
            padding: theme.spacing(1.25)
        }
    }
});
