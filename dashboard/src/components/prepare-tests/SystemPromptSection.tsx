import {
  Alert,
  Box,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { SystemPromptMode } from '../../pages/prepareTestsTypes';

export interface SystemPromptSectionProps {
  systemPrompt: string;
  defaultPrompt: string;
  systemPromptMode: SystemPromptMode;
  onSystemPromptChange: (value: string) => void;
  onModeChange: (mode: SystemPromptMode) => void;
  onReset: () => void;
}

export function SystemPromptSection({
  systemPrompt,
  defaultPrompt,
  systemPromptMode,
  onSystemPromptChange,
  onModeChange,
  onReset,
}: SystemPromptSectionProps) {
  const isModified = systemPrompt !== defaultPrompt;

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          System Prompt
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {isModified && (
            <Chip
              label="Zmodyfikowany"
              size="small"
              color="warning"
              variant="outlined"
            />
          )}
          <Tooltip title="Przywróć domyślny prompt">
            <span>
              <IconButton
                size="small"
                onClick={onReset}
                disabled={!isModified}
              >
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>
      <TextField
        fullWidth
        multiline
        rows={10}
        placeholder="Wpisz custom system prompt (opcjonalnie). Jeśli puste, zostanie użyty domyślny prompt agenta."
        value={systemPrompt}
        onChange={(e) => onSystemPromptChange(e.target.value)}
        variant="outlined"
      />
      <FormControl sx={{ mt: 2, minWidth: 300 }}>
        <InputLabel>Tryb System Prompt</InputLabel>
        <Select
          value={systemPromptMode}
          label="Tryb System Prompt"
          onChange={(e) => onModeChange(e.target.value as SystemPromptMode)}
        >
          <MenuItem value="append">
            Append - dodaj do claude_code
          </MenuItem>
          <MenuItem value="replace">
            Replace - zastąp claude_code
          </MenuItem>
        </Select>
      </FormControl>
      {systemPromptMode === 'replace' && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Tryb Replace usuwa domyślny prompt claude_code (styl odpowiedzi, wytyczne bezpieczeństwa).
          Przydatne dla agentów nie-programistycznych.
        </Alert>
      )}
    </Paper>
  );
}
