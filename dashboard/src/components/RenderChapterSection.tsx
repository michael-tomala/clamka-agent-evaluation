/**
 * RenderChapterSection - Sekcja renderowania chapter'a
 *
 * Wyświetla przycisk do rozpoczęcia renderowania, progress bar,
 * preview frame i video player po zakończeniu.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Stack,
  Alert,
  IconButton,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  PlayArrow as RenderIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { api, RenderJob } from '../api/client';

interface RenderChapterSectionProps {
  suiteId?: string;
  scenarioId?: string;
  projectId: string;
  chapterId: string;
  defaultEngine?: 'remotion' | 'puppeteer';
}

export function RenderChapterSection({ suiteId, scenarioId, projectId, chapterId, defaultEngine = 'remotion' }: RenderChapterSectionProps) {
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<'remotion' | 'puppeteer'>(defaultEngine);

  // Polling interval ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start polling for render status
  const startPolling = useCallback((jobId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const status = await api.getRenderStatus(jobId);
        setRenderJob(status);

        // Stop polling when completed or error
        if (status.status === 'completed' || status.status === 'error') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch (e) {
        console.error('Error polling render status:', e);
      }
    }, 1000);  // Poll every second
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Start render
  const handleStartRender = async () => {
    setIsStarting(true);
    setError(null);

    try {
      const result = await api.renderChapter(projectId, chapterId, { suiteId, scenarioId, engine });
      setRenderJob({
        jobId: result.jobId,
        projectId,
        chapterId,
        status: 'pending',
        progress: 0,
        startedAt: new Date().toISOString(),
      });

      // Start polling
      startPolling(result.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udalo sie rozpoczac renderowania');
    } finally {
      setIsStarting(false);
    }
  };

  // Delete render
  const handleDeleteRender = async () => {
    if (!renderJob) return;

    try {
      await api.deleteRender(renderJob.jobId);
      setRenderJob(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udalo sie usunac renderowania');
    }
  };

  // Render status label
  const getStatusLabel = (status: RenderJob['status']) => {
    switch (status) {
      case 'pending':
        return 'Oczekuje...';
      case 'rendering':
        return 'Renderowanie klatek...';
      case 'encoding':
        return 'Kodowanie video...';
      case 'completed':
        return 'Zakonczone';
      case 'error':
        return 'Blad';
      default:
        return status;
    }
  };

  // Render status color
  const getStatusColor = (status: RenderJob['status']): 'default' | 'primary' | 'secondary' | 'success' | 'error' => {
    switch (status) {
      case 'pending':
        return 'default';
      case 'rendering':
        return 'primary';
      case 'encoding':
        return 'secondary';
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Typography variant="h6">Renderowanie chaptera</Typography>
        {renderJob && (
          <Chip
            label={getStatusLabel(renderJob.status)}
            color={getStatusColor(renderJob.status)}
            size="small"
          />
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* No render job - show engine selector + start button */}
      {!renderJob && (
        <Stack direction="row" spacing={2} alignItems="center">
          <ToggleButtonGroup
            value={engine}
            exclusive
            onChange={(_, val) => { if (val) setEngine(val); }}
            size="small"
          >
            <ToggleButton value="remotion">Remotion</ToggleButton>
            <ToggleButton value="puppeteer">Puppeteer</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<RenderIcon />}
            onClick={handleStartRender}
            disabled={isStarting}
          >
            {isStarting ? 'Uruchamianie...' : 'Renderuj chapter'}
          </Button>
        </Stack>
      )}

      {/* Render in progress */}
      {renderJob && (renderJob.status === 'pending' || renderJob.status === 'rendering' || renderJob.status === 'encoding') && (
        <Box>
          {/* Progress bar */}
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" mb={0.5}>
              <Typography variant="body2" color="text.secondary">
                {renderJob.currentFrame !== undefined && renderJob.totalFrames
                  ? `Klatka ${renderJob.currentFrame} / ${renderJob.totalFrames}`
                  : 'Przygotowywanie...'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {renderJob.progress.toFixed(1)}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={renderJob.progress}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>

          {/* Preview frame */}
          {renderJob.previewFrame && (
            <Box
              sx={{
                width: '100%',
                maxWidth: 640,
                aspectRatio: '16/9',
                backgroundColor: 'black',
                borderRadius: 1,
                overflow: 'hidden',
                mb: 2,
              }}
            >
              <img
                src={`data:image/jpeg;base64,${renderJob.previewFrame}`}
                alt="Preview"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </Box>
          )}
        </Box>
      )}

      {/* Render completed - show video */}
      {renderJob && renderJob.status === 'completed' && renderJob.videoUrl && (
        <Box>
          <Box
            sx={{
              width: '100%',
              maxWidth: 800,
              aspectRatio: '16/9',
              backgroundColor: 'black',
              borderRadius: 1,
              overflow: 'hidden',
              mb: 2,
            }}
          >
            <video
              src={renderJob.videoUrl}
              controls
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </Box>

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleStartRender}
              disabled={isStarting}
            >
              Renderuj ponownie
            </Button>
            <IconButton
              color="error"
              onClick={handleDeleteRender}
              title="Usun render"
            >
              <DeleteIcon />
            </IconButton>
          </Stack>
        </Box>
      )}

      {/* Render error */}
      {renderJob && renderJob.status === 'error' && (
        <Box>
          <Alert severity="error" sx={{ mb: 2 }}>
            {renderJob.error || 'Wystapil blad podczas renderowania'}
          </Alert>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleStartRender}
            disabled={isStarting}
          >
            Sprobuj ponownie
          </Button>
        </Box>
      )}
    </Paper>
  );
}
