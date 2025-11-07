import {Components, Theme} from '@mui/material/styles';

export const createBackdropOverrides = (theme: Theme): Components['MuiBackdrop'] => ({
    styleOverrides: {
        root: {
            backgroundColor: 'rgba(2, 6, 23, 0.6)',
            backdropFilter: 'blur(2px)',
            '&.MuiBackdrop-invisible': {
                backgroundColor: 'transparent',
                backdropFilter: 'none'
            }
        }
    }
});
