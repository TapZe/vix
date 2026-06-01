import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, Video, VideoOff, Mic, MicOff, Square, Play, BarChart3, Trash2, Download, Diamond, Type, Database, Sparkles, X, Folder, ZoomIn, ZoomOut, Maximize, RotateCcw, PanelLeftClose, PanelLeftOpen, Code2, Upload, ChevronDown, Plus, Monitor, Trash, Pencil, GripVertical } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CodePanel, CodeArtifact } from '@/components/whiteboard/CodePanel';
import { mockSessions } from '@/data/sessions';
import { SystemDesignCanvas } from '@/components/whiteboard/SystemDesignCanvas';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AIAvatar } from '@/components/whiteboard/AIAvatar';
import { Badge } from '@/components/ui/badge';
// import { UserVideoFeed } from '@/components/whiteboard/UserVideoFeed';
import { logger } from '@/lib/logger';
import { elevenLabsService, ConversationState, ConversationTranscript as TranscriptType } from '@/lib/elevenlabs';
import { useMicrophoneLevel } from '@/hooks/useMicrophoneLevel';
import { InterviewerText } from '@/components/whiteboard/InterviewerText';
import logo from '@/assets/logo.svg';

type VoiceState = 'ready' | 'active' | 'ended';

interface TrainingSession {
  id: string;
  title: string;
  maximumDurationSeconds: number;
  signedUrl?: string;
  agentId?: string;
  userProfile: { firstName: string; seniority: number | null };
}

const WhiteboardPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [plan] = useState(() => {
    const raw = searchParams.get('plan');
    return raw ? decodeURIComponent(raw) : '';
  });

  const [whiteboard] = useState(() => {
    const raw = searchParams.get('scenes');
    return raw ? decodeURIComponent(raw) : '';
  });

  const [trainingSession, setTrainingSession] = useState<TrainingSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('ready');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
  const [hasNewCode, setHasNewCode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [isScenesOpen, setIsScenesOpen] = useState(true);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);
  const { toast } = useToast();

  const handleImportJson = () => {
    const setCanvas = (window as any).__setCanvas;
    if (!setCanvas) {
      toast({ title: 'Canvas not ready', variant: 'destructive' });
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(importJson);
    } catch (e) {
      toast({ title: 'Invalid JSON', description: String(e), variant: 'destructive' });
      return;
    }
    // Accept either an array of scenes or a single canvas object.
    const list: Array<{ name?: string; context?: string; nodes: any[]; edges: any[]; code?: CodeArtifact[] }> = Array.isArray(parsed)
      ? parsed
      : [{ name: 'Scene 1', nodes: parsed.nodes || [], edges: parsed.edges || [], code: parsed.code || [] }];
    if (list.length === 0) {
      toast({ title: 'Import failed', description: 'No scenes in JSON', variant: 'destructive' });
      return;
    }
    const newScenes: Scene[] = list.map((entry, idx) => ({
      id: `scene_${idx + 1}`,
      name: entry.name || `Scene ${idx + 1}`,
      context: entry.context || '',
      canvas: { nodes: entry.nodes || [], edges: entry.edges || [] },
      code: Array.isArray(entry.code) ? entry.code : [],
    }));
    sceneCounter.current = newScenes.length;
    setScenes(newScenes);
    setActiveSceneId(newScenes[0].id);
    setCanvas(JSON.stringify(newScenes[0].canvas));
    toast({ title: 'Canvas imported', description: `${newScenes.length} scene(s)` });
    setIsImportOpen(false);
    setImportJson('');
  };

  const handleExportJson = () => {
    const getFinal = (window as any).__getFinalCanvas;
    if (!getFinal) {
      toast({ title: 'Canvas not ready', variant: 'destructive' });
      return;
    }
    // Persist current scene's live canvas before exporting.
    const currentCanvas = getFinal();
    const exportData = scenes.map((s) => ({
      name: s.name,
      context: s.context,
      ...(s.id === activeSceneId ? currentCanvas : s.canvas),
      code: s.code,
    }));
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Canvas exported' });
  };

  const mockArtifacts: CodeArtifact[] = [
    {
      filename: 'urlShortener.ts',
      language: 'ts',
      previous: `function shorten(url: string) {
  const id = Math.random().toString(36).slice(2, 8);
  store.set(id, url);
  return id;
}`,
      content: `function shorten(url: string): string {
  const id = nanoid(7);
  store.set(id, { url, createdAt: Date.now() });
  metrics.increment('shorten');
  return id;
}`,
    },
    {
      filename: 'store.ts',
      language: 'ts',
      previous: `export const store = new Map<string, string>();`,
      content: `interface Entry { url: string; createdAt: number; }
export const store = new Map<string, Entry>();

export function get(id: string): Entry | undefined {
  return store.get(id);
}`,
    },
    {
      filename: 'routes.ts',
      language: 'ts',
      content: `import { shorten } from './urlShortener';
import { get } from './store';

app.post('/shorten', (req, res) => {
  const id = shorten(req.body.url);
  res.json({ id });
});

app.get('/:id', (req, res) => {
  const entry = get(req.params.id);
  if (!entry) return res.status(404).end();
  res.redirect(entry.url);
});`,
    },
  ];

  // Each "scene" has its own canvas (nodes+edges JSON) + code artifacts.
  interface Scene {
    id: string;
    name: string;
    context: string;
    canvas: { nodes: any[]; edges: any[] };
    code: CodeArtifact[];
  }
  const [scenes, setScenes] = useState<Scene[]>(() => [
    {
      id: 'scene_1',
      name: 'Scene 1',
      context: '',
      canvas: { nodes: [], edges: [] },
      code: !import.meta.env.VITE_USE_REAL_DATA ? mockArtifacts : [],
    },
  ]);
  const [activeSceneId, setActiveSceneId] = useState<string>('scene_1');
  const sceneCounter = useRef(1);

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];
  const codeArtifacts = activeScene?.code ?? [];

  const setCodeArtifacts = useCallback(
    (updater: CodeArtifact[] | ((prev: CodeArtifact[]) => CodeArtifact[])) => {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === activeSceneId
            ? { ...s, code: typeof updater === 'function' ? (updater as any)(s.code) : updater }
            : s
        )
      );
    },
    [activeSceneId]
  );

  // Persist current canvas to its screen, then switch to another screen.
  const switchScene = useCallback(
    (nextId: string) => {
      if (nextId === activeSceneId) return;
      const getFinal = (window as any).__getFinalCanvas;
      const currentCanvas = typeof getFinal === 'function' ? getFinal() : null;
      setScenes((prev) => {
        const updated = currentCanvas
          ? prev.map((s) => (s.id === activeSceneId ? { ...s, canvas: currentCanvas } : s))
          : prev;
        const next = updated.find((s) => s.id === nextId);
        // Load the next scene's canvas into the live React Flow instance.
        const setCanvas = (window as any).__setCanvas;
        if (next && typeof setCanvas === 'function') {
          setCanvas(JSON.stringify(next.canvas));
        }
        return updated;
      });
      setActiveSceneId(nextId);
    },
    [activeSceneId]
  );

  const addScene = useCallback(() => {
    // Save current first
    const getFinal = (window as any).__getFinalCanvas;
    const currentCanvas = typeof getFinal === 'function' ? getFinal() : null;
    sceneCounter.current += 1;
    const newId = `scene_${sceneCounter.current}`;
    const newScene: Scene = {
      id: newId,
      name: `Scene ${sceneCounter.current}`,
      context: '',
      canvas: { nodes: [], edges: [] },
      code: [],
    };
    setScenes((prev) =>
      (currentCanvas
        ? prev.map((s) => (s.id === activeSceneId ? { ...s, canvas: currentCanvas } : s))
        : prev
      ).concat(newScene)
    );
    const setCanvas = (window as any).__setCanvas;
    if (typeof setCanvas === 'function') setCanvas(JSON.stringify(newScene.canvas));
    setActiveSceneId(newId);
  }, [activeSceneId]);

  const removeScene = useCallback(
    (id: string) => {
      setScenes((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((s) => s.id !== id);
        if (id === activeSceneId) {
          const next = filtered[0];
          const setCanvas = (window as any).__setCanvas;
          if (next && typeof setCanvas === 'function') setCanvas(JSON.stringify(next.canvas));
          setActiveSceneId(next.id);
        }
        return filtered;
      });
    },
    [activeSceneId]
  );

  const renameScene = useCallback((id: string) => {
    const current = scenes.find((s) => s.id === id);
    const next = window.prompt('Rename scene', current?.name ?? '');
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
  }, [scenes]);

  // Drag-and-drop reordering for scenes
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  const reorderScenes = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setScenes((prev) => {
      const from = prev.findIndex((s) => s.id === sourceId);
      const to = prev.findIndex((s) => s.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Signal new content when artifacts arrive/change while the panel is closed.
  const artifactsSignature = codeArtifacts.map((a) => `${a.filename}:${a.content.length}`).join('|');
  useEffect(() => {
    if (codeArtifacts.length > 0 && !isCodePanelOpen) {
      setHasNewCode(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactsSignature]);

  useEffect(() => {
    const interval = setInterval(() => {
      if ((window as any).__reactFlowGetZoom) {
        const zoom = (window as any).__reactFlowGetZoom();
        setZoomPercentage(Math.round(zoom * 100));
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Auto-import scenes passed via ?scenes= query parameter (set by the plan whiteboard workflow)
  useEffect(() => {
    const raw = searchParams.get('scenes');
    if (!raw) return;
    let decoded = decodeURIComponent(raw).trim();
    // Strip markdown fences in case the model wrapped its output
    if (decoded.startsWith('```')) {
      decoded = decoded.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    let attempts = 0;
    const iv = setInterval(() => {
      const setCanvas = (window as any).__setCanvas;
      if (!setCanvas && ++attempts < 30) return;
      clearInterval(iv);
      if (!setCanvas) return;
      let parsed: any;
      try { parsed = JSON.parse(decoded); } catch { return; }
      const list: Array<{ name?: string; context?: string; nodes: any[]; edges: any[]; code?: CodeArtifact[] }> =
        Array.isArray(parsed)
          ? parsed
          : [{ name: 'Scene 1', nodes: parsed.nodes || [], edges: parsed.edges || [] }];
      if (!list.length) return;
      const newScenes: Scene[] = list.map((e, i) => ({
        id: `scene_${i + 1}`,
        name: e.name || `Scene ${i + 1}`,
        context: e.context || '',
        canvas: { nodes: e.nodes || [], edges: e.edges || [] },
        code: Array.isArray(e.code) ? e.code : [],
      }));
      sceneCounter.current = newScenes.length;
      setScenes(newScenes);
      setActiveSceneId(newScenes[0].id);
      setCanvas(JSON.stringify(newScenes[0].canvas));
      toast({ title: 'Whiteboard loaded', description: `${newScenes.length} scene(s) from your plan` });
    }, 100);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptType[]>([]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);
  const [currentInterviewerText, setCurrentInterviewerText] = useState<string>('');
  const [showInterviewerText, setShowInterviewerText] = useState(false);
  const [cameraCleanupFn, setCameraCleanupFn] = useState<(() => void) | null>(null);
  const micLevel = useMicrophoneLevel();
  const [zoomPercentage, setZoomPercentage] = useState(75);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Fetch session metadata + signed URL on mount
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        if (!import.meta.env.VITE_USE_REAL_DATA) {
          const mock = mockSessions.find(s => s.id === id);
          if (!cancelled) {
            setTrainingSession({
              id: id!,
              title: mock?.cwd ?? id!,
              maximumDurationSeconds: 2700,
              agentId: '',
              userProfile: { firstName: '', seniority: null },
            });
            setTranscripts([
              { id: 'm1', role: 'assistant', content: "Hi! Welcome to your system design interview. Today we'll design a URL shortener like bit.ly. Ready to start?" } as any,
              { id: 'm2', role: 'user', content: "Yes, sounds good. Should I start with the requirements?" } as any,
              { id: 'm3', role: 'assistant', content: "Great approach. Walk me through the functional and non-functional requirements you'd consider." } as any,
              { id: 'm4', role: 'user', content: "Functional: shorten a long URL, redirect to original, custom aliases. Non-functional: high availability, low latency reads, ~100M URLs/month." } as any,
              { id: 'm4b', role: 'tool', toolName: 'drawOnWhiteboard', content: 'Updating canvas with requirements diagram…' } as any,
              { id: 'm5', role: 'assistant', content: "Good. How would you estimate storage and QPS based on that traffic?" } as any,
            ]);
          }
          return;
        }

        // Fetch session metadata
        const metaRes = await fetch(`/api/session/${id}/interview-data`);
        if (!metaRes.ok) throw new Error(`Failed to load session: ${metaRes.status}`);
        const meta = await metaRes.json();

        // Fetch connection config (returns { signedUrl } or { agentId } depending
        // on auth_mode in settings — "signed_url" vs "public").
        const agentIdOverride = searchParams.get('agent_id');
        const connPath = agentIdOverride
          ? `/api/session/${id}/signed-url?agent_id=${encodeURIComponent(agentIdOverride)}`
          : `/api/session/${id}/signed-url`;
        const urlRes = await fetch(connPath);
        if (!urlRes.ok) throw new Error(`Failed to get connection config: ${urlRes.status}`);
        const { signedUrl, agentId } = await urlRes.json();

        if (!cancelled) {
          setTrainingSession({ ...meta, signedUrl, agentId });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voiceState === 'active' && elevenLabsService.isConnected()) {
        elevenLabsService.endConversation().catch((err) => logger.error('Failed to end conversation:', err));
      }
      if (cameraCleanupFn) cameraCleanupFn();
    };
  }, [voiceState, cameraCleanupFn]);

  const updateScenes = useCallback((params: any) => {
    setTranscripts((prev) => [
      ...prev,
      { id: `tool-${Date.now()}`, role: 'tool' as any, toolName: 'updateScenes', content: 'Updating whiteboard…' } as any,
    ]);

    const setCanvas = (window as any).__setCanvas;
    if (!setCanvas) return { success: false, error: 'Canvas not ready' };

    let parsed: any;
    try {
      const raw = params.scenes_json ?? params.scenes;
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return { success: false, error: 'Invalid JSON' };
    }

    const list: Array<{ name?: string; context?: string; nodes: any[]; edges: any[]; code?: CodeArtifact[] }> = Array.isArray(parsed)
      ? parsed
      : [{ name: 'Scene 1', nodes: parsed.nodes || [], edges: parsed.edges || [], code: parsed.code || [] }];

    if (list.length === 0) return { success: false, error: 'No scenes in JSON' };

    const newScenes: Scene[] = list.map((entry, idx) => ({
      id: `scene_${idx + 1}`,
      name: entry.name || `Scene ${idx + 1}`,
      context: entry.context || '',
      canvas: { nodes: entry.nodes || [], edges: entry.edges || [] },
      code: Array.isArray(entry.code) ? entry.code : [],
    }));
    sceneCounter.current = newScenes.length;
    setScenes(newScenes);
    setActiveSceneId(newScenes[0].id);
    setCanvas(JSON.stringify(newScenes[0].canvas));

    const hasCode = newScenes.some((s) => s.code.length > 0);
    if (hasCode) {
      setIsCodePanelOpen(true);
      setHasNewCode(false);
    }

    return { success: true };
  }, []);

  const handleStartConversation = useCallback(async () => {
    logger.debug('🚀 Starting conversation...', { id });

    if (!trainingSession?.signedUrl && !trainingSession?.agentId) {
      setConversationError('Session data not available. Please try refreshing the page.');
      return;
    }

    try {
      setConversationError(null);
      setVoiceState('active');

      await elevenLabsService.startConversation(
        id!,
        trainingSession.signedUrl ?? '',
        trainingSession.agentId ?? '',
        trainingSession.userProfile || { firstName: '', seniority: null },
        {
          onStateChange: (state) => setConversationState(state),
          onMessage: (message: any) => {
            const src = message?.source;
            if (src === 'ai' || src === 'agent') {
              const content = message?.message || message?.text || message?.content;
              if (typeof content === 'string' && content) setCurrentInterviewerText(content);
            }
          },
          onTranscript: (transcript) => {
            setTranscripts((prev) => [...prev, { ...transcript, id: `transcript-${Date.now()}` }]);
            if ((transcript.role === 'assistant' || (transcript.role as any) === 'agent') && transcript.content.trim()) {
              setCurrentInterviewerText(transcript.content);
            }
          },
          onError: (err) => {
            logger.error('🔥 Voice conversation error:', { error: String(err) });
            setConversationError(typeof err === 'string' ? err : String(err));
          },
          onConnect: async () => logger.debug('Voice conversation connected'),
          onDisconnect: () => logger.debug('Voice conversation disconnected'),
        },
        {
          updateScenes,
          callAgent: async (params: { agent: string; prompt: string }) => {
            elevenLabsService.sendContextualUpdate(
              "I'm looking into the codebase, give me a moment…"
            );
            try {
              const res = await fetch(`/api/session/${id}/call-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent: params.agent, prompt: params.prompt }),
              });
              const data = await res.json();
              return data.result ?? data.error ?? 'No result';
            } catch (err) {
              logger.error('callAgent failed:', err);
              return 'Failed to explore the codebase.';
            }
          },
        },
        trainingSession.title,
        plan,
        whiteboard
      );
    } catch (err: unknown) {
      logger.error('🔥 Failed to start conversation:', err);
      const msg = err instanceof Error ? err.message : 'Failed to start voice conversation';
      setConversationError(msg);
    }
  }, [id, trainingSession, updateScenes, plan, whiteboard]);

  const handleEndConversation = async () => {
    try {
      if (elevenLabsService.isConnected()) await elevenLabsService.endConversation();
      setVoiceState('ended');
    } catch (err) {
      logger.error('Error ending conversation:', err);
      setVoiceState('ended');
    }
  };

  const handleDiscardConversation = () => {
    setVoiceState('ready');
    setTranscripts([]);
    setConversationState(null);
    setConversationError(null);
  };

  const handleCanvasChange = useCallback(() => {
    if (voiceState !== 'active' || !elevenLabsService.isConnected()) return;
    if (!(window as any).__getFinalCanvas) return;
    const liveCanvas = (window as any).__getFinalCanvas();
    const allScenes = scenes.map((s) => ({
      name: s.name,
      context: s.context,
      ...(s.id === activeSceneId ? liveCanvas : s.canvas),
      code: s.code,
    }));
    const message = `Here is the current whiteboard state:\n${JSON.stringify(allScenes, null, 2)}`;
    logger.debug('📊 Sending canvas update to ElevenLabs');
    elevenLabsService.sendContextualUpdate(message);
  }, [voiceState, scenes, activeSceneId]);

  const handleManualSendCanvas = useCallback(() => {
    if (!(window as any).__getFinalCanvas) return;
    const liveCanvas = (window as any).__getFinalCanvas();
    const allScenes = scenes.map((s) => ({
      name: s.name,
      context: s.context,
      ...(s.id === activeSceneId ? liveCanvas : s.canvas),
      code: s.code,
    }));
    const message = `Here is the current whiteboard state:\n${JSON.stringify(allScenes, null, 2)}`;
    logger.debug('📊 Manually sending canvas update to ElevenLabs');
    elevenLabsService.sendContextualUpdate(message);
  }, [scenes, activeSceneId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-lg text-gray-700">Loading session...</span>
        </div>
      </div>
    );
  }

  if (error || !trainingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-100 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold text-red-800 mb-4">Session Not Found</h1>
          <p className="text-red-600 mb-6">
            {error?.message || 'Could not load session data.'}
          </p>
          <Button onClick={() => navigate('/')} className="bg-blue-600 hover:bg-blue-700 text-white">
            Go to Sessions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-100">
      <div className="h-screen w-full flex">
        {/* Left Panel */}
        {isPanelOpen && (
        <aside className="w-[340px] flex-shrink-0 bg-white/80 backdrop-blur-sm border-r border-gray-200 shadow-lg z-10 flex flex-col">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2">
                <img src={logo} alt="Vix" className="h-7" />
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsPanelOpen(false)}
                title="Close panel"
              >
                <PanelLeftClose className="h-4 w-4 text-gray-600" />
              </Button>
            </div>
          </div>

          {/* AI Avatar + Action buttons row */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-stretch gap-3 h-[133px]">
            <div className="basis-2/3 h-full rounded-lg overflow-hidden border border-gray-300 flex-shrink-0">
              <AIAvatar
                isAISpeaking={conversationState?.isSpeaking || false}
                voiceState={voiceState}
                conversationState={conversationState}
                conversationError={conversationError}
              />
            </div>
            <div className="basis-1/3 flex flex-col gap-2 min-w-0 justify-center">
              {voiceState === 'ready' && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white w-full h-8 px-2"
                  onClick={handleStartConversation}
                >
                  <Play className="h-3 w-3 mr-1 fill-white" />
                  <span className="text-xs">Start</span>
                </Button>
              )}
              {voiceState === 'active' && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="bg-red-500 hover:bg-red-600 text-white w-full h-8 px-2"
                  onClick={handleEndConversation}
                >
                  <Square className="h-3 w-3 mr-1 fill-white" />
                  <span className="text-xs">End</span>
                </Button>
              )}
              {voiceState === 'ended' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 px-2"
                  onClick={handleDiscardConversation}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  <span className="text-xs">New</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 px-2"
                onClick={() => setShowCancelDialog(true)}
              >
                <X className="h-3 w-3 mr-1" />
                <span className="text-xs">Cancel</span>
              </Button>
            </div>
          </div>

          {/* Microphone level + mute toggle */}
          <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !isMuted;
                setIsMuted(next);
                elevenLabsService.setMicrophoneMuted(next).catch(() => {});
              }}
              className={`flex-shrink-0 flex items-center justify-center transition-colors ${
                isMuted ? 'text-red-600 hover:text-red-700' : 'text-gray-700 hover:text-gray-900'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            {isMuted && (
              <span className="text-[10px] tabular-nums text-gray-500 w-8 text-right">OFF</span>
            )}
            <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  isMuted ? 'bg-gray-400' : 'bg-green-500'
                }`}
                style={{
                  width: `${isMuted ? 0 : micLevel}%`,
                }}
              />
            </div>

          </div>

          {/* Current directory */}
          <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2">
            <Folder className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-gray-700 truncate">
              {trainingSession.title || 'Whiteboard'}
            </span>
          </div>

          {/* Scenes + Transcript collapsible sections */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* SCREENS */}
            <Collapsible open={isScenesOpen} onOpenChange={setIsScenesOpen} className="flex flex-col min-h-0">
              <CollapsibleTrigger className="px-4 py-2 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Scenes</h2>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${isScenesOpen ? '' : '-rotate-90'}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden">
                <div className="px-3 py-2 space-y-1">
                  {scenes.map((s) => {
                    const isActive = s.id === activeSceneId;
                    const isDragging = draggingSceneId === s.id;
                    const isDragOver = dragOverSceneId === s.id && draggingSceneId && draggingSceneId !== s.id;
                    return (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingSceneId(s.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', s.id);
                        }}
                        onDragEnd={() => { setDraggingSceneId(null); setDragOverSceneId(null); }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverSceneId !== s.id) setDragOverSceneId(s.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverSceneId === s.id) setDragOverSceneId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const sourceId = e.dataTransfer.getData('text/plain') || draggingSceneId;
                          if (sourceId) reorderScenes(sourceId, s.id);
                          setDraggingSceneId(null);
                          setDragOverSceneId(null);
                        }}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                          isActive ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                        } ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-blue-400' : ''}`}
                        onClick={() => switchScene(s.id)}
                      >
                        <span
                          className="text-gray-300 group-hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0"
                          title="Drag to reorder"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <Monitor className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                        <span className={`text-sm truncate flex-1 ${isActive ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                          {s.name}
                        </span>
                        <button
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); renameScene(s.id); }}
                          title="Rename scene"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        {scenes.length > 1 && (
                          <button
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); removeScene(s.id); }}
                            title="Remove scene"
                          >
                            <Trash className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs text-gray-600 hover:text-gray-900 mt-1"
                    onClick={addScene}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add scene
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* TRANSCRIPT */}
            <Collapsible
              open={isTranscriptOpen}
              onOpenChange={setIsTranscriptOpen}
              className={`flex flex-col border-t border-gray-200 ${isTranscriptOpen ? 'flex-1 min-h-0' : ''}`}
            >
              <CollapsibleTrigger className="px-4 py-2 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Transcript</h2>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${isTranscriptOpen ? '' : '-rotate-90'}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex-1 min-h-0 overflow-hidden data-[state=open]:flex data-[state=open]:flex-col">
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {transcripts.length === 0 && conversationState?.status !== 'processing' ? (
                    <p className="text-sm text-gray-400 italic">
                      Conversation transcript will appear here once the session starts.
                    </p>
                  ) : (
                    transcripts.map((t) => {
                      const role = t.role as any;
                      const isAI = role === 'assistant' || role === 'agent';
                      const isTool = role === 'tool';

                      if (isTool) {
                        const tool: any = t as any;
                        return (
                          <div key={t.id} className="w-full text-xs text-gray-500 italic px-1 text-center">
                            Vix used the tool <code className="font-mono not-italic text-gray-700">`{tool.toolName || 'unknown'}`</code>
                          </div>
                        );
                      }

                      return (
                        <div key={t.id} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                              isAI
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-blue-500 text-white'
                            }`}
                          >
                            <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${isAI ? 'text-gray-500' : 'text-blue-100'}`}>
                              {isAI ? 'Vix' : 'You'}
                            </div>
                            <div className="whitespace-pre-wrap break-words">{t.content}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {conversationState?.status === 'processing' && voiceState === 'active' && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Vix</div>
                        <div className="flex gap-1 items-center h-3">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </aside>
        )}

        {!isPanelOpen && (
          <Button
            variant="outline"
            size="icon"
            className="absolute top-4 left-4 z-20 bg-white/90 h-8 w-8"
            onClick={() => setIsPanelOpen(true)}
            title="Open panel"
          >
            <PanelLeftOpen className="h-4 w-4 text-gray-700" />
          </Button>
        )}

        {/* Right side: canvas area */}
        <div className="flex-1 relative">
          {/* Cancel Confirmation Dialog */}
          <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel session?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to cancel? Any unsaved progress will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Go Back</AlertDialogCancel>
                <AlertDialogAction onClick={() => navigate('/')}>Cancel</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Error Message */}
          {conversationError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-2xl w-full px-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-600 text-xs">!</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-red-800 font-medium">Connection Error</p>
                    <p className="text-xs text-red-600 mt-1">{conversationError}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Full Canvas */}
          <div className="absolute inset-0">
            <SystemDesignCanvas onCanvasChange={handleCanvasChange} />
          </div>


        {/* Bottom Floating Menu Bar */}
        <Card className="absolute left-1/2 bottom-6 -translate-x-1/2 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-xl z-20 rounded-full">
          <div className="px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => (window as any).__addFlowNode?.('rectangle')} title="Add Rectangle">
              <Square className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => (window as any).__addFlowNode?.('diamond')} title="Add Diamond">
              <Diamond className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => (window as any).__addFlowNode?.('textbox')} title="Add Text">
              <Type className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => (window as any).__addFlowNode?.('database')} title="Add Database">
              <Database className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => (window as any).__reactFlowZoomOut?.()} title="Zoom Out">
              <ZoomOut className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="sm" className="rounded-full hover:bg-gray-100 px-3 min-w-[60px]"
              onClick={() => (window as any).__reactFlowResetZoom?.()} title="Reset Zoom">
              <span className="text-sm font-medium text-gray-700">{zoomPercentage}%</span>
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => (window as any).__reactFlowZoomIn?.()} title="Zoom In">
              <ZoomIn className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => (window as any).__reactFlowCenterView?.()} title="Center View">
              <Maximize className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100 relative"
              onClick={() => {
                setIsCodePanelOpen((v) => {
                  const next = !v;
                  if (next) setHasNewCode(false);
                  return next;
                });
              }} title="Toggle Code Panel">
              <Code2 className={`h-5 w-5 ${isCodePanelOpen ? 'text-primary' : 'text-gray-700'}`} />
              {hasNewCode && !isCodePanelOpen && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none ring-2 ring-white">
                  !
                </span>
              )}
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={() => setIsImportOpen(true)} title="Import JSON">
              <Upload className="h-5 w-5 text-gray-700" />
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100"
              onClick={handleExportJson} title="Export JSON">
              <Download className="h-5 w-5 text-gray-700" />
            </Button>
          </div>
        </Card>

        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import canvas JSON</DialogTitle>
              <DialogDescription>
                Paste a canvas JSON object with <code>nodes</code> and <code>edges</code> arrays. This will replace the current canvas.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"nodes": [...], "edges": [...]}'
              className="font-mono text-xs min-h-[300px]"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
              <Button onClick={handleImportJson} disabled={!importJson.trim()}>Import</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Interviewer Text */}
        {showInterviewerText && voiceState === 'active' && currentInterviewerText && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 max-w-3xl w-full px-4">
            <InterviewerText currentText={currentInterviewerText} />
          </div>
        )}
        </div>

        {/* Right Code Panel */}
        {isCodePanelOpen && codeArtifacts.length > 0 && (
          <CodePanel artifacts={codeArtifacts} onClose={() => setIsCodePanelOpen(false)} />
        )}
      </div>
    </div>
  );
};

export default WhiteboardPage;
