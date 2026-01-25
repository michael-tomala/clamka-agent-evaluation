import { useState } from 'react';
import { Box, Typography, Button, Stack, Alert, CircularProgress } from '@mui/material';
import { Clear as ClearIcon } from '@mui/icons-material';

import { usePrepareTestsState } from '../hooks/usePrepareTestsState';
import {
  TestConfigSection,
  SystemPromptSection,
  ToolsSelectorSection,
  ScenariosSelectorSection,
  ToolDescriptionEditDialog,
  RunTestsButton,
} from '../components/prepare-tests';

export default function PrepareTests() {
  const state = usePrepareTestsState();
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [scenariosExpanded, setScenariosExpanded] = useState(true);

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight={600}>
          Przygotuj Testy
        </Typography>
        {state.rerunSuiteId && (
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={() => { window.location.href = '/'; }}
          >
            Wyczyść
          </Button>
        )}
      </Box>

      {/* Alerts */}
      {state.loading && (
        <Alert severity="info" sx={{ mb: 3 }} icon={<CircularProgress size={20} />}>
          {state.rerunSuiteId ? 'Ładowanie konfiguracji z poprzedniego testu...' : 'Ładowanie danych...'}
        </Alert>
      )}

      {state.error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={state.clearError}>
          {state.error}
        </Alert>
      )}

      <Stack spacing={3}>
        <TestConfigSection
          agent={state.agent}
          model={state.model}
          thinkingMode={state.thinkingMode}
          onAgentChange={state.setAgent}
          onModelChange={state.setModel}
          onThinkingModeChange={state.setThinkingMode}
        />

        <SystemPromptSection
          systemPrompt={state.systemPrompt}
          defaultPrompt={state.defaultPrompt}
          systemPromptMode={state.systemPromptMode}
          onSystemPromptChange={state.setSystemPrompt}
          onModeChange={state.setSystemPromptMode}
          onReset={state.handleResetPrompt}
        />

        <ToolsSelectorSection
          tools={state.tools}
          toolsByCategory={state.toolsByCategory}
          enabledTools={state.enabledTools}
          toolDescriptions={state.toolDescriptions}
          loading={state.toolsLoading}
          expanded={toolsExpanded}
          onToggleExpanded={() => setToolsExpanded(!toolsExpanded)}
          onToolToggle={state.handleToolToggle}
          onSelectAll={state.handleSelectAllTools}
          onDeselectAll={state.handleDeselectAllTools}
          onEditToolDescription={state.handleOpenToolEdit}
        />

        <ScenariosSelectorSection
          scenarios={state.filteredScenarios}
          selectedScenarios={state.selectedScenarios}
          totalCount={state.scenarios.length}
          loading={state.scenariosLoading}
          expanded={scenariosExpanded}
          filter={state.scenarioFilter}
          onToggleExpanded={() => setScenariosExpanded(!scenariosExpanded)}
          onFilterChange={state.setScenarioFilter}
          onScenarioToggle={state.handleScenarioToggle}
          onSelectAll={state.handleSelectAllScenarios}
          onDeselectAll={state.handleDeselectAllScenarios}
        />

        <RunTestsButton
          selectedCount={state.selectedScenarios.size}
          running={state.running}
          onClick={state.handleRunTests}
        />
      </Stack>

      <ToolDescriptionEditDialog
        tool={state.editingTool}
        description={state.editingDescription}
        parameterDescriptions={state.editingParameterDescriptions}
        onDescriptionChange={state.setEditingDescription}
        onParameterDescriptionChange={state.handleParameterDescriptionChange}
        onSave={state.handleSaveToolDescription}
        onReset={state.handleResetToolDescription}
        onClose={() => state.setEditingTool(null)}
      />
    </Box>
  );
}
