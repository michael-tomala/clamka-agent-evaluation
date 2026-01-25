import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { api, FixtureTimeline } from '../../api/client';
import { CopyButton } from './CopyButton';
import { BlocksTable } from './BlocksTable';

interface TimelinesAccordionProps {
  chapterId: string;
}

export function TimelinesAccordion({ chapterId }: TimelinesAccordionProps) {
  const [timelines, setTimelines] = useState<FixtureTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | false>(false);

  useEffect(() => {
    loadTimelines();
  }, [chapterId]);

  const loadTimelines = async () => {
    try {
      setLoading(true);
      const data = await api.getFixtureTimelines(chapterId);
      setTimelines(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania timeline\'ow');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <CircularProgress size={20} />;
  if (error) return <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>;
  if (timelines.length === 0) return <Typography color="text.secondary" variant="body2">Brak timeline'ow</Typography>;

  return (
    <Box>
      {timelines.map((timeline) => (
        <Accordion
          key={timeline.id}
          expanded={expanded === timeline.id}
          onChange={(_, isExpanded) => setExpanded(isExpanded ? timeline.id : false)}
          sx={{ bgcolor: 'background.default' }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={2} width="100%">
              <Typography fontWeight={500}>{timeline.label || timeline.type}</Typography>
              <Chip label={timeline.type} size="small" color="info" variant="outlined" />
              <Chip label={`${timeline.blocksCount} blokow`} size="small" variant="outlined" />
              <Box flexGrow={1} />
              <CopyButton text={timeline.id} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <BlocksTable timelineId={timeline.id} />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
