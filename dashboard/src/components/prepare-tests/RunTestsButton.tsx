import { Box, Button, CircularProgress } from '@mui/material';
import { PlayArrow as PlayIcon } from '@mui/icons-material';

export interface RunTestsButtonProps {
  selectedCount: number;
  running: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function RunTestsButton({ selectedCount, running, disabled, onClick }: RunTestsButtonProps) {
  return (
    <Box display="flex" justifyContent="center">
      <Button
        variant="contained"
        size="large"
        startIcon={running ? <CircularProgress size={20} color="inherit" /> : <PlayIcon />}
        onClick={onClick}
        disabled={disabled || running || selectedCount === 0}
        sx={{ minWidth: 300, py: 1.5 }}
      >
        Uruchom Testy ({selectedCount} wybranych)
      </Button>
    </Box>
  );
}
