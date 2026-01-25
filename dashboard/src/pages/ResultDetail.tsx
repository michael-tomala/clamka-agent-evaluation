import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Button,
  Collapse,
  IconButton,
  LinearProgress,
  Grid,
} from '@mui/material';
import {
  CheckCircle as PassIcon,
  Cancel as FailIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ArrowBack as BackIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
  Replay as ReplayIcon,
  HourglassEmpty as PendingIcon,
  Stop as StopIcon,
} from '@mui/icons-material';
import { api, subscribeToSuite, SuiteEvent, ToolInfo, RawMessage, ToolCall, SuiteStatus } from '../api/client';
import { ToolsListView, ScenarioMessagesView } from '../components';

type ScenarioStatusType = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface ScenarioSummary {
  id: string;
  name: string;
  passed?: boolean;
  tokens?: number;
  latencyMs?: number;
  turnCount?: number;
  toolCalls?: string[];
  error?: string;
  status?: ScenarioStatusType;
}

export default function ResultDetail() {
  const { suiteId, otherSuiteId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Single suite view
  const [suite, setSuite] = useState<Awaited<ReturnType<typeof api.getSuite>> | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);

  // Live state
  const [suiteStatus, setSuiteStatus] = useState<SuiteStatus>('completed');
  const [currentScenario, setCurrentScenario] = useState<string | null>(null);
  const [scenarioStatuses, setScenarioStatuses] = useState<Record<string, ScenarioStatusType>>({});
  const [liveMessages, setLiveMessages] = useState<RawMessage[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<ToolCall[]>([]);
  const [isStopping, setIsStopping] = useState(false);

  // Compare view
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof api.compareSuites>> | null>(null);

  // System prompt collapse
  const [promptExpanded, setPromptExpanded] = useState(false);

  // Tools MCP
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [toolsExpanded, setToolsExpanded] = useState(false);


  useEffect(() => {
    loadData();
  }, [suiteId, otherSuiteId]);

  // Laduj narzedzia MCP
  useEffect(() => {
    api.getTools().then((response) => {
      setTools(response.tools);
    }).catch((err) => {
      console.error('Failed to load tools:', err);
    });
  }, []);

  // WebSocket subscription dla live updates
  useEffect(() => {
    if (!suiteId || otherSuiteId) return;
    if (suiteStatus !== 'running' && suiteStatus !== 'pending') return;

    const unsubscribe = subscribeToSuite(suiteId, handleSuiteEvent);

    return unsubscribe;
  }, [suiteId, otherSuiteId, suiteStatus]);

  const handleSuiteEvent = useCallback((event: SuiteEvent) => {
    switch (event.type) {
      case 'job:start':
        setSuiteStatus('running');
        break;

      case 'scenario:start':
        setCurrentScenario(event.scenarioId || null);
        setLiveMessages([]); // Clear messages for new scenario
        setLiveToolCalls([]);
        if (event.scenarioId) {
          setScenarioStatuses((prev) => ({ ...prev, [event.scenarioId!]: 'running' }));
        }
        break;

      case 'tool:call':
        if (event.toolCall) {
          setLiveToolCalls((prev) => [...prev, event.toolCall!]);
        }
        break;

      case 'message:received':
        if (event.message) {
          setLiveMessages((prev) => [...prev, event.message!]);
        }
        break;

      case 'scenario:complete':
        if (event.scenarioId && event.result) {
          setScenarioStatuses((prev) => ({
            ...prev,
            [event.scenarioId!]: event.result!.passed ? 'completed' : 'failed',
          }));
          // Update scenario in list with result data
          setScenarios((prev) =>
            prev.map((s) =>
              s.id === event.scenarioId
                ? {
                    ...s,
                    passed: event.result!.passed,
                    tokens: event.result!.metrics.totalTokens,
                    latencyMs: event.result!.metrics.latencyMs,
                    turnCount: event.result!.metrics.turnCount,
                    toolCalls: event.result!.toolCalls.map((c) => c.toolName),
                    error: event.result!.error,
                    status: event.result!.passed ? 'completed' : 'failed',
                  }
                : s
            )
          );
        }
        break;

      case 'job:complete':
        setSuiteStatus('completed');
        setCurrentScenario(null);
        setLiveMessages([]);
        setLiveToolCalls([]);
        // Reload data to get final results
        loadData();
        break;

      case 'job:error':
        setSuiteStatus('failed');
        setError(event.error || 'Unknown error');
        break;

      case 'suite:stopped':
        setSuiteStatus('stopped');
        setCurrentScenario(null);
        setIsStopping(false);
        loadData();
        break;
    }
  }, []);

  const loadData = async () => {
    if (!suiteId) return;

    try {
      setLoading(true);

      if (otherSuiteId) {
        // Compare mode
        const compData = await api.compareSuites(suiteId, otherSuiteId);
        setComparison(compData);
      } else {
        // Single suite view
        const [suiteData, scenariosData] = await Promise.all([
          api.getSuite(suiteId),
          api.getSuiteScenarios(suiteId),
        ]);
        setSuite(suiteData);

        // Initialize scenario statuses
        const statuses: Record<string, ScenarioStatusType> = {};
        const scenariosWithStatus = scenariosData.map((s) => {
          const status = suiteData.scenarioStatuses?.[s.id] || (s.passed !== undefined ? 'completed' : 'pending');
          statuses[s.id] = status as ScenarioStatusType;
          return { ...s, status: status as ScenarioStatusType };
        });
        setScenarios(scenariosWithStatus);
        setScenarioStatuses(statuses);

        // Set suite status
        setSuiteStatus(suiteData.status || 'completed');
        setCurrentScenario(suiteData.currentScenario || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!suiteId) return;
    setIsStopping(true);
    try {
      await api.stopSuite(suiteId);
      // WebSocket 'suite:stopped' zaktualizuje UI
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zatrzymać');
      setIsStopping(false);
    }
  };

  const getStatusIcon = (status: ScenarioStatusType, passed?: boolean) => {
    switch (status) {
      case 'pending':
        return <PendingIcon color="disabled" />;
      case 'running':
        return <CircularProgress size={24} />;
      case 'completed':
        return passed ? <PassIcon color="success" /> : <FailIcon color="error" />;
      case 'failed':
        return <FailIcon color="error" />;
      case 'cancelled':
        return <StopIcon color="warning" />;
      default:
        return <PendingIcon color="disabled" />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error && suiteStatus !== 'running') {
    return (
      <Alert severity="error">
        {error}
        <Button onClick={() => navigate('/results')}>Wroc</Button>
      </Alert>
    );
  }

  // Compare view
  if (comparison) {
    return (
      <Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/results')} sx={{ mb: 2 }}>
          Wroc do historii
        </Button>

        <Typography variant="h4" fontWeight={600} mb={3}>
          Porownanie Suiteow
        </Typography>

        <Stack direction="row" spacing={3} mb={3}>
          <Paper sx={{ flex: 1, p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Suite A
            </Typography>
            <Typography>{new Date(comparison.suite1.createdAt).toLocaleString('pl-PL')}</Typography>
            <Stack direction="row" spacing={0.5} mt={1}>
              {comparison.suite1.tags.map((t) => (
                <Chip key={t} label={t} size="small" />
              ))}
            </Stack>
          </Paper>
          <Paper sx={{ flex: 1, p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Suite B
            </Typography>
            <Typography>{new Date(comparison.suite2.createdAt).toLocaleString('pl-PL')}</Typography>
            <Stack direction="row" spacing={0.5} mt={1}>
              {comparison.suite2.tags.map((t) => (
                <Chip key={t} label={t} size="small" />
              ))}
            </Stack>
          </Paper>
        </Stack>

        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" mb={1}>
            Podsumowanie
          </Typography>
          <Stack direction="row" spacing={3}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Roznica tokenow
              </Typography>
              <Typography
                variant="h6"
                color={comparison.totalTokensDiff < 0 ? 'success.main' : 'error.main'}
              >
                {comparison.totalTokensDiff > 0 ? '+' : ''}
                {comparison.totalTokensDiff.toLocaleString()} ({comparison.totalTokensDiffPercent.toFixed(1)}%)
              </Typography>
            </Box>
          </Stack>
        </Paper>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Scenariusz</TableCell>
                <TableCell>Suite A</TableCell>
                <TableCell>Suite B</TableCell>
                <TableCell>Zmiana</TableCell>
                <TableCell>Roznica tokenow</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {comparison.comparison.map((c) => (
                <TableRow key={c.scenarioId}>
                  <TableCell>{c.scenarioId}</TableCell>
                  <TableCell>
                    {c.suite1 ? (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        {c.suite1.passed ? <PassIcon color="success" fontSize="small" /> : <FailIcon color="error" fontSize="small" />}
                        <Typography variant="body2">{c.suite1.tokens} tok</Typography>
                      </Stack>
                    ) : (
                      <Typography color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.suite2 ? (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        {c.suite2.passed ? <PassIcon color="success" fontSize="small" /> : <FailIcon color="error" fontSize="small" />}
                        <Typography variant="body2">{c.suite2.tokens} tok</Typography>
                      </Stack>
                    ) : (
                      <Typography color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={c.change}
                      size="small"
                      color={
                        c.change === 'fixed'
                          ? 'success'
                          : c.change === 'regressed'
                          ? 'error'
                          : c.change === 'unchanged'
                          ? 'default'
                          : 'info'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {c.tokensDiff !== undefined && (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        {c.tokensDiff < 0 ? (
                          <DownIcon color="success" fontSize="small" />
                        ) : c.tokensDiff > 0 ? (
                          <UpIcon color="error" fontSize="small" />
                        ) : null}
                        <Typography
                          variant="body2"
                          color={c.tokensDiff < 0 ? 'success.main' : c.tokensDiff > 0 ? 'error.main' : 'text.secondary'}
                        >
                          {c.tokensDiff > 0 ? '+' : ''}
                          {c.tokensDiff} ({c.tokensDiffPercent?.toFixed(1)}%)
                        </Typography>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  // Single suite view
  if (!suite) return null;

  const handleRerun = () => {
    navigate(`/?rerunSuiteId=${suiteId}`);
  };

  const isRunning = suiteStatus === 'running';
  const completedCount = scenarios.filter((s) => s.status === 'completed' || s.status === 'failed').length;
  const progress = suite.totalScenarios > 0 ? (completedCount / suite.totalScenarios) * 100 : 0;
  const passedCount = scenarios.filter((s) => s.status === 'completed' && s.passed).length;
  const failedCount = scenarios.filter((s) => s.status === 'failed' || (s.status === 'completed' && !s.passed)).length;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/results')}>
          Wroc do historii
        </Button>
        {!isRunning && (
          <Button startIcon={<ReplayIcon />} onClick={handleRerun} variant="outlined">
            Uruchom ponownie
          </Button>
        )}
      </Stack>

      {/* Header z progress */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h4" fontWeight={600}>
              {isRunning ? 'Test w trakcie...' : 'Szczegoly Suite'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {new Date(suite.createdAt).toLocaleString('pl-PL')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              label={suiteStatus.toUpperCase()}
              color={
                suiteStatus === 'completed' ? 'success' :
                suiteStatus === 'running' ? 'primary' :
                suiteStatus === 'failed' ? 'error' :
                suiteStatus === 'stopped' ? 'warning' : 'default'
              }
            />
            {isRunning && (
              <Typography variant="body2">
                {completedCount} / {suite.totalScenarios}
              </Typography>
            )}
          </Stack>
        </Stack>

        {isRunning && (
          <Box mb={2}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <LinearProgress variant="determinate" value={progress} sx={{ flex: 1, height: 8, borderRadius: 1 }} />
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopIcon />}
                onClick={handleStop}
                disabled={isStopping}
                size="small"
              >
                {isStopping ? 'Zatrzymywanie...' : 'Zatrzymaj'}
              </Button>
            </Stack>
            {currentScenario && (
              <Typography variant="body2" color="text.secondary" mt={1}>
                Aktualnie: {currentScenario}
              </Typography>
            )}
          </Box>
        )}

        <Stack direction="row" spacing={4}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Wynik
            </Typography>
            <Typography variant="h5">
              {isRunning ? `${passedCount}/${completedCount}` : `${suite.passedScenarios}/${suite.totalScenarios}`}
              {!isRunning && ` (${((suite.passedScenarios / suite.totalScenarios) * 100).toFixed(0)}%)`}
            </Typography>
          </Box>
          {!isRunning && (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Tokeny
                </Typography>
                <Typography variant="h5">{suite.totalTokens.toLocaleString()}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Czas
                </Typography>
                <Typography variant="h5">{(suite.totalLatencyMs / 1000).toFixed(1)}s</Typography>
              </Box>
            </>
          )}
          <Stack direction="row" spacing={2}>
            <Chip icon={<PassIcon />} label={`${passedCount} PASS`} color="success" />
            <Chip icon={<FailIcon />} label={`${failedCount} FAIL`} color="error" />
          </Stack>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {suiteStatus === 'stopped' && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Test został zatrzymany przez użytkownika. Wykonano {completedCount} z {suite.totalScenarios} scenariuszy.
        </Alert>
      )}

      {/* Konfiguracja Suite */}
      {(suite.configSnapshot || suite.results?.[0]?.systemPromptInfo) && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" mb={2}>Konfiguracja</Typography>

          {/* Model i narzedzia */}
          {suite.configSnapshot && (
            <Stack direction="row" spacing={1} flexWrap="wrap" mb={2} useFlexGap>
              {suite.configSnapshot.model && (
                <Chip label={`Model: ${suite.configSnapshot.model}`} />
              )}
              {suite.configSnapshot.thinkingMode && (
                <Chip label={`Thinking: ${suite.configSnapshot.thinkingMode}`} />
              )}
              {suite.configSnapshot.enabledTools && (
                <Chip label={`Tools: ${suite.configSnapshot.enabledTools.length} enabled`} />
              )}
              {suite.configSnapshot.disabledTools && suite.configSnapshot.disabledTools.length > 0 && (
                <Chip label={`Disabled: ${suite.configSnapshot.disabledTools.length}`} color="warning" />
              )}
              {suite.configSnapshot.systemPromptSource && (
                <Chip label={`Prompt: ${suite.configSnapshot.systemPromptSource}`} variant="outlined" />
              )}
            </Stack>
          )}

          {/* System Prompt - z fallbackiem do configSnapshot */}
          {(suite.results?.[0]?.systemPromptInfo || suite.configSnapshot?.systemPromptRaw) && (
            <>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="subtitle2">System Prompt:</Typography>
                <Chip
                  label={suite.results?.[0]?.systemPromptInfo?.source || suite.configSnapshot?.systemPromptSource || 'custom'}
                  size="small"
                />
                <IconButton size="small" onClick={() => setPromptExpanded(!promptExpanded)}>
                  {promptExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>
              <Collapse in={promptExpanded}>
                <Box
                  sx={{
                    mt: 1,
                    maxHeight: 300,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    p: 1.5,
                    backgroundColor: 'action.hover',
                    borderRadius: 1,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  {suite.configSnapshot?.systemPromptRaw
                    || suite.results?.[0]?.systemPromptInfo?.content
                    || ''}
                </Box>
              </Collapse>
            </>
          )}
        </Paper>
      )}

      {/* Narzedzia MCP */}
      {suite.configSnapshot?.enabledTools && tools.length > 0 && !isRunning && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">
              Narzedzia MCP ({suite.configSnapshot.enabledTools.length}/{tools.length} wlaczonych)
            </Typography>
            <IconButton size="small" onClick={() => setToolsExpanded(!toolsExpanded)}>
              {toolsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={toolsExpanded}>
            <ToolsListView
              tools={tools}
              enabledTools={suite.configSnapshot.enabledTools}
              showOnlyEnabled={false}
              groupByCategory
              toolDescriptions={suite.configSnapshot.toolDescriptions}
              toolParameterDescriptions={suite.configSnapshot.toolParameterDescriptions}
            />
          </Collapse>
          {!toolsExpanded && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {suite.configSnapshot.enabledTools.slice(0, 10).map((tool) => (
                <Chip key={tool} label={tool} size="small" color="primary" />
              ))}
              {suite.configSnapshot.enabledTools.length > 10 && (
                <Chip label={`+${suite.configSnapshot.enabledTools.length - 10}`} size="small" variant="outlined" />
              )}
            </Stack>
          )}
        </Paper>
      )}

      {/* 2 kolumny gdy running, 1 kolumna gdy completed */}
      {isRunning ? (
        <Grid container spacing={3}>
          {/* Lewa: Scenariusze */}
          <Grid item xs={12} md={6}>
            <Typography variant="h6" mb={2}>Scenariusze ({scenarios.length})</Typography>
            <Stack spacing={1}>
              {scenarios.map((scenario) => {
                const status = scenarioStatuses[scenario.id] || scenario.status || 'pending';
                const isCurrent = currentScenario === scenario.id;

                return (
                  <Paper
                    key={scenario.id}
                    onClick={() => navigate(`/results/${suiteId}/scenario/${encodeURIComponent(scenario.id)}`)}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      border: isCurrent ? '2px solid' : '1px solid',
                      borderColor: isCurrent ? 'primary.main' : 'divider',
                      backgroundColor: isCurrent ? 'action.selected' : 'background.paper',
                      '&:hover': { borderColor: 'primary.light', backgroundColor: 'action.hover' },
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="center">
                      {getStatusIcon(status, scenario.passed)}
                      <Typography flex={1}>{scenario.name}</Typography>
                      {status === 'completed' || status === 'failed' ? (
                        <>
                          <Chip label={`${scenario.tokens ?? 0} tok`} size="small" variant="outlined" />
                          <Chip label={`${((scenario.latencyMs ?? 0) / 1000).toFixed(1)}s`} size="small" variant="outlined" />
                        </>
                      ) : status === 'running' ? (
                        <Chip label="W trakcie..." size="small" color="primary" />
                      ) : status === 'cancelled' ? (
                        <Chip label="Anulowano" size="small" color="warning" />
                      ) : (
                        <Chip label="Oczekuje" size="small" variant="outlined" />
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Grid>

          {/* Prawa: Stream */}
          <Grid item xs={12} md={6}>
            <Box sx={{ position: 'sticky', top: 16 }}>
              <Typography variant="h6" mb={2}>
                Stream{currentScenario ? `: ${currentScenario}` : ''}
              </Typography>
              <Paper sx={{ p: 2 }}>
                {currentScenario ? (
                  <>
                    <Box sx={{ maxHeight: 'calc(100vh - 350px)', overflow: 'auto' }}>
                      <ScenarioMessagesView messages={liveMessages} liveMode={true} />
                    </Box>
                    {liveToolCalls.length > 0 && (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={1} useFlexGap>
                        {liveToolCalls.slice(-10).map((tc, i) => (
                          <Chip key={i} label={tc.toolName} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    )}
                  </>
                ) : (
                  <Typography color="text.secondary">Oczekiwanie na scenariusz...</Typography>
                )}
              </Paper>
            </Box>
          </Grid>
        </Grid>
      ) : (
        /* Completed - pojedyncza lista */
        <>
          <Typography variant="h6" mb={2}>Scenariusze ({scenarios.length})</Typography>
          <Stack spacing={1}>
            {scenarios.map((scenario) => {
              const status = scenarioStatuses[scenario.id] || scenario.status || 'pending';

              return (
                <Paper
                  key={scenario.id}
                  onClick={() => navigate(`/results/${suiteId}/scenario/${encodeURIComponent(scenario.id)}`)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { borderColor: 'primary.light', backgroundColor: 'action.hover' },
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    {getStatusIcon(status, scenario.passed)}
                    <Typography flex={1}>{scenario.name}</Typography>
                    {status === 'completed' || status === 'failed' ? (
                      <>
                        <Chip label={`${scenario.tokens ?? 0} tok`} size="small" variant="outlined" />
                        <Chip label={`${((scenario.latencyMs ?? 0) / 1000).toFixed(1)}s`} size="small" variant="outlined" />
                      </>
                    ) : status === 'cancelled' ? (
                      <Chip label="Anulowano" size="small" color="warning" />
                    ) : (
                      <Chip label="Oczekuje" size="small" variant="outlined" />
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </>
      )}
    </Box>
  );
}
