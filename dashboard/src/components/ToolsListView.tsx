import { useMemo } from 'react';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import type { ToolInfo, ToolParameter, ToolParameterDescriptions } from '../api/client';

/**
 * Generuje klucz dot-notation dla zagnieżdżonego parametru
 */
function getParamKey(parentPath: string, paramName: string): string {
  return parentPath ? `${parentPath}.${paramName}` : paramName;
}

/**
 * Rekurencyjnie renderuje parametry w tooltipie z odpowiednią hierarchią
 */
function renderParametersHierarchy(
  params: ToolParameter[],
  customParamDescriptions: Record<string, string> | undefined,
  parentPath: string = '',
  depth: number = 0
): JSX.Element[] {
  return params.map((param) => {
    const paramKey = getParamKey(parentPath, param.name);
    const customParamDesc = customParamDescriptions?.[paramKey];
    const isParamModified = customParamDesc && customParamDesc !== param.description;
    const hasNested = param.properties && param.properties.length > 0;

    // Formatowanie typu
    let displayType = param.type;
    if (param.itemType) {
      displayType = `array[${param.itemType}]`;
    }

    return (
      <Box key={paramKey} sx={{ mb: 0.5, pl: depth * 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          {depth > 0 && (
            <Typography
              variant="caption"
              component="span"
              sx={{ color: 'text.secondary', mr: 0.5 }}
            >
              └
            </Typography>
          )}
          <Typography
            variant="caption"
            component="span"
            fontWeight={600}
            sx={{ color: param.required ? 'primary.light' : 'text.secondary' }}
          >
            {param.name}
          </Typography>
          <Typography
            variant="caption"
            component="span"
            sx={{ ml: 0.5, fontFamily: 'monospace', fontSize: '0.65rem' }}
          >
            ({displayType})
          </Typography>
          {!param.required && (
            <Typography
              variant="caption"
              component="span"
              sx={{ ml: 0.5, fontStyle: 'italic', color: 'text.secondary' }}
            >
              opcjonalny
            </Typography>
          )}
          {isParamModified && (
            <Chip label="zmod." size="small" color="warning" sx={{ height: 14, fontSize: '0.5rem', ml: 0.5 }} />
          )}
          {hasNested && (
            <Chip
              label={`${param.properties!.length} pól`}
              size="small"
              variant="outlined"
              sx={{ height: 14, fontSize: '0.5rem', ml: 0.5 }}
            />
          )}
        </Box>
        {isParamModified ? (
          <>
            <Typography variant="caption" display="block" sx={{ pl: depth > 0 ? 2 : 1, color: 'warning.light' }}>
              Custom: {customParamDesc}
            </Typography>
            <Typography variant="caption" display="block" sx={{ pl: depth > 0 ? 2 : 1, color: 'text.secondary', fontStyle: 'italic', fontSize: '0.6rem' }}>
              Domyślny: {param.description}
            </Typography>
          </>
        ) : param.description ? (
          <Typography variant="caption" display="block" sx={{ pl: depth > 0 ? 2 : 1, color: 'text.secondary' }}>
            {param.description}
          </Typography>
        ) : null}

        {/* Rekurencyjnie renderuj zagnieżdżone właściwości */}
        {hasNested && (
          <Box sx={{ mt: 0.5 }}>
            {renderParametersHierarchy(param.properties!, customParamDescriptions, paramKey, depth + 1)}
          </Box>
        )}
      </Box>
    );
  });
}

interface ToolsListViewProps {
  tools: ToolInfo[];
  enabledTools?: string[];
  showOnlyEnabled?: boolean;
  groupByCategory?: boolean;
  /** Custom opisy narzędzi (nadpisują domyślne) */
  toolDescriptions?: Record<string, string>;
  /** Custom opisy parametrów narzędzi (nadpisują domyślne) */
  toolParameterDescriptions?: ToolParameterDescriptions;
}

/**
 * Komponent do wyświetlania listy narzędzi MCP
 */
export function ToolsListView({
  tools,
  enabledTools,
  showOnlyEnabled = false,
  groupByCategory = true,
  toolDescriptions,
  toolParameterDescriptions,
}: ToolsListViewProps) {
  const enabledSet = useMemo(() => new Set(enabledTools || []), [enabledTools]);

  const filteredTools = useMemo(() => {
    if (!showOnlyEnabled || !enabledTools) return tools;
    return tools.filter(t => enabledSet.has(t.name));
  }, [tools, showOnlyEnabled, enabledTools, enabledSet]);

  const toolsByCategory = useMemo(() => {
    if (!groupByCategory) return { 'Wszystkie': filteredTools };
    const grouped: Record<string, ToolInfo[]> = {};
    for (const tool of filteredTools) {
      if (!grouped[tool.category]) {
        grouped[tool.category] = [];
      }
      grouped[tool.category].push(tool);
    }
    return grouped;
  }, [filteredTools, groupByCategory]);

  // Liczba narzędzi z modyfikacjami
  const modifiedToolsCount = useMemo(() => {
    let count = 0;
    for (const tool of filteredTools) {
      const hasCustomDescription = toolDescriptions?.[tool.name] && toolDescriptions[tool.name] !== tool.description;
      const hasCustomParams = toolParameterDescriptions?.[tool.name] && Object.keys(toolParameterDescriptions[tool.name]).length > 0;
      if (hasCustomDescription || hasCustomParams) count++;
    }
    return count;
  }, [filteredTools, toolDescriptions, toolParameterDescriptions]);

  if (filteredTools.length === 0) {
    return (
      <Typography color="text.secondary" textAlign="center" py={2}>
        Brak narzędzi
      </Typography>
    );
  }

  return (
    <Box>
      {modifiedToolsCount > 0 && (
        <Chip
          label={`${modifiedToolsCount} z modyfikacjami opisów`}
          size="small"
          color="warning"
          sx={{ mb: 2 }}
        />
      )}
      {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
        <Box key={category} sx={{ mb: 2 }}>
          {groupByCategory && (
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', mb: 1 }}
            >
              {category}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {categoryTools.map((tool) => {
              const isEnabled = enabledTools ? enabledSet.has(tool.name) : tool.enabledByDefault;
              const customDescription = toolDescriptions?.[tool.name];
              const customParamDescriptions = toolParameterDescriptions?.[tool.name];
              const hasCustomDescription = customDescription && customDescription !== tool.description;
              const hasCustomParams = customParamDescriptions && Object.keys(customParamDescriptions).length > 0;
              const isModified = hasCustomDescription || hasCustomParams;

              return (
                <Tooltip
                  key={tool.name}
                  title={
                    <Box sx={{ maxWidth: 400 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {tool.name}
                        </Typography>
                        {isModified && (
                          <Chip label="zmodyfikowany" size="small" color="warning" sx={{ height: 18, fontSize: '0.6rem' }} />
                        )}
                      </Box>
                      {hasCustomDescription ? (
                        <>
                          <Typography variant="caption" display="block" sx={{ mb: 0.5, color: 'warning.light' }}>
                            Custom: {customDescription}
                          </Typography>
                          <Typography variant="caption" display="block" sx={{ mb: 1, color: 'text.secondary', fontStyle: 'italic' }}>
                            Domyślny: {tool.description}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                          {tool.description}
                        </Typography>
                      )}
                      {tool.parameters && tool.parameters.length > 0 && (
                        <Box sx={{ mt: 1, borderTop: '1px solid rgba(255,255,255,0.2)', pt: 1 }}>
                          <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                            Parametry:
                          </Typography>
                          {renderParametersHierarchy(tool.parameters, customParamDescriptions)}
                        </Box>
                      )}
                    </Box>
                  }
                >
                  <Chip
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {tool.name}
                        {isModified && (
                          <Box
                            component="span"
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: 'warning.main',
                              display: 'inline-block',
                            }}
                          />
                        )}
                      </Box>
                    }
                    size="small"
                    color={isEnabled ? 'primary' : 'default'}
                    variant={isEnabled ? 'filled' : 'outlined'}
                  />
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
