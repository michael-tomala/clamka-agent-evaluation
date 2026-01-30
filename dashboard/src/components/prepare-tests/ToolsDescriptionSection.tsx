import {
  Box,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  Edit as EditIcon,
} from '@mui/icons-material';
import { ToolInfo, ToolParameter } from '../../api/client';

export interface ToolsDescriptionSectionProps {
  tools: ToolInfo[];
  toolsByCategory: Record<string, ToolInfo[]>;
  toolDescriptions: Record<string, string>;
  toolParameterDescriptions: Record<string, Record<string, string>>;
  loading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onEditTool: (tool: ToolInfo) => void;
}

interface ToolDescriptionChipProps {
  tool: ToolInfo;
  customDescription?: string;
  customParameterDescriptions?: Record<string, string>;
  onEdit: () => void;
}

function ToolDescriptionChip({
  tool,
  customDescription,
  customParameterDescriptions,
  onEdit,
}: ToolDescriptionChipProps) {
  const hasCustomDescription = !!customDescription;
  const hasCustomParameters = customParameterDescriptions && Object.keys(customParameterDescriptions).length > 0;
  const isModified = hasCustomDescription || hasCustomParameters;

  return (
    <Tooltip
      title={
        <Box sx={{ maxWidth: 400 }}>
          <Typography variant="body2" fontWeight={600}>{tool.name}</Typography>
          <Typography variant="caption" display="block" sx={{ mb: 1 }}>
            {customDescription || tool.description}
          </Typography>
          {hasCustomDescription && (
            <Typography variant="caption" color="warning.main" display="block" sx={{ mb: 1 }}>
              (opis zmodyfikowany)
            </Typography>
          )}
          {tool.parameters && tool.parameters.length > 0 && (
            <Box sx={{ mt: 1, borderTop: '1px solid rgba(255,255,255,0.2)', pt: 1 }}>
              <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                Parametry:
              </Typography>
              {tool.parameters.map((param: ToolParameter) => {
                const hasCustomParamDesc = customParameterDescriptions?.[param.name];
                return (
                  <Box key={param.name} sx={{ mb: 0.5 }}>
                    <Typography
                      variant="caption"
                      component="span"
                      fontWeight={600}
                      sx={{ color: param.required ? 'primary.light' : 'text.secondary' }}
                    >
                      {param.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{ ml: 0.5, fontFamily: 'monospace', fontSize: '0.65rem' }}
                    >
                      ({param.type})
                    </Typography>
                    {!param.required && (
                      <Typography
                        variant="caption"
                        component="span"
                        sx={{ ml: 0.5, fontStyle: 'italic', color: 'text.secondary' }}
                      >
                        opcjonalny
                      </Typography>
                    )}
                    {hasCustomParamDesc && (
                      <Typography
                        variant="caption"
                        component="span"
                        sx={{ ml: 0.5, color: 'warning.main' }}
                      >
                        *
                      </Typography>
                    )}
                    {param.description && (
                      <Typography variant="caption" display="block" sx={{ pl: 1, color: 'text.secondary' }}>
                        {hasCustomParamDesc || param.description}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
          <Typography variant="caption" display="block" sx={{ mt: 1, fontStyle: 'italic', color: 'text.secondary' }}>
            Kliknij aby edytować opis
          </Typography>
        </Box>
      }
    >
      <Chip
        label={
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <span>{tool.name}</span>
            {isModified && (
              <EditIcon sx={{ fontSize: 12, color: 'warning.main' }} />
            )}
          </Stack>
        }
        size="small"
        color={isModified ? 'warning' : 'default'}
        variant="outlined"
        onClick={onEdit}
        sx={{ cursor: 'pointer' }}
      />
    </Tooltip>
  );
}

interface ToolCategoryGroupProps {
  category: string;
  tools: ToolInfo[];
  toolDescriptions: Record<string, string>;
  toolParameterDescriptions: Record<string, Record<string, string>>;
  onEditTool: (tool: ToolInfo) => void;
}

function ToolCategoryGroup({
  category,
  tools,
  toolDescriptions,
  toolParameterDescriptions,
  onEditTool,
}: ToolCategoryGroupProps) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', mb: 1 }}
      >
        {category}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {tools.map((tool) => (
          <ToolDescriptionChip
            key={tool.name}
            tool={tool}
            customDescription={toolDescriptions[tool.name]}
            customParameterDescriptions={toolParameterDescriptions[tool.name]}
            onEdit={() => onEditTool(tool)}
          />
        ))}
      </Box>
    </Box>
  );
}

export function ToolsDescriptionSection({
  tools,
  toolsByCategory,
  toolDescriptions,
  toolParameterDescriptions,
  loading,
  expanded,
  onToggleExpanded,
  onEditTool,
}: ToolsDescriptionSectionProps) {
  const customDescriptionsCount = Object.keys(toolDescriptions).length;
  const customParamsCount = Object.keys(toolParameterDescriptions).length;
  const totalModified = customDescriptionsCount + customParamsCount;

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">
          Opisy Narzędzi ({tools.length})
          {totalModified > 0 && (
            <Chip
              label={`${totalModified} zmodyfikowanych`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ ml: 1 }}
            />
          )}
        </Typography>
        <IconButton onClick={onToggleExpanded}>
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Kliknij na narzędzie aby edytować jego opis. Zmodyfikowane opisy są wysyłane do agenta.
      </Typography>

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
                toolDescriptions={toolDescriptions}
                toolParameterDescriptions={toolParameterDescriptions}
                onEditTool={onEditTool}
              />
            ))}
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}
