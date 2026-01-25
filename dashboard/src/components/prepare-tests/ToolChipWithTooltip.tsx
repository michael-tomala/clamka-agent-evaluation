import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { ToolInfo, ToolParameter } from '../../api/client';

export interface ToolChipWithTooltipProps {
  tool: ToolInfo;
  enabled: boolean;
  customDescription?: string;
  onToggle: () => void;
  onEditDescription: () => void;
}

export function ToolChipWithTooltip({
  tool,
  enabled,
  customDescription,
  onToggle,
  onEditDescription,
}: ToolChipWithTooltipProps) {
  return (
    <Tooltip
      title={
        <Box sx={{ maxWidth: 400 }}>
          <Typography variant="body2" fontWeight={600}>{tool.name}</Typography>
          <Typography variant="caption" display="block" sx={{ mb: 1 }}>
            {customDescription || tool.description}
          </Typography>
          {customDescription && (
            <Typography variant="caption" color="warning.main" display="block" sx={{ mb: 1 }}>
              (opis zmodyfikowany)
            </Typography>
          )}
          {tool.parameters && tool.parameters.length > 0 && (
            <Box sx={{ mt: 1, borderTop: '1px solid rgba(255,255,255,0.2)', pt: 1 }}>
              <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                Parametry:
              </Typography>
              {tool.parameters.map((param: ToolParameter) => (
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
                  {param.description && (
                    <Typography variant="caption" display="block" sx={{ pl: 1, color: 'text.secondary' }}>
                      {param.description}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      }
    >
      <Chip
        label={
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <span>{tool.name}</span>
            {customDescription && (
              <EditIcon sx={{ fontSize: 12, color: 'warning.main' }} />
            )}
          </Stack>
        }
        size="small"
        color={enabled ? 'primary' : 'default'}
        variant={enabled ? 'filled' : 'outlined'}
        onClick={onToggle}
        onDelete={onEditDescription}
        deleteIcon={
          <Tooltip title="Edytuj opis">
            <EditIcon sx={{ fontSize: 14 }} />
          </Tooltip>
        }
      />
    </Tooltip>
  );
}
