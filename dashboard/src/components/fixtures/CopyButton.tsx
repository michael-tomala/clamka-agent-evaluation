import { useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';

interface CopyButtonProps {
  text: string;
  label?: string;
}

export function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Tooltip title={copied ? 'Skopiowano!' : label || 'Kopiuj ID'}>
      <IconButton size="small" onClick={handleCopy}>
        <CopyIcon fontSize="small" color={copied ? 'success' : 'inherit'} />
      </IconButton>
    </Tooltip>
  );
}
