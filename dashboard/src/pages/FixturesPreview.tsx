import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import {
  api,
  FixtureProject,
  FixtureChapter,
  FixturesStatus,
} from '../api/client';
import {
  CopyButton,
  TimelinesAccordion,
  MediaAssetsSection,
} from '../components/fixtures';

function ChaptersAccordion({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<FixtureChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | false>(false);

  useEffect(() => {
    loadChapters();
  }, [projectId]);

  const loadChapters = async () => {
    try {
      setLoading(true);
      const data = await api.getFixtureChapters(projectId);
      setChapters(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania rozdzialow');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <CircularProgress size={20} />;
  if (error) return <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>;
  if (chapters.length === 0) return <Typography color="text.secondary" variant="body2">Brak rozdzialow</Typography>;

  return (
    <Box>
      {chapters.map((chapter) => (
        <Accordion
          key={chapter.id}
          expanded={expanded === chapter.id}
          onChange={(_, isExpanded) => setExpanded(isExpanded ? chapter.id : false)}
          sx={{ bgcolor: 'grey.900' }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={2} width="100%">
              <Typography fontWeight={500}>{chapter.title}</Typography>
              <Chip label={chapter.templateId} size="small" variant="outlined" />
              <Chip label={`${chapter.timelinesCount} timelines`} size="small" variant="outlined" />
              <Chip label={`${chapter.blocksCount} blokow`} size="small" variant="outlined" />
              <Box flexGrow={1} />
              <CopyButton text={chapter.id} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
              Timelines
            </Typography>
            <TimelinesAccordion chapterId={chapter.id} />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

export default function FixturesPreview() {
  const [status, setStatus] = useState<FixturesStatus | null>(null);
  const [projects, setProjects] = useState<FixtureProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | false>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const statusData = await api.getFixturesStatus();
      setStatus(statusData);

      if (statusData.exists) {
        const projectsData = await api.getFixtureProjects();
        setProjects(projectsData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania danych');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight={600}>
          Fixtures Preview
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {status && !status.exists && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography fontWeight={500}>Baza fixtures.db nie istnieje</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {status.instructions}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Sciezka: {status.path}
          </Typography>
        </Alert>
      )}

      {status?.exists && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Baza fixtures.db jest dostepna ({projects.length} projektow)
        </Alert>
      )}

      {projects.length > 0 && (
        <Box>
          {projects.map((project) => (
            <Accordion
              key={project.id}
              expanded={expanded === project.id}
              onChange={(_, isExpanded) => setExpanded(isExpanded ? project.id : false)}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={2} width="100%">
                  <FolderIcon color="primary" />
                  <Typography fontWeight={600}>{project.name}</Typography>
                  <Chip label={`${project.chaptersCount} rozdzialow`} size="small" color="primary" variant="outlined" />
                  <Chip label={`${project.mediaAssetsCount} assets`} size="small" variant="outlined" />
                  <Box flexGrow={1} />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(project.lastModified).toLocaleDateString('pl-PL')}
                  </Typography>
                  <CopyButton text={project.id} />
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Rozdzialy
                  </Typography>
                  <ChaptersAccordion projectId={project.id} />
                </Paper>

                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Media Assets
                  </Typography>
                  <MediaAssetsSection projectId={project.id} />
                </Paper>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {status?.exists && projects.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">Brak projektow w bazie fixtures</Typography>
        </Box>
      )}
    </Box>
  );
}
