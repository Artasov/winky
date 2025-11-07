import {Components, Theme} from '@mui/material/styles';

export const createTextFieldOverrides = (theme: Theme): Pick<
    Components,
    'MuiTextField' | 'MuiOutlinedInput' | 'MuiInputLabel'
> => ({
    MuiTextField: {
        defaultProps: {
            variant: 'outlined',
            fullWidth: true
        }
    },
    MuiOutlinedInput: {
        styleOverrides: {
            root: {
                borderRadius: theme.spacing(2.5),
                backgroundColor: '#fff',
                border: '1px solid rgba(15, 23, 42, 0.12)',
                transition: 'border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease',
                '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'transparent',
                    transition: 'border-color 220ms ease'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(244,63,94,0.5)'
                },
                '&.Mui-focused': {
                    backgroundColor: '#fff',
                    boxShadow: '0 6px 16px rgba(244,63,94,0.16)',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.primary.main
                    }
                }
            },
            input: {
                paddingTop: theme.spacing(1),
                paddingBottom: theme.spacing(1.5),
                '&.MuiInputBase-inputMultiline': {
                    lineHeight: 1.5,
                    padding: 0,
                    marginTop: -7
                }
            }
        }
    },
    MuiInputLabel: {
        styleOverrides: {
            root: {
                fontWeight: 500,
                '&.MuiInputLabel-shrink': {
                    backgroundColor: '#fff',
                    padding: '0 6px',
                    borderRadius: theme.spacing(1),
                    marginLeft: -4,
                    lineHeight: 1.1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    zIndex: 1
                }
            }
        }
    }
});
