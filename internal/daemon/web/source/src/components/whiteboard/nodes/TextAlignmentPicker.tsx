import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';

interface TextAlignmentPickerProps {
  alignment: 'left' | 'center' | 'right' | 'justify';
  onChange: (alignment: 'left' | 'center' | 'right' | 'justify') => void;
}

const alignmentIcons = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
};

export const TextAlignmentPicker = ({ alignment, onChange }: TextAlignmentPickerProps) => {
  const CurrentIcon = alignmentIcons[alignment];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <CurrentIcon className="h-4 w-4" />
          Align
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          {(Object.keys(alignmentIcons) as Array<keyof typeof alignmentIcons>).map((align) => {
            const Icon = alignmentIcons[align];
            return (
              <Button
                key={align}
                variant={alignment === align ? 'default' : 'ghost'}
                size="sm"
                className="w-10 h-10 p-0"
                onClick={() => onChange(align)}
                title={`Align ${align}`}
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
