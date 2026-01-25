import { useState } from 'react';
import {
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  ExpandMore,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  KeyboardArrowDown,
  KeyboardArrowRight,
} from '@mui/icons-material';
import { DataDiff } from '../../api/client';
import { DiffBlocksTable } from './DiffBlocksTable';
import { CopyButton } from './CopyButton';

interface DataDiffViewProps {
  dataDiff: DataDiff;
}

// ============================================================================
// DiffTimelinesTable
// ============================================================================

interface DiffTimelineItem {
  id: string;
  data?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface DiffTimelinesTableProps {
  timelines: DiffTimelineItem[];
  changeType: 'added' | 'modified' | 'deleted';
}

function extractTimelineData(item: DiffTimelineItem, changeType: 'added' | 'modified' | 'deleted') {
  const source = changeType === 'modified'
    ? item.after ?? item.before
    : item.data;

  return {
    type: (source?.type as string) || 'unknown',
    label: (source?.label as string) || '',
    orderIndex: source?.orderIndex as number | undefined,
  };
}

function TimelineRow({
  item,
  changeType
}: {
  item: DiffTimelineItem;
  changeType: 'added' | 'modified' | 'deleted';
}) {
  const [expanded, setExpanded] = useState(false);
  const extracted = extractTimelineData(item, changeType);

  const rowColor = {
    added: 'rgba(46, 125, 50, 0.08)',
    modified: 'rgba(237, 108, 2, 0.08)',
    deleted: 'rgba(211, 47, 47, 0.08)',
  }[changeType];

  const textColor = {
    added: 'success.main',
    modified: 'warning.main',
    deleted: 'error.main',
  }[changeType];

  return (
    <>
      <TableRow
        hover
        sx={{
          bgcolor: rowColor,
          '& > *': { borderBottom: expanded ? 0 : undefined }
        }}
      >
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="caption" fontFamily="monospace" color={textColor}>
              {item.id.slice(0, 8)}...
            </Typography>
            <CopyButton text={item.id} />
          </Stack>
        </TableCell>
        <TableCell>
          <Chip label={extracted.type} size="small" variant="outlined" />
        </TableCell>
        <TableCell>{extracted.label || '-'}</TableCell>
        <TableCell>{extracted.orderIndex ?? '-'}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, bgcolor: rowColor }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 1, overflow: 'hidden' }}>
              {changeType === 'modified' ? (
                <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      Przed:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        mt: 0.5,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        bgcolor: 'rgba(0,0,0,0.2)',
                        p: 1,
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: 200,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(item.before, null, 2)}
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      Po:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        mt: 0.5,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        bgcolor: 'rgba(0,0,0,0.2)',
                        p: 1,
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: 200,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(item.after, null, 2)}
                    </Box>
                  </Box>
                </Stack>
              ) : (
                <Box sx={{ width: '100%' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold">
                    Szczegoly:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      mt: 0.5,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      bgcolor: 'rgba(0,0,0,0.2)',
                      p: 1,
                      borderRadius: 1,
                      overflow: 'auto',
                      maxHeight: 200,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(item.data, null, 2)}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function DiffTimelinesTable({ timelines, changeType }: DiffTimelinesTableProps) {
  if (timelines.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        Brak timelines
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>ID</TableCell>
            <TableCell>Typ</TableCell>
            <TableCell>Label</TableCell>
            <TableCell>Order Index</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {timelines.map((timeline) => (
            <TimelineRow key={timeline.id} item={timeline} changeType={changeType} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================================================
// DiffMediaAssetsTable
// ============================================================================

interface DiffMediaAssetItem {
  id: string;
  data?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface DiffMediaAssetsTableProps {
  assets: DiffMediaAssetItem[];
  changeType: 'added' | 'modified' | 'deleted';
}

function extractMediaAssetData(item: DiffMediaAssetItem, changeType: 'added' | 'modified' | 'deleted') {
  const source = changeType === 'modified'
    ? item.after ?? item.before
    : item.data;

  return {
    mediaType: (source?.mediaType as string) || 'unknown',
    fileName: (source?.fileName as string) || '',
    filePath: (source?.filePath as string) || '',
  };
}

function MediaAssetRow({
  item,
  changeType
}: {
  item: DiffMediaAssetItem;
  changeType: 'added' | 'modified' | 'deleted';
}) {
  const [expanded, setExpanded] = useState(false);
  const extracted = extractMediaAssetData(item, changeType);

  const rowColor = {
    added: 'rgba(46, 125, 50, 0.08)',
    modified: 'rgba(237, 108, 2, 0.08)',
    deleted: 'rgba(211, 47, 47, 0.08)',
  }[changeType];

  const textColor = {
    added: 'success.main',
    modified: 'warning.main',
    deleted: 'error.main',
  }[changeType];

  return (
    <>
      <TableRow
        hover
        sx={{
          bgcolor: rowColor,
          '& > *': { borderBottom: expanded ? 0 : undefined }
        }}
      >
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="caption" fontFamily="monospace" color={textColor}>
              {item.id.slice(0, 8)}...
            </Typography>
            <CopyButton text={item.id} />
          </Stack>
        </TableCell>
        <TableCell>
          <Chip label={extracted.mediaType} size="small" variant="outlined" />
        </TableCell>
        <TableCell>{extracted.fileName || '-'}</TableCell>
        <TableCell>
          <Typography
            variant="caption"
            fontFamily="monospace"
            sx={{
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {extracted.filePath || '-'}
          </Typography>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, bgcolor: rowColor }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 1, overflow: 'hidden' }}>
              {changeType === 'modified' ? (
                <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      Przed:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        mt: 0.5,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        bgcolor: 'rgba(0,0,0,0.2)',
                        p: 1,
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: 200,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(item.before, null, 2)}
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      Po:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        mt: 0.5,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        bgcolor: 'rgba(0,0,0,0.2)',
                        p: 1,
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: 200,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(item.after, null, 2)}
                    </Box>
                  </Box>
                </Stack>
              ) : (
                <Box sx={{ width: '100%' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold">
                    Szczegoly:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      mt: 0.5,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      bgcolor: 'rgba(0,0,0,0.2)',
                      p: 1,
                      borderRadius: 1,
                      overflow: 'auto',
                      maxHeight: 200,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(item.data, null, 2)}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function DiffMediaAssetsTable({ assets, changeType }: DiffMediaAssetsTableProps) {
  if (assets.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        Brak media assets
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>ID</TableCell>
            <TableCell>Typ</TableCell>
            <TableCell>Nazwa pliku</TableCell>
            <TableCell>Sciezka</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {assets.map((asset) => (
            <MediaAssetRow key={asset.id} item={asset} changeType={changeType} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================================================
// DataDiffView - Main Component
// ============================================================================

interface DiffAccordionProps {
  title: string;
  count: number;
  color: 'success' | 'warning' | 'error';
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function DiffAccordion({ title, count, color, icon, children, defaultExpanded = false }: DiffAccordionProps) {
  if (count === 0) return null;

  const bgColors = {
    success: 'rgba(46, 125, 50, 0.05)',
    warning: 'rgba(237, 108, 2, 0.05)',
    error: 'rgba(211, 47, 47, 0.05)',
  };

  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      sx={{
        bgcolor: bgColors[color],
        '&:before': { display: 'none' },
        mb: 1,
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Stack direction="row" spacing={1} alignItems="center">
          {icon}
          <Typography color={`${color}.main`} fontWeight="medium">
            {title}
          </Typography>
          <Chip
            label={count}
            size="small"
            color={color}
            variant="outlined"
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

export function DataDiffView({ dataDiff }: DataDiffViewProps) {
  const hasBlocksAdded = dataDiff.blocks.added.length > 0;
  const hasBlocksModified = dataDiff.blocks.modified.length > 0;
  const hasBlocksDeleted = dataDiff.blocks.deleted.length > 0;
  const hasTimelinesAdded = dataDiff.timelines.added.length > 0;
  const hasTimelinesModified = dataDiff.timelines.modified.length > 0;
  const hasTimelinesDeleted = dataDiff.timelines.deleted.length > 0;
  const hasMediaAssetsAdded = dataDiff.mediaAssets.added.length > 0;
  const hasMediaAssetsModified = dataDiff.mediaAssets.modified.length > 0;
  const hasMediaAssetsDeleted = dataDiff.mediaAssets.deleted.length > 0;

  const hasAnyChanges =
    hasBlocksAdded || hasBlocksModified || hasBlocksDeleted ||
    hasTimelinesAdded || hasTimelinesModified || hasTimelinesDeleted ||
    hasMediaAssetsAdded || hasMediaAssetsModified || hasMediaAssetsDeleted;

  if (!hasAnyChanges) {
    return (
      <Typography color="text.secondary">
        Brak zmian do wyswietlenia
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom color="text.secondary" mb={2}>
        Zmiany po wykonaniu scenariusza
      </Typography>

      {/* Bloki */}
      <DiffAccordion
        title="Dodane bloki"
        count={dataDiff.blocks.added.length}
        color="success"
        icon={<AddIcon fontSize="small" color="success" />}
        defaultExpanded={hasBlocksAdded && !hasBlocksModified}
      >
        <DiffBlocksTable blocks={dataDiff.blocks.added} changeType="added" />
      </DiffAccordion>

      <DiffAccordion
        title="Zmodyfikowane bloki"
        count={dataDiff.blocks.modified.length}
        color="warning"
        icon={<EditIcon fontSize="small" color="warning" />}
        defaultExpanded={hasBlocksModified}
      >
        <DiffBlocksTable blocks={dataDiff.blocks.modified} changeType="modified" />
      </DiffAccordion>

      <DiffAccordion
        title="Usuniete bloki"
        count={dataDiff.blocks.deleted.length}
        color="error"
        icon={<DeleteIcon fontSize="small" color="error" />}
      >
        <DiffBlocksTable blocks={dataDiff.blocks.deleted} changeType="deleted" />
      </DiffAccordion>

      {/* Timelines */}
      <DiffAccordion
        title="Dodane timelines"
        count={dataDiff.timelines.added.length}
        color="success"
        icon={<AddIcon fontSize="small" color="success" />}
      >
        <DiffTimelinesTable timelines={dataDiff.timelines.added} changeType="added" />
      </DiffAccordion>

      <DiffAccordion
        title="Zmodyfikowane timelines"
        count={dataDiff.timelines.modified.length}
        color="warning"
        icon={<EditIcon fontSize="small" color="warning" />}
      >
        <DiffTimelinesTable timelines={dataDiff.timelines.modified} changeType="modified" />
      </DiffAccordion>

      <DiffAccordion
        title="Usuniete timelines"
        count={dataDiff.timelines.deleted.length}
        color="error"
        icon={<DeleteIcon fontSize="small" color="error" />}
      >
        <DiffTimelinesTable timelines={dataDiff.timelines.deleted} changeType="deleted" />
      </DiffAccordion>

      {/* Media Assets */}
      <DiffAccordion
        title="Dodane media assets"
        count={dataDiff.mediaAssets.added.length}
        color="success"
        icon={<AddIcon fontSize="small" color="success" />}
      >
        <DiffMediaAssetsTable assets={dataDiff.mediaAssets.added} changeType="added" />
      </DiffAccordion>

      <DiffAccordion
        title="Zmodyfikowane media assets"
        count={dataDiff.mediaAssets.modified.length}
        color="warning"
        icon={<EditIcon fontSize="small" color="warning" />}
      >
        <DiffMediaAssetsTable assets={dataDiff.mediaAssets.modified} changeType="modified" />
      </DiffAccordion>

      <DiffAccordion
        title="Usuniete media assets"
        count={dataDiff.mediaAssets.deleted.length}
        color="error"
        icon={<DeleteIcon fontSize="small" color="error" />}
      >
        <DiffMediaAssetsTable assets={dataDiff.mediaAssets.deleted} changeType="deleted" />
      </DiffAccordion>
    </Box>
  );
}
