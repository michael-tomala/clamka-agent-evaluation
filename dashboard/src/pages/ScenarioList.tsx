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
  Button,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
} from '@mui/material';
import { PlayArrow as PlayIcon, PlaylistPlay as SuiteIcon } from '@mui/icons-material';
import { api, Scenario } from '../api/client';

export default function ScenarioList() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [runningJob, setRunningJob] = useState<string | null>(null);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      setLoading(true);
      const data = await api.getScenarios();
      setScenarios(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  };

  const runScenario = async (path: string) => {
    try {
      setRunningJob(path);
      const { jobId } = await api.runScenario(path, { verbose: true });
      navigate(`/run/${encodeURIComponent(path)}?jobId=${jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start test');
    } finally {
      setRunningJob(null);
    }
  };

  const runAllForAgent = async (agent: string) => {
    try {
      const { jobId } = await api.runSuite({ agent, verbose: true });
      navigate(`/run/suite?jobId=${jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start suite');
    }
  };

  const agents = [...new Set(scenarios.map((s) => s.agent))];

  const filteredScenarios = scenarios.filter((s) => {
    if (agentFilter !== 'all' && s.agent !== agentFilter) return false;
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight={600}>
          Scenariusze Testowe
        </Typography>
        <Stack direction="row" spacing={2}>
          {agentFilter !== 'all' && (
            <Button
              variant="contained"
              startIcon={<SuiteIcon />}
              onClick={() => runAllForAgent(agentFilter)}
            >
              Uruchom wszystkie ({filteredScenarios.length})
            </Button>
          )}
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Agent</InputLabel>
            <Select value={agentFilter} label="Agent" onChange={(e) => setAgentFilter(e.target.value)}>
              <MenuItem value="all">Wszystkie</MenuItem>
              {agents.map((agent) => (
                <MenuItem key={agent} value={agent}>
                  {agent}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Szukaj"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ minWidth: 250 }}
          />
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Scenariusz</TableCell>
              <TableCell>Agent</TableCell>
              <TableCell>Tagi</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredScenarios.map((scenario) => (
              <TableRow key={scenario.path} hover>
                <TableCell>
                  <Typography fontWeight={500}>{scenario.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {scenario.id}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={scenario.agent} size="small" color="primary" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    {scenario.tags?.map((tag) => (
                      <Chip key={tag} label={tag} size="small" variant="outlined" />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  {scenario.available ? (
                    <Chip label="Dostępny" size="small" color="success" />
                  ) : (
                    <Chip label="Niedostępny" size="small" color="error" />
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={
                      runningJob === scenario.path ? <CircularProgress size={16} /> : <PlayIcon />
                    }
                    onClick={() => runScenario(scenario.path)}
                    disabled={!scenario.available || !!runningJob}
                  >
                    Uruchom
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filteredScenarios.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">Brak scenariuszy</Typography>
        </Box>
      )}
    </Box>
  );
}
