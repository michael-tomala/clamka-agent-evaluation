import { useRef, useEffect, useMemo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import type { RawMessage, ContentBlock } from '../api/client';
import { ContentBlockView } from './ContentBlockView';
import { TransAgentSection } from './TransAgentSection';

interface TransAgentMessagesViewProps {
  messages: RawMessage[];
  liveMode?: boolean;
}

interface TransAgentToolUse {
  toolUseId: string;
  agentType: string;
  task: string;
  sessionId?: string;
}

/**
 * Wyciaga informacje o runTransAgent tool_use z bloku
 */
function extractTransAgentToolUse(block: ContentBlock): TransAgentToolUse | null {
  if (block.type !== 'tool_use') return null;
  if (!block.name.endsWith('runTransAgent')) return null;

  const input = block.input as { agentType?: string; task?: string; sessionId?: string };
  if (!input.agentType || !input.task) return null;

  return {
    toolUseId: block.id,
    agentType: input.agentType,
    task: input.task,
    sessionId: input.sessionId,
  };
}

/**
 * TransAgentMessagesView - hierarchiczne wyswietlanie wiadomosci z trans agentami
 *
 * 1. Separuje root messages (bez parentToolUseId) od trans agent messages
 * 2. Buduje mape: toolUseId -> lista wiadomosci trans agenta
 * 3. Wyciaga info o runTransAgent tool_use (agentType, task) dla naglowkow
 * 4. Renderuje root messages z osadzonymi TransAgentSection
 */
export function TransAgentMessagesView({ messages, liveMode = false }: TransAgentMessagesViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll w trybie live
  useEffect(() => {
    if (liveMode && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, liveMode]);

  // Przetwarzanie wiadomosci - grupowanie trans agentow
  const { rootMessages, transAgentMessagesMap, transAgentToolUses, resolvedToolUseIds, toolResults } =
    useMemo(() => {
      // Root messages - bez parentToolUseId
      const rootMsgs = messages.filter((m) => !m.parentToolUseId);

      // Trans agent messages - z parentToolUseId
      // Mapa: toolUseId -> lista wiadomosci
      const transAgentMap = new Map<string, RawMessage[]>();
      for (const msg of messages) {
        if (msg.parentToolUseId) {
          const existing = transAgentMap.get(msg.parentToolUseId) || [];
          existing.push(msg);
          transAgentMap.set(msg.parentToolUseId, existing);
        }
      }

      // Wyciagnij wszystkie runTransAgent tool_use z root messages
      const toolUses = new Map<string, TransAgentToolUse>();
      for (const msg of rootMsgs) {
        for (const block of msg.content) {
          const transAgent = extractTransAgentToolUse(block);
          if (transAgent) {
            toolUses.set(transAgent.toolUseId, transAgent);
          }
        }
      }

      // Resolved tool_use IDs (mamy tool_result w root messages)
      const resolvedIds = new Set<string>();
      // Mapa tool_use_id -> tool_result content
      const results = new Map<string, unknown>();
      for (const msg of rootMsgs) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            resolvedIds.add(block.tool_use_id);
            results.set(block.tool_use_id, block.content);
          }
        }
      }

      return {
        rootMessages: rootMsgs,
        transAgentMessagesMap: transAgentMap,
        transAgentToolUses: toolUses,
        resolvedToolUseIds: resolvedIds,
        toolResults: results,
      };
    }, [messages]);

  // Renderowanie pojedynczej wiadomosci root z osadzonymi trans agentami
  const renderRootMessage = (msg: RawMessage, msgIndex: number) => {
    // Grupuj bloki: zwykle bloki + TransAgentSection dla runTransAgent
    const elements: React.ReactNode[] = [];
    let currentBlocks: ContentBlock[] = [];

    const flushCurrentBlocks = () => {
      if (currentBlocks.length > 0) {
        elements.push(
          <Stack key={`blocks-${elements.length}`} spacing={1}>
            {currentBlocks.map((block, j) => (
              <ContentBlockView key={j} block={block} />
            ))}
          </Stack>
        );
        currentBlocks = [];
      }
    };

    for (const block of msg.content) {
      const transAgent = extractTransAgentToolUse(block);

      if (transAgent) {
        // Flush poprzednie bloki przed TransAgentSection
        flushCurrentBlocks();

        // Dodaj TransAgentSection
        const childMessages = transAgentMessagesMap.get(transAgent.toolUseId) || [];
        const isResolved = resolvedToolUseIds.has(transAgent.toolUseId);
        const toolResult = toolResults.get(transAgent.toolUseId);

        elements.push(
          <TransAgentSection
            key={`trans-${transAgent.toolUseId}`}
            toolUseId={transAgent.toolUseId}
            toolUseInput={{ agentType: transAgent.agentType, task: transAgent.task, sessionId: transAgent.sessionId }}
            childMessages={childMessages}
            isResolved={isResolved}
            toolResult={toolResult}
          />
        );
      } else if (block.type === 'tool_result' && transAgentToolUses.has(block.tool_use_id)) {
        // Pomijamy tool_result dla runTransAgent - jest wyswietlany w TransAgentSection
        continue;
      } else {
        // Zwykly blok - dodaj do kolejki
        currentBlocks.push(block);
      }
    }

    // Flush pozostale bloki
    flushCurrentBlocks();

    return (
      <Box
        key={msgIndex}
        sx={{
          mb: 1,
          p: 1.5,
          borderRadius: 1,
          maxWidth: '100%',
          overflowX: 'auto',
          wordBreak: 'break-word',
          borderLeft: '3px solid',
          borderColor: msg.role === 'assistant' ? 'primary.main' : 'secondary.main',
        }}
      >
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          {msg.role === 'assistant' ? 'Assistant' : 'User'} •{' '}
          {new Date(msg.timestamp).toLocaleTimeString()}
        </Typography>
        <Stack spacing={1}>{elements}</Stack>
      </Box>
    );
  };

  return (
    <Box ref={containerRef}>
      {rootMessages.map((msg, i) => renderRootMessage(msg, i))}
      {rootMessages.length === 0 && (
        <Typography color="text.secondary" textAlign="center" py={4}>
          {liveMode ? 'Oczekiwanie na wiadomosci...' : 'Brak wiadomosci'}
        </Typography>
      )}
    </Box>
  );
}
