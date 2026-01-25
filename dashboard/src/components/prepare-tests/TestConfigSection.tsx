import {
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { AgentType, ModelType, ThinkingMode } from '../../pages/prepareTestsTypes';

export interface TestConfigSectionProps {
  agent: AgentType;
  model: ModelType;
  thinkingMode: ThinkingMode;
  onAgentChange: (agent: AgentType) => void;
  onModelChange: (model: ModelType) => void;
  onThinkingModeChange: (mode: ThinkingMode) => void;
}

export function TestConfigSection({
  agent,
  model,
  thinkingMode,
  onAgentChange,
  onModelChange,
  onThinkingModeChange,
}: TestConfigSectionProps) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" mb={2}>
        Konfiguracja
      </Typography>
      <Stack direction="row" spacing={3}>
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Agent</InputLabel>
          <Select
            value={agent}
            label="Agent"
            onChange={(e) => onAgentChange(e.target.value as AgentType)}
          >
            <MenuItem value="montage">Montage</MenuItem>
            <MenuItem value="script">Script</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Model</InputLabel>
          <Select
            value={model}
            label="Model"
            onChange={(e) => onModelChange(e.target.value as ModelType)}
          >
            <MenuItem value="haiku">Haiku</MenuItem>
            <MenuItem value="sonnet">Sonnet</MenuItem>
            <MenuItem value="opus">Opus</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Thinking Mode</InputLabel>
          <Select
            value={thinkingMode}
            label="Thinking Mode"
            onChange={(e) => onThinkingModeChange(e.target.value as ThinkingMode)}
          >
            <MenuItem value="think">think (5k)</MenuItem>
            <MenuItem value="hard">hard (16k)</MenuItem>
            <MenuItem value="harder">harder (32k)</MenuItem>
            <MenuItem value="ultrathink">ultrathink (64k)</MenuItem>
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  );
}
