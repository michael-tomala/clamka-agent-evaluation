import { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  Dialog,
  DialogContent,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Build as ToolIcon,
} from '@mui/icons-material';
import type { ToolCall } from '../api/client';

interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

function normalizeBlock(block: unknown): ContentBlock {
  const b = block as Record<string, unknown>;
  // Normalizuj format Anthropic: source.data → data
  if (b.type === 'image' && b.source && typeof b.source === 'object') {
    const source = b.source as { data?: string; media_type?: string };
    return {
      type: 'image' as const,
      data: source.data,
      mimeType: source.media_type || 'image/png',
    };
  }
  return b as unknown as ContentBlock;
}

function extractContentBlocks(output: unknown): ContentBlock[] {
  // Przypadek 1: output jest bezpośrednio tablicą content blocków
  if (Array.isArray(output)) {
    return output.map(normalizeBlock);
  }
  // Przypadek 2: output ma zagnieżdżoną strukturę { content: [...] }
  if (output && typeof output === 'object' && 'content' in output) {
    const content = (output as { content: unknown[] }).content;
    if (Array.isArray(content)) {
      return content.map(normalizeBlock);
    }
  }
  return [];
}

function ImagePreview({ data, mimeType }: { data: string; mimeType: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const src = `data:${mimeType};base64,${data}`;

  return (
    <>
      <Box
        component="img"
        src={src}
        sx={{
          maxWidth: 200,
          maxHeight: 150,
          borderRadius: 1,
          cursor: 'pointer',
          '&:hover': { opacity: 0.8 },
        }}
        onClick={() => setDialogOpen(true)}
      />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xl">
        <DialogContent>
          <Box component="img" src={src} sx={{ maxWidth: '100%', maxHeight: '85vh' }} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function OutputRenderer({ output }: { output: unknown }) {
  const contentBlocks = extractContentBlocks(output);

  // DEBUG - sprawdź co widzimy
  console.log('[DEBUG] output:', output);
  console.log('[DEBUG] contentBlocks:', contentBlocks);

  if (contentBlocks.length > 0) {
    return (
      <Stack spacing={1.5}>
        {contentBlocks.map((block, index) => {
          console.log('[DEBUG] block', index, ':', block);
          console.log('[DEBUG] isImage:', block.type === 'image', 'hasData:', !!block.data, 'hasMimeType:', !!block.mimeType);
          if (block.type === 'image' && block.data && block.mimeType) {
            console.log('[DEBUG] RENDERING IMAGE!');
            return (
              <Box key={index}>
                <ImagePreview data={block.data} mimeType={block.mimeType} />
              </Box>
            );
          }
          if (block.type === 'text' && block.text) {
            return (
              <Box
                key={index}
                component="pre"
                sx={{
                  bgcolor: 'grey.900',
                  p: 1.5,
                  borderRadius: 1,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 200,
                  m: 0,
                }}
              >
                {block.text}
              </Box>
            );
          }
          return null;
        })}
      </Stack>
    );
  }

  return (
    <Box
      component="pre"
      sx={{
        bgcolor: 'grey.900',
        p: 1.5,
        borderRadius: 1,
        fontSize: 12,
        overflow: 'auto',
        maxHeight: 200,
        m: 0,
      }}
    >
      {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
    </Box>
  );
}

interface ToolCallsDetailViewProps {
  toolCalls: ToolCall[];
  showDetails?: boolean;
}

/**
 * Komponent do szczegółowego wyświetlania tool calls z accordion
 */
export function ToolCallsDetailView({
  toolCalls,
  showDetails = true
}: ToolCallsDetailViewProps) {
  if (toolCalls.length === 0) {
    return (
      <Typography color="text.secondary" textAlign="center" py={2}>
        Brak wywołań narzędzi
      </Typography>
    );
  }

  if (!showDetails) {
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {toolCalls.map((call, i) => (
          <Chip
            key={i}
            label={call.toolName}
            size="small"
            icon={<ToolIcon />}
          />
        ))}
      </Stack>
    );
  }

  return (
    <Box>
      {toolCalls.map((call, i) => (
        <Accordion key={i} disableGutters sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={2} alignItems="center" flex={1}>
              <ToolIcon fontSize="small" color="primary" />
              <Typography fontWeight={500}>{call.toolName}</Typography>
              <Chip
                label={`${call.durationMs}ms`}
                size="small"
                variant="outlined"
                sx={{ ml: 'auto' }}
              />
              <Typography variant="caption" color="text.secondary">
                #{call.order + 1}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Input:
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: 'grey.900',
                  p: 1.5,
                  borderRadius: 1,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 200,
                  m: 0,
                }}
              >
                {JSON.stringify(call.input, null, 2)}
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Output:
              </Typography>
              <OutputRenderer output={call.output} />
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
