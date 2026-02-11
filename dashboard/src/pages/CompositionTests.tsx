/**
 * Strona testów kompozycji Remotion
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  CircularProgress,
  Alert,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CompositionTestCard from '../components/composition-tests/CompositionTestCard';
import { api, type CompositionTestFixture, type CompositionRenderJobStatus } from '../api/client';

// Grupuj fixtures po definitionId
function groupByDefinition(fixtures: CompositionTestFixture[]): Map<string, CompositionTestFixture[]> {
  const map = new Map<string, CompositionTestFixture[]>();
  for (const f of fixtures) {
    const group = map.get(f.compositionDefinitionId) || [];
    group.push(f);
    map.set(f.compositionDefinitionId, group);
  }
  return map;
}

// Mapowanie definitionId -> czytelna nazwa
const DEFINITION_NAMES: Record<string, string> = {
  'subscribe-cta': 'Subscribe CTA',
  'youtube-subscribe-card': 'YouTube Subscribe Card',
  'x-post': 'X Post',
  'blur-background-image': 'Blur Background Image',
  'facebook-post': 'Facebook Post',
};

export default function CompositionTests() {
  const [fixtures, setFixtures] = useState<CompositionTestFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedFixtureIds, setRenderedFixtureIds] = useState<Set<string>>(new Set());
  const [renderingJobs, setRenderingJobs] = useState<Map<string, CompositionRenderJobStatus>>(new Map());
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [engine, setEngine] = useState<'remotion' | 'puppeteer'>('puppeteer');
  const [useBackgroundVideo, setUseBackgroundVideo] = useState(false);
  const [debug, setDebug] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Załaduj fixtures
  useEffect(() => {
    api.getCompositionFixtures()
      .then(setFixtures)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Załaduj wyrenderowane pliki
  const loadRendered = useCallback(async () => {
    try {
      const renders = await api.getCompositionRenders(engine);
      setRenderedFixtureIds(new Set(renders.map(r => r.fixtureId)));
    } catch {
      // ignore
    }
  }, [engine]);

  useEffect(() => {
    loadRendered();
  }, [loadRendered]);

  // Polling dla aktywnych jobów
  useEffect(() => {
    const activeJobs = Array.from(renderingJobs.entries())
      .filter(([, job]) => job.status === 'pending' || job.status === 'rendering' || job.status === 'encoding');

    if (activeJobs.length === 0 && !batchId) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      let hasActive = false;

      // Poll individual jobs
      for (const [fixtureId, job] of renderingJobs.entries()) {
        if (job.status === 'completed' || job.status === 'error') continue;

        try {
          const updated = await api.getCompositionJobStatus(job.jobId);
          setRenderingJobs(prev => {
            const next = new Map(prev);
            next.set(fixtureId, updated);
            return next;
          });

          if (updated.status === 'completed') {
            setRenderedFixtureIds(prev => new Set([...prev, fixtureId]));
          } else if (updated.status !== 'error') {
            hasActive = true;
          }
        } catch {
          // ignore
        }
      }

      // Poll batch
      if (batchId) {
        try {
          const batch = await api.getCompositionBatchStatus(batchId);
          setBatchProgress({ completed: batch.completedCount, total: batch.totalCount });

          if (batch.status === 'completed' || batch.status === 'error') {
            setBatchId(null);
            setBatchProgress(null);
            loadRendered();
          } else {
            hasActive = true;
          }
        } catch {
          // ignore
        }
      }

      if (!hasActive && !batchId) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [renderingJobs, batchId, loadRendered]);

  const handleRenderFixture = useCallback(async (fixtureId: string) => {
    try {
      const result = await api.renderComposition(fixtureId, engine, useBackgroundVideo || undefined, debug || undefined);
      setRenderingJobs(prev => {
        const next = new Map(prev);
        next.set(fixtureId, {
          jobId: result.jobId,
          status: result.status as CompositionRenderJobStatus['status'],
          progress: 0,
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd renderowania');
    }
  }, [engine, useBackgroundVideo, debug]);

  const handleRenderAll = useCallback(async (definitionId: string) => {
    try {
      const result = await api.renderCompositionBatch(definitionId, engine, useBackgroundVideo || undefined);
      setBatchId(result.batchId);
      setBatchProgress({ completed: 0, total: result.totalCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd renderowania batch');
    }
  }, [engine, useBackgroundVideo]);

  const handleRenderAllCompositions = useCallback(async () => {
    try {
      const result = await api.renderCompositionBatch(undefined, engine, useBackgroundVideo || undefined);
      setBatchId(result.batchId);
      setBatchProgress({ completed: 0, total: result.totalCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd renderowania batch');
    }
  }, [engine, useBackgroundVideo]);

  const handleDeleteRender = useCallback(async (fixtureId: string) => {
    try {
      await api.deleteCompositionRender(fixtureId, engine);
      setRenderedFixtureIds(prev => {
        const next = new Set(prev);
        next.delete(fixtureId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd usuwania');
    }
  }, [engine]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const grouped = groupByDefinition(fixtures);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          Testy Kompozycji
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <ToggleButtonGroup
            value={engine}
            exclusive
            onChange={(_, v) => v && setEngine(v)}
            size="small"
          >
            <ToggleButton value="puppeteer">Puppeteer (esbuild)</ToggleButton>
            <ToggleButton value="remotion">Remotion (webpack)</ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel
            control={
              <Checkbox
                checked={useBackgroundVideo}
                onChange={(_, checked) => setUseBackgroundVideo(checked)}
                size="small"
              />
            }
            label="Background Video"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={debug}
                onChange={(_, checked) => setDebug(checked)}
                size="small"
              />
            }
            label="Debug"
          />
          <Typography variant="body2" color="text.secondary">
            {fixtures.length} fixtures, {renderedFixtureIds.size} renderów
          </Typography>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={handleRenderAllCompositions}
            disabled={!!batchId}
          >
            Renderuj wszystkie
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {batchProgress && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Batch render: {batchProgress.completed} / {batchProgress.total}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(batchProgress.completed / batchProgress.total) * 100}
          />
        </Box>
      )}

      {Array.from(grouped.entries()).map(([definitionId, defFixtures]) => (
        <CompositionTestCard
          key={definitionId}
          definitionId={definitionId}
          definitionName={DEFINITION_NAMES[definitionId] || definitionId}
          fixtures={defFixtures}
          renderedFixtureIds={renderedFixtureIds}
          renderingJobs={renderingJobs}
          engine={engine}
          onRenderFixture={handleRenderFixture}
          onRenderAll={handleRenderAll}
          onDeleteRender={handleDeleteRender}
        />
      ))}
    </Box>
  );
}
