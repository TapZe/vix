import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, VideoOff } from 'lucide-react';

interface UserVideoFeedProps {
  isVideoOn: boolean;
  onVideoToggle: (videoOn: boolean) => void;
  preview?: boolean;
  onStreamRef?: (cleanupFn: () => void) => void;
}

export const UserVideoFeed = ({ isVideoOn, onVideoToggle, preview = false, onStreamRef }: UserVideoFeedProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasStream, setHasStream] = useState(false);

  // Cleanup function
  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setError(null);
    setHasStream(false);
  };

  // Provide cleanup to parent
  useEffect(() => {
    if (onStreamRef) {
      onStreamRef(cleanup);
    }
  }, [onStreamRef]);

  // Handle video on/off
  useEffect(() => {
    const handleVideo = async () => {
      if (isVideoOn && !streamRef.current) {
        try {
          setError(null);
          
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          
          streamRef.current = stream;
          setHasStream(true);
          
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Camera access failed');
          streamRef.current = null;
        }
      } else if (!isVideoOn && streamRef.current) {
        cleanup();
      }
    };

    handleVideo();
  }, [isVideoOn]);

  // Separate effect to handle video element when stream is available
  useEffect(() => {
    if (hasStream && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      const stream = streamRef.current;
      
      video.srcObject = stream;
      
      const handleVideoSetup = async () => {
        try {
          await video.play();
        } catch (playError) {
          logger.error('Video play error:', playError);
        }
      };
      
      if (video.readyState >= 1) {
        handleVideoSetup();
      } else {
        video.addEventListener('loadedmetadata', handleVideoSetup, { once: true });
      }
      
      return () => {
        video.removeEventListener('loadedmetadata', handleVideoSetup);
      };
    }
  }, [hasStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-0">
        <div className="aspect-video bg-gray-900 relative">
          {isVideoOn && hasStream && !error ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover transform scale-x-[-1]"
              style={{ backgroundColor: 'transparent' }}
            />
          ) : null}
          {!(isVideoOn && hasStream && !error) && (
            <div className="w-full h-full flex items-center justify-center text-white">
              <VideoOff className="h-12 w-12 opacity-50" />
            </div>
          )}
          
          {/* Overlay for preview mode */}
          {preview && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="text-white text-center">
                <Video className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Camera Preview</p>
              </div>
            </div>
          )}
          
          {/* Video controls overlay */}
          <div className="absolute bottom-2 left-2">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => onVideoToggle(!isVideoOn)}
              className="bg-black bg-opacity-50 hover:bg-opacity-75 h-8 w-8"
            >
              {isVideoOn ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
