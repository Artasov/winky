import {Components, Theme} from '@mui/material/styles';

export const createButtonOverrides = (theme: Theme): Components['MuiButton'] => ({
    styleOverrides: {
        root: {
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 600,
            paddingInline: theme.spacing(2.5),
            paddingBlock: theme.spacing(1),
            boxShadow: 'none',
            letterSpacing: 0,
            transition: 'all .3s ease-in-out',
            '&:hover': {
                boxShadow: 'none'
            }
        },
        containedPrimary: {
            backgroundImage: 'linear-gradient(135deg, #ff4d6d, #f43f5e)',
            color: theme.palette.common.white,
            transition: 'all .3s ease-in-out',
            '&:hover': {
                backgroundImage: 'linear-gradient(135deg, #f43f5e, #e11d48)'
            }
        },
        outlined: {
            transition: 'all .3s ease-in-out',
            borderColor: theme.palette.divider
        }
    }
});
