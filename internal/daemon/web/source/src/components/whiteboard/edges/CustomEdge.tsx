import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />

      {/* Show handles at source and target when selected */}
      {selected && (
        <>
          {/* Source handle */}
          <circle
            cx={sourceX}
            cy={sourceY}
            r={6}
            fill="#000000"
            stroke="#ffffff"
            strokeWidth={2}
            pointerEvents="none"
          />

          {/* Target handle */}
          <circle
            cx={targetX}
            cy={targetY}
            r={6}
            fill="#000000"
            stroke="#ffffff"
            strokeWidth={2}
            pointerEvents="none"
          />
        </>
      )}
    </>
  );
}
