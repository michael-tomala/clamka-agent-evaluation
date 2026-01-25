import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  Button,
  Breadcrumbs,
  Link,
  Collapse,
  IconButton,
} from '@mui/material';
import {
  CheckCircle as PassIcon,
  Cancel as FailIcon,
  ArrowBack as BackIcon,
  Token as TokenIcon,
  Timer as TimerIcon,
  Replay as TurnIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { api, subscribeToSuite, SuiteEvent, TestResult, RawMessage, ToolCall } from '../api/client';
import { ScenarioMessagesView, ToolCallsDetailView, ScenarioFixturesSection } from '../components';

type ScenarioStatus = 'pending' | 'running' | 'completed' | 'failed';

export default function ScenarioDetail() {
  const { suiteId, scenarioId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ScenarioStatus>('completed');
  const [scenario, setScenario] = useState<TestResult | null>(null);

  // Live mode state
  const [liveMessages, setLiveMessages] = useState<RawMessage[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<ToolCall[]>([]);

  // System prompt collapse
  const [promptExpanded, setPromptExpanded] = useState(false);

  // Suite status (do sprawdzenia czy subskrybowac WebSocket)
  const [suiteStatus, setSuiteStatus] = useState<string>('completed');

  useEffect(() => {
    if (!suiteId || !scenarioId) {
      setError('Brak parametrow');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);

        // Najpierw pobierz status suite'a
        const suiteData = await api.getSuite(suiteId);
        setSuiteStatus(suiteData.status || 'completed');

        // Sprawdz status scenariusza w suite
        const scenarioStatus = suiteData.scenarioStatuses?.[decodeURIComponent(scenarioId)];

        if (scenarioStatus === 'running' || scenarioStatus === 'pending') {
          // Scenariusz w trakcie lub oczekuje
          setStatus(scenarioStatus);
          setScenario(null);
        } else {
          // Probuj pobrac wyniki scenariusza
          try {
            const result = await api.getScenarioResult(suiteId, scenarioId);
            setScenario(result);
            setStatus('completed');
          } catch (e) {
            // Jesli 404 - scenariusz moze byc pending
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
              setStatus('pending');
            } else {
              setStatus('completed');
              setError(errorMessage);
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Nie udalo sie zaladowac danych');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [suiteId, scenarioId]);

  // WebSocket subscription dla live updates
  useEffect(() => {
    if (!suiteId) return;
    if (suiteStatus !== 'running') return;
    if (status === 'completed') return;

    const decodedScenarioId = decodeURIComponent(scenarioId || '');
    const unsubscribe = subscribeToSuite(suiteId, (event: SuiteEvent) => {
      handleSuiteEvent(event, decodedScenarioId);
    });

    return unsubscribe;
  }, [suiteId, scenarioId, suiteStatus, status]);

  const handleSuiteEvent = useCallback((event: SuiteEvent, targetScenarioId: string) => {
    // Filtruj tylko eventy dla tego scenariusza
    if (event.scenarioId && event.scenarioId !== targetScenarioId) return;

    switch (event.type) {
      case 'scenario:start':
        if (event.scenarioId === targetScenarioId) {
          setStatus('running');
          setLiveMessages([]);
          setLiveToolCalls([]);
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
        if (event.result && event.scenarioId === targetScenarioId) {
          setScenario(event.result);
          setStatus(event.result.passed ? 'completed' : 'failed');
        }
        break;

      case 'job:complete':
        // Jesli job sie skonczyl a scenariusz nadal pending - reload
        if (status === 'pending' || status === 'running') {
          window.location.reload();
        }
        break;
    }
  }, [status]);

  // Metryki do wyswietlenia
  const metrics = scenario?.metrics;
  const messages = scenario?.messages || liveMessages;
  const toolCalls = scenario?.toolCalls || liveToolCalls;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component="button"
          underline="hover"
          color="inherit"
          onClick={() => navigate('/results')}
        >
          Historia
        </Link>
        <Link
          component="button"
          underline="hover"
          color="inherit"
          onClick={() => navigate(`/results/${suiteId}`)}
        >
          Suite {suiteId?.slice(0, 8)}
        </Link>
        <Typography color="text.primary">
          {decodeURIComponent(scenarioId || '')}
        </Typography>
      </Breadcrumbs>

      <Button startIcon={<BackIcon />} onClick={() => navigate(`/results/${suiteId}`)} sx={{ mb: 2 }}>
        Wroc do Suite
      </Button>

      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          {status === 'completed' && scenario && (
            scenario.passed ? (
              <PassIcon color="success" fontSize="large" />
            ) : (
              <FailIcon color="error" fontSize="large" />
            )
          )}
          {status === 'failed' && (
            <FailIcon color="error" fontSize="large" />
          )}
          {status === 'pending' && (
            <CircularProgress size={32} />
          )}
          {status === 'running' && (
            <CircularProgress size={32} color="secondary" />
          )}
          <Box flex={1}>
            <Typography variant="h5" fontWeight={600}>
              {scenario?.scenarioName || decodeURIComponent(scenarioId || '')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {scenario?.scenarioId || scenarioId}
            </Typography>
          </Box>
          {status === 'completed' && scenario && (
            <Chip
              label={scenario.passed ? 'PASS' : 'FAIL'}
              color={scenario.passed ? 'success' : 'error'}
              size="medium"
            />
          )}
          {status === 'failed' && (
            <Chip label="FAIL" color="error" size="medium" />
          )}
          {status === 'pending' && (
            <Chip label="Oczekuje" color="default" />
          )}
          {status === 'running' && (
            <Chip label="W trakcie..." color="secondary" />
          )}
        </Stack>

        {/* Metryki */}
        {metrics && (
          <Stack direction="row" spacing={4}>
            <Box display="flex" alignItems="center" gap={1}>
              <TokenIcon fontSize="small" color="primary" />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Tokeny
                </Typography>
                <Typography variant="h6">
                  {metrics.totalTokens.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {metrics.inputTokens.toLocaleString()} in / {metrics.outputTokens.toLocaleString()} out
                </Typography>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <TimerIcon fontSize="small" color="primary" />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Czas
                </Typography>
                <Typography variant="h6">
                  {(metrics.latencyMs / 1000).toFixed(2)}s
                </Typography>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <TurnIcon fontSize="small" color="primary" />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Turny
                </Typography>
                <Typography variant="h6">
                  {metrics.turnCount}
                </Typography>
              </Box>
            </Box>
          </Stack>
        )}
      </Paper>

      {/* Error */}
      {error && status !== 'pending' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Pending message */}
      {status === 'pending' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Scenariusz oczekuje w kolejce lub nie zostal jeszcze wykonany.
        </Alert>
      )}

      {/* Running message */}
      {status === 'running' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Scenariusz jest w trakcie wykonywania. Wyniki pojawia sie na biezaco.
        </Alert>
      )}

      {/* Blad scenariusza */}
      {scenario?.error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="subtitle2">Blad wykonania:</Typography>
          {scenario.error}
        </Alert>
      )}

      {/* System Prompt - przetworzony dla tego scenariusza */}
      {scenario?.systemPromptInfo && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2">System Prompt:</Typography>
            <Chip
              label={scenario.systemPromptInfo.source || 'custom'}
              size="small"
            />
            <IconButton size="small" onClick={() => setPromptExpanded(!promptExpanded)}>
              {promptExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Stack>
          <Collapse in={promptExpanded}>
            <Box
              sx={{
                mt: 1,
                maxHeight: 400,
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
              {scenario.systemPromptInfo.resolvedContent
                || scenario.systemPromptInfo.content
                || 'Brak danych'}
            </Box>
          </Collapse>
        </Paper>
      )}

      {/* Sekcja Fixtures - stan danych przed/po wykonaniu scenariusza */}
      {scenario?.inputContext?.projectId && scenario?.inputContext?.chapterId && (
        <ScenarioFixturesSection
          projectId={scenario.inputContext.projectId}
          chapterId={scenario.inputContext.chapterId}
          dataDiff={scenario?.dataDiff}
        />
      )}

      {/* Glowna sekcja - 2 kolumny */}
      {(status === 'completed' || status === 'running' || status === 'failed') && (messages.length > 0 || toolCalls.length > 0) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 3, width: '100%' }}>
          {/* Lewa kolumna - wiadomosci */}
          <Paper sx={{ p: 2, overflow: 'hidden', width: '100%' }}>
            <Typography variant="h6" mb={2}>
              Historia wiadomosci ({messages.length})
            </Typography>
            <Box sx={{ overflow: 'auto' }}>
              <ScenarioMessagesView
                messages={messages}
                liveMode={status === 'running'}
              />
            </Box>
          </Paper>

          {/* Prawa kolumna - tool calls */}
          <Paper sx={{ p: 2, overflow: 'hidden', width: '100%' }}>
            <Typography variant="h6" mb={2}>
              Wywolania narzedzi ({toolCalls.length})
            </Typography>
            <Box sx={{ overflow: 'auto' }}>
              <ToolCallsDetailView toolCalls={toolCalls} showDetails />
            </Box>
          </Paper>
        </Box>
      )}

      {/* Brak danych */}
      {status !== 'running' && messages.length === 0 && toolCalls.length === 0 && !error && status !== 'pending' && (
        <Alert severity="info">
          Brak danych do wyswietlenia dla tego scenariusza.
        </Alert>
      )}
    </Box>
  );
}
