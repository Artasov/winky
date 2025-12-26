import {Components, Theme} from '@mui/material/styles';

export const createBackdropOverrides = (_theme: Theme): Components['MuiBackdrop'] => {
    return {
        styleOverrides: {
            root: {
                // Прозрачный backdrop без затемнения
                backgroundColor: 'transparent',
                backdropFilter: 'none',
                transition: 'opacity 250ms cubic-bezier(0.4, 0, 0.2, 1) !important',
                '&.MuiBackdrop-invisible': {
                    backgroundColor: 'transparent',
                    backdropFilter: 'none'
                }
            }
        }
    };
};
