import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, NodeResizeControl, useReactFlow } from '@xyflow/react';
import { ColorPicker } from './ColorPicker';

export interface DatabaseNodeData {
  label: string;
  fillColor?: string;
  borderColor?: string;
}

// Utility function to darken a hex color
const darkenColor = (hex: string, factor: number = 0.65): string => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

const DatabaseNode = ({ id, data, selected, width, height }: NodeProps) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const nodeData = data as unknown as DatabaseNodeData;
  const [label, setLabel] = useState(nodeData.label || 'Database');
  const [fillColor, setFillColor] = useState(nodeData.fillColor || '#10b981');
  const [borderColor, setBorderColor] = useState(nodeData.borderColor || '#059669');
  const textRef = useRef<HTMLDivElement>(null);

  const nodeWidth = width || 128;
  const nodeHeight = height || 140;

  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(textRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  // Sync from external data changes (e.g. AI canvas updates)
  useEffect(() => {
    if (!isEditing) setLabel(nodeData.label || 'Database');
  }, [nodeData.label, isEditing]);

  useEffect(() => {
    setFillColor(nodeData.fillColor || '#10b981');
  }, [nodeData.fillColor]);

  // Automatically update border color when fill color changes
  useEffect(() => {
    setBorderColor(darkenColor(fillColor));
  }, [fillColor]);

  // Persist color changes to React Flow state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, fillColor, borderColor } }
          : node
      )
    );
  }, [fillColor, borderColor, id, setNodes]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (textRef.current) {
      const newLabel = textRef.current.innerText || 'Database';
      setLabel(newLabel);
      // Persist to React Flow state
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, label: newLabel } }
            : node
        )
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleBlur();
    }
  };

  // Calculate dynamic coordinates for cylinder
  const bodyHeight = nodeHeight - 40;
  const bottomY = nodeHeight - 20;

  return (
    <div className="relative" style={{ width: nodeWidth, height: nodeHeight }}>
      {/* Resize Control - only show when selected */}
      {selected && (
        <NodeResizeControl
          style={{
            background: 'transparent',
            border: 'none',
          }}
          minWidth={120}
          minHeight={140}
        >
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-tl cursor-nwse-resize" />
        </NodeResizeControl>
      )}

      {/* Database Cylinder Shape */}
      <div
        className="w-full h-full relative"
        style={{
          outline: selected ? '2px solid #10b981' : 'none',
          outlineOffset: '2px',
        }}
        onDoubleClick={handleDoubleClick}
      >
        <svg viewBox={`0 0 120 ${nodeHeight}`} className="w-full h-full" preserveAspectRatio="none">
          {/* Top ellipse */}
          <ellipse
            cx="60"
            cy="20"
            rx="50"
            ry="12"
            fill={fillColor}
            stroke={borderColor}
            strokeWidth="2"
          />

          {/* Body - filled rectangle behind */}
          <rect
            x="10"
            y="20"
            width="100"
            height={bodyHeight}
            fill={fillColor}
            stroke="none"
          />

          {/* Left side line */}
          <line
            x1="10"
            y1="20"
            x2="10"
            y2={bottomY}
            stroke={borderColor}
            strokeWidth="2"
          />

          {/* Right side line */}
          <line
            x1="110"
            y1="20"
            x2="110"
            y2={bottomY}
            stroke={borderColor}
            strokeWidth="2"
          />

          {/* Bottom ellipse */}
          <ellipse
            cx="60"
            cy={bottomY}
            rx="50"
            ry="12"
            fill={fillColor}
            stroke={borderColor}
            strokeWidth="2"
          />
        </svg>

        {/* Text overlay - positioned absolutely outside SVG to prevent distortion */}
        <div
          className="absolute inset-0 flex items-center justify-center px-4 py-8"
          style={{ pointerEvents: isEditing ? 'auto' : 'none' }}
        >
          <div
            ref={textRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="text-white font-medium text-center outline-none cursor-default w-full"
            style={{
              userSelect: isEditing ? 'text' : 'none',
              whiteSpace: 'pre-wrap',
              fontFamily: 'Virgil, sans-serif',
              fontSize: '14px',
              pointerEvents: 'auto',
            }}
          >
            {label}
          </div>
        </div>
      </div>

      {/* Color Picker Toolbar - only show when selected */}
      {selected && !isEditing && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex gap-2 bg-white rounded-lg shadow-lg p-2 border border-gray-200 z-10">
          <ColorPicker
            color={fillColor}
            onChange={setFillColor}
            label="Color"
          />
        </div>
      )}

      {/* Connection Handles - always rendered but only visible when selected */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className="w-3 h-3 !bg-gray-400"
        style={{ opacity: selected ? 1 : 0, transition: 'opacity 0.2s' }}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-gray-400"
        style={{ opacity: selected ? 1 : 0, transition: 'opacity 0.2s' }}
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400"
        style={{ opacity: selected ? 1 : 0, transition: 'opacity 0.2s' }}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-gray-400"
        style={{ opacity: selected ? 1 : 0, transition: 'opacity 0.2s' }}
      />
    </div>
  );
};

export default memo(DatabaseNode);
