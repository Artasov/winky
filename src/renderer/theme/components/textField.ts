import {alpha, Components, Theme} from '@mui/material/styles';

export const createTextFieldOverrides = (theme: Theme): Pick<
    Components,
    'MuiTextField' | 'MuiOutlinedInput' | 'MuiInputLabel'
> => {
    const isDark = theme.palette.mode === 'dark';
    const baseBackground = isDark ? theme.palette.background.default : theme.palette.background.paper;
    const baseBorderColor = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.12)';
    const hoverBorderColor = alpha(theme.palette.primary.main, isDark ? 0.7 : 0.5);
    const focusShadow = isDark
        ? `0 0 0 1px ${alpha(theme.palette.primary.main, 0.45)}, 0 12px 28px ${alpha(theme.palette.primary.main, 0.35)}`
        : `0 6px 16px ${alpha(theme.palette.primary.main, 0.16)}`;
    const disabledTextColor = isDark ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.5)';
    const disabledIconColor = isDark ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.4)';
    return {
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
                    backgroundColor: baseBackground,
                    transition: 'box-shadow 220ms ease, background-color 220ms ease',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: baseBorderColor,
                        transition: 'border-color 220ms ease'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: hoverBorderColor
                    },
                    '&.Mui-focused': {
                        backgroundColor: baseBackground,
                        boxShadow: focusShadow,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: theme.palette.primary.main
                        }
                    },
                    '&.Mui-disabled': {
                        backgroundColor: baseBackground,
                        opacity: 1,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: baseBorderColor
                        },
                        '& .MuiSelect-select, & .MuiSelect-select.Mui-disabled': {
                            color: disabledTextColor,
                            WebkitTextFillColor: disabledTextColor
                        },
                        '& .MuiInputBase-input, & .MuiInputBase-input.Mui-disabled': {
                            color: disabledTextColor,
                            WebkitTextFillColor: disabledTextColor
                        },
                        '& .MuiSelect-icon': {
                            color: disabledIconColor
                        },
                        '& .MuiTypography-root': {
                            color: theme.palette.text.primary
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
                    marginTop: -6,
                    '&.MuiInputLabel-shrink': {
                        backgroundColor: baseBackground,
                        padding: '0 6px',
                        borderRadius: theme.spacing(1),
                        marginLeft: -4,
                        marginTop: 0,
                        lineHeight: 1.1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        zIndex: 1
                    },
                    '&.Mui-disabled': {
                        color: disabledTextColor,
                        fontWeight: 600,
                        opacity: 0.5
                    }
                }
            }
        }
    };
};
