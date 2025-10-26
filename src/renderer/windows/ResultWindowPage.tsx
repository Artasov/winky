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
    await window.winky?.result.close();
  };

  return (
    <div className='h-screen w-full bg-slate-950 fc'>
      <TitleBar />
      
      <div className='fc flex-1 p-6 gap-4 overflow-hidden'>
        <div className='frbe gap-3'>
          <h2 className='text-xl font-semibold text-white'>Результаты</h2>
          <button
            type='button'
            onClick={handleClose}
            className='flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-slate-300 transition hover:border-white/40 hover:text-white'
            aria-label='Закрыть'
          >
            <svg viewBox='0 0 12 12' className='h-3 w-3 fill-current'>
              <path d='M1.28 0 0 1.28 4.72 6 0 10.72 1.28 12 6 7.28 10.72 12 12 10.72 7.28 6 12 1.28 10.72 0 6 4.72Z' />
            </svg>
          </button>
        </div>

        <div className='fc gap-4 overflow-auto flex-1'>
        {/* Transcription */}
        <div className='fc gap-2'>
          <div className='frbe'>
            <label className='text-sm font-medium text-slate-300'>Распознанная речь</label>
            <button
              type='button'
              onClick={handleCopyTranscription}
              className='frcs gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/10'
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
          <div className='rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm leading-relaxed text-slate-200 min-h-24'>
            {transcription || 'Распознавание...'}
          </div>
        </div>

        {/* LLM Response */}
        {llmResponse && (
          <div className='fc gap-2'>
            <div className='frbe'>
              <label className='text-sm font-medium text-slate-300'>
                Ответ {isStreaming && <span className='text-xs text-slate-500'>(идет генерация...)</span>}
              </label>
              <button
                type='button'
                onClick={handleCopyResponse}
                disabled={isStreaming}
                className='frcs gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
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
            <div className='rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap min-h-48'>
              {llmResponse}
              {isStreaming && <span className='inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse' />}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default ResultWindowPage;

