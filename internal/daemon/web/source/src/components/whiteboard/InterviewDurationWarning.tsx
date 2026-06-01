import { Clock, AlertCircle } from 'lucide-react';
import { MINIMUM_ANALYSIS_DURATION_SECONDS, formatDuration, formatMinutesFromSeconds } from '@/lib/constants';

interface InterviewDurationWarningProps {
  elapsedSeconds: number;
  showWhenReady?: boolean; // Show even when analysis is available (for informational purposes)
}

export const InterviewDurationWarning = ({ 
  elapsedSeconds, 
  showWhenReady = false 
}: InterviewDurationWarningProps) => {
  const isAnalysisAvailable = elapsedSeconds >= MINIMUM_ANALYSIS_DURATION_SECONDS;
  const remainingSeconds = Math.max(0, MINIMUM_ANALYSIS_DURATION_SECONDS - elapsedSeconds);
  const remainingMinutes = formatMinutesFromSeconds(remainingSeconds);
  const elapsedFormatted = formatDuration(elapsedSeconds);
  
  // Don't show if analysis is available and we're not in "always show" mode
  if (isAnalysisAvailable && !showWhenReady) {
    return null;
  }

  return (
    <div className={`border rounded-lg p-4 ${
      isAnalysisAvailable 
        ? 'bg-green-50 border-green-200' 
        : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
          isAnalysisAvailable ? 'text-green-600' : 'text-amber-600'
        }`}>
          {isAnalysisAvailable ? (
            <Clock className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${
            isAnalysisAvailable ? 'text-green-800' : 'text-amber-800'
          }`}>
            {isAnalysisAvailable ? (
              'Analysis Available'
            ) : (
              'Analysis Not Yet Available'
            )}
          </div>
          
          <div className={`text-sm mt-1 ${
            isAnalysisAvailable ? 'text-green-700' : 'text-amber-700'
          }`}>
            {isAnalysisAvailable ? (
              <>
                Interview duration: <strong>{elapsedFormatted}</strong>
                <br />
                Your interview meets the 10-minute minimum required for AI analysis.
              </>
            ) : (
              <>
                Current duration: <strong>{elapsedFormatted}</strong>
                <br />
                Need <strong>{remainingMinutes} more minutes</strong> to enable AI analysis.
                <br />
                <span className="text-xs opacity-75">
                  Analysis requires at least 10 minutes to provide meaningful feedback.
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
