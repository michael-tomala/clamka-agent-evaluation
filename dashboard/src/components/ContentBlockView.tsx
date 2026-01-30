import { useState } from 'react';
import { Box, Typography, Stack, Dialog, DialogContent } from '@mui/material';
import type { ContentBlock } from '../api/client';

interface ToolResultContentBlock {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

function normalizeToolResultBlock(block: unknown): ToolResultContentBlock {
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
  return b as unknown as ToolResultContentBlock;
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
    let textContent: string = '';
    let imageBlocks: ToolResultContentBlock[] = [];

    if (typeof block.content === 'string') {
      textContent = block.content;
    } else if (Array.isArray(block.content)) {
      // Normalizuj i rozdziel bloki na tekstowe i obrazkowe
      const normalizedBlocks = (block.content as unknown[]).map(normalizeToolResultBlock);

      // Obrazki
      imageBlocks = normalizedBlocks.filter(
        (item) => item.type === 'image' && item.data && item.mimeType
      );

      // Tekst
      textContent = normalizedBlocks
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
      textContent = JSON.stringify(block.content, null, 2);
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

        {/* Obrazki */}
        {imageBlocks.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {imageBlocks.map((imgBlock, idx) => (
              <ImagePreview key={idx} data={imgBlock.data!} mimeType={imgBlock.mimeType!} />
            ))}
          </Stack>
        )}

        {/* Tekst */}
        {textContent && (
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
            {textContent}
          </Box>
        )}
      </Box>
    );
  }

  if (block.type === 'image') {
    return (
      <Box>
        <Typography variant="caption" color="grey.400" sx={{ mb: 0.5 }}>
          Image ({block.source.media_type})
        </Typography>
        <ImagePreview data={block.source.data} mimeType={block.source.media_type} />
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
