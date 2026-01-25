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
  Stack,
} from '@mui/material';
import { api, FixtureMediaAsset } from '../../api/client';
import { CopyButton } from './CopyButton';
import { MediaTypeIcon } from './MediaTypeIcon';

interface MediaAssetsSectionProps {
  projectId: string;
}

export function MediaAssetsSection({ projectId }: MediaAssetsSectionProps) {
  const [assets, setAssets] = useState<FixtureMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAssets();
  }, [projectId]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const data = await api.getFixtureMediaAssets(projectId);
      setAssets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania media assets');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <CircularProgress size={20} />;
  if (error) return <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>;
  if (assets.length === 0) return <Typography color="text.secondary" variant="body2">Brak media assets</Typography>;

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Typ</TableCell>
            <TableCell>Nazwa pliku</TableCell>
            <TableCell>Sciezka</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id} hover>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="caption" fontFamily="monospace">
                    {asset.id.slice(0, 8)}...
                  </Typography>
                  <CopyButton text={asset.id} />
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <MediaTypeIcon type={asset.mediaType} />
                  <Typography variant="body2">{asset.mediaType}</Typography>
                </Stack>
              </TableCell>
              <TableCell>{asset.fileName}</TableCell>
              <TableCell>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {asset.filePath}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
