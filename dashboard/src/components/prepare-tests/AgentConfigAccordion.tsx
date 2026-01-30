import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  SelectAll as SelectAllIcon,
  Deselect as DeselectIcon,
} from '@mui/icons-material';
import { SystemPromptMode } from '../../pages/prepareTestsTypes';

export interface AgentConfigAccordionProps {
  label: string;
  prompt: string;
  defaultPrompt?: string;
  mode: SystemPromptMode;
  tools: string[];
  enabledTools: Set<string>;
  isModified: boolean;
  defaultExpanded?: boolean;
  onPromptChange: (prompt: string) => void;
  onModeChange: (mode: SystemPromptMode) => void;
  onToolToggle: (toolName: string) => void;
  onSelectAllTools: () => void;
  onDeselectAllTools: () => void;
  onReset?: () => void;
}

export function AgentConfigAccordion({
  label,
  prompt,
  defaultPrompt,
  mode,
  tools,
  enabledTools,
  isModified,
  defaultExpanded = false,
  onPromptChange,
  onModeChange,
  onToolToggle,
  onSelectAllTools,
  onDeselectAllTools,
  onReset,
}: AgentConfigAccordionProps) {
  const enabledCount = enabledTools.size;
  const totalCount = tools.length;
  const isToolsModified = enabledCount !== totalCount;
  const isPromptModified = defaultPrompt !== undefined && prompt !== defaultPrompt;

  return (
    <Accordion defaultExpanded={defaultExpanded}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography fontWeight={500}>
            {label}
          </Typography>
          {isModified && (
            <Chip
              label="Zmodyfikowany"
              size="small"
              color="warning"
              variant="outlined"
            />
          )}
          {!isModified && (
            <Chip
              label={`${totalCount} narzędzi`}
              size="small"
              variant="outlined"
            />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={3}>
          {/* Prompt Section */}
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2" color="text.secondary">
                System Prompt
              </Typography>
              {onReset && (
                <Tooltip title="Przywróć domyślny prompt">
                  <span>
                    <IconButton
                      size="small"
                      onClick={onReset}
                      disabled={!isPromptModified}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
            <TextField
              fullWidth
              multiline
              rows={8}
              placeholder="Wpisz custom system prompt..."
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              variant="outlined"
              size="small"
            />
            <FormControl sx={{ mt: 1.5, minWidth: 300 }} size="small">
              <InputLabel>Tryb</InputLabel>
              <Select
                value={mode}
                label="Tryb"
                onChange={(e) => onModeChange(e.target.value as SystemPromptMode)}
              >
                <MenuItem value="append">
                  Append - dodaj do domyślnego
                </MenuItem>
                <MenuItem value="replace">
                  Replace - zastąp domyślny
                </MenuItem>
              </Select>
            </FormControl>
            {mode === 'replace' && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Tryb Replace całkowicie zastępuje domyślny prompt agenta.
              </Alert>
            )}
          </Box>

          {/* Tools Section */}
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2" color="text.secondary">
                Narzędzia ({enabledCount}/{totalCount})
                {isToolsModified && (
                  <Chip
                    label="zmienione"
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ ml: 1 }}
                  />
                )}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<SelectAllIcon />}
                  onClick={onSelectAllTools}
                  disabled={enabledCount === totalCount}
                  sx={{ minWidth: 'auto' }}
                >
                  Wszystkie
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<DeselectIcon />}
                  onClick={onDeselectAllTools}
                  disabled={enabledCount === 0}
                  sx={{ minWidth: 'auto' }}
                >
                  Żadne
                </Button>
              </Stack>
            </Box>
            {tools.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                Brak narzędzi dla tego agenta.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {tools.map((toolName) => (
                  <Chip
                    key={toolName}
                    label={toolName}
                    size="small"
                    color={enabledTools.has(toolName) ? 'primary' : 'default'}
                    variant={enabledTools.has(toolName) ? 'filled' : 'outlined'}
                    onClick={() => onToolToggle(toolName)}
                    sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
