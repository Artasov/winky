import React from 'react';
import {IconButton, MenuItem, TextField, Tooltip} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {BACKEND_DOMAINS} from '@shared/constants';
import type {BackendDomain} from '@shared/types';

interface BackendDomainSelectProps {
    value: BackendDomain;
    onChange: (domain: BackendDomain) => void;
    disabled?: boolean;
    compact?: boolean;
    showInfoIcon?: boolean;
    infoTooltip?: string;
}

const DOMAIN_LABELS: Record<BackendDomain, string> = {
    'xlartas.com': 'xlartas.com',
    'xlartas.ru': 'xlartas.ru'
};

const DEFAULT_TOOLTIP = 'Main backend domain.';

const BackendDomainSelect: React.FC<BackendDomainSelectProps> = ({
    value,
    onChange,
    disabled = false,
    compact = false,
    showInfoIcon = false,
    infoTooltip = DEFAULT_TOOLTIP
}) => {
    return (
        <div className="frsc gap-1">
            <TextField
                select
                size={compact ? 'small' : 'medium'}
                label="Backend domain"
                value={value}
                onChange={(event) => onChange(event.target.value as BackendDomain)}
                disabled={disabled}
                fullWidth={!compact}
                sx={compact ? {width: 180} : undefined}
            >
                {BACKEND_DOMAINS.map((domain) => (
                    <MenuItem key={domain} value={domain}>
                        {DOMAIN_LABELS[domain]}
                    </MenuItem>
                ))}
            </TextField>

            {showInfoIcon && (
                <Tooltip title={infoTooltip}>
                    <span>
                        <IconButton
                            size="small"
                            disabled={disabled}
                            sx={{color: 'text.secondary'}}
                        >
                            <InfoOutlinedIcon fontSize="small"/>
                        </IconButton>
                    </span>
                </Tooltip>
            )}
        </div>
    );
};

export default BackendDomainSelect;
