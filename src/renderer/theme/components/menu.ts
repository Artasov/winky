import {alpha, Components, Theme} from '@mui/material/styles';
import type {CSSObject} from '@mui/system';

const scrollbarStyles: CSSObject = {
    scrollbarWidth: 'thin' as any,
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
};

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
            boxShadow: '0 18px 40px rgba(15,23,42,0.18)',
            ...(scrollbarStyles as any)
        },
        list: {
            paddingTop: theme.spacing(1),
            paddingBottom: theme.spacing(1),
            ...(scrollbarStyles as any),
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
        } as any
    }
});

export const createMenuListOverrides = (): Components['MuiMenuList'] => ({
    styleOverrides: {
        root: scrollbarStyles as any
    }
});
