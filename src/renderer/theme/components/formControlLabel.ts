import {Components, Theme} from '@mui/material/styles';

export const createFormControlLabelOverrides = (theme: Theme): Components['MuiFormControlLabel'] => ({
    styleOverrides: {
        root: {
            marginLeft: 0,
            gap: theme.spacing(.7),
            alignItems: 'center'
        },
        label: {
            marginLeft: 0,
        }
    }
});
