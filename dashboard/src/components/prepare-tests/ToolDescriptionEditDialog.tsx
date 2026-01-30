import {
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useState } from 'react';
import { ToolInfo, ToolParameter } from '../../api/client';

/**
 * Generuje klucz dot-notation dla zagnieżdżonego parametru
 */
function getParamKey(parentPath: string, paramName: string): string {
  return parentPath ? `${parentPath}.${paramName}` : paramName;
}

/**
 * Liczy wszystkie parametry rekurencyjnie (włącznie z zagnieżdżonymi)
 */
function countAllParams(params: ToolParameter[]): number {
  let count = 0;
  for (const param of params) {
    count += 1;
    if (param.properties && param.properties.length > 0) {
      count += countAllParams(param.properties);
    }
  }
  return count;
}

/**
 * Liczy zmodyfikowane parametry rekurencyjnie
 */
function countModifiedParams(
  params: ToolParameter[],
  parameterDescriptions: Record<string, string>,
  parentPath: string = ''
): number {
  let count = 0;
  for (const param of params) {
    const key = getParamKey(parentPath, param.name);
    const customDesc = parameterDescriptions[key];
    if (customDesc && customDesc !== param.description && customDesc.trim() !== '') {
      count += 1;
    }
    if (param.properties && param.properties.length > 0) {
      count += countModifiedParams(param.properties, parameterDescriptions, key);
    }
  }
  return count;
}

/**
 * Rekurencyjny edytor zagnieżdżonych parametrów
 */
interface NestedParameterEditorProps {
  params: ToolParameter[];
  parameterDescriptions: Record<string, string>;
  onParameterDescriptionChange: (paramKey: string, value: string) => void;
  parentPath?: string;
  depth?: number;
}

function NestedParameterEditor({
  params,
  parameterDescriptions,
  onParameterDescriptionChange,
  parentPath = '',
  depth = 0,
}: NestedParameterEditorProps) {
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());

  const toggleExpanded = (key: string) => {
    setExpandedParams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {params.map((param) => {
        const paramKey = getParamKey(parentPath, param.name);
        const currentValue = parameterDescriptions[paramKey] ?? param.description;
        const isModified =
          parameterDescriptions[paramKey] &&
          parameterDescriptions[paramKey] !== param.description &&
          parameterDescriptions[paramKey].trim() !== '';
        const hasNested = param.properties && param.properties.length > 0;
        const isExpanded = expandedParams.has(paramKey);

        // Formatowanie typu dla wyświetlenia
        let displayType = param.type;
        if (param.itemType) {
          displayType = `array[${param.itemType}]`;
        }

        return (
          <Box
            key={paramKey}
            sx={{
              pl: depth * 3,
              borderLeft: depth > 0 ? '2px solid' : 'none',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              {hasNested && (
                <IconButton size="small" onClick={() => toggleExpanded(paramKey)} sx={{ p: 0.5 }}>
                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              )}
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
                ({displayType})
              </Typography>
              {param.required && (
                <Chip label="wymagany" size="small" color="primary" variant="outlined" />
              )}
              {isModified && <Chip label="zmodyfikowany" size="small" color="warning" />}
              {hasNested && (
                <Chip
                  label={`${param.properties!.length} pól`}
                  size="small"
                  variant="outlined"
                  sx={{ ml: 'auto' }}
                />
              )}
            </Box>
            <TextField
              fullWidth
              multiline
              rows={2}
              size="small"
              value={currentValue}
              onChange={(e) => onParameterDescriptionChange(paramKey, e.target.value)}
              variant="outlined"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Domyślny: {param.description?.substring(0, 100)}
              {param.description && param.description.length > 100 ? '...' : ''}
            </Typography>

            {/* Zagnieżdżone parametry */}
            {hasNested && (
              <Collapse in={isExpanded}>
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
                  >
                    Właściwości {param.itemType === 'object' ? 'elementu tablicy' : 'obiektu'}:
                  </Typography>
                  <NestedParameterEditor
                    params={param.properties!}
                    parameterDescriptions={parameterDescriptions}
                    onParameterDescriptionChange={onParameterDescriptionChange}
                    parentPath={paramKey}
                    depth={depth + 1}
                  />
                </Box>
              </Collapse>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

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
  // Liczba zmodyfikowanych parametrów (rekurencyjnie)
  const modifiedParamsCount = tool?.parameters
    ? countModifiedParams(tool.parameters, parameterDescriptions)
    : 0;

  // Całkowita liczba parametrów (rekurencyjnie)
  const totalParamsCount = tool?.parameters ? countAllParams(tool.parameters) : 0;

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
              Opisy parametrów ({totalParamsCount})
              {modifiedParamsCount > 0 && (
                <Chip
                  label={`${modifiedParamsCount} zmod.`}
                  size="small"
                  color="info"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
            <NestedParameterEditor
              params={tool.parameters}
              parameterDescriptions={parameterDescriptions}
              onParameterDescriptionChange={onParameterDescriptionChange}
            />
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
