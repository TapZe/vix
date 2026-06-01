import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, NodeResizeControl, useReactFlow } from '@xyflow/react';
import { ColorPicker } from './ColorPicker';
import { TextAlignmentPicker } from './TextAlignmentPicker';

export interface TextBoxNodeData {
  label: string;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

const TextBoxNode = ({ id, data, selected, width, height }: NodeProps) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const nodeData = data as unknown as TextBoxNodeData;
  const [label, setLabel] = useState(nodeData.label || 'Text');
  const [textColor, setTextColor] = useState(nodeData.textColor || '#000000');
  const [backgroundColor, setBackgroundColor] = useState(nodeData.backgroundColor || 'transparent');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right' | 'justify'>(nodeData.textAlign || 'left');
  const textRef = useRef<HTMLDivElement>(null);

  const nodeWidth = width || 120;
  const nodeHeight = height || 60;

  // Persist color and alignment changes to React Flow state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, textColor, backgroundColor, textAlign } }
          : node
      )
    );
  }, [textColor, backgroundColor, textAlign, id, setNodes]);

  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(textRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  // Sync from external data changes (e.g. AI canvas updates)
  useEffect(() => {
    if (!isEditing) setLabel(nodeData.label || 'Text');
  }, [nodeData.label, isEditing]);

  useEffect(() => {
    setTextColor(nodeData.textColor || '#000000');
    setBackgroundColor(nodeData.backgroundColor || 'transparent');
    setTextAlign(nodeData.textAlign || 'left');
  }, [nodeData.textColor, nodeData.backgroundColor, nodeData.textAlign]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (textRef.current) {
      const newLabel = textRef.current.innerText || 'Text';
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
          minWidth={80}
          minHeight={40}
        >
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-gray-500 rounded-tl cursor-nwse-resize" />
        </NodeResizeControl>
      )}

      {/* Text Box */}
      <div
        className="px-3 py-2 rounded transition-all"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: backgroundColor,
          outline: selected ? '2px dashed #6b7280' : 'none',
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
          className="font-medium outline-none select-none cursor-default"
          style={{
            color: textColor,
            userSelect: isEditing ? 'text' : 'none',
            whiteSpace: 'pre-wrap',
            fontFamily: 'Virgil, sans-serif',
            textAlign: textAlign,
            width: '100%',
          }}
        >
          {label}
        </div>
      </div>

      {/* Color Picker Toolbar - only show when selected */}
      {selected && !isEditing && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex gap-2 bg-white rounded-lg shadow-lg p-2 border border-gray-200">
          <ColorPicker
            color={textColor}
            onChange={setTextColor}
            label="Text"
          />
          <TextAlignmentPicker
            alignment={textAlign}
            onChange={setTextAlign}
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

export default memo(TextBoxNode);
