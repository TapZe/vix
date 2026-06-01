import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import RectangleNode from './nodes/RectangleNode';
import DiamondNode from './nodes/DiamondNode';
import TextBoxNode from './nodes/TextBoxNode';
import DatabaseNode from './nodes/DatabaseNode';
import CustomEdge from './edges/CustomEdge';

interface SystemDesignCanvasProps {
  onAddNode?: (type: 'rectangle' | 'diamond' | 'textbox' | 'database') => void;
  onCanvasChange?: () => void;
}

interface FlowCanvasProps extends SystemDesignCanvasProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: any;
  setEdges: any;
  onNodesChange: any;
  onEdgesChange: any;
  notifyCanvasChange: () => void;
  idCounters: React.MutableRefObject<{ node: number; edge: number }>;
}

const nodeTypes = {
  rectangle: RectangleNode,
  diamond: DiamondNode,
  textbox: TextBoxNode,
  database: DatabaseNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function nextNodeId(counters: React.MutableRefObject<{ node: number; edge: number }>): string {
  counters.current.node += 1;
  return `node_${counters.current.node}`;
}

function nextEdgeId(counters: React.MutableRefObject<{ node: number; edge: number }>): string {
  counters.current.edge += 1;
  return `edge_${counters.current.edge}`;
}

// Advance counters past any IDs already present in the incoming canvas
function syncCounters(
  counters: React.MutableRefObject<{ node: number; edge: number }>,
  nodes: any[],
  edges: any[]
) {
  for (const n of nodes) {
    const m = String(n.id).match(/^node_(\d+)$/);
    if (m) counters.current.node = Math.max(counters.current.node, parseInt(m[1]));
  }
  for (const e of edges) {
    const m = String(e.id).match(/^edge_(\d+)$/);
    if (m) counters.current.edge = Math.max(counters.current.edge, parseInt(m[1]));
  }
}

// Inner component that uses React Flow hooks
const FlowCanvas = ({ nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange, onAddNode, notifyCanvasChange, idCounters }: FlowCanvasProps) => {
  const [canvasEvents, setCanvasEvents] = useState<any[]>([]);
  const reactFlowInstance = useReactFlow();

  // Get current timestamp from interview timer (in seconds)
  const getTimestamp = (): number => {
    const getElapsedSeconds = (window as any).__getElapsedSeconds;
    if (typeof getElapsedSeconds === 'function') {
      return getElapsedSeconds();
    }
    return 0;
  };

  // Record node event
  const recordNodeEvent = useCallback((eventType: 'add' | 'update' | 'delete', node: Node) => {
    const event: any = {
      event_type: eventType,
      timestamp: getTimestamp(),
      element: 'node',
      id: node.id,
    };

    if (eventType !== 'delete') {
      const position = node.position || { x: 0, y: 0 };

      event.shape = node.type || 'rectangle';
      event.x = Math.round(position.x);
      event.y = Math.round(position.y);
      event.color = node.data?.fillColor || node.data?.backgroundColor || '#3b82f6';
      event.border_color = node.data?.borderColor || '#1d4ed8';
      event.label = node.data?.label || '';
      event.text_alignment = node.data?.textAlign || 'center';
    }

    setCanvasEvents(prev => [...prev, event]);
  }, []);

  // Record edge event
  const recordEdgeEvent = useCallback((eventType: 'add' | 'update' | 'delete', edge: Edge) => {
    const event: any = {
      event_type: eventType,
      timestamp: getTimestamp(),
      element: 'edge',
      id: edge.id,
    };

    if (eventType !== 'delete') {
      event.from = edge.source;
      event.from_handle = edge.sourceHandle || 'bottom';
      event.to = edge.target;
      event.to_handle = edge.targetHandle || 'top';
    }

    setCanvasEvents(prev => [...prev, event]);
  }, []);

  // Generate final canvas state in the shared JSON schema
  const generateFinalCanvas = useCallback(() => {
    const finalNodes = nodes.map(node => ({
      id: node.id,
      shape: node.type || 'rectangle',
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      label: node.data?.label || '',
      color: node.data?.fillColor || node.data?.backgroundColor || '#3b82f6',
      border_color: node.data?.borderColor || '#1d4ed8',
      text_alignment: node.data?.textAlign || 'center',
    }));

    const finalEdges = edges.map(edge => ({
      id: edge.id,
      from: edge.source,
      from_handle: edge.sourceHandle || 'bottom',
      to: edge.target,
      to_handle: edge.targetHandle || 'top',
    }));

    return { nodes: finalNodes, edges: finalEdges };
  }, [nodes, edges]);

  // Update edge styles based on selection state
  useEffect(() => {
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (edge.selected) {
          return {
            ...edge,
            animated: false,
            style: {
              stroke: '#000000',
              strokeWidth: 2,
              strokeDasharray: 'none'
            },
            markerEnd: {
              type: 'arrowclosed',
              color: '#000000',
            },
          };
        } else {
          return {
            ...edge,
            animated: true,
            style: {
              stroke: '#000000',
              strokeWidth: 2
            },
            markerEnd: {
              type: 'arrowclosed',
              color: '#000000',
            },
          };
        }
      })
    );
  }, [edges.map(e => e.selected).join(','), setEdges]);

  // Add a node at the viewport center (used by toolbar buttons)
  const addNode = useCallback(
    (type: 'rectangle' | 'diamond' | 'textbox' | 'database') => {
      const viewport = reactFlowInstance.getViewport();
      const canvasElement = document.querySelector('.react-flow__renderer');
      const canvasWidth = canvasElement?.clientWidth || 800;
      const canvasHeight = canvasElement?.clientHeight || 600;

      const centerX = (canvasWidth / 2 - viewport.x) / viewport.zoom;
      const centerY = (canvasHeight / 2 - viewport.y) / viewport.zoom;

      const newNode: Node = {
        id: nextNodeId(idCounters),
        type,
        position: { x: centerX, y: centerY },
        data: {
          label: type === 'rectangle' ? 'Rectangle' : type === 'diamond' ? 'Diamond' : type === 'textbox' ? 'Text' : 'Database',
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, reactFlowInstance, idCounters]
  );

  (window as any).__addFlowNode = addNode;

  // Expose a positioned addNode for legacy use (kept for backward compat with toolbar)
  (window as any).__addFlowNodeAt = (
    type: 'rectangle' | 'diamond' | 'textbox' | 'database',
    xPct: number,
    yPct: number,
    label?: string,
    color?: string
  ): string => {
    const viewport = reactFlowInstance.getViewport();
    const canvasElement = document.querySelector('.react-flow__renderer');
    const canvasWidth = canvasElement?.clientWidth || 800;
    const canvasHeight = canvasElement?.clientHeight || 600;

    const flowX = (xPct / 100 * canvasWidth - viewport.x) / viewport.zoom;
    const flowY = (yPct / 100 * canvasHeight - viewport.y) / viewport.zoom;

    const defaultLabel = type === 'rectangle' ? 'Rectangle' : type === 'diamond' ? 'Diamond' : type === 'textbox' ? 'Text' : 'Database';
    const nodeId = nextNodeId(idCounters);
    const newNode: Node = {
      id: nodeId,
      type,
      position: { x: flowX, y: flowY },
      data: {
        label: label || defaultLabel,
        ...(color ? { fillColor: color, backgroundColor: color } : {}),
      },
    };
    setNodes((nds) => [...nds, newNode]);
    return nodeId;
  };

  (window as any).__clearCanvas = () => {
    setNodes([]);
    setEdges([]);
  };

  (window as any).__connectNodes = (fromId: string, toId: string): string => {
    const edgeId = nextEdgeId(idCounters);
    setEdges((eds) =>
      addEdge(
        {
          id: edgeId,
          source: fromId,
          target: toId,
          type: 'custom',
          animated: true,
          style: { stroke: '#000000', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#000000' },
        },
        eds
      )
    );
    return edgeId;
  };

  // Full canvas replacement from JSON — the shared model used by both the AI and the canvas
  (window as any).__setCanvas = (jsonStr: string) => {
    let parsed: { nodes: any[]; edges: any[] };
    try {
      parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch {
      return { success: false, error: 'Invalid JSON' };
    }

    const incomingNodes: Node[] = (parsed.nodes || []).map((n: any) => {
      const shape = n.shape || 'rectangle';
      const isTextBox = shape === 'textbox';
      return {
        id: String(n.id),
        type: shape,
        position: { x: Number(n.x) || 0, y: Number(n.y) || 0 },
        data: {
          label: n.label || '',
          // textbox uses backgroundColor for its background (default: transparent)
          // all other shapes use fillColor for their fill (default: blue)
          fillColor: isTextBox ? undefined : (n.color || '#3b82f6'),
          backgroundColor: isTextBox ? (n.color || 'transparent') : undefined,
          borderColor: isTextBox ? undefined : (n.border_color || '#1d4ed8'),
          textAlign: n.text_alignment || (isTextBox ? 'left' : 'center'),
        },
      };
    });

    const incomingEdges: Edge[] = (parsed.edges || []).map((e: any) => ({
      id: String(e.id),
      source: String(e.from),
      sourceHandle: e.from_handle || 'bottom',
      target: String(e.to),
      targetHandle: e.to_handle || 'top',
      type: 'custom',
      animated: true,
      style: { stroke: '#000000', strokeWidth: 2 },
      markerEnd: { type: 'arrowclosed', color: '#000000' },
    }));

    syncCounters(idCounters, incomingNodes, incomingEdges);
    setNodes(incomingNodes);
    setEdges(incomingEdges);
    return { success: true };
  };

  (window as any).__exportFlowData = () => {
    return { nodes, edges };
  };

  // Expose React Flow zoom methods for toolbar controls
  (window as any).__reactFlowZoomIn = () => reactFlowInstance.zoomIn();
  (window as any).__reactFlowZoomOut = () => reactFlowInstance.zoomOut();
  (window as any).__reactFlowCenterView = () => {
    const currentZoom = reactFlowInstance.getZoom();

    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(node => {
      const x = node.position.x;
      const y = node.position.y;
      const width = node.width || node.measured?.width || 150;
      const height = node.height || node.measured?.height || 80;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    reactFlowInstance.setCenter(centerX, centerY, { zoom: currentZoom, duration: 800 });
  };
  (window as any).__reactFlowResetZoom = () => reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
  (window as any).__reactFlowGetZoom = () => reactFlowInstance.getZoom();

  // Expose canvas events and final canvas via window object
  (window as any).__getCanvasEvents = () => canvasEvents;
  (window as any).__getFinalCanvas = generateFinalCanvas;

  // Handle keyboard deletion of selected nodes and edges
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target as HTMLElement;
        if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }

        setNodes((nodes) => nodes.filter((node) => !node.selected));
        setEdges((edges) => edges.filter((edge) => !edge.selected));

        notifyCanvasChange();

        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setNodes, setEdges, notifyCanvasChange]);

  return (
    <>
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#94a3b8"
      />
      <MiniMap
        nodeStrokeWidth={3}
        zoomable
        pannable
        className="bg-white/80 backdrop-blur-sm"
      />
    </>
  );
};

// Outer wrapper component that provides ReactFlow context
export const SystemDesignCanvas = (props: SystemDesignCanvasProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idCounters = useRef({ node: 0, edge: 0 });

  const notifyCanvasChange = useCallback(() => {
    if (!props.onCanvasChange) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      props.onCanvasChange!();
      debounceTimerRef.current = null;
    }, 500);
  }, [props.onCanvasChange]);

  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    notifyCanvasChange();
  }, [onNodesChange, notifyCanvasChange]);

  const handleEdgesChange = useCallback((changes: any) => {
    onEdgesChange(changes);
    notifyCanvasChange();
  }, [onEdgesChange, notifyCanvasChange]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: `edge_${++idCounters.current.edge}`,
            type: 'custom',
            animated: true,
            style: { stroke: '#000000', strokeWidth: 2 },
            markerEnd: {
              type: 'arrowclosed',
              color: '#000000',
            },
          },
          eds
        )
      );
      notifyCanvasChange();
    },
    [setEdges, notifyCanvasChange]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
        minZoom={0.1}
        maxZoom={2}
        connectionMode={ConnectionMode.Loose}
        proOptions={{ hideAttribution: true }}
      >
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          notifyCanvasChange={notifyCanvasChange}
          idCounters={idCounters}
          {...props}
        />
      </ReactFlow>
    </div>
  );
};
