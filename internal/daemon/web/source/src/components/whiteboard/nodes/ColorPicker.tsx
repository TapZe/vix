import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Paintbrush } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#64748b', // slate
  '#6b7280', // gray
  '#000000', // black
  '#ffffff', // white
];

export const ColorPicker = ({ color, onChange, label = 'Color' }: ColorPickerProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Paintbrush className="h-4 w-4" />
          <div
            className="h-4 w-4 rounded border border-gray-300"
            style={{ backgroundColor: color }}
          />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div className="text-sm font-medium">{label}</div>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((presetColor) => (
              <button
                key={presetColor}
                className="h-8 w-8 rounded border-2 border-gray-300 hover:border-blue-500 transition-colors"
                style={{ backgroundColor: presetColor }}
                onClick={() => onChange(presetColor)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-full rounded border border-gray-300 cursor-pointer"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
