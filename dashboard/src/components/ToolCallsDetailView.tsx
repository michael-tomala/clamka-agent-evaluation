import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Build as ToolIcon,
} from '@mui/icons-material';
import type { ToolCall } from '../api/client';

interface ToolCallsDetailViewProps {
  toolCalls: ToolCall[];
  showDetails?: boolean;
}

/**
 * Komponent do szczegółowego wyświetlania tool calls z accordion
 */
export function ToolCallsDetailView({
  toolCalls,
  showDetails = true
}: ToolCallsDetailViewProps) {
  if (toolCalls.length === 0) {
    return (
      <Typography color="text.secondary" textAlign="center" py={2}>
        Brak wywołań narzędzi
      </Typography>
    );
  }

  if (!showDetails) {
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {toolCalls.map((call, i) => (
          <Chip
            key={i}
            label={call.toolName}
            size="small"
            icon={<ToolIcon />}
          />
        ))}
      </Stack>
    );
  }

  return (
    <Box>
      {toolCalls.map((call, i) => (
        <Accordion key={i} disableGutters sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={2} alignItems="center" flex={1}>
              <ToolIcon fontSize="small" color="primary" />
              <Typography fontWeight={500}>{call.toolName}</Typography>
              <Chip
                label={`${call.durationMs}ms`}
                size="small"
                variant="outlined"
                sx={{ ml: 'auto' }}
              />
              <Typography variant="caption" color="text.secondary">
                #{call.order + 1}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Input:
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: 'grey.100',
                  p: 1.5,
                  borderRadius: 1,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 200,
                  m: 0,
                }}
              >
                {JSON.stringify(call.input, null, 2)}
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Output:
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: 'grey.100',
                  p: 1.5,
                  borderRadius: 1,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 200,
                  m: 0,
                }}
              >
                {typeof call.output === 'string'
                  ? call.output
                  : JSON.stringify(call.output, null, 2)}
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
