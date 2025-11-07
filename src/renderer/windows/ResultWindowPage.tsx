import React, {useEffect, useRef, useState} from 'react';
import TitleBar from '../components/TitleBar';

const ResultWindowPage: React.FC = () => {
    const [transcription, setTranscription] = useState('');
    const [llmResponse, setLLMResponse] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [copiedTranscription, setCopiedTranscription] = useState(false);
    const [copiedResponse, setCopiedResponse] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        contentRef.current?.focus({preventScroll: true});
    }, []);

    useEffect(() => {
        console.log('[ResultWindowPage] Subscribing to result data');
        const unsubscribe = window.winky?.result.onData((data) => {
            console.log('[ResultWindowPage] Received data:', data);
            if (data.transcription !== undefined) {
                console.log('[ResultWindowPage] Setting transcription:', data.transcription);
                setTranscription(data.transcription);
            }
            if (data.llmResponse !== undefined) {
                console.log('[ResultWindowPage] Setting LLM response:', data.llmResponse);
                setLLMResponse(data.llmResponse);
            }
            if (data.isStreaming !== undefined) {
                setIsStreaming(data.isStreaming);
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, []);

    const handleCopyTranscription = async () => {
        await window.winky?.clipboard.writeText(transcription);
        setCopiedTranscription(true);
        setTimeout(() => setCopiedTranscription(false), 2000);
    };

    const handleCopyResponse = async () => {
        await window.winky?.clipboard.writeText(llmResponse);
        setCopiedResponse(true);
        setTimeout(() => setCopiedResponse(false), 2000);
    };

    const handleClose = async () => {
        console.log('[ResultWindowPage] Close button clicked');
        try {
            await window.winky?.result.close();
            console.log('[ResultWindowPage] Close request sent');
        } catch (error) {
            console.error('[ResultWindowPage] Error closing window:', error);
        }
    };

    return (
        <div className='h-screen w-full bg-bg-base fc overflow-hidden'>
            <div className='flex-shrink-0'>
                <TitleBar onClose={handleClose}/>
            </div>

            <div className='fc flex-1 overflow-hidden'>
                <div
                    ref={contentRef}
                    tabIndex={-1}
                    className='fc gap-2 overflow-y-auto flex-1 px-6 pt-4 pb-6 focus:outline-none'
                >
                    {/* Transcription */}
                    <div className='fc gap-2'>
                        <div className='frsc gap-2'>
                            <label className='text-sm font-medium text-text-primary pl-1'>Recognized Speech</label>
                            <button
                                type='button'
                                onClick={handleCopyTranscription}
                                className='flex h-7 w-7 items-center justify-center rounded-lg border border-primary-200 bg-white text-text-primary transition-[background-color,border-color] duration-base hover:border-primary hover:bg-primary-50'
                                aria-label='Copy transcription'
                            >
                                {copiedTranscription ? (
                                    <svg className='h-3.5 w-3.5' viewBox='0 0 20 20' fill='currentColor'>
                                        <path fillRule='evenodd'
                                              d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                                              clipRule='evenodd'/>
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
                            className='rounded-lg border border-primary-200 bg-white shadow-primary-sm p-4 text-sm leading-relaxed text-text-primary min-h-24'>
                            {transcription ||
                                <span className='text-text-tertiary animate-pulse-soft'>Recognizing...</span>}
                        </div>
                    </div>

                    {/* LLM Response */}
                    {llmResponse && (
                        <div className='fc gap-2'>
                            <div className='frsc gap-2'>
                                <label className='text-sm font-medium text-text-primary pl-1'>
                                    Response {isStreaming &&
                                    <span className='text-xs text-text-tertiary'>(generating...)</span>}
                                </label>
                                <button
                                    type='button'
                                    onClick={handleCopyResponse}
                                    disabled={isStreaming}
                                    className='flex h-7 w-7 items-center justify-center rounded-lg border border-primary-200 bg-white text-text-primary transition-[background-color,border-color] duration-base hover:border-primary hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50'
                                    aria-label='Copy response'
                                >
                                    {copiedResponse ? (
                                        <svg className='h-3.5 w-3.5' viewBox='0 0 20 20' fill='currentColor'>
                                            <path fillRule='evenodd'
                                                  d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                                                  clipRule='evenodd'/>
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
                                className='rounded-lg border border-primary-200 bg-white shadow-primary-sm p-4 text-sm leading-relaxed text-text-primary whitespace-pre-wrap min-h-48'>
                                {llmResponse}
                                {isStreaming && <span className='inline-block w-2 h-4 ml-1 bg-primary animate-pulse'/>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResultWindowPage;

