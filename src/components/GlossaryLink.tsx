import { HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { glossaryHref } from '@/lib/glossary';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  term: string;
  className?: string;
}

const GlossaryLink = ({ term, className = '' }: Props) => {
  const navigate = useNavigate();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(glossaryHref(term));
          }}
          aria-label={`What is ${term}?`}
          // tap-area widens the target to about 40 px without moving the icon.
          className={`tap-area inline-flex items-center p-1.5 -m-1.5 text-muted-foreground hover:text-primary transition-colors ${className}`}
        >
          <HelpCircle size={12} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[200px]">
        <p>Learn about <span className="font-medium">{term}</span></p>
      </TooltipContent>
    </Tooltip>
  );
};

export default GlossaryLink;
