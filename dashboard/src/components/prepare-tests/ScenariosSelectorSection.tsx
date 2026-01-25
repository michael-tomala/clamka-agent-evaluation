import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  List,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  Search as SearchIcon,
  SelectAll as SelectAllIcon,
  Deselect as DeselectIcon,
} from '@mui/icons-material';
import { Scenario } from '../../api/client';
import { ScenarioListItem } from './ScenarioListItem';

export interface ScenariosSelectorSectionProps {
  scenarios: Scenario[];
  selectedScenarios: Set<string>;
  totalCount: number;
  loading: boolean;
  expanded: boolean;
  filter: string;
  onToggleExpanded: () => void;
  onFilterChange: (value: string) => void;
  onScenarioToggle: (path: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function ScenariosSelectorSection({
  scenarios,
  selectedScenarios,
  totalCount,
  loading,
  expanded,
  filter,
  onToggleExpanded,
  onFilterChange,
  onScenarioToggle,
  onSelectAll,
  onDeselectAll,
}: ScenariosSelectorSectionProps) {
  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">
          Scenariusze ({selectedScenarios.size}/{totalCount} wybranych)
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            startIcon={<SelectAllIcon />}
            onClick={onSelectAll}
          >
            Wszystkie
          </Button>
          <Button
            size="small"
            startIcon={<DeselectIcon />}
            onClick={onDeselectAll}
          >
            Żadne
          </Button>
          <IconButton onClick={onToggleExpanded}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Stack>
      </Box>

      <Collapse in={expanded}>
        <TextField
          fullWidth
          size="small"
          placeholder="Filtruj scenariusze..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          sx={{ mt: 2, mb: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {loading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
            {scenarios.map((scenario) => (
              <ScenarioListItem
                key={scenario.path}
                scenario={scenario}
                selected={selectedScenarios.has(scenario.path)}
                onToggle={() => onScenarioToggle(scenario.path)}
              />
            ))}
            {scenarios.length === 0 && (
              <Box textAlign="center" py={2}>
                <Typography color="text.secondary">
                  Brak scenariuszy
                </Typography>
              </Box>
            )}
          </List>
        )}
      </Collapse>
    </Paper>
  );
}
