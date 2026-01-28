import {alpha, Components, Theme} from '@mui/material/styles';
import type {CSSObject} from '@mui/system';

const getScrollbarStyles = (theme: Theme): CSSObject => {
    const isDark = theme.palette.mode === 'dark';
    const trackBackground = isDark
        ? 'linear-gradient(180deg, rgba(15, 15, 15, 0.95), rgba(9, 9, 11, 0.88))'
        : 'linear-gradient(180deg, rgba(255, 241, 242, 0.95), rgba(254, 226, 226, 0.65))';
    const border = isDark ? '1px solid rgba(244, 63, 94, 0.18)' : '2px solid rgba(255, 241, 242, 0.9)';
    const insetShadow = isDark ? 'inset 0 0 0 1px rgba(244, 63, 94, 0.16)' : 'inset 0 1px 2px rgba(255, 255, 255, 0.4)';
    const hoverShadow = isDark
        ? 'inset 0 0 0 1px rgba(244, 63, 94, 0.24), 0 0 6px rgba(244, 63, 94, 0.22)'
        : 'inset 0 1px 2px rgba(255, 255, 255, 0.5), 0 0 6px rgba(244, 63, 94, 0.15)';
    return {
        scrollbarWidth: 'thin' as any,
        scrollbarColor: isDark ? '#f43f5e rgba(244, 63, 94, 0.16)' : '#fb7185 rgba(244, 63, 94, 0.12)',
        '&::-webkit-scrollbar': {
            width: '10px'
        },
        '&::-webkit-scrollbar-track': {
            background: trackBackground,
            borderRadius: '9999px',
            boxShadow: 'inset 0 0 0 1px rgba(244, 63, 94, 0.08)'
        },
        '&::-webkit-scrollbar-thumb': {
            background: 'linear-gradient(180deg, #f43f5e, #fb7185) !important',
            borderRadius: '9999px',
            border: `${border} !important`,
            boxShadow: `${insetShadow} !important`,
            transition: 'background 250ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1)'
        },
        '&::-webkit-scrollbar-thumb:hover': {
            background: 'linear-gradient(180deg, #f43f5e, #fb7185) !important',
            boxShadow: `${hoverShadow} !important`
        }
    };
};

export const createMenuOverrides = (theme: Theme): Components['MuiMenu'] => {
    const scrollbarStyles = getScrollbarStyles(theme);
    const isDark = theme.palette.mode === 'dark';
    const borderColor = isDark ? alpha(theme.palette.primary.main, 0.45) : alpha(theme.palette.primary.main, 1);
    const paperShadow = isDark
        ? '0 28px 70px rgba(0, 0, 0, 0.82), 0 0 0 1px rgba(244, 63, 94, 0.12)'
        : '0 18px 40px rgba(15,23,42,0.18)';
    const hoverBackground = alpha(theme.palette.primary.main, isDark ? 0.14 : 0.08);
    const selectedBackground = alpha(theme.palette.primary.main, isDark ? 0.22 : 0.12);
    const selectedHoverBackground = alpha(theme.palette.primary.main, isDark ? 0.28 : 0.18);
    return ({
        defaultProps: {
            disablePortal: false
        },
        styleOverrides: {
            paper: {
                borderRadius: theme.spacing(2),
                marginTop: theme.spacing(1),
                border: `${isDark ? 1 : 2}px solid ${borderColor}`,
                backgroundColor: isDark ? theme.palette.background.default : theme.palette.background.paper,
                color: theme.palette.text.primary,
                boxShadow: paperShadow,
                ...(scrollbarStyles as any)
            },
            list: {
                paddingTop: theme.spacing(1),
                paddingBottom: theme.spacing(1),
                backgroundColor: isDark ? theme.palette.background.default : theme.palette.background.paper,
                ...(scrollbarStyles as any),
                '& .MuiMenuItem-root': {
                    borderRadius: theme.spacing(1.2),
                    margin: theme.spacing(0.25, 1),
                    fontWeight: 500,
                    fontSize: '0.92rem',
                    '&:hover': {
                        backgroundColor: hoverBackground
                    },
                    '&.Mui-selected': {
                        backgroundColor: selectedBackground,
                        color: theme.palette.primary.main,
                        '&:hover': {
                            backgroundColor: selectedHoverBackground
                        }
                    }
                }
            } as any
        }
    });
};

export const createMenuListOverrides = (theme: Theme): Components['MuiMenuList'] => ({
    styleOverrides: {
        root: {
            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.default : theme.palette.background.paper,
            ...(getScrollbarStyles(theme) as any)
        } as any
    }
});
