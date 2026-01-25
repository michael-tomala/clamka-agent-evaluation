import { Box, Typography } from '@mui/material';
import { ToolInfo } from '../../api/client';
import { ToolChipWithTooltip } from './ToolChipWithTooltip';

export interface ToolCategoryGroupProps {
  category: string;
  tools: ToolInfo[];
  enabledTools: Set<string>;
  toolDescriptions: Record<string, string>;
  onToolToggle: (toolName: string) => void;
  onEditDescription: (tool: ToolInfo) => void;
}

export function ToolCategoryGroup({
  category,
  tools,
  enabledTools,
  toolDescriptions,
  onToolToggle,
  onEditDescription,
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
          <ToolChipWithTooltip
            key={tool.name}
            tool={tool}
            enabled={enabledTools.has(tool.name)}
            customDescription={toolDescriptions[tool.name]}
            onToggle={() => onToolToggle(tool.name)}
            onEditDescription={() => onEditDescription(tool)}
          />
        ))}
      </Box>
    </Box>
  );
}
