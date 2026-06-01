import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, NodeResizeControl, useReactFlow } from '@xyflow/react';
import { ColorPicker } from './ColorPicker';

export interface RectangleNodeData {
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

const RectangleNode = ({ id, data, selected, width, height }: NodeProps) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const nodeData = data as unknown as RectangleNodeData;
  const [label, setLabel] = useState(nodeData.label || 'Rectangle');
  const [fillColor, setFillColor] = useState(nodeData.fillColor || '#3b82f6');
  const [borderColor, setBorderColor] = useState(nodeData.borderColor || '#1d4ed8');
  const textRef = useRef<HTMLDivElement>(null);

  const nodeWidth = width || 150;
  const nodeHeight = height || 80;

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
    if (!isEditing) setLabel(nodeData.label || 'Rectangle');
  }, [nodeData.label, isEditing]);

  useEffect(() => {
    setFillColor(nodeData.fillColor || '#3b82f6');
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
    // Update node data
    if (textRef.current) {
      const newLabel = textRef.current.innerText || 'Rectangle';
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

  return (
    <div className="relative" style={{ width: nodeWidth, height: nodeHeight }}>
      {/* Resize Control - only show when selected */}
      {selected && (
        <NodeResizeControl
          style={{
            background: 'transparent',
            border: 'none',
          }}
          minWidth={100}
          minHeight={60}
        >
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-tl cursor-nwse-resize" />
        </NodeResizeControl>
      )}

      {/* Main Rectangle */}
      <div
        className="px-4 py-3 rounded shadow-md transition-all"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fillColor,
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: borderColor,
          outline: selected ? '2px solid #3b82f6' : 'none',
          outlineOffset: '2px',
        }}
        onDoubleClick={handleDoubleClick}
      >
        <div
          ref={textRef}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="text-white font-medium text-center outline-none select-none cursor-default"
          style={{ userSelect: isEditing ? 'text' : 'none', whiteSpace: 'pre-wrap', fontFamily: 'Virgil, sans-serif' }}
        >
          {label}
        </div>
      </div>

      {/* Color Picker Toolbar - only show when selected */}
      {selected && !isEditing && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex gap-2 bg-white rounded-lg shadow-lg p-2 border border-gray-200">
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

export default memo(RectangleNode);
