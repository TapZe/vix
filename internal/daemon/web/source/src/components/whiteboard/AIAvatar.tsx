
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';

interface AIAvatarProps {
  isAISpeaking: boolean;
  voiceState: 'ready' | 'active' | 'ended';
  conversationState: any;
  conversationError: string | null;
}

function getStatusLabel(status: string | undefined, voiceState: string, hasError: boolean): string {
  if (hasError) return 'Error';
  switch (status) {
    case 'connecting':    return 'Connecting…';
    case 'connected':     return 'Waiting';
    case 'listening':     return 'Listening';
    case 'processing':    return 'Thinking…';
    case 'speaking':      return 'Speaking';
    case 'disconnected':  return 'Disconnected';
    case 'error':         return 'Error';
    default:
      if (voiceState === 'ready')  return 'Ready';
      if (voiceState === 'active') return 'Active';
      return 'Ended';
  }
}

function getBadgeClass(status: string | undefined, hasError: boolean): string {
  if (hasError) return 'bg-red-500 border-red-400 text-white';
  switch (status) {
    case 'listening':    return 'bg-blue-500 border-blue-400 text-white';
    case 'processing':   return 'bg-amber-500 border-amber-400 text-white';
    case 'speaking':     return 'bg-green-500 border-green-400 text-white';
    case 'connecting':   return 'bg-gray-400 border-gray-300 text-white';
    case 'error':        return 'bg-red-500 border-red-400 text-white';
    default:             return 'bg-gray-400 border-gray-300 text-white';
  }
}

export const AIAvatar = ({ isAISpeaking, voiceState, conversationState, conversationError }: AIAvatarProps) => {
  const status = conversationState?.status as string | undefined;
  const inputVolume = conversationState?.inputVolume ?? 0;
  const isListening = status === 'listening';
  const isProcessing = status === 'processing';
  const isAnimated = isListening || isProcessing || isAISpeaking;

  // Ring size grows with mic volume (96px = avatar size, up to +44px)
  const ringSize = 96 + Math.min(inputVolume * 0.44, 44);

  return (
    <Card className="h-full">
      <CardContent className="p-0 h-full">
        <div className="aspect-video bg-gradient-to-br from-blue-100 to-blue-50 relative flex items-center justify-center overflow-hidden">

          {/* VAD mic ring: grows with user voice when listening */}
          {isListening && (
            <div
              className="absolute rounded-full border-4 border-blue-400 transition-all duration-100"
              style={{
                width: `${ringSize}px`,
                height: `${ringSize}px`,
                opacity: inputVolume > 10 ? 0.55 : 0.15,
              }}
            />
          )}

          {/* Processing ring: pulsing amber when agent is thinking */}
          {isProcessing && (
            <div className="absolute w-36 h-36 rounded-full border-2 border-amber-400 animate-pulse opacity-50" />
          )}

          {/* AI speaking rings */}
          {isAISpeaking && (
            <>
              <div className="absolute w-32 h-32 rounded-full border-4 border-blue-300 animate-ping opacity-30" />
              <div className="absolute w-28 h-28 rounded-full border-2 border-blue-400 animate-pulse" />
            </>
          )}

          {/* Avatar circle */}
          <div
            className={`w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center transition-all duration-300 relative z-10 ${
              isAISpeaking ? 'scale-110 bg-blue-700' : 'scale-100'
            }`}
          >
            <User className="h-12 w-12 text-white" />
          </div>

          {/* Status badge */}
          <div className="absolute bottom-2 right-2">
            <Badge
              variant="secondary"
              className={`text-[10px] px-2 py-0.5 shadow-md ${getBadgeClass(status, !!conversationError)}`}
            >
              {isAnimated && (
                <span className="w-1 h-1 bg-white rounded-full mr-1 animate-pulse" />
              )}
              {getStatusLabel(status, voiceState, !!conversationError)}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
