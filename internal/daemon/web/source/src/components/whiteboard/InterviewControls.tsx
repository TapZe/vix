import { Button } from '@/components/ui/button';
import { Square, BarChart3, Trash2, Play } from 'lucide-react';
import { ConversationState } from '@/lib/elevenlabs';

const CCIcon = ({ className }: { className?: string }) => (
  <div className={`flex items-center justify-center font-bold text-current ${className}`} style={{ fontSize: '0.75rem' }}>
    [CC]
  </div>
);

type InterviewState = 'ready' | 'active' | 'ended';

interface InterviewControlsProps {
  interviewState: InterviewState;
  isMuted: boolean;
  isVideoOn: boolean;
  showAvatar: boolean;
  onMuteToggle: (muted: boolean) => void;
  onVideoToggle: (videoOn: boolean) => void;
  onAvatarToggle: (showAvatar: boolean) => void;
  onStartInterview?: () => void;
  onEndInterview: () => void;
  onTranscriptToggle?: (show: boolean) => void;
  showTranscript?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  onAnalyze?: () => void;
  elapsedSeconds?: number;
  interviewMode?: 'voice' | 'text';
  conversationState?: ConversationState | null;
  elevenLabsService?: typeof import('@/lib/elevenlabs').elevenLabsService;
}

import { MINIMUM_ANALYSIS_DURATION_SECONDS, formatMinutesFromSeconds } from '@/lib/constants';

export const InterviewControls = ({
  interviewState,
  onStartInterview,
  onEndInterview,
  onTranscriptToggle,
  showTranscript = false,
  onSave,
  onDiscard,
  onAnalyze,
  elapsedSeconds = 0,
}: InterviewControlsProps) => {
  const isAnalysisAvailable = elapsedSeconds >= MINIMUM_ANALYSIS_DURATION_SECONDS;
  const remainingSeconds = Math.max(0, MINIMUM_ANALYSIS_DURATION_SECONDS - elapsedSeconds);
  const remainingMinutes = formatMinutesFromSeconds(remainingSeconds);

  const handleTranscriptToggle = () => {
    if (interviewState !== 'ended' && onTranscriptToggle) {
      onTranscriptToggle(!showTranscript);
    }
  };

  return (
    <div className="flex items-center justify-center space-x-4 py-4">
      {interviewState === 'active' && (
        <Button
          variant={showTranscript ? 'default' : 'outline'}
          size="lg"
          onClick={handleTranscriptToggle}
          className="px-5"
        >
          <CCIcon className="h-5 w-5 mr-2" />
          <span>Transcript</span>
        </Button>
      )}

      {interviewState === 'ready' && onStartInterview && (
        <Button
          variant="default"
          size="lg"
          onClick={onStartInterview}
          className="px-5 bg-green-500 hover:bg-green-600"
        >
          <Play className="h-5 w-5 mr-2 fill-white" />
          <span>Start</span>
        </Button>
      )}

      {interviewState === 'active' && (
        <Button
          variant="destructive"
          size="lg"
          onClick={onEndInterview}
          className="px-5 bg-red-500 hover:bg-red-600"
        >
          <Square className="h-5 w-5 mr-2 fill-white" />
          <span>Stop</span>
        </Button>
      )}

      {interviewState === 'ended' && onAnalyze && (
        <div className="flex flex-col items-center space-y-1">
          <Button
            variant="default"
            size="lg"
            onClick={isAnalysisAvailable ? onAnalyze : undefined}
            disabled={!isAnalysisAvailable}
            className={`px-5 ${
              isAnalysisAvailable
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            title={
              !isAnalysisAvailable
                ? `Analysis requires at least 10 minutes. Need ${remainingMinutes} more minutes.`
                : 'Analyze your interview performance'
            }
          >
            <BarChart3 className="h-5 w-5 mr-2" />
            <span>Analyze</span>
          </Button>
          {!isAnalysisAvailable && (
            <p className="text-xs text-gray-500 text-center max-w-36">
              Analysis requires 10+ minutes
            </p>
          )}
        </div>
      )}

      {interviewState === 'ended' && onSave && (
        <Button variant="default" size="lg" onClick={onSave} className="px-5">
          <BarChart3 className="h-5 w-5 mr-2" />
          <span>Save</span>
        </Button>
      )}

      {interviewState === 'ended' && onDiscard && (
        <Button variant="outline" size="lg" onClick={onDiscard} className="px-5">
          <Trash2 className="h-5 w-5 mr-2" />
          <span>Discard</span>
        </Button>
      )}
    </div>
  );
};
