import { HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
            navigate('/glossary');
          }}
          className={`inline-flex items-center text-muted-foreground/60 hover:text-primary transition-colors ${className}`}
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
