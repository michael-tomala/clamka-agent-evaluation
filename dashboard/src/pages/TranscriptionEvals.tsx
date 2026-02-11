/**
 * Transcription Evals Page
 *
 * Główna strona systemu ewaluacji transkrypcji.
 * Trzy zakładki:
 * 1. Konfiguracja assetów + Ground Truth anotacja
 * 2. Uruchamianie ewaluacji
 * 3. Wyniki i porównania
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Alert,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  api,
  type TranscriptionAssetConfig,
  type GroundTruthSegment,
  type TranscriptionBackend,
  type TranscriptionEvalRun,
  type TranscriptionEvalResult,
  type TranscriptionEvalJob,
  type BackendStatus,
  type SegmentMatch,
} from '../api/client';

// ============================================================================
// ASSET CONFIG PANEL
// ============================================================================

function AssetConfigPanel() {
  const [configs, setConfigs] = useState<TranscriptionAssetConfig[]>([]);
  const [newAssetId, setNewAssetId] = useState('');
  const [newAudioPath, setNewAudioPath] = useState('');
  const [newFps, setNewFps] = useState('30');
  const [newLanguage, setNewLanguage] = useState('pl');
  const [newLabel, setNewLabel] = useState('');

  const loadConfigs = useCallback(async () => {
    const data = await api.getTranscriptionAssetConfigs();
    setConfigs(data);
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const handleAdd = async () => {
    if (!newAssetId || !newAudioPath) return;
    await api.upsertTranscriptionAssetConfig({
      assetId: newAssetId,
      audioFilePath: newAudioPath,
      sourceFps: parseFloat(newFps),
      language: newLanguage,
      label: newLabel || undefined,
    });
    setNewAssetId('');
    setNewAudioPath('');
    setNewLabel('');
    loadConfigs();
  };

  const handleDelete = async (assetId: string) => {
    await api.deleteTranscriptionAssetConfig(assetId);
    loadConfigs();
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Konfiguracja assetow audio</Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="flex-end" flexWrap="wrap">
            <TextField
              label="Asset ID"
              value={newAssetId}
              onChange={e => setNewAssetId(e.target.value)}
              size="small"
              sx={{ minWidth: 280 }}
            />
            <TextField
              label="Sciezka do pliku audio"
              value={newAudioPath}
              onChange={e => setNewAudioPath(e.target.value)}
              size="small"
              sx={{ minWidth: 400 }}
              placeholder="/Users/.../file.wav"
            />
            <TextField
              label="FPS"
              value={newFps}
              onChange={e => setNewFps(e.target.value)}
              size="small"
              sx={{ width: 80 }}
              type="number"
            />
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <InputLabel>Jezyk</InputLabel>
              <Select value={newLanguage} onChange={e => setNewLanguage(e.target.value)} label="Jezyk">
                <MenuItem value="pl">PL</MenuItem>
                <MenuItem value="en">EN</MenuItem>
                <MenuItem value="de">DE</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Etykieta"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              size="small"
              sx={{ minWidth: 150 }}
            />
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd} disabled={!newAssetId || !newAudioPath}>
              Dodaj
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Asset ID</TableCell>
              <TableCell>Plik audio</TableCell>
              <TableCell>FPS</TableCell>
              <TableCell>Jezyk</TableCell>
              <TableCell>Etykieta</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {configs.map(config => (
              <TableRow key={config.id}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{config.assetId.slice(0, 12)}...</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{config.audioFilePath}</TableCell>
                <TableCell>{config.sourceFps}</TableCell>
                <TableCell>{config.language}</TableCell>
                <TableCell>{config.label || '-'}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleDelete(config.assetId)} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {configs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                  Brak skonfigurowanych assetow. Dodaj asset audio powyzej.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ============================================================================
// GROUND TRUTH PANEL
// ============================================================================

function GroundTruthPanel() {
  const [configs, setConfigs] = useState<TranscriptionAssetConfig[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [segments, setSegments] = useState<GroundTruthSegment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editStartMs, setEditStartMs] = useState('');
  const [editEndMs, setEditEndMs] = useState('');

  // Nowy segment
  const [newText, setNewText] = useState('');
  const [newStartMs, setNewStartMs] = useState('');
  const [newEndMs, setNewEndMs] = useState('');

  // Audio element ref for wavesurfer
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadConfigs = useCallback(async () => {
    const data = await api.getTranscriptionAssetConfigs();
    setConfigs(data);
  }, []);

  const loadSegments = useCallback(async () => {
    if (!selectedAssetId) return;
    const data = await api.getGroundTruth(selectedAssetId);
    setSegments(data);
  }, [selectedAssetId]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);
  useEffect(() => { loadSegments(); }, [loadSegments]);

  const selectedConfig = configs.find(c => c.assetId === selectedAssetId);
  const audioUrl = selectedAssetId ? api.getTranscriptionAudioUrl(selectedAssetId) : '';

  const handleAddSegment = async () => {
    if (!selectedAssetId || !newText || !newStartMs || !newEndMs) return;
    const config = configs.find(c => c.assetId === selectedAssetId);
    await api.createGroundTruthSegment({
      assetId: selectedAssetId,
      text: newText,
      startMs: parseFloat(newStartMs),
      endMs: parseFloat(newEndMs),
      sourceFps: config?.sourceFps || 30,
      orderIndex: segments.length,
    });
    setNewText('');
    setNewStartMs('');
    setNewEndMs('');
    loadSegments();
  };

  const handleDeleteSegment = async (id: string) => {
    await api.deleteGroundTruthSegment(id);
    loadSegments();
  };

  const handleStartEdit = (seg: GroundTruthSegment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
    setEditStartMs(String(seg.startMs));
    setEditEndMs(String(seg.endMs));
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const config = configs.find(c => c.assetId === selectedAssetId);
    await api.updateGroundTruthSegment(editingId, {
      text: editText,
      startMs: parseFloat(editStartMs),
      endMs: parseFloat(editEndMs),
      sourceFps: config?.sourceFps || 30,
    });
    setEditingId(null);
    loadSegments();
  };

  const handleExport = async () => {
    if (!selectedAssetId) return;
    const data = await api.exportGroundTruth(selectedAssetId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ground-truth-${selectedAssetId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      const importSegments = data.segments || data;
      await api.importGroundTruth(selectedAssetId, importSegments);
      loadSegments();
    };
    input.click();
  };

  const formatMs = (ms: number) => {
    const sec = ms / 1000;
    const min = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(2);
    return `${min}:${s.padStart(5, '0')}`;
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Anotacja Ground Truth</Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 400 }}>
          <InputLabel>Wybierz asset</InputLabel>
          <Select
            value={selectedAssetId}
            onChange={e => setSelectedAssetId(e.target.value)}
            label="Wybierz asset"
          >
            {configs.map(c => (
              <MenuItem key={c.assetId} value={c.assetId}>
                {c.label || c.assetId.slice(0, 12)} ({c.language})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedAssetId && (
          <>
            <Button size="small" startIcon={<DownloadIcon />} onClick={handleExport}>Export</Button>
            <Button size="small" startIcon={<UploadIcon />} onClick={handleImport}>Import</Button>
          </>
        )}
      </Stack>

      {/* Audio Player */}
      {selectedAssetId && audioUrl && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Odtwarzacz audio</Typography>
            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              style={{ width: '100%' }}
            />
            {selectedConfig && (
              <Typography variant="caption" color="text.secondary">
                FPS: {selectedConfig.sourceFps} | Jezyk: {selectedConfig.language} | Plik: {selectedConfig.audioFilePath}
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* Nowy segment */}
      {selectedAssetId && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Dodaj segment</Typography>
            <Stack direction="row" spacing={2} alignItems="flex-end">
              <TextField
                label="Tekst"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                size="small"
                sx={{ flexGrow: 1 }}
                multiline
              />
              <TextField
                label="Start (ms)"
                value={newStartMs}
                onChange={e => setNewStartMs(e.target.value)}
                size="small"
                type="number"
                sx={{ width: 120 }}
              />
              <TextField
                label="End (ms)"
                value={newEndMs}
                onChange={e => setNewEndMs(e.target.value)}
                size="small"
                type="number"
                sx={{ width: 120 }}
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddSegment}
                disabled={!newText || !newStartMs || !newEndMs}
              >
                Dodaj
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Lista segmentow */}
      {selectedAssetId && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40}>#</TableCell>
                <TableCell>Tekst</TableCell>
                <TableCell width={100}>Start</TableCell>
                <TableCell width={100}>End</TableCell>
                <TableCell width={80}>Klatki</TableCell>
                <TableCell width={100} align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {segments.map((seg, idx) => (
                <TableRow key={seg.id} hover>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    {editingId === seg.id ? (
                      <TextField
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        size="small"
                        fullWidth
                        multiline
                      />
                    ) : (
                      <Typography variant="body2">{seg.text}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === seg.id ? (
                      <TextField
                        value={editStartMs}
                        onChange={e => setEditStartMs(e.target.value)}
                        size="small"
                        type="number"
                        sx={{ width: 90 }}
                      />
                    ) : (
                      <Typography variant="body2" fontFamily="monospace">{formatMs(seg.startMs)}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === seg.id ? (
                      <TextField
                        value={editEndMs}
                        onChange={e => setEditEndMs(e.target.value)}
                        size="small"
                        type="number"
                        sx={{ width: 90 }}
                      />
                    ) : (
                      <Typography variant="body2" fontFamily="monospace">{formatMs(seg.endMs)}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">
                      {seg.fileRelativeStartFrame}-{seg.fileRelativeEndFrame}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {editingId === seg.id ? (
                      <>
                        <IconButton size="small" onClick={handleSaveEdit} color="success">
                          <CheckIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setEditingId(null)} color="error">
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton size="small" onClick={() => handleStartEdit(seg)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteSegment(seg.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {segments.length === 0 && selectedAssetId && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    Brak segmentow ground truth. Dodaj segmenty powyzej lub zaimportuj z pliku JSON.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

// ============================================================================
// EVALUATION PANEL
// ============================================================================

function EvaluationPanel() {
  const [configs, setConfigs] = useState<TranscriptionAssetConfig[]>([]);
  const [assetsWithGT, setAssetsWithGT] = useState<Array<{ assetId: string; segmentCount: number }>>([]);
  const [backends, setBackends] = useState<Record<string, BackendStatus>>({});
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [selectedBackend, setSelectedBackend] = useState<TranscriptionBackend>('whisper-cpp');
  const [language, setLanguage] = useState('pl');
  const [label, setLabel] = useState('');
  const [activeJob, setActiveJob] = useState<TranscriptionEvalJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [runs, setRuns] = useState<TranscriptionEvalRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<TranscriptionEvalRun | null>(null);

  const loadData = useCallback(async () => {
    const [configsData, gtData, backendsData, runsData] = await Promise.all([
      api.getTranscriptionAssetConfigs(),
      api.getAssetsWithGroundTruth(),
      api.getTranscriptionBackends(),
      api.getTranscriptionEvalRuns(20),
    ]);
    setConfigs(configsData);
    setAssetsWithGT(gtData);
    setBackends(backendsData);
    setRuns(runsData);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Polling for active job
  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'error') {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      const status = await api.getTranscriptionEvalJobStatus(activeJob.jobId);
      setActiveJob(status);
      if (status.status === 'completed' || status.status === 'error') {
        loadData(); // Reload runs
      }
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeJob, loadData]);

  // Assety z GT i configiem
  const availableAssets = assetsWithGT.filter(a => configs.some(c => c.assetId === a.assetId));

  const handleRun = async () => {
    if (selectedAssets.length === 0) return;

    const result = await api.runTranscriptionEval({
      assetIds: selectedAssets,
      backend: selectedBackend,
      language,
      label: label || undefined,
    });

    setActiveJob({
      jobId: result.jobId,
      evalRunId: result.evalRunId,
      status: 'pending',
      completedAssets: 0,
      totalAssets: result.totalAssets,
      startedAt: new Date().toISOString(),
    });
  };

  const handleViewRun = async (runId: string) => {
    const run = await api.getTranscriptionEvalRun(runId);
    setSelectedRun(run);
  };

  const handleDeleteRun = async (runId: string) => {
    await api.deleteTranscriptionEvalRun(runId);
    setSelectedRun(null);
    loadData();
  };

  const toggleAsset = (assetId: string) => {
    setSelectedAssets(prev =>
      prev.includes(assetId) ? prev.filter(a => a !== assetId) : [...prev, assetId]
    );
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Ewaluacja transkrypcji</Typography>

      {/* Backend status */}
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        {Object.entries(backends).map(([name, status]) => (
          <Chip
            key={name}
            label={`${name}: ${status.available ? 'OK' : status.error || 'N/A'}`}
            color={status.available ? 'success' : 'default'}
            size="small"
            variant="outlined"
          />
        ))}
        <IconButton size="small" onClick={loadData}><RefreshIcon fontSize="small" /></IconButton>
      </Stack>

      {/* Run config */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>Nowa ewaluacja</Typography>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Backend</InputLabel>
                <Select value={selectedBackend} onChange={e => setSelectedBackend(e.target.value as TranscriptionBackend)} label="Backend">
                  <MenuItem value="whisper-cpp">whisper-cpp</MenuItem>
                  <MenuItem value="openai">OpenAI</MenuItem>
                  <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Jezyk</InputLabel>
                <Select value={language} onChange={e => setLanguage(e.target.value)} label="Jezyk">
                  <MenuItem value="pl">PL</MenuItem>
                  <MenuItem value="en">EN</MenuItem>
                  <MenuItem value="de">DE</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Etykieta (opcjonalna)" value={label} onChange={e => setLabel(e.target.value)} size="small" sx={{ minWidth: 200 }} />
            </Stack>

            {/* Assety z GT */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Assety z ground truth ({availableAssets.length} dostepnych):
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {availableAssets.map(a => {
                  const config = configs.find(c => c.assetId === a.assetId);
                  return (
                    <Chip
                      key={a.assetId}
                      label={`${config?.label || a.assetId.slice(0, 8)} (${a.segmentCount} seg)`}
                      onClick={() => toggleAsset(a.assetId)}
                      color={selectedAssets.includes(a.assetId) ? 'primary' : 'default'}
                      variant={selectedAssets.includes(a.assetId) ? 'filled' : 'outlined'}
                      size="small"
                    />
                  );
                })}
                {availableAssets.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Brak assetow z ground truth i konfiguracjami. Dodaj asset w zakladce "Assety" i anotuj ground truth w "Ground Truth".
                  </Typography>
                )}
              </Stack>
            </Box>

            <Button
              variant="contained"
              startIcon={<PlayIcon />}
              onClick={handleRun}
              disabled={selectedAssets.length === 0 || (activeJob?.status === 'running' || activeJob?.status === 'pending')}
            >
              Uruchom ewaluacje ({selectedAssets.length} assetow)
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Active job progress */}
      {activeJob && (activeJob.status === 'pending' || activeJob.status === 'running') && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Ewaluacja w toku: {activeJob.completedAssets}/{activeJob.totalAssets} assetow
            {activeJob.currentAssetId && ` (aktualnie: ${activeJob.currentAssetId.slice(0, 8)}...)`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={activeJob.totalAssets ? (activeJob.completedAssets / activeJob.totalAssets) * 100 : 0}
            sx={{ mt: 1 }}
          />
        </Alert>
      )}

      {activeJob && activeJob.status === 'completed' && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Ewaluacja zakonczona! {activeJob.completedAssets} assetow przetworzonych.
          <Button size="small" onClick={() => handleViewRun(activeJob.evalRunId)} sx={{ ml: 2 }}>
            Zobacz wyniki
          </Button>
        </Alert>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Runs history */}
      <Typography variant="h6" gutterBottom>Historia ewaluacji</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>Backend</TableCell>
              <TableCell>Jezyk</TableCell>
              <TableCell>Assety</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Etykieta</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.map(run => (
              <TableRow key={run.id} hover sx={{ cursor: 'pointer' }} onClick={() => handleViewRun(run.id)}>
                <TableCell>{new Date(run.createdDate).toLocaleString('pl')}</TableCell>
                <TableCell><Chip label={run.backend} size="small" variant="outlined" /></TableCell>
                <TableCell>{run.language}</TableCell>
                <TableCell>{run.completedAssets}/{run.totalAssets}</TableCell>
                <TableCell>
                  <Chip
                    label={run.status}
                    size="small"
                    color={run.status === 'completed' ? 'success' : run.status === 'error' ? 'error' : 'default'}
                  />
                </TableCell>
                <TableCell>{run.label || '-'}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={e => { e.stopPropagation(); handleDeleteRun(run.id); }} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  Brak historii ewaluacji. Uruchom pierwsza ewaluacje powyzej.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Run details dialog */}
      <EvalRunDialog run={selectedRun} onClose={() => setSelectedRun(null)} />
    </Box>
  );
}

// ============================================================================
// EVAL RUN DIALOG (wyniki)
// ============================================================================

function EvalRunDialog({ run, onClose }: { run: TranscriptionEvalRun | null; onClose: () => void }) {
  if (!run) return null;

  return (
    <Dialog open={!!run} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Wyniki ewaluacji: {run.backend} ({run.language})
        {run.label && <Chip label={run.label} size="small" sx={{ ml: 1 }} />}
      </DialogTitle>
      <DialogContent>
        {/* Summary cards */}
        {run.results.map(result => (
          <EvalResultCard key={result.id} result={result} />
        ))}

        {run.results.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            Brak wynikow w tym runie.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================================================
// EVAL RESULT CARD
// ============================================================================

function EvalResultCard({ result }: { result: TranscriptionEvalResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        {/* Summary metrics */}
        <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ minWidth: 100 }}>
            Asset: {result.assetId.slice(0, 8)}...
          </Typography>
          <MetricChip label="Match" value={`${result.matchPercentage.toFixed(1)}%`} good={result.matchPercentage >= 80} />
          <MetricChip label="Avg IoU" value={result.avgIoU.toFixed(3)} good={result.avgIoU >= 0.7} />
          <MetricChip label="Avg Start" value={`${result.avgStartDiffMs.toFixed(0)}ms`} good={result.avgStartDiffMs <= 200} />
          <MetricChip label="Avg End" value={`${result.avgEndDiffMs.toFixed(0)}ms`} good={result.avgEndDiffMs <= 200} />
          <MetricChip label="Max Start" value={`${result.maxStartDiffMs.toFixed(0)}ms`} good={result.maxStartDiffMs <= 500} />
          <MetricChip label="Max End" value={`${result.maxEndDiffMs.toFixed(0)}ms`} good={result.maxEndDiffMs <= 500} />
          <Typography variant="caption" color="text.secondary">
            GT: {result.totalGroundTruthSegments} | Pred: {result.totalPredictedSegments} | {result.transcriptionDurationMs}ms
          </Typography>
          <Button size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Zwi\u0144' : 'Rozwi\u0144'}
          </Button>
        </Stack>

        {/* Timeline comparison */}
        {expanded && (
          <>
            <TimelineComparison matches={result.segmentMatches} />
            <SegmentMatchTable matches={result.segmentMatches} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MetricChip({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <Tooltip title={label}>
      <Chip
        label={`${label}: ${value}`}
        size="small"
        color={good ? 'success' : 'warning'}
        variant="outlined"
      />
    </Tooltip>
  );
}

// ============================================================================
// TIMELINE COMPARISON
// ============================================================================

function TimelineComparison({ matches }: { matches: SegmentMatch[] }) {
  if (matches.length === 0) return null;

  // Znajdz max czas
  const allTimes = matches.flatMap(m => {
    const times = [m.groundTruth.startMs, m.groundTruth.endMs];
    if (m.predicted) {
      times.push(m.predicted.startMs, m.predicted.endMs);
    }
    return times;
  });
  const maxMs = Math.max(...allTimes);
  if (maxMs === 0) return null;

  const toPercent = (ms: number) => (ms / maxMs) * 100;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
        Porownanie timeline (zielony = GT, niebieski = predicted)
      </Typography>

      {/* GT row */}
      <Box sx={{ position: 'relative', height: 24, bgcolor: 'background.default', borderRadius: 1, mb: 0.5, border: '1px solid', borderColor: 'divider' }}>
        {matches.map((m, i) => (
          <Tooltip key={i} title={`GT: ${m.groundTruth.text.slice(0, 50)} (${m.groundTruth.startMs}-${m.groundTruth.endMs}ms)`}>
            <Box
              sx={{
                position: 'absolute',
                left: `${toPercent(m.groundTruth.startMs)}%`,
                width: `${Math.max(toPercent(m.groundTruth.endMs - m.groundTruth.startMs), 0.5)}%`,
                height: '100%',
                bgcolor: m.matched ? 'success.main' : 'error.main',
                opacity: 0.7,
                borderRadius: 0.5,
              }}
            />
          </Tooltip>
        ))}
      </Box>

      {/* Predicted row */}
      <Box sx={{ position: 'relative', height: 24, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
        {matches.filter(m => m.predicted).map((m, i) => (
          <Tooltip key={i} title={`Pred: ${m.predicted!.text.slice(0, 50)} (${m.predicted!.startMs}-${m.predicted!.endMs}ms)`}>
            <Box
              sx={{
                position: 'absolute',
                left: `${toPercent(m.predicted!.startMs)}%`,
                width: `${Math.max(toPercent(m.predicted!.endMs - m.predicted!.startMs), 0.5)}%`,
                height: '100%',
                bgcolor: 'info.main',
                opacity: 0.7,
                borderRadius: 0.5,
              }}
            />
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}

// ============================================================================
// SEGMENT MATCH TABLE
// ============================================================================

function SegmentMatchTable({ matches }: { matches: SegmentMatch[] }) {
  const formatMs = (ms: number) => {
    const sec = ms / 1000;
    const min = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(2);
    return `${min}:${s.padStart(5, '0')}`;
  };

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>GT Tekst</TableCell>
            <TableCell>GT Start</TableCell>
            <TableCell>GT End</TableCell>
            <TableCell>Pred Tekst</TableCell>
            <TableCell>Start Diff</TableCell>
            <TableCell>End Diff</TableCell>
            <TableCell>IoU</TableCell>
            <TableCell>Text Sim</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {matches.map((m, i) => (
            <TableRow key={i} sx={{ bgcolor: m.matched ? undefined : 'error.dark', opacity: m.matched ? 1 : 0.7 }}>
              <TableCell>{i + 1}</TableCell>
              <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.groundTruth.text}
              </TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{formatMs(m.groundTruth.startMs)}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{formatMs(m.groundTruth.endMs)}</TableCell>
              <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.predicted?.text || <Typography variant="caption" color="error">BRAK</Typography>}
              </TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: m.startDiffMs !== null ? (Math.abs(m.startDiffMs) > 200 ? 'warning.main' : 'success.main') : 'error.main' }}>
                {m.startDiffMs !== null ? `${m.startDiffMs > 0 ? '+' : ''}${m.startDiffMs.toFixed(0)}ms` : '-'}
              </TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: m.endDiffMs !== null ? (Math.abs(m.endDiffMs) > 200 ? 'warning.main' : 'success.main') : 'error.main' }}>
                {m.endDiffMs !== null ? `${m.endDiffMs > 0 ? '+' : ''}${m.endDiffMs.toFixed(0)}ms` : '-'}
              </TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{m.iou.toFixed(3)}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{m.textSimilarity.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function TranscriptionEvals() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
        Ewaluacja transkrypcji
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Porownuj jakosc transkrypcji whisper-cpp, OpenAI i ElevenLabs z ground truth.
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Assety" />
        <Tab label="Ground Truth" />
        <Tab label="Ewaluacja" />
      </Tabs>

      {tab === 0 && <AssetConfigPanel />}
      {tab === 1 && <GroundTruthPanel />}
      {tab === 2 && <EvaluationPanel />}
    </Box>
  );
}
