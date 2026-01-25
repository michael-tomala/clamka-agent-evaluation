import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Chip,
  Stack,
} from '@mui/material';
import { Storage as StorageIcon } from '@mui/icons-material';
import { api, DataDiff } from '../api/client';
import { TimelinesAccordion, DataDiffView } from './fixtures';

interface ScenarioFixturesSectionProps {
  projectId: string;
  chapterId: string;
  dataDiff?: DataDiff;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export function ScenarioFixturesSection({ projectId, chapterId, dataDiff }: ScenarioFixturesSectionProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixturesAvailable, setFixturesAvailable] = useState(false);

  useEffect(() => {
    checkFixtures();
  }, [projectId]);

  const checkFixtures = async () => {
    try {
      setLoading(true);
      const status = await api.getFixturesStatus();
      setFixturesAvailable(status.exists);
      if (!status.exists) {
        setError('Baza fixtures.db nie jest dostepna');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad sprawdzania fixtures');
    } finally {
      setLoading(false);
    }
  };

  // Oblicz podsumowanie zmian z dataDiff
  const diffSummary = dataDiff ? {
    blocksAdded: dataDiff.blocks.added.length,
    blocksModified: dataDiff.blocks.modified.length,
    blocksDeleted: dataDiff.blocks.deleted.length,
    timelinesAdded: dataDiff.timelines.added.length,
    timelinesModified: dataDiff.timelines.modified.length,
    timelinesDeleted: dataDiff.timelines.deleted.length,
    mediaAssetsAdded: dataDiff.mediaAssets.added.length,
  } : null;

  const hasDiff = diffSummary && (
    diffSummary.blocksAdded > 0 ||
    diffSummary.blocksModified > 0 ||
    diffSummary.blocksDeleted > 0 ||
    diffSummary.timelinesAdded > 0 ||
    diffSummary.timelinesModified > 0 ||
    diffSummary.timelinesDeleted > 0 ||
    diffSummary.mediaAssetsAdded > 0
  );

  if (loading) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <StorageIcon color="primary" />
          <Typography variant="h6">Stan danych (Fixtures)</Typography>
        </Stack>
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress size={24} />
        </Box>
      </Paper>
    );
  }

  if (error || !fixturesAvailable) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <StorageIcon color="primary" />
          <Typography variant="h6">Stan danych (Fixtures)</Typography>
        </Stack>
        <Alert severity="warning">
          {error || 'Fixtures nie sa dostepne'}
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <StorageIcon color="primary" />
        <Typography variant="h6">Stan danych (Fixtures)</Typography>
        <Box flex={1} />
        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
          Project: {projectId.slice(0, 8)}... | Chapter: {chapterId.slice(0, 8)}...
        </Typography>
      </Stack>

      {/* Podsumowanie zmian */}
      {hasDiff && diffSummary && (
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          {diffSummary.blocksAdded > 0 && (
            <Chip label={`+${diffSummary.blocksAdded} blokow`} size="small" color="success" variant="outlined" />
          )}
          {diffSummary.blocksModified > 0 && (
            <Chip label={`~${diffSummary.blocksModified} zmienionych`} size="small" color="warning" variant="outlined" />
          )}
          {diffSummary.blocksDeleted > 0 && (
            <Chip label={`-${diffSummary.blocksDeleted} usunietych`} size="small" color="error" variant="outlined" />
          )}
          {diffSummary.timelinesAdded > 0 && (
            <Chip label={`+${diffSummary.timelinesAdded} timelines`} size="small" color="success" variant="outlined" />
          )}
          {diffSummary.mediaAssetsAdded > 0 && (
            <Chip label={`+${diffSummary.mediaAssetsAdded} media`} size="small" color="success" variant="outlined" />
          )}
        </Stack>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="Stan poczatkowy" />
          <Tab label="Stan koncowy" disabled={!hasDiff} />
        </Tabs>
      </Box>

      <TabPanel value={activeTab} index={0}>
        <Typography variant="subtitle2" gutterBottom color="text.secondary">
          Timelines i bloki przed wykonaniem scenariusza
        </Typography>
        <TimelinesAccordion chapterId={chapterId} />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        {hasDiff && dataDiff ? (
          <DataDiffView dataDiff={dataDiff} />
        ) : (
          <Typography color="text.secondary">
            Brak zmian do wyswietlenia
          </Typography>
        )}
      </TabPanel>
    </Paper>
  );
}
