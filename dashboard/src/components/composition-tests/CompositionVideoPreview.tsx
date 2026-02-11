/**
 * Preview wyrenderowanego video kompozycji
 */

import { Box, Typography, IconButton, Stack, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

interface CompositionVideoPreviewProps {
  fixtureId: string;
  variantName: string;
  renderDurationMs?: number;
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
  engine: 'remotion' | 'puppeteer';
  onDelete: (fixtureId: string) => void;
}

export default function CompositionVideoPreview({
  fixtureId,
  variantName,
  renderDurationMs,
  width,
  height,
  durationInFrames,
  fps,
  engine,
  onDelete,
}: CompositionVideoPreviewProps) {
  const videoUrl = `/api/composition-tests/renders/${fixtureId}/video?engine=${engine}`;
  const durationSec = (durationInFrames / fps).toFixed(1);

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">{variantName}</Typography>
        <IconButton size="small" color="error" onClick={() => onDelete(fixtureId)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'black',
          maxWidth: 480,
        }}
      >
        <video
          src={videoUrl}
          controls
          muted
          style={{ width: '100%', display: 'block' }}
        />
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <Chip label={`${width}x${height}`} size="small" variant="outlined" />
        <Chip label={`${durationSec}s`} size="small" variant="outlined" />
        <Chip label={`${fps} fps`} size="small" variant="outlined" />
        {renderDurationMs && (
          <Chip
            label={`Render: ${(renderDurationMs / 1000).toFixed(1)}s`}
            size="small"
            variant="outlined"
            color="success"
          />
        )}
      </Stack>
    </Box>
  );
}
