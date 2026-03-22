import React from 'react';
import type {SxProps, Theme} from '@mui/material/styles';
import {MenuItem, TextField} from '@mui/material';
import {formatLLMLabel} from '../../../utils/modelFormatters';

type Props = {
    value: string;
    options: string[];
    disabled?: boolean;
    sx?: SxProps<Theme>;
    onChange: (value: string) => void;
};

const ChatModelSelect: React.FC<Props> = ({value, options, disabled = false, sx, onChange}) => (
    <TextField
        select
        size="small"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        sx={{
            minWidth: 220,
            maxWidth: 360,
            '& .MuiInputBase-root': {
                height: 34
            },
            '& .MuiSelect-select': {
                py: 0.5,
                fontSize: 13,
                fontWeight: 600
            },
            ...sx
        }}
    >
        {options.map((option) => (
            <MenuItem key={option} value={option}>
                {formatLLMLabel(option)}
            </MenuItem>
        ))}
    </TextField>
);

export default ChatModelSelect;
