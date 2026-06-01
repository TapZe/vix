import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface InterviewTimerProps {
  isActive: boolean;
  isConnected?: boolean;
  shouldReset?: boolean; // when true, resets the timer
  plannedDuration?: number; // in minutes, default 45
  onElapsedSecondsChange?: (seconds: number) => void; // callback to report elapsed seconds
}

export const InterviewTimer = ({ isActive, isConnected = true, shouldReset = false, plannedDuration = 45, onElapsedSecondsChange }: InterviewTimerProps) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isActive || !isConnected) {
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, isConnected]);

  // Report elapsed seconds to parent component whenever elapsedSeconds changes
  useEffect(() => {
    onElapsedSecondsChange?.(elapsedSeconds);
  }, [elapsedSeconds, onElapsedSecondsChange]);

  // Reset timer only when explicitly requested (e.g., when starting a new interview)
  useEffect(() => {
    if (shouldReset) {
      setElapsedSeconds(0);
    }
  }, [shouldReset]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const isOvertime = elapsedMinutes >= plannedDuration;

  return (
    <div className="flex items-center space-x-2">
      <Clock className="w-4 h-4 text-gray-600" />

      <div className="flex items-center space-x-1">
        <span className={`text-sm font-medium ${
          isOvertime ? 'text-red-600' : 'text-gray-700'
        }`}>
          {formatTime(elapsedSeconds)}
        </span>
        <span className="text-sm text-gray-500">/</span>
        <span className="text-sm text-gray-500">
          {plannedDuration}:00
        </span>
      </div>
      
      {isOvertime && (
        <span className="bg-red-100 text-red-700 px-2 py-1 rounded-md text-xs font-medium">
          Overtime
        </span>
      )}
    </div>
  );
};
