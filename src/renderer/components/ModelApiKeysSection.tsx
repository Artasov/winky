import React from 'react';
import {TextField, Typography} from '@mui/material';
import type {ModelConfigFormData} from './ModelConfigForm';

type ModelApiKeysSectionProps = {
    values: ModelConfigFormData;
    requireApiKeys: boolean;
    requiresOpenAIKey: boolean;
    requiresGoogleKey: boolean;
    shouldShowOpenAIField: boolean;
    googleKeyReasons: string[];
    openaiKeyReasons: string[];
    disableInputs: boolean;
    emitChange: (partial: Partial<ModelConfigFormData>) => void;
};

export const ModelApiKeysSection: React.FC<ModelApiKeysSectionProps> = ({
    values,
    requireApiKeys,
    requiresOpenAIKey,
    requiresGoogleKey,
    shouldShowOpenAIField,
    googleKeyReasons,
    openaiKeyReasons,
    disableInputs,
    emitChange
}) => {
    return (
        <div className="fc gap-2">
            <div className="fc gap-1">
                <Typography variant="h6" color="text.primary" fontWeight={600}>
                    API Keys
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {requireApiKeys ? (
                        <>
                            Add at least one API key to use cloud models. Visit{' '}
                            <a
                                href="https://platform.openai.com/api-keys"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-primary font-semibold"
                            >
                                OpenAI
                            </a>{' '}
                            or{' '}
                            <a
                                href="https://aistudio.google.com/"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-primary font-semibold flex items-center gap-1 inline-flex"
                            >
                                GoogleAI
                                <span style={{color: '#16a34a', fontWeight: 300}}>free</span>
                            </a>{' '}
                            to generate keys. You can also use Local mode without any keys.
                        </>
                    ) : (
                        <>
                            Optional: Add API keys to use cloud models, or use Local mode without keys.
                        </>
                    )}
                </Typography>
            </div>
            <div className="fc gap-2 mt-1">
                <TextField
                    id="google-key"
                    type="password"
                    label="Google AI API Key"
                    value={values.googleKey}
                    onChange={(e) => emitChange({googleKey: e.target.value})}
                    placeholder="AIza..."
                    required={false}
                    disabled={disableInputs}
                />
                {requiresGoogleKey && (
                    <Typography variant="caption" color="text.secondary">
                        Required for {googleKeyReasons.join(' + ')}.
                    </Typography>
                )}
            </div>

            {shouldShowOpenAIField && (
                <div className="fc gap-2 mt-1">
                    <TextField
                        id="openai-key"
                        type="password"
                        label="OpenAI API Key"
                        value={values.openaiKey}
                        onChange={(e) => emitChange({openaiKey: e.target.value})}
                        placeholder="sk-..."
                        required={false}
                        disabled={disableInputs}
                    />
                    {requiresOpenAIKey && (
                        <Typography variant="caption" color="text.secondary">
                            Required for {openaiKeyReasons.join(' + ')}.
                        </Typography>
                    )}
                </div>
            )}
        </div>
    );
};

export default ModelApiKeysSection;
