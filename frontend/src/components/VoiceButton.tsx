import { useState, useEffect, useRef, useCallback } from 'react';
import mergeClasses from '../lib/mergeClasses';

interface VoiceButtonProps {
  onResult: (transcript: string) => void;
  onListeningChange?: (isListening: boolean) => void;
  lang?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'floating';
}

export function VoiceButton({ 
  onResult, 
  onListeningChange,
  lang = 'hi-IN',
  size = 'md',
  variant = 'default',
}: VoiceButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const updateListening = useCallback((value: boolean) => {
    setIsListening(value);
    onListeningChange?.(value);
  }, [onListeningChange]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass = (window as Window).SpeechRecognition || (window as Window).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        recognitionRef.current = new SpeechRecognitionClass();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = lang;

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          onResult(transcript);
          updateListening(false);
        };

        recognitionRef.current.onerror = () => {
          updateListening(false);
        };

        recognitionRef.current.onend = () => {
          updateListening(false);
        };
      } else {
        setIsSupported(false);
      }
    }
  }, [onResult, lang, updateListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      updateListening(true);
    }
  };

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-14 h-14',
    lg: 'w-16 h-16',
  };

  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  };

  if (!isSupported) {
    return null;
  }

  const baseClasses = `
    relative
    flex items-center justify-center
    rounded-full
    transition-all duration-300 ease-out
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    disabled:opacity-50
  `;

  const variantClasses = {
    default: `
      ${sizeClasses[size]}
      ${isListening 
        ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 scale-110' 
        : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
      }
      focus-visible:ring-primary-500
    `,
    floating: `
      w-16 h-16
      ${isListening
        ? 'bg-red-500 text-white shadow-2xl shadow-red-500/50 scale-110'
        : 'bg-gradient-to-b from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/30 hover:shadow-2xl hover:shadow-primary-500/40 hover:scale-105'
      }
      focus-visible:ring-primary-500
    `,
  };

  return (
    <button
      onClick={toggleListening}
      className={mergeClasses(baseClasses, variantClasses[variant])}
      aria-label={isListening ? 'Stop listening' : 'Start voice input'}
      aria-pressed={isListening}
    >
      {/* Pulse rings when listening */}
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
          <span className="absolute inset-[-4px] rounded-full border-2 border-red-400 animate-pulse" />
        </>
      )}
      
      {/* Icon */}
      <span className="relative z-10">
        {isListening ? (
          <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        )}
      </span>

      {/* Listening indicator label */}
      {isListening && variant === 'floating' && (
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-medium text-red-500 whitespace-nowrap">
          Listening...
        </span>
      )}
    </button>
  );
}
