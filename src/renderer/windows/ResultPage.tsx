import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {alpha, useTheme} from '@mui/material/styles';
import {Button} from '@mui/material';
import {clipboardBridge} from '../services/winkyBridge';
import {useResult} from '../context/ResultContext';

const ResultPage: React.FC = () => {
    const navigate = useNavigate();
    const {data, clear} = useResult();
    const [copiedRequest, setCopiedRequest] = useState(false);
    const [copiedResponse, setCopiedResponse] = useState(false);
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.3);

    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        contentRef.current?.focus({preventScroll: true});
    }, []);

    const handleCopyRequest = useCallback(async () => {
        if (!data?.transcription) return;
        await clipboardBridge.writeText(data.transcription);
        setCopiedRequest(true);
        setTimeout(() => setCopiedRequest(false), 2000);
    }, [data?.transcription]);

    const handleCopyResponse = useCallback(async () => {
        if (!data?.llmResponse) return;
        await clipboardBridge.writeText(data.llmResponse);
        setCopiedResponse(true);
        setTimeout(() => setCopiedResponse(false), 2000);
    }, [data?.llmResponse]);

    const handleClear = useCallback(() => {
        clear();
        navigate(-1);
    }, [clear, navigate]);

    const requestText = data?.transcription || '';
    const llmResponse = data?.llmResponse || '';
    const isStreaming = data?.isStreaming || false;

    return (
        <div className="mx-auto fc h-full w-full max-w-5xl gap-3 px-8 py-6 overflow-x-hidden box-border">
            <div className="frbc flex-wrap gap-3">
                <div className="fc gap-1 w-full">
                    <div className="frbc w-full">
                        <h1 className="text-3xl font-semibold text-text-primary">Result</h1>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={handleClear}
                            sx={{borderRadius: 3}}
                        >
                            Clear & Back
                        </Button>
                    </div>
                    <p className="text-sm text-text-secondary">
                        Transcription and LLM response from your action.
                    </p>
                </div>
            </div>

            <div
                ref={contentRef}
                tabIndex={-1}
                className="fc gap-4 flex-1 overflow-y-auto focus:outline-none pb-6"
            >
                {/* Request */}
                <div className="fc gap-2">
                    <div className="frsc gap-2">
                        <label className="text-sm font-medium text-text-primary pl-1">Request</label>
                        <button
                            type="button"
                            onClick={handleCopyRequest}
                            disabled={!requestText}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary-200 bg-bg-elevated text-text-primary transition-[background-color,border-color] duration-base hover:border-primary hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Copy request"
                        >
                            {copiedRequest ? (
                                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd"
                                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                          clipRule="evenodd"/>
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                     xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        d="M10.5 2.0028C9.82495 2.01194 9.4197 2.05103 9.09202 2.21799C8.71569 2.40973 8.40973 2.71569 8.21799 3.09202C8.05103 3.4197 8.01194 3.82495 8.0028 4.5M19.5 2.0028C20.1751 2.01194 20.5803 2.05103 20.908 2.21799C21.2843 2.40973 21.5903 2.71569 21.782 3.09202C21.949 3.4197 21.9881 3.82494 21.9972 4.49999M21.9972 13.5C21.9881 14.175 21.949 14.5803 21.782 14.908C21.5903 15.2843 21.2843 15.5903 20.908 15.782C20.5803 15.949 20.1751 15.9881 19.5 15.9972M22 7.99999V9.99999M14.0001 2H16M5.2 22H12.8C13.9201 22 14.4802 22 14.908 21.782C15.2843 21.5903 15.5903 21.2843 15.782 20.908C16 20.4802 16 19.9201 16 18.8V11.2C16 10.0799 16 9.51984 15.782 9.09202C15.5903 8.71569 15.2843 8.40973 14.908 8.21799C14.4802 8 13.9201 8 12.8 8H5.2C4.0799 8 3.51984 8 3.09202 8.21799C2.71569 8.40973 2.40973 8.71569 2.21799 9.09202C2 9.51984 2 10.0799 2 11.2V18.8C2 19.9201 2 20.4802 2.21799 20.908C2.40973 21.2843 2.71569 21.5903 3.09202 21.782C3.51984 22 4.07989 22 5.2 22Z"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
                    <div
                        className="rounded-2xl border border-primary-200 bg-bg-elevated shadow-primary-sm p-4 text-sm leading-relaxed text-text-primary min-h-24"
                        style={isDark ? {
                            borderColor: darkSurface,
                            backgroundColor: theme.palette.background.default,
                            boxShadow: 'none'
                        } : undefined}
                    >
                        {requestText ||
                            <span className="text-text-tertiary animate-pulse-soft">Preparing request...</span>}
                    </div>
                </div>

                {/* LLM Response */}
                {(llmResponse || isStreaming) && (
                    <div className="fc gap-2">
                        <div className="frsc gap-2">
                            <label className="text-sm font-medium text-text-primary pl-1">
                                Response {isStreaming &&
                                <span className="text-xs text-text-tertiary">(generating...)</span>}
                            </label>
                            <button
                                type="button"
                                onClick={handleCopyResponse}
                                disabled={isStreaming || !llmResponse}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary-200 bg-bg-elevated text-text-primary transition-[background-color,border-color] duration-base hover:border-primary hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Copy response"
                            >
                                {copiedResponse ? (
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd"
                                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                              clipRule="evenodd"/>
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                         xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M10.5 2.0028C9.82495 2.01194 9.4197 2.05103 9.09202 2.21799C8.71569 2.40973 8.40973 2.71569 8.21799 3.09202C8.05103 3.4197 8.01194 3.82495 8.0028 4.5M19.5 2.0028C20.1751 2.01194 20.5803 2.05103 20.908 2.21799C21.2843 2.40973 21.5903 2.71569 21.782 3.09202C21.949 3.4197 21.9881 3.82494 21.9972 4.49999M21.9972 13.5C21.9881 14.175 21.949 14.5803 21.782 14.908C21.5903 15.2843 21.2843 15.5903 20.908 15.782C20.5803 15.949 20.1751 15.9881 19.5 15.9972M22 7.99999V9.99999M14.0001 2H16M5.2 22H12.8C13.9201 22 14.4802 22 14.908 21.782C15.2843 21.5903 15.5903 21.2843 15.782 20.908C16 20.4802 16 19.9201 16 18.8V11.2C16 10.0799 16 9.51984 15.782 9.09202C15.5903 8.71569 15.2843 8.40973 14.908 8.21799C14.4802 8 13.9201 8 12.8 8H5.2C4.0799 8 3.51984 8 3.09202 8.21799C2.71569 8.40973 2.40973 8.71569 2.21799 9.09202C2 9.51984 2 10.0799 2 11.2V18.8C2 19.9201 2 20.4802 2.21799 20.908C2.40973 21.2843 2.71569 21.5903 3.09202 21.782C3.51984 22 4.07989 22 5.2 22Z"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <div
                            className="rounded-2xl border border-primary-200 bg-bg-elevated shadow-primary-sm p-4 text-text-primary min-h-48"
                            style={isDark ? {
                                borderColor: darkSurface,
                                backgroundColor: theme.palette.background.default,
                                boxShadow: 'none'
                            } : undefined}
                        >
                            <div className="markdown-compact">
                                <ReactMarkdown>{llmResponse}</ReactMarkdown>
                            </div>
                            {isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse"/>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResultPage;
