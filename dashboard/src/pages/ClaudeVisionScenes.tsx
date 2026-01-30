import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Stack,
  SelectChangeEvent,
  Divider,
  IconButton,
  Chip,
  Tooltip,
  Card,
  CardContent,
  CardActions,
  Collapse,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import UploadIcon from '@mui/icons-material/Upload';
import { api, ClaudeVisionTestResponse, ClaudeVisionTestRecord } from '../api/client';
import { ScenarioMessagesView } from '../components/ScenarioMessagesView';

export default function ClaudeVisionScenes() {
  // Konfiguracja
  const [videoPath, setVideoPath] = useState('');
  const [model, setModel] = useState('sonnet');
  const [frameWidth, setFrameWidth] = useState(240);
  const [maxFrames, setMaxFrames] = useState(20);
  const [prompt, setPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState('');
  const [systemPromptMode, setSystemPromptMode] = useState<'append' | 'replace'>('replace');

  // Stan
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaudeVisionTestResponse | null>(null);

  // Historia testów
  const [history, setHistory] = useState<ClaudeVisionTestRecord[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Załaduj domyślne prompty przy starcie
  useEffect(() => {
    api.getClaudeVisionDefaultPrompt().then(({ prompt: p, systemPrompt: sp }) => {
      setDefaultPrompt(p);
      setPrompt(p);
      setDefaultSystemPrompt(sp);
      setSystemPrompt(sp);
    }).catch((err) => {
      console.error('Nie udalo sie pobrac domyslnych promptow:', err);
    });
  }, []);

  // Załaduj historię przy starcie
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { tests } = await api.getClaudeVisionTests({ limit: 20 });
      setHistory(tests);
    } catch (err) {
      console.error('Nie udalo sie pobrac historii:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleResetPrompt = () => {
    setPrompt(defaultPrompt);
  };

  const handleResetSystemPrompt = () => {
    setSystemPrompt(defaultSystemPrompt);
  };

  const handleAnalyze = async () => {
    if (!videoPath.trim()) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.analyzeClaudeVision({
        videoPath: videoPath.trim(),
        prompt: prompt.trim() || undefined,
        model,
        frameWidth,
        maxFrames,
        systemPrompt: systemPrompt.trim() || undefined,
        systemPromptMode,
      });
      setResult(response);
      // Odśwież historię po zapisaniu nowego testu
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleLoadConfig = async (testId: string) => {
    try {
      const config = await api.getClaudeVisionTestConfig(testId);
      setVideoPath(config.videoPath);
      setModel(config.model);
      setFrameWidth(config.frameWidth);
      setMaxFrames(config.maxFrames);
      setPrompt(config.prompt);
      setSystemPrompt(config.systemPrompt || '');
      setSystemPromptMode(config.systemPromptMode || 'append');
    } catch (err) {
      console.error('Nie udalo sie zaladowac konfiguracji:', err);
    }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten test?')) return;
    try {
      await api.deleteClaudeVisionTest(testId);
      loadHistory();
    } catch (err) {
      console.error('Nie udalo sie usunac testu:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileName = (filePath: string) => {
    return filePath.split('/').pop() || filePath;
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Claude Vision - Scenes
      </Typography>

      {/* Sekcja historii */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ cursor: 'pointer' }}
          onClick={() => setHistoryExpanded(!historyExpanded)}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6">Historia testów</Typography>
            <Chip label={history.length} size="small" />
          </Stack>
          <IconButton size="small">
            {historyExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Stack>

        <Collapse in={historyExpanded}>
          <Box sx={{ mt: 2 }}>
            {loadingHistory ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : history.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                Brak zapisanych testów
              </Typography>
            ) : (
              <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1 }}>
                {history.map((test) => (
                  <Card
                    key={test.id}
                    sx={{
                      minWidth: 280,
                      maxWidth: 320,
                      bgcolor: 'grey.900',
                      flexShrink: 0,
                    }}
                  >
                    <CardContent sx={{ pb: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <Chip
                          label={test.model}
                          size="small"
                          color={
                            test.model === 'opus' ? 'secondary' :
                            test.model === 'sonnet' ? 'primary' : 'default'
                          }
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(test.createdAt)}
                        </Typography>
                      </Stack>

                      <Tooltip title={test.videoPath}>
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            mb: 1,
                          }}
                        >
                          {getFileName(test.videoPath)}
                        </Typography>
                      </Tooltip>

                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
                        <Chip
                          label={`${test.frameWidth}px`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={`${test.maxFrames} kl.`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={`${(test.durationMs / 1000).toFixed(1)}s`}
                          size="small"
                          variant="outlined"
                        />
                        {(() => {
                          const total = (test.inputTokens || 0) + (test.outputTokens || 0) +
                                        (test.cacheReadInputTokens || 0) + (test.cacheCreationInputTokens || 0);
                          return total > 0 ? (
                            <Chip
                              label={`${(total / 1000).toFixed(1)}k tok`}
                              size="small"
                              variant="outlined"
                            />
                          ) : null;
                        })()}
                        {test.costUsd != null && test.costUsd > 0 && (
                          <Chip
                            label={`$${test.costUsd.toFixed(4)}`}
                            size="small"
                            variant="outlined"
                            color="warning"
                          />
                        )}
                      </Stack>

                      {test.parsedResult && (
                        <Typography
                          variant="caption"
                          color="success.main"
                          sx={{ display: 'block', mt: 1 }}
                        >
                          ✓ Parsed OK
                        </Typography>
                      )}
                      {test.parseError && (
                        <Typography
                          variant="caption"
                          color="error.main"
                          sx={{ display: 'block', mt: 1 }}
                        >
                          ✗ Parse error
                        </Typography>
                      )}
                    </CardContent>
                    <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
                      <Tooltip title="Załaduj konfigurację">
                        <IconButton
                          size="small"
                          onClick={() => handleLoadConfig(test.id)}
                          color="primary"
                        >
                          <UploadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń test">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteTest(test.id)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </CardActions>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Sekcja konfiguracji */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Konfiguracja</Typography>

        <Stack spacing={2}>
          <TextField
            label="Sciezka do pliku wideo"
            value={videoPath}
            onChange={(e) => setVideoPath(e.target.value)}
            fullWidth
            placeholder="/Users/.../video.mp4"
            size="small"
          />

          <Stack direction="row" spacing={2}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Model</InputLabel>
              <Select
                value={model}
                label="Model"
                onChange={(e) => setModel(e.target.value)}
              >
                <MenuItem value="haiku">Haiku</MenuItem>
                <MenuItem value="sonnet">Sonnet</MenuItem>
                <MenuItem value="opus">Opus</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Szerokosc klatki (px)"
              type="number"
              value={frameWidth}
              onChange={(e) => setFrameWidth(Number(e.target.value) || 240)}
              size="small"
              sx={{ width: 180 }}
              slotProps={{ htmlInput: { min: 80, max: 640, step: 40 } }}
              helperText="80-640px"
            />

            <TextField
              label="Max klatek"
              type="number"
              value={maxFrames}
              onChange={(e) => setMaxFrames(Number(e.target.value) || 20)}
              size="small"
              sx={{ width: 120 }}
              slotProps={{ htmlInput: { min: 4, max: 100, step: 1 } }}
              helperText="4-100"
            />

            <Button
              variant="contained"
              onClick={handleAnalyze}
              disabled={running || !videoPath.trim()}
              startIcon={running ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ minWidth: 180 }}
            >
              {running ? 'Analizuję...' : 'Uruchom analize'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Sekcja promptu */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6">Prompt</Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={handleResetPrompt}
            disabled={prompt === defaultPrompt}
          >
            Resetuj do domyslnego
          </Button>
        </Stack>

        <TextField
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          multiline
          rows={20}
          fullWidth
          slotProps={{
            input: {
              sx: { fontFamily: 'monospace', fontSize: 12 },
            },
          }}
        />
      </Paper>

      {/* Sekcja system promptu */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">System Prompt</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Tryb</InputLabel>
              <Select
                value={systemPromptMode}
                label="Tryb"
                onChange={(e: SelectChangeEvent) => setSystemPromptMode(e.target.value as 'append' | 'replace')}
              >
                <MenuItem value="append">Append</MenuItem>
                <MenuItem value="replace">Replace</MenuItem>
              </Select>
            </FormControl>
            <Button
              size="small"
              variant="outlined"
              onClick={handleResetSystemPrompt}
              disabled={systemPrompt === defaultSystemPrompt}
            >
              Resetuj do domyslnego
            </Button>
          </Stack>
        </Stack>

        {systemPromptMode === 'append' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Tryb Append dokleja tekst do domyslnego preset'u Claude Code (claude_code).
          </Alert>
        )}
        {systemPromptMode === 'replace' && systemPrompt !== defaultSystemPrompt && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Tryb Replace z niestandardowym promptem zastepuje domyslny system prompt Claude Code calkowicie.
          </Alert>
        )}

        <TextField
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          multiline
          rows={12}
          fullWidth
          InputProps={{
            sx: { fontFamily: 'monospace', fontSize: 12 },
          }}
        />
      </Paper>

      {/* Blad */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Wyniki */}
      {result && (
        <>
          {/* Info o wynikach */}
          <Alert severity="info" sx={{ mb: 3 }}>
            Czas: {(result.durationMs / 1000).toFixed(1)}s | Model: {model} |
            Frame width: {result.spriteSheet.frameWidth}px |
            Sprite: {result.spriteSheet.cols}x{result.spriteSheet.rows} ({result.spriteSheet.totalFrames} klatek) |
            Video: {result.videoMetadata.width}x{result.videoMetadata.height} @ {result.videoMetadata.fps.toFixed(1)}fps,{' '}
            {result.videoMetadata.duration.toFixed(1)}s ({result.videoMetadata.frameCount} klatek)
            {result.usedSystemPrompt && (
              <> | System prompt: <strong>{result.systemPromptMode}</strong></>
            )}
            {result.tokenUsage && (
              <> | Tokeny: {result.tokenUsage.inputTokens.toLocaleString()} in / {result.tokenUsage.outputTokens.toLocaleString()} out</>
            )}
            {result.savedTestId && (
              <> | Zapisano: <strong>{result.savedTestId.slice(0, 8)}...</strong></>
            )}
          </Alert>

          {/* Token Usage Summary */}
          {result.tokenUsage && (
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'grey.900' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Token Usage</Typography>
              <Stack direction="row" spacing={3} divider={<Divider orientation="vertical" flexItem />}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Input</Typography>
                  <Typography>{result.tokenUsage.inputTokens.toLocaleString()}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Output</Typography>
                  <Typography>{result.tokenUsage.outputTokens.toLocaleString()}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total</Typography>
                  <Typography fontWeight={600}>
                    {(result.tokenUsage.inputTokens + result.tokenUsage.outputTokens).toLocaleString()}
                  </Typography>
                </Box>
                {result.tokenUsage.cacheReadInputTokens != null && result.tokenUsage.cacheReadInputTokens > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Cache Read</Typography>
                    <Typography color="success.main">{result.tokenUsage.cacheReadInputTokens.toLocaleString()}</Typography>
                  </Box>
                )}
                {result.tokenUsage.cacheCreationInputTokens != null && result.tokenUsage.cacheCreationInputTokens > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Cache Creation</Typography>
                    <Typography color="info.main">{result.tokenUsage.cacheCreationInputTokens.toLocaleString()}</Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          )}

          {/* Historia wiadomosci */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Historia wiadomosci</Typography>
            <ScenarioMessagesView messages={result.messages} />
          </Paper>

          {/* Parsed JSON */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Parsed SceneDescription</Typography>
            {result.parseError && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {result.parseError}
              </Alert>
            )}
            {result.parsed ? (
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  bgcolor: 'grey.900',
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: 'grey.100',
                }}
              >
                {JSON.stringify(result.parsed, null, 2)}
              </Box>
            ) : (
              <Typography color="text.secondary">Brak sparsowanego wyniku</Typography>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}
