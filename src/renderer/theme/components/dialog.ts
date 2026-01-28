import {alpha, Components, Theme} from '@mui/material/styles';

export const createDialogOverrides = (theme: Theme): Components['MuiDialog'] => ({
    defaultProps: {
        fullWidth: true,
        closeAfterTransition: true,
        slotProps: {
            transition: {
                timeout: 280,
                unmountOnExit: true,
                mountOnEnter: true
            },
            backdrop: {
                timeout: 280,
                invisible: false,
                sx: {
                    backgroundColor: theme.palette.mode === 'dark'
                        ? 'rgba(0, 0, 0, 0.82)'
                        : 'rgba(2, 6, 23, 0.52)'
                }
            }
        }
    },
    styleOverrides: {
        root: {
            // РџР»Р°РІРЅР°СЏ Р°РЅРёРјР°С†РёСЏ РїРѕСЏРІР»РµРЅРёСЏ/РёСЃС‡РµР·РЅРѕРІРµРЅРёСЏ
            '& .MuiDialog-container': {
                transition: 'opacity 280ms cubic-bezier(0.4, 0, 0.2, 1), transform 280ms cubic-bezier(0.4, 0, 0.2, 1)'
            }
        },
        paper: (() => {
            const isDark = theme.palette.mode === 'dark';
            const darkSurface = alpha('#6f6f6f', 0.3);
            return {
                borderRadius: theme.spacing(3.5),
                border: isDark ? `1px solid ${darkSurface}` : '1px solid rgba(15, 23, 42, 0.08)',
                boxShadow: isDark ? '0 64px 160px rgba(0, 0, 0, 0.96)' : '0 30px 70px rgba(2, 6, 23, 0.55)',
                backgroundColor: isDark ? theme.palette.background.default : theme.palette.background.paper,
                backgroundImage: 'none',
                color: theme.palette.text.primary,
                transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)'
            };
        })()
    }
});

export const createDialogContentOverrides = (theme: Theme): Components['MuiDialogContent'] => {
    const isDark = theme.palette.mode === 'dark';
    const trackColor = isDark ? alpha('#6f6f6f', 0.16) : 'rgba(15, 23, 42, 0.05)';
    const thumbColor = isDark ? alpha('#6f6f6f', 0.42) : 'rgba(244, 63, 94, 0.4)';
    return {
        styleOverrides: {
            root: {
                py: 0,
                px: 3,
                overflowY: 'auto',
                '&::-webkit-scrollbar': {
                    width: 6
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: thumbColor,
                    borderRadius: 999
                },
                '&::-webkit-scrollbar-track': {
                    background: trackColor
                }
            },
            dividers: {
                borderTop: 'none',
                borderBottom: 'none'
            },
        }
    };
};

export const createDialogTitleOverrides = (theme: Theme): Components['MuiDialogTitle'] => ({
    styleOverrides: {
        root: {
            padding: theme.spacing(3),
            paddingBottom: theme.spacing(1.3),
            paddingTop: theme.spacing(2.3)
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





