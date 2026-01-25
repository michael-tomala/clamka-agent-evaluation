import { Box, Typography } from '@mui/material';
import type { ContentBlock } from '../api/client';

interface ContentBlockViewProps {
  block: ContentBlock;
}

/**
 * Komponent do renderowania pojedynczego bloku zawartości wiadomości
 */
export function ContentBlockView({ block }: ContentBlockViewProps) {
  if (block.type === 'text') {
    return (
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {block.text}
      </Typography>
    );
  }

  if (block.type === 'tool_use') {
    return (
      <Box sx={{ bgcolor: 'info.main', color: 'info.contrastText', p: 1, borderRadius: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">
          🔧 Tool: {block.name}
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            mt: 0.5,
            whiteSpace: 'pre-wrap',
            fontSize: 11,
            bgcolor: 'rgba(0,0,0,0.1)',
            p: 1,
            borderRadius: 0.5,
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          {JSON.stringify(block.input, null, 2)}
        </Box>
      </Box>
    );
  }

  if (block.type === 'tool_result') {
    // Parsuj content - może być string, tablica [{type, text}] lub obiekt
    let displayContent: string;

    if (typeof block.content === 'string') {
      displayContent = block.content;
    } else if (Array.isArray(block.content)) {
      // Iteruj po elementach i wyciągnij tylko "text"
      displayContent = (block.content as Array<{ type?: string; text?: string }>)
        .filter((item) => item.type === 'text' && item.text)
        .map((item) => {
          // Spróbuj sparsować text jako JSON dla ładnego formatowania
          try {
            const parsed = JSON.parse(item.text!);
            return JSON.stringify(parsed, null, 2);
          } catch {
            return item.text!;
          }
        })
        .join('\n');
    } else {
      displayContent = JSON.stringify(block.content, null, 2);
    }

    return (
      <Box
        sx={{
          bgcolor: block.is_error ? 'error.main' : 'success.main',
          color: block.is_error ? 'error.contrastText' : 'success.contrastText',
          p: 1,
          borderRadius: 1,
        }}
      >
        <Typography variant="subtitle2" fontWeight="bold">
          {block.is_error ? '❌ Error' : '✅ Result'}
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            mt: 0.5,
            whiteSpace: 'pre-wrap',
            fontSize: 11,
            bgcolor: 'rgba(0,0,0,0.1)',
            p: 1,
            borderRadius: 0.5,
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          {displayContent}
        </Box>
      </Box>
    );
  }

  if (block.type === 'thinking') {
    return (
      <Box sx={{ bgcolor: 'grey.800', p: 1, borderRadius: 1, fontStyle: 'italic' }}>
        <Typography variant="caption" color="grey.400">
          💭 Thinking...
        </Typography>
        <Typography variant="body2" color="grey.200" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
          {block.thinking}
        </Typography>
      </Box>
    );
  }

  return null;
}
