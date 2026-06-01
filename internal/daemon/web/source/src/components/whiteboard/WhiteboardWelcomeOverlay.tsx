import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Square, Type, Database, Diamond, Video, Mic } from 'lucide-react';

export function WhiteboardWelcomeOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user has seen the welcome overlay before
    const hasSeenWelcome = localStorage.getItem('whiteboard-welcome-seen');
    
    if (!hasSeenWelcome) {
      // Show overlay after a short delay
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('whiteboard-welcome-seen', 'true');
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 border-2 border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Welcome to Your System Design Interview!
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Canvas Tools Section */}
          <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4 border border-primary/10">
            <h3 className="font-semibold text-lg mb-3 text-foreground flex items-center gap-2">
              <Diamond className="w-5 h-5 text-primary" />
              Canvas Tools
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Square className="w-4 h-4 mt-1 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Shapes</p>
                  <p className="text-muted-foreground">Add rectangles, diamonds, and databases</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Type className="w-4 h-4 mt-1 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Text Boxes</p>
                  <p className="text-muted-foreground">Label your components</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Database className="w-4 h-4 mt-1 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Database Nodes</p>
                  <p className="text-muted-foreground">Design your data layer</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Diamond className="w-4 h-4 mt-1 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Connectors</p>
                  <p className="text-muted-foreground">Link components together</p>
                </div>
              </div>
            </div>
          </div>

          {/* Interview Controls Section */}
          <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4 border border-primary/10">
            <h3 className="font-semibold text-lg mb-3 text-foreground flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              Interview Controls
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Video className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">Video Feed</p>
                  <p className="text-muted-foreground">Your camera and AI interviewer are in the top bar</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mic className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">Voice Conversation</p>
                  <p className="text-muted-foreground">Start the interview to begin talking with the AI</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tips Section */}
          <div className="bg-gradient-to-r from-primary/5 to-purple-500/5 rounded-lg p-4 border border-primary/20">
            <h3 className="font-semibold text-lg mb-2 text-foreground">💡 Pro Tips</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Explain your design choices out loud as you draw</li>
              <li>• The AI can see your canvas and will ask relevant questions</li>
              <li>• Use the timer to pace yourself effectively</li>
              <li>• Don't worry about perfection - focus on communication</li>
            </ul>
          </div>

          <Button 
            onClick={handleClose}
            className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Got it! Let's start
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
