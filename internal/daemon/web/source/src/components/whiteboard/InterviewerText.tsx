import { Bot } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InterviewerTextProps {
  currentText?: string;
  isLoading?: boolean;
}

export const InterviewerText = ({ currentText, isLoading }: InterviewerTextProps) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!currentText) {
      setDisplayedText('');
      return;
    }

    if (currentText !== displayedText) {
      setIsAnimating(true);
      setDisplayedText('');
      
      // Start typing animation
      let index = 0;
      const typeTimer = setInterval(() => {
        setDisplayedText(currentText.substring(0, index + 1));
        index++;
        
        if (index >= currentText.length) {
          clearInterval(typeTimer);
          setIsAnimating(false);
        }
      }, 30); // 30ms delay between characters for smooth typing

      return () => clearInterval(typeTimer);
    }
  }, [currentText]);

  return (
    <div className="flex items-start gap-3 px-4 transition-all duration-300 ease-in-out">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <Bot className="w-5 h-5 text-blue-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-gray-900 mb-2">AI Interviewer</div>
        <div className="text-base text-gray-700">
          {isLoading ? (
            <div className="flex items-center gap-1">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
              </div>
              <span className="ml-2 text-gray-500">AI is thinking...</span>
            </div>
          ) : displayedText ? (
            <p className="leading-relaxed animate-in fade-in duration-300">
              {displayedText}
              {isAnimating && <span className="animate-pulse">|</span>}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
