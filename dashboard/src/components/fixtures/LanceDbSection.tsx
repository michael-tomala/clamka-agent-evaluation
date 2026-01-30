import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Stack,
} from '@mui/material';
import { Storage as StorageIcon } from '@mui/icons-material';
import { api, LanceDbStatus } from '../../api/client';
import { LanceDbTableAccordion } from './LanceDbTableAccordion';

// Tabele które chcemy wyświetlić (w tej kolejności)
const LANCEDB_TABLES = [
  'scene_embeddings',
  'project_contexts',
  'transcription_embeddings',
];

export function LanceDbSection() {
  const [status, setStatus] = useState<LanceDbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getLanceDbStatus();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania statusu LanceDB');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" py={4}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ my: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!status) {
    return null;
  }

  // Filtruj tabele - tylko te które istnieją i są na liście
  const availableTables = LANCEDB_TABLES.filter((t) => status.tables.includes(t));

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <StorageIcon color="primary" />
        <Typography variant="h6" fontWeight={600}>
          LanceDB (Vector Store)
        </Typography>
      </Stack>

      {!status.exists ? (
        <Alert severity="warning">
          <Typography fontWeight={500}>LanceDB fixtures nie istnieje</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Uruchom glowna aplikacje z CLAMKA_DATA_PATH=testing/agent-evals/fixtures i wykonaj analize wideo, aby stworzyc embeddingi.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Sciezka: {status.path}
          </Typography>
        </Alert>
      ) : availableTables.length === 0 ? (
        <Alert severity="info">
          LanceDB istnieje, ale nie znaleziono znanych tabel embeddingów.
        </Alert>
      ) : (
        <>
          <Alert severity="success" sx={{ mb: 2 }}>
            LanceDB dostepna ({availableTables.length} tabel{availableTables.length === 1 ? 'a' : ''})
          </Alert>

          <Stack spacing={1}>
            {availableTables.map((tableName) => (
              <LanceDbTableAccordion key={tableName} tableName={tableName} />
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
