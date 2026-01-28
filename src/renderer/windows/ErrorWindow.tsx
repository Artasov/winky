import React, {useEffect, useState} from 'react';

interface ErrorData {
    title: string;
    message: string;
    details?: string;
    timestamp: string;
}

const ErrorWindow: React.FC = () => {
    const [errorData, setErrorData] = useState<ErrorData | null>(null);

    useEffect(() => {
        const handleError = (_event: any, data: ErrorData) => {
            console.log('[ErrorWindow] Received error:', data);
            setErrorData(data);
        };

        const unsubscribe = window.winky?.on?.('error:show', (_data: any) => handleError(null, _data));
        return () => {
            unsubscribe?.();
        };
    }, []);

    const handleClose = () => {
        window.winky?.windowControls?.close();
    };

    if (!errorData) {
        return (
            <div className='frcc h-full w-full bg-bg-base'>
                <div className='text-sm text-text-secondary'>Loading...</div>
            </div>
        );
    }

    return (
        <div className='fc h-full w-full bg-bg-base'>
            {/* Header */}
            <div className='frbc border-b border-primary-200 bg-bg-elevated px-4 py-3 shadow-primary-sm'>
                <div className='frc gap-2'>
                    <div className='text-2xl'>вљ пёЏ</div>
                    <h1 className='text-lg font-semibold text-error'>{errorData.title}</h1>
                </div>
                <button
                    onClick={handleClose}
                    className='button-animated frcc h-8 w-8 rounded-lg text-text-secondary transition-colors hover:bg-primary-50 hover:text-error focus:outline-none'
                    aria-label='Close'
                >
                    вњ•
                </button>
            </div>

            {/* Content */}
            <div className='fc flex-1 gap-4 overflow-y-auto px-6 py-4'>
                <div className='rounded-lg border border-error bg-error/5 p-4'>
                    <p className='text-sm text-text-primary whitespace-pre-wrap'>{errorData.message}</p>
                </div>

                {errorData.details && (
                    <div className='fc gap-2'>
                        <h2 className='text-xs font-semibold text-text-secondary uppercase tracking-wide'>
                            Technical Details
                        </h2>
                        <div className='rounded-lg border border-primary-200 bg-bg-elevated p-4'>
              <pre className='text-xs text-text-secondary whitespace-pre-wrap wrap-break-word font-mono'>
                {errorData.details}
              </pre>
                        </div>
                    </div>
                )}

                <div className='text-xs text-text-tertiary'>
                    {new Date(errorData.timestamp).toLocaleString()}
                </div>
            </div>

            {/* Footer */}
            <div className='frce border-t border-primary-200 bg-bg-elevated px-6 py-4'>
                <button
                    onClick={handleClose}
                    className='button-animated rounded-lg bg-primary px-6 py-2 text-sm font-medium text-text-inverse shadow-primary-md transition-all hover:bg-primary-dark hover:shadow-primary-lg focus:outline-none'
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default ErrorWindow;


