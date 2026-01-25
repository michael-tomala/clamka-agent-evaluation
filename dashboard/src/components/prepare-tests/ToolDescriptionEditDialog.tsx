import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from '@mui/material';
import { ToolInfo } from '../../api/client';

export interface ToolDescriptionEditDialogProps {
  tool: ToolInfo | null;
  description: string;
  parameterDescriptions: Record<string, string>;
  onDescriptionChange: (value: string) => void;
  onParameterDescriptionChange: (paramName: string, value: string) => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function ToolDescriptionEditDialog({
  tool,
  description,
  parameterDescriptions,
  onDescriptionChange,
  onParameterDescriptionChange,
  onSave,
  onReset,
  onClose,
}: ToolDescriptionEditDialogProps) {
  // Liczba zmodyfikowanych parametrów
  const modifiedParamsCount = tool?.parameters?.filter(p => {
    const customDesc = parameterDescriptions[p.name];
    return customDesc && customDesc !== p.description && customDesc.trim() !== '';
  }).length || 0;

  // Czy opis narzędzia jest zmodyfikowany
  const isToolDescriptionModified = tool && description !== tool.description;

  return (
    <Dialog open={!!tool} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edytuj opis narzędzia: {tool?.name}
        {(isToolDescriptionModified || modifiedParamsCount > 0) && (
          <Chip
            label={`${(isToolDescriptionModified ? 1 : 0) + modifiedParamsCount} zmian(y)`}
            size="small"
            color="warning"
            sx={{ ml: 2 }}
          />
        )}
      </DialogTitle>
      <DialogContent>
        {/* Opis narzędzia */}
        <TextField
          fullWidth
          multiline
          rows={4}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          variant="outlined"
          label="Opis narzędzia"
          sx={{ mt: 1 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Domyślny: {tool?.description?.substring(0, 150)}{tool?.description && tool.description.length > 150 ? '...' : ''}
        </Typography>

        {/* Opisy parametrów */}
        {tool?.parameters && tool.parameters.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Opisy parametrów ({tool.parameters.length})
              {modifiedParamsCount > 0 && (
                <Chip
                  label={`${modifiedParamsCount} zmod.`}
                  size="small"
                  color="info"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {tool.parameters.map((param) => {
                const currentValue = parameterDescriptions[param.name] ?? param.description;
                const isModified = parameterDescriptions[param.name] &&
                  parameterDescriptions[param.name] !== param.description &&
                  parameterDescriptions[param.name].trim() !== '';

                return (
                  <Box key={param.name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ color: param.required ? 'primary.main' : 'text.secondary' }}
                      >
                        {param.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                      >
                        ({param.type})
                      </Typography>
                      {param.required && (
                        <Chip label="wymagany" size="small" color="primary" variant="outlined" />
                      )}
                      {isModified && (
                        <Chip label="zmodyfikowany" size="small" color="warning" />
                      )}
                    </Box>
                    <TextField
                      fullWidth
                      multiline
                      rows={2}
                      size="small"
                      value={currentValue}
                      onChange={(e) => onParameterDescriptionChange(param.name, e.target.value)}
                      variant="outlined"
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.5 }}
                    >
                      Domyślny: {param.description?.substring(0, 100)}{param.description && param.description.length > 100 ? '...' : ''}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onReset}>
          Przywróć domyślne
        </Button>
        <Button onClick={onClose}>
          Anuluj
        </Button>
        <Button onClick={onSave} variant="contained">
          Zapisz
        </Button>
      </DialogActions>
    </Dialog>
  );
}
