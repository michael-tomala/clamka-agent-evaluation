import { useState } from 'react';
import { Box, Typography, Button, Stack, Alert, CircularProgress } from '@mui/material';
import { Clear as ClearIcon } from '@mui/icons-material';

import { usePrepareTestsState, TransAgentType, SubagentType } from '../hooks/usePrepareTestsState';
import { SystemPromptMode } from './prepareTestsTypes';
import {
  TestConfigSection,
  ToolsDescriptionSection,
  AgentsConfigSection,
  ScenariosSelectorSection,
  ToolDescriptionEditDialog,
  RunTestsButton,
} from '../components/prepare-tests';

export default function PrepareTests() {
  const state = usePrepareTestsState();
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [scenariosExpanded, setScenariosExpanded] = useState(true);

  // Pobierz listę typów trans agentów
  const transAgentTypes = Object.keys(state.defaultTransAgentPrompts) as TransAgentType[];

  // Pobierz listę typów subagentów (Task tool)
  const subagentTypes = Object.keys(state.defaultSubagentPrompts) as SubagentType[];

  // Handler dla zmiany promptu trans agenta (łączy prompt i mode)
  const handleTransAgentPromptChange = (type: TransAgentType, prompt: string, mode: SystemPromptMode) => {
    state.setTransAgentPrompt(type, { raw: prompt, mode });
  };

  // Handler dla zmiany promptu subagenta (tylko prompt, brak mode)
  const handleSubagentPromptChange = (type: SubagentType, prompt: string) => {
    state.setSubagentPrompt(type, { prompt });
  };

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
        {/* 1. KONFIGURACJA */}
        <TestConfigSection
          agent={state.agent}
          model={state.model}
          thinkingMode={state.thinkingMode}
          onAgentChange={state.setAgent}
          onModelChange={state.setModel}
          onThinkingModeChange={state.setThinkingMode}
        />

        {/* 2. NARZĘDZIA (edycja opisów) */}
        <ToolsDescriptionSection
          tools={state.tools}
          toolsByCategory={state.toolsByCategory}
          toolDescriptions={state.toolDescriptions}
          toolParameterDescriptions={state.toolParameterDescriptions}
          loading={state.toolsLoading}
          expanded={toolsExpanded}
          onToggleExpanded={() => setToolsExpanded(!toolsExpanded)}
          onEditTool={state.handleOpenToolEdit}
        />

        {/* 3. KONFIGURACJA AGENTÓW */}
        <AgentsConfigSection
          // Główny agent
          mainAgentPrompt={state.systemPrompt}
          mainAgentDefaultPrompt={state.defaultPrompt}
          mainAgentPromptMode={state.systemPromptMode}
          mainAgentTools={state.tools}
          mainAgentEnabledTools={state.enabledTools}
          onMainAgentPromptChange={state.setSystemPrompt}
          onMainAgentModeChange={state.setSystemPromptMode}
          onMainAgentToolToggle={state.handleToolToggle}
          onMainAgentSelectAllTools={state.handleSelectAllTools}
          onMainAgentDeselectAllTools={state.handleDeselectAllTools}
          onMainAgentResetPrompt={state.handleResetPrompt}
          // Trans agenty
          transAgentTypes={transAgentTypes}
          transAgentPrompts={state.transAgentPrompts}
          defaultTransAgentPrompts={state.defaultTransAgentPrompts}
          transAgentTools={state.transAgentTools}
          transAgentEnabledTools={state.transAgentEnabledTools}
          onTransAgentPromptChange={handleTransAgentPromptChange}
          onTransAgentToolToggle={state.handleTransAgentToolToggle}
          onTransAgentSelectAllTools={state.handleSelectAllTransAgentTools}
          onTransAgentDeselectAllTools={state.handleDeselectAllTransAgentTools}
          onTransAgentReset={state.resetTransAgentPrompt}
          // Subagenty (Task tool)
          subagentTypes={subagentTypes}
          subagentPrompts={state.subagentPrompts}
          defaultSubagentPrompts={state.defaultSubagentPrompts}
          subagentTools={state.subagentTools}
          subagentEnabledTools={state.subagentEnabledTools}
          onSubagentPromptChange={handleSubagentPromptChange}
          onSubagentToolToggle={state.handleSubagentToolToggle}
          onSubagentSelectAllTools={state.handleSelectAllSubagentTools}
          onSubagentDeselectAllTools={state.handleDeselectAllSubagentTools}
          onSubagentReset={state.resetSubagentPrompt}
        />

        {/* 4. SCENARIUSZE */}
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
