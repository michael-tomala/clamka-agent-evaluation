import { useState } from 'react';
import { Box, Typography, Collapse, CircularProgress, Stack } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SendIcon from '@mui/icons-material/Send';
import type { RawMessage } from '../api/client';
import { ContentBlockView } from './ContentBlockView';

interface TransAgentInput {
  agentType: string;
  task: string;
  sessionId?: string;
}

interface TransAgentSectionProps {
  /** tool_use block wywolujacy trans agenta (id) */
  toolUseId: string;
  toolUseInput: TransAgentInput;
  /** Wiadomosci nalezace do tego trans agenta (filtowane po parentToolUseId) */
  childMessages: RawMessage[];
  /** Czy trans agent zakonczyl prace (mamy tool_result) */
  isResolved: boolean;
  /** Wynik trans agenta (tool_result content) */
  toolResult?: unknown;
}

/**
 * TransAgentSection - sekcja wyswietlajaca prace trans agenta
 *
 * Analogiczny do TransAgentContainer z glownej aplikacji, ale dostosowany
 * do struktury dashboard testing.
 *
 * Wyswietla:
 * - Naglowek z typem trans agenta i opisem zadania (skroconym)
 * - Status: CheckCircle (completed) lub CircularProgress (in progress)
 * - Zwijana sekcja z krokami trans agenta (wiadomosci + tool calls)
 */
export function TransAgentSection({
  toolUseId: _toolUseId, // Zachowane w props dla przyszlego uzycia (np. key w liscie)
  toolUseInput,
  childMessages,
  isResolved,
  toolResult,
}: TransAgentSectionProps) {
  const { agentType, task, sessionId } = toolUseInput;
  const [expanded, setExpanded] = useState(true);
  const [taskExpanded, setTaskExpanded] = useState(false);

  // Skroc task do pierwszych 100 znakow dla naglowka
  const shortTask = task.length > 100 ? task.slice(0, 100) + '...' : task;

  // Parsuj wynik JSON jesli mozliwe
  let parsedResult: { success?: boolean; result?: string; error?: string; sessionId?: string } | null = null;
  if (toolResult) {
    try {
      // toolResult moze byc string lub tablica [{type: 'text', text: '...'}]
      let textContent: string | undefined;
      if (typeof toolResult === 'string') {
        textContent = toolResult;
      } else if (Array.isArray(toolResult)) {
        const textBlock = (toolResult as Array<{ type: string; text?: string }>).find(
          (b) => b.type === 'text'
        );
        textContent = textBlock?.text;
      }
      if (textContent) {
        parsedResult = JSON.parse(textContent);
      }
    } catch {
      // Nie JSON
    }
  }

  return (
    <Box sx={{ mb: 1, ml: 1, borderLeft: '2px solid', borderColor: 'primary.dark', pl: 1.5 }}>
      {/* Naglowek - klikalny */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          py: 0.5,
          '&:hover': { opacity: 0.8 },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status indicator */}
        {isResolved ? (
          <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
        ) : (
          <CircularProgress size={14} />
        )}

        {/* Agent type */}
        <Typography variant="caption" fontWeight="bold" color="primary.main">
          {agentType}
        </Typography>

        {/* Session resume indicator */}
        {sessionId && (
          <Typography variant="caption" color="warning.main" sx={{ fontStyle: 'italic' }}>
            ↪ {sessionId.slice(0, 8)}...
          </Typography>
        )}

        {/* Short task */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {shortTask}
        </Typography>

        {/* Expand icon */}
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
        )}
      </Box>

      {/* Zawartosc - zwijana */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 0.5 }}>
          {/* Zadanie - collapsible */}
          <Box sx={{ py: 0.25 }}>
            <Box
              onClick={(e) => {
                e.stopPropagation();
                setTaskExpanded(!taskExpanded);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                cursor: 'pointer',
                '&:hover': { opacity: 0.8 },
              }}
            >
              <SendIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.disabled">
                Zadanie
              </Typography>
              {taskExpanded ? (
                <ExpandLessIcon sx={{ fontSize: 16, color: 'text.disabled', ml: 'auto' }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.disabled', ml: 'auto' }} />
              )}
            </Box>

            <Collapse in={taskExpanded}>
              <Box sx={{ mt: 0.5, mx: 0.5 }}>
                <Box
                  component="span"
                  sx={{
                    display: 'block',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontStyle: 'italic',
                    lineHeight: 1.25,
                    fontSize: '0.75rem',
                    color: 'text.disabled',
                  }}
                >
                  {task}
                </Box>
              </Box>
            </Collapse>
          </Box>

          {/* Wiadomosci trans agenta */}
          {childMessages.length > 0 ? (
            childMessages.map((msg, idx) => (
              <Box
                key={idx}
                sx={{
                  py: 0.5,
                  pl: 1,
                  borderLeft: '1px solid',
                  borderColor: msg.role === 'assistant' ? 'primary.light' : 'secondary.light',
                  ml: 0.5,
                  my: 0.25,
                }}
              >
                <Typography variant="caption" color="text.disabled" display="block" mb={0.5}>
                  {msg.role === 'assistant' ? 'Assistant' : 'Tool Result'}
                </Typography>
                <Stack spacing={0.5}>
                  {msg.content.map((block, j) => (
                    <ContentBlockView key={j} block={block} />
                  ))}
                </Stack>
              </Box>
            ))
          ) : !isResolved ? (
            <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', ml: 1 }}>
              Trans agent sie uruchamia...
            </Typography>
          ) : null}

          {/* Loader jesli w trakcie */}
          {!isResolved && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25, ml: 1 }}>
              <CircularProgress size={10} />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
                ...
              </Typography>
            </Box>
          )}

          {/* Finalna odpowiedz trans agenta - tool_result z runTransAgent */}
          {isResolved && parsedResult && (
            <Box
              sx={{
                mt: 0.5,
                p: 1,
                bgcolor: parsedResult.success ? 'success.dark' : 'error.dark',
                borderRadius: 1,
                maxHeight: 200,
                overflow: 'auto',
                ml: 1,
              }}
            >
              {parsedResult.success && parsedResult.result && (
                <Typography variant="body2" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                  {parsedResult.result}
                </Typography>
              )}
              {parsedResult.sessionId && (
                <Typography variant="caption" color="success.light" display="block" mt={0.5}>
                  sessionId: {parsedResult.sessionId}
                </Typography>
              )}
              {parsedResult.error && (
                <Typography variant="caption" color="error.light">
                  {parsedResult.error}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
