import { Paper, Typography, Box } from '@mui/material';
import { ToolInfo, TransAgentPromptConfig } from '../../api/client';
import { SystemPromptMode } from '../../pages/prepareTestsTypes';
import type { TransAgentType } from '../../hooks/usePrepareTestsState';
import { AgentConfigAccordion } from './AgentConfigAccordion';

/** Mapowanie typów trans agentów na nazwy wyświetlane */
const TRANS_AGENT_LABELS: Record<TransAgentType, string> = {
  'media-scout': 'Media Scout (Trans Agent)',
};

export interface AgentsConfigSectionProps {
  // Główny agent
  mainAgentPrompt: string;
  mainAgentDefaultPrompt: string;
  mainAgentPromptMode: SystemPromptMode;
  mainAgentTools: ToolInfo[];
  mainAgentEnabledTools: Set<string>;
  onMainAgentPromptChange: (prompt: string) => void;
  onMainAgentModeChange: (mode: SystemPromptMode) => void;
  onMainAgentToolToggle: (toolName: string) => void;
  onMainAgentSelectAllTools: () => void;
  onMainAgentDeselectAllTools: () => void;
  onMainAgentResetPrompt: () => void;

  // Trans agenty
  transAgentTypes: TransAgentType[];
  transAgentPrompts: Record<TransAgentType, TransAgentPromptConfig>;
  defaultTransAgentPrompts: Record<TransAgentType, string>;
  transAgentTools: Record<TransAgentType, string[]>;
  transAgentEnabledTools: Record<TransAgentType, Set<string>>;
  onTransAgentPromptChange: (type: TransAgentType, prompt: string, mode: SystemPromptMode) => void;
  onTransAgentToolToggle: (type: TransAgentType, toolName: string) => void;
  onTransAgentSelectAllTools: (type: TransAgentType) => void;
  onTransAgentDeselectAllTools: (type: TransAgentType) => void;
  onTransAgentReset: (type: TransAgentType) => void;
}

export function AgentsConfigSection({
  // Główny agent
  mainAgentPrompt,
  mainAgentDefaultPrompt,
  mainAgentPromptMode,
  mainAgentTools,
  mainAgentEnabledTools,
  onMainAgentPromptChange,
  onMainAgentModeChange,
  onMainAgentToolToggle,
  onMainAgentSelectAllTools,
  onMainAgentDeselectAllTools,
  onMainAgentResetPrompt,

  // Trans agenty
  transAgentTypes,
  transAgentPrompts,
  defaultTransAgentPrompts,
  transAgentTools,
  transAgentEnabledTools,
  onTransAgentPromptChange,
  onTransAgentToolToggle,
  onTransAgentSelectAllTools,
  onTransAgentDeselectAllTools,
  onTransAgentReset,
}: AgentsConfigSectionProps) {
  // Sprawdź modyfikacje głównego agenta
  const mainAgentToolNames = mainAgentTools.map(t => t.name);
  const isMainAgentToolsModified = mainAgentEnabledTools.size !== mainAgentTools.length;
  const isMainAgentPromptModified = mainAgentPrompt !== mainAgentDefaultPrompt || mainAgentPromptMode !== 'append';
  const isMainAgentModified = isMainAgentToolsModified || isMainAgentPromptModified;

  return (
    <Paper sx={{ p: 3 }}>
      <Box mb={2}>
        <Typography variant="h6">
          Konfiguracja Agentów
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ustawienia promptów i narzędzi dla głównego agenta oraz trans agentów.
        </Typography>
      </Box>

      {/* Główny Agent */}
      <AgentConfigAccordion
        label="Główny Agent"
        prompt={mainAgentPrompt}
        defaultPrompt={mainAgentDefaultPrompt}
        mode={mainAgentPromptMode}
        tools={mainAgentToolNames}
        enabledTools={mainAgentEnabledTools}
        isModified={isMainAgentModified}
        defaultExpanded
        onPromptChange={onMainAgentPromptChange}
        onModeChange={onMainAgentModeChange}
        onToolToggle={onMainAgentToolToggle}
        onSelectAllTools={onMainAgentSelectAllTools}
        onDeselectAllTools={onMainAgentDeselectAllTools}
        onReset={onMainAgentResetPrompt}
      />

      {/* Trans Agenty */}
      {transAgentTypes.map((type) => {
        const config = transAgentPrompts[type] || { raw: '', mode: 'append' as const };
        const defaultPrompt = defaultTransAgentPrompts[type] || '';
        const tools = transAgentTools[type] || [];
        const enabled = transAgentEnabledTools[type] || new Set<string>();

        const isToolsModified = enabled.size !== tools.length;
        const isPromptModified = config.raw !== defaultPrompt || config.mode !== 'append';
        const isModified = isToolsModified || isPromptModified;

        const currentMode = (config.mode || 'append') as SystemPromptMode;
        const currentPrompt = config.raw || '';

        return (
          <AgentConfigAccordion
            key={type}
            label={TRANS_AGENT_LABELS[type] || type}
            prompt={currentPrompt}
            defaultPrompt={defaultPrompt}
            mode={currentMode}
            tools={tools}
            enabledTools={enabled}
            isModified={isModified}
            onPromptChange={(prompt) => onTransAgentPromptChange(type, prompt, currentMode)}
            onModeChange={(mode) => onTransAgentPromptChange(type, currentPrompt, mode)}
            onToolToggle={(toolName) => onTransAgentToolToggle(type, toolName)}
            onSelectAllTools={() => onTransAgentSelectAllTools(type)}
            onDeselectAllTools={() => onTransAgentDeselectAllTools(type)}
            onReset={() => onTransAgentReset(type)}
          />
        );
      })}
    </Paper>
  );
}
