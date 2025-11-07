import React from 'react';
import {ThemeProvider, CssBaseline} from '@mui/material';
import muiTheme from './muiTheme';

type Props = {
    children: React.ReactNode;
};

const WinkyThemeProvider: React.FC<Props> = ({children}) => (
    <ThemeProvider theme={muiTheme}>
        <CssBaseline/>
        {children}
    </ThemeProvider>
);

export default WinkyThemeProvider;
