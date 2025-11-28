import {Components, Theme} from '@mui/material/styles';

export const createBackdropOverrides = (theme: Theme): Components['MuiBackdrop'] => {
    const backgroundColor = theme.palette.mode === 'dark' ? 'rgba(2, 6, 23, 0.65)' : 'rgba(2, 6, 23, 0.6)';

    return {
        styleOverrides: {
            root: {
                backgroundColor,
                backdropFilter: 'blur(2px)',
                '&.MuiBackdrop-invisible': {
                    backgroundColor: 'transparent',
                    backdropFilter: 'none'
                }
            }
        }
    };
};
