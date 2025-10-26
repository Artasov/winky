import React, { useEffect, useState } from 'react';
import TitleBar from '../components/TitleBar';

const ResultWindowPage: React.FC = () => {
  const [transcription, setTranscription] = useState('');
  const [llmResponse, setLLMResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedTranscription, setCopiedTranscription] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

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
        <TitleBar onClose={handleClose} />
      </div>
      
      <div className='fc flex-1 overflow-hidden'>
        <div className='flex-shrink-0 frbe gap-3 px-6 pt-6 pb-4'>
          <h2 className='text-xl font-semibold text-text-primary'>Результаты</h2>
          <button
            type='button'
            onClick={handleClose}
            className='button-animated flex h-8 w-8 items-center justify-center rounded-lg border border-primary-200 text-text-secondary transition-all duration-base hover:border-primary hover:text-primary'
            aria-label='Закрыть'
          >
            <svg viewBox='0 0 12 12' className='h-3 w-3 fill-current'>
              <path d='M1.28 0 0 1.28 4.72 6 0 10.72 1.28 12 6 7.28 10.72 12 12 10.72 7.28 6 12 1.28 10.72 0 6 4.72Z' />
            </svg>
          </button>
        </div>

        <div className='fc gap-4 overflow-y-auto flex-1 px-6 pb-6'>
        {/* Transcription */}
        <div className='fc gap-2'>
          <div className='frbe'>
            <label className='text-sm font-medium text-text-primary'>Распознанная речь</label>
            <button
              type='button'
              onClick={handleCopyTranscription}
              className='button-secondary frcs gap-1.5 rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-all duration-base hover:border-primary hover:bg-primary-50'
            >
              {copiedTranscription ? (
                <>
                  <svg className='h-3.5 w-3.5' viewBox='0 0 20 20' fill='currentColor'>
                    <path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' />
                  </svg>
                  Скопировано
                </>
              ) : (
                <>
                  <svg className='h-3.5 w-3.5' viewBox='0 0 20 20' fill='currentColor'>
                    <path d='M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z' />
                    <path d='M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z' />
                  </svg>
                  Копировать
                </>
              )}
            </button>
          </div>
          <div className='rounded-lg border border-primary-200 bg-white shadow-primary-sm p-4 text-sm leading-relaxed text-text-primary min-h-24'>
            {transcription || <span className='text-text-tertiary animate-pulse-soft'>Распознавание...</span>}
          </div>
        </div>

        {/* LLM Response */}
        {llmResponse && (
          <div className='fc gap-2'>
            <div className='frbe'>
              <label className='text-sm font-medium text-text-primary'>
                Ответ {isStreaming && <span className='text-xs text-text-tertiary'>(идет генерация...)</span>}
              </label>
              <button
                type='button'
                onClick={handleCopyResponse}
                disabled={isStreaming}
                className='button-secondary frcs gap-1.5 rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-all duration-base hover:border-primary hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {copiedResponse ? (
                  <>
                    <svg className='h-3.5 w-3.5' viewBox='0 0 20 20' fill='currentColor'>
                      <path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' />
                    </svg>
                    Скопировано
                  </>
                ) : (
                  <>
                    <svg className='h-3.5 w-3.5' viewBox='0 0 20 20' fill='currentColor'>
                      <path d='M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z' />
                      <path d='M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z' />
                    </svg>
                    Копировать
                  </>
                )}
              </button>
            </div>
            <div className='rounded-lg border border-primary-200 bg-white shadow-primary-sm p-4 text-sm leading-relaxed text-text-primary whitespace-pre-wrap min-h-48'>
              {llmResponse}
              {isStreaming && <span className='inline-block w-2 h-4 ml-1 bg-primary animate-pulse' />}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default ResultWindowPage;

