/**
 * Karta jednej kompozycji z wariantami
 */

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Chip,
  Box,
  LinearProgress,
  Collapse,
  IconButton,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CompositionVideoPreview from './CompositionVideoPreview';
import type { CompositionTestFixture, CompositionRenderJobStatus } from '../../api/client';

interface CompositionTestCardProps {
  definitionId: string;
  definitionName: string;
  fixtures: CompositionTestFixture[];
  renderedFixtureIds: Set<string>;
  renderingJobs: Map<string, CompositionRenderJobStatus>;
  engine: 'remotion' | 'puppeteer';
  onRenderFixture: (fixtureId: string) => void;
  onRenderAll: (definitionId: string) => void;
  onDeleteRender: (fixtureId: string) => void;
}

export default function CompositionTestCard({
  definitionId,
  definitionName,
  fixtures,
  renderedFixtureIds,
  renderingJobs,
  engine,
  onRenderFixture,
  onRenderAll,
  onDeleteRender,
}: CompositionTestCardProps) {
  const [expanded, setExpanded] = useState(true);

  const isAnyRendering = fixtures.some(f => {
    const job = renderingJobs.get(f.id);
    return job && (job.status === 'pending' || job.status === 'rendering' || job.status === 'encoding');
  });

  const renderedCount = fixtures.filter(f => renderedFixtureIds.has(f.id)).length;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6">{definitionName}</Typography>
            <Chip
              label={`${fixtures.length} wariantów`}
              size="small"
              color="primary"
              variant="outlined"
            />
            {renderedCount > 0 && (
              <Chip
                label={`${renderedCount} renderów`}
                size="small"
                color="success"
                variant="outlined"
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="contained"
              size="small"
              startIcon={<PlayArrowIcon />}
              onClick={() => onRenderAll(definitionId)}
              disabled={isAnyRendering}
            >
              Renderuj
            </Button>
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Stack>
        </Stack>

        <Collapse in={expanded}>
          <Box sx={{ mt: 2 }}>
            {fixtures.map((fixture) => {
              const job = renderingJobs.get(fixture.id);
              const isRendered = renderedFixtureIds.has(fixture.id);
              const isRendering = job && (job.status === 'pending' || job.status === 'rendering' || job.status === 'encoding');

              return (
                <Box
                  key={fixture.id}
                  sx={{
                    p: 1.5,
                    mb: 1,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="subtitle2">{fixture.variantName}</Typography>
                      {fixture.tags.map(tag => (
                        <Chip key={tag} label={tag} size="small" sx={{ height: 20, fontSize: 11 }} />
                      ))}
                    </Stack>
                    {!isRendered && !isRendering && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onRenderFixture(fixture.id)}
                      >
                        Renderuj
                      </Button>
                    )}
                  </Stack>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {fixture.description}
                  </Typography>

                  {isRendering && (
                    <Box sx={{ mb: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={job?.progress ?? 0}
                        sx={{ mb: 0.5 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {job?.status === 'encoding' ? 'Kodowanie' : 'Renderowanie'}: {Math.round(job?.progress ?? 0)}%
                      </Typography>
                    </Box>
                  )}

                  {job?.status === 'error' && (
                    <Alert severity="error" sx={{ mb: 1 }}>
                      {job.error || 'Nieznany błąd renderowania'}
                    </Alert>
                  )}

                  {isRendered && (
                    <CompositionVideoPreview
                      fixtureId={fixture.id}
                      variantName={fixture.variantName}
                      renderDurationMs={job?.renderDurationMs}
                      width={fixture.width}
                      height={fixture.height}
                      durationInFrames={fixture.durationInFrames}
                      fps={fixture.fps}
                      engine={engine}
                      onDelete={onDeleteRender}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
