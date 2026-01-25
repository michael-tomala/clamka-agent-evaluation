import { useState, useEffect } from 'react';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import { api, FixtureBlock } from '../../api/client';
import { CopyButton } from './CopyButton';

interface BlocksTableProps {
  timelineId: string;
}

export function BlocksTable({ timelineId }: BlocksTableProps) {
  const [blocks, setBlocks] = useState<FixtureBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBlocks();
  }, [timelineId]);

  const loadBlocks = async () => {
    try {
      setLoading(true);
      const data = await api.getFixtureBlocks(timelineId);
      setBlocks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania blokow');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <CircularProgress size={20} />;
  if (error) return <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>;
  if (blocks.length === 0) return <Typography color="text.secondary" variant="body2">Brak blokow</Typography>;

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
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
            <TableRow key={block.id} hover>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="caption" fontFamily="monospace">
                    {block.id.slice(0, 8)}...
                  </Typography>
                  <CopyButton text={block.id} />
                </Stack>
              </TableCell>
              <TableCell>
                <Chip label={block.blockType} size="small" variant="outlined" />
              </TableCell>
              <TableCell>{block.timelineOffsetInFrames}</TableCell>
              <TableCell>{block.fileRelativeStartFrame}</TableCell>
              <TableCell>{block.fileRelativeEndFrame ?? '-'}</TableCell>
              <TableCell>
                {block.mediaAssetId ? (
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="caption" fontFamily="monospace">
                      {block.mediaAssetId.slice(0, 8)}...
                    </Typography>
                    <CopyButton text={block.mediaAssetId} />
                  </Stack>
                ) : (
                  '-'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Wersja statyczna dla danych przekazanych jako props (bez API call)
interface StaticBlocksTableProps {
  blocks: FixtureBlock[];
}

export function StaticBlocksTable({ blocks }: StaticBlocksTableProps) {
  if (blocks.length === 0) {
    return <Typography color="text.secondary" variant="body2">Brak blokow</Typography>;
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
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
            <TableRow key={block.id} hover>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="caption" fontFamily="monospace">
                    {block.id.slice(0, 8)}...
                  </Typography>
                  <CopyButton text={block.id} />
                </Stack>
              </TableCell>
              <TableCell>
                <Chip label={block.blockType} size="small" variant="outlined" />
              </TableCell>
              <TableCell>{block.timelineOffsetInFrames}</TableCell>
              <TableCell>{block.fileRelativeStartFrame}</TableCell>
              <TableCell>{block.fileRelativeEndFrame ?? '-'}</TableCell>
              <TableCell>
                {block.mediaAssetId ? (
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="caption" fontFamily="monospace">
                      {block.mediaAssetId.slice(0, 8)}...
                    </Typography>
                    <CopyButton text={block.mediaAssetId} />
                  </Stack>
                ) : (
                  '-'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
