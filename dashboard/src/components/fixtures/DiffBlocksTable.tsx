import { useState } from 'react';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  IconButton,
  Collapse,
  Box,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import { CopyButton } from './CopyButton';

interface DiffBlockItem {
  id: string;
  data?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface DiffBlocksTableProps {
  blocks: DiffBlockItem[];
  changeType: 'added' | 'modified' | 'deleted';
}

function extractBlockData(item: DiffBlockItem, changeType: 'added' | 'modified' | 'deleted') {
  const source = changeType === 'modified'
    ? item.after ?? item.before
    : item.data;

  return {
    blockType: (source?.blockType as string) || 'unknown',
    offset: source?.timelineOffsetInFrames as number | undefined,
    start: source?.fileRelativeStartFrame as number | undefined,
    end: source?.fileRelativeEndFrame as number | null | undefined,
    mediaAssetId: source?.mediaAssetId as string | null | undefined,
  };
}

function BlockRow({
  item,
  changeType
}: {
  item: DiffBlockItem;
  changeType: 'added' | 'modified' | 'deleted';
}) {
  const [expanded, setExpanded] = useState(false);
  const extracted = extractBlockData(item, changeType);

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
          <Chip label={extracted.blockType} size="small" variant="outlined" />
        </TableCell>
        <TableCell>{extracted.offset ?? '-'}</TableCell>
        <TableCell>{extracted.start ?? '-'}</TableCell>
        <TableCell>{extracted.end ?? '-'}</TableCell>
        <TableCell>
          {extracted.mediaAssetId ? (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="caption" fontFamily="monospace">
                {extracted.mediaAssetId.slice(0, 8)}...
              </Typography>
              <CopyButton text={extracted.mediaAssetId} />
            </Stack>
          ) : (
            '-'
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, bgcolor: rowColor }}>
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

export function DiffBlocksTable({ blocks, changeType }: DiffBlocksTableProps) {
  if (blocks.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        Brak blokow
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
            <TableCell>Offset (frames)</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>End</TableCell>
            <TableCell>Media Asset ID</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {blocks.map((block) => (
            <BlockRow key={block.id} item={block} changeType={changeType} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
