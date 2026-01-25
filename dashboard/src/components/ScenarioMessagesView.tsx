import { useRef, useEffect } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import type { RawMessage } from '../api/client';
import { ContentBlockView } from './ContentBlockView';

interface ScenarioMessagesViewProps {
  messages: RawMessage[];
  liveMode?: boolean;
}

/**
 * Komponent do wyświetlania historii wiadomości scenariusza
 */
export function ScenarioMessagesView({
  messages,
  liveMode = false,
}: ScenarioMessagesViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll w trybie live
  useEffect(() => {
    if (liveMode && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, liveMode]);

  return (
    <Box ref={containerRef}>
      {messages.map((msg, i) => (
        <Box
          key={i}
          sx={{
            mb: 1,
            p: 1.5,
            borderRadius: 1,
            maxWidth: '100%',
            overflowX: 'auto',
            wordBreak: 'break-word',
            borderLeft: msg.role === 'assistant' ? '3px solid' : '3px solid',
            borderColor: msg.role === 'assistant' ? 'primary.main' : 'secondary.main',
          }}
        >
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            {msg.role === 'assistant' ? '🤖 Assistant' : '👤 User'} •{' '}
            {new Date(msg.timestamp).toLocaleTimeString()}
          </Typography>
          <Stack spacing={1}>
            {msg.content.map((block, j) => (
              <ContentBlockView key={j} block={block} />
            ))}
          </Stack>
        </Box>
      ))}
      {messages.length === 0 && (
        <Typography color="text.secondary" textAlign="center" py={4}>
          {liveMode ? 'Oczekiwanie na wiadomości...' : 'Brak wiadomości'}
        </Typography>
      )}
    </Box>
  );
}
