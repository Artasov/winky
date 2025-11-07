import React from 'react';
import {alpha, Components, Theme} from '@mui/material/styles';

const BaseCheckboxIcon = React.createElement('span', {className: 'winky-checkbox__control'});
const CheckedCheckboxIcon = React.createElement(
    'span',
    {className: 'winky-checkbox__control winky-checkbox__control--checked'},
    React.createElement(
        'svg',
        {
            className: 'winky-checkbox__check',
            viewBox: '0 0 16 16',
            'aria-hidden': 'true',
            focusable: 'false'
        },
        React.createElement('polyline', {
            points: '3.5 8.5 6.5 11.5 12.5 4.5',
            fill: 'none',
            strokeWidth: 2.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
        })
    )
);

export const createCheckboxOverrides = (theme: Theme): Components['MuiCheckbox'] => ({
    defaultProps: {
        disableRipple: true,
        icon: BaseCheckboxIcon,
        checkedIcon: CheckedCheckboxIcon
    },
    styleOverrides: {
        root: {
            padding: theme.spacing(0.5),
            borderRadius: theme.spacing(1),
            position: 'relative',
            color: theme.palette.text.primary,
            transition: 'color 260ms ease',
            '&:hover': {
                backgroundColor: 'transparent'
            },
            '& .winky-checkbox__control': {
                width: 22,
                height: 22,
                borderRadius: theme.spacing(1.2),
                border: '1.5px solid rgba(15, 23, 42, 0.25)',
                backgroundColor: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 rgba(244, 63, 94, 0)',
                transition: 'box-shadow 200ms ease, border-color 200ms ease, background-color 200ms ease'
            },
            '& .winky-checkbox__check': {
                width: 14,
                height: 14,
                stroke: '#fff'
            },
            '&:hover .winky-checkbox__control': {
                boxShadow: `0 0 16px ${alpha(theme.palette.primary.main, 0.45)}`,
                borderColor: theme.palette.primary.main
            },
            '&.Mui-focusVisible .winky-checkbox__control': {
                boxShadow: `0 0 18px ${alpha(theme.palette.primary.main, 0.6)}`,
                borderColor: theme.palette.primary.main
            },
            '&.Mui-disabled .winky-checkbox__control': {
                borderColor: 'rgba(148, 163, 184, 0.4)',
                backgroundColor: 'rgba(148, 163, 184, 0.15)',
                boxShadow: 'none'
            },
            '&.Mui-disabled .winky-checkbox__check': {
                stroke: 'rgba(255,255,255,0.6)'
            },
            '& .winky-checkbox__control--checked': {
                backgroundColor: theme.palette.primary.main,
                borderColor: theme.palette.primary.main,
                boxShadow: `0 6px 16px ${alpha(theme.palette.primary.main, 0.45)}`
            }
        }
    }
});
