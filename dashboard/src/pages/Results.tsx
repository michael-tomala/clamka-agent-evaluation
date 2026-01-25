import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  CheckCircle as PassIcon,
  Cancel as FailIcon,
  Visibility as ViewIcon,
  CompareArrows as CompareIcon,
} from '@mui/icons-material';
import { api, SuiteRun } from '../api/client';

export default function Results() {
  const navigate = useNavigate();
  const [suites, setSuites] = useState<SuiteRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<string | null>(null);

  useEffect(() => {
    loadSuites();
  }, []);

  const loadSuites = async () => {
    try {
      setLoading(true);
      const data = await api.getSuites({ limit: 50 });
      setSuites(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCompare = (suiteId: string) => {
    if (!selectedForCompare) {
      setSelectedForCompare(suiteId);
    } else if (selectedForCompare === suiteId) {
      setSelectedForCompare(null);
    } else {
      navigate(`/results/${selectedForCompare}/compare/${suiteId}`);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} mb={3}>
        Historia Testów
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {selectedForCompare && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Wybierz drugi suite do porównania lub kliknij ponownie aby anulować
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>Wynik</TableCell>
              <TableCell>Tokeny</TableCell>
              <TableCell>Czas</TableCell>
              <TableCell>Tagi</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {suites.map((suite) => (
              <TableRow
                key={suite.id}
                hover
                sx={{
                  bgcolor: selectedForCompare === suite.id ? 'action.selected' : undefined,
                }}
              >
                <TableCell>
                  <Typography>{formatDate(suite.createdAt)}</Typography>
                  {suite.label && (
                    <Typography variant="caption" color="text.secondary">
                      {suite.label}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {suite.failedScenarios === 0 ? (
                      <PassIcon color="success" fontSize="small" />
                    ) : (
                      <FailIcon color="error" fontSize="small" />
                    )}
                    <Typography>
                      {suite.passedScenarios}/{suite.totalScenarios}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({((suite.passedScenarios / suite.totalScenarios) * 100).toFixed(0)}%)
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography>{suite.totalTokens.toLocaleString()}</Typography>
                </TableCell>
                <TableCell>
                  <Typography>{(suite.totalLatencyMs / 1000).toFixed(1)}s</Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    {suite.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" variant="outlined" />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title="Zobacz szczegóły">
                      <IconButton size="small" onClick={() => navigate(`/results/${suite.id}`)}>
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={selectedForCompare ? 'Porównaj' : 'Wybierz do porównania'}>
                      <IconButton
                        size="small"
                        onClick={() => handleCompare(suite.id)}
                        color={selectedForCompare === suite.id ? 'primary' : 'default'}
                      >
                        <CompareIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {suites.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">Brak wyników testów</Typography>
        </Box>
      )}
    </Box>
  );
}
