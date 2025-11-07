import {Components, Theme} from '@mui/material/styles';

export const createFormControlLabelOverrides = (theme: Theme): Components['MuiFormControlLabel'] => ({
    styleOverrides: {
        root: {
            marginLeft: 0,
            gap: theme.spacing(1.5),
            alignItems: 'center'
        },
        label: {
            marginLeft: 0,
            fontWeight: 500
        }
    }
});
