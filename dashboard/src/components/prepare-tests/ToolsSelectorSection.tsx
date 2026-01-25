import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  SelectAll as SelectAllIcon,
  Deselect as DeselectIcon,
} from '@mui/icons-material';
import { ToolInfo } from '../../api/client';
import { ToolCategoryGroup } from './ToolCategoryGroup';

export interface ToolsSelectorSectionProps {
  tools: ToolInfo[];
  toolsByCategory: Record<string, ToolInfo[]>;
  enabledTools: Set<string>;
  toolDescriptions: Record<string, string>;
  loading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToolToggle: (toolName: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onEditToolDescription: (tool: ToolInfo) => void;
}

export function ToolsSelectorSection({
  tools,
  toolsByCategory,
  enabledTools,
  toolDescriptions,
  loading,
  expanded,
  onToggleExpanded,
  onToolToggle,
  onSelectAll,
  onDeselectAll,
  onEditToolDescription,
}: ToolsSelectorSectionProps) {
  const customDescriptionsCount = Object.keys(toolDescriptions).length;

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">
          Narzędzia MCP ({enabledTools.size}/{tools.length} włączonych)
          {customDescriptionsCount > 0 && (
            <Chip
              label={`${customDescriptionsCount} opis${customDescriptionsCount === 1 ? '' : 'ów'} zmod.`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ ml: 1 }}
            />
          )}
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
        {loading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
              <ToolCategoryGroup
                key={category}
                category={category}
                tools={categoryTools}
                enabledTools={enabledTools}
                toolDescriptions={toolDescriptions}
                onToolToggle={onToolToggle}
                onEditDescription={onEditToolDescription}
              />
            ))}
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}
