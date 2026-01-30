import { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Chip,
  Stack,
  Box,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  TextField,
  Button,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Storage as StorageIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { api, LanceDbTableStats, LanceDbSampleRecord, LanceDbSearchResult } from '../../api/client';

interface LanceDbTableAccordionProps {
  tableName: string;
}

export function LanceDbTableAccordion({ tableName }: LanceDbTableAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<LanceDbTableStats | null>(null);
  const [sample, setSample] = useState<LanceDbSampleRecord[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingSample, setLoadingSample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LanceDbSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [tableName]);

  useEffect(() => {
    if (expanded && sample.length === 0 && !loadingSample) {
      loadSample();
    }
  }, [expanded]);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      setError(null);
      const data = await api.getLanceDbTableStats(tableName);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania statystyk');
    } finally {
      setLoadingStats(false);
    }
  };

  const loadSample = async () => {
    try {
      setLoadingSample(true);
      const data = await api.getLanceDbTableSample(tableName, { limit: 10 });
      setSample(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania przykladow');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLoadingSearch(true);
      setSearchError(null);
      const response = await api.searchLanceDbTable(tableName, {
        query: searchQuery.trim(),
        limit: 10,
      });
      setSearchResults(response.results);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Blad wyszukiwania');
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loadingSearch) {
      handleSearch();
    }
  };

  if (loadingStats) {
    return (
      <Box display="flex" alignItems="center" gap={1} py={1}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Ladowanie {tableName}...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>;
  }

  if (!stats) {
    return null;
  }

  const columns = sample.length > 0 ? Object.keys(sample[0]) : [];

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      sx={{ bgcolor: 'grey.900' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={2} width="100%">
          <StorageIcon fontSize="small" color="action" />
          <Typography fontWeight={500}>{stats.displayName}</Typography>
          <Chip
            label={`${stats.totalCount} rekordow`}
            size="small"
            color={stats.totalCount > 0 ? 'primary' : 'default'}
            variant="outlined"
          />
          <Chip
            label={`${stats.byProject.length} projekt${stats.byProject.length === 1 ? '' : 'ow'}`}
            size="small"
            variant="outlined"
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {stats.byProject.length > 0 && (
          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>
              Rozklad po projektach:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {stats.byProject.map(({ projectId, count }) => (
                <Tooltip key={projectId} title={projectId}>
                  <Chip
                    label={`${projectId.substring(0, 8)}...: ${count}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                </Tooltip>
              ))}
            </Stack>
          </Box>
        )}

        {/* Sekcja wyszukiwania semantycznego */}
        {stats.totalCount > 0 && (
          <Box mb={2}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Wyszukiwanie semantyczne:
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                placeholder="np. osoba przy biurku, produkt na stole..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loadingSearch}
                sx={{ flexGrow: 1, maxWidth: 400 }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={handleSearch}
                disabled={loadingSearch || !searchQuery.trim()}
                startIcon={loadingSearch ? <CircularProgress size={16} /> : <SearchIcon />}
              >
                Szukaj
              </Button>
            </Stack>

            {searchError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {searchError}
              </Alert>
            )}

            {searchResults.length > 0 && (
              <Box mt={2}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Wyniki ({searchResults.length}):
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 250, bgcolor: 'grey.800' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ bgcolor: 'grey.900', fontWeight: 600, width: 70 }}>
                          Score
                        </TableCell>
                        <TableCell sx={{ bgcolor: 'grey.900', fontWeight: 600, width: 100 }}>
                          ID
                        </TableCell>
                        <TableCell sx={{ bgcolor: 'grey.900', fontWeight: 600 }}>
                          Text
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {searchResults.map((result, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>
                            <Chip
                              label={result.score.toFixed(2)}
                              size="small"
                              color={result.score >= 0.7 ? 'success' : result.score >= 0.5 ? 'warning' : 'default'}
                              sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            <Tooltip title={result.id}>
                              <span>{result.id.substring(0, 8)}...</span>
                            </Tooltip>
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              maxWidth: 400,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Tooltip title={result.text || '-'}>
                              <span>{result.text || '-'}</span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        )}

        {loadingSample ? (
          <Box display="flex" alignItems="center" gap={1}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              Ladowanie przykladow...
            </Typography>
          </Box>
        ) : sample.length > 0 ? (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Przyklady (do 10 rekordow):
            </Typography>
            <TableContainer component={Paper} sx={{ maxHeight: 300, bgcolor: 'grey.800' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {columns.map((col) => (
                      <TableCell
                        key={col}
                        sx={{
                          bgcolor: 'grey.900',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sample.map((row, idx) => (
                    <TableRow key={idx} hover>
                      {columns.map((col) => (
                        <TableCell
                          key={col}
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            maxWidth: 250,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Tooltip title={String(row[col] ?? '')}>
                            <span>{String(row[col] ?? '-')}</span>
                          </Tooltip>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : stats.totalCount === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Brak rekordow w tabeli
          </Typography>
        ) : null}
      </AccordionDetails>
    </Accordion>
  );
}
