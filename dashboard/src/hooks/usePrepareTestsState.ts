import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, Scenario, ToolInfo } from '../api/client';
import { AgentType, ModelType, ThinkingMode, SystemPromptMode } from '../pages/prepareTestsTypes';

export interface UsePrepareTestsStateReturn {
  // Inicjalizacja
  loading: boolean;
  initialized: boolean;
  error: string | null;
  running: boolean;
  rerunSuiteId: string | null;

  // Config
  agent: AgentType;
  model: ModelType;
  thinkingMode: ThinkingMode;
  setAgent: (agent: AgentType) => void;
  setModel: (model: ModelType) => void;
  setThinkingMode: (mode: ThinkingMode) => void;

  // Prompt
  systemPrompt: string;
  defaultPrompt: string;
  systemPromptMode: SystemPromptMode;
  setSystemPrompt: (value: string) => void;
  setSystemPromptMode: (mode: SystemPromptMode) => void;
  handleResetPrompt: () => void;

  // Tools
  tools: ToolInfo[];
  enabledTools: Set<string>;
  toolDescriptions: Record<string, string>;
  toolParameterDescriptions: Record<string, Record<string, string>>;
  toolsLoading: boolean;
  toolsByCategory: Record<string, ToolInfo[]>;
  handleToolToggle: (toolName: string) => void;
  handleSelectAllTools: () => void;
  handleDeselectAllTools: () => void;

  // Tool edit
  editingTool: ToolInfo | null;
  editingDescription: string;
  editingParameterDescriptions: Record<string, string>;
  handleOpenToolEdit: (tool: ToolInfo) => void;
  handleSaveToolDescription: () => void;
  handleResetToolDescription: () => void;
  handleParameterDescriptionChange: (paramName: string, value: string) => void;
  setEditingTool: (tool: ToolInfo | null) => void;
  setEditingDescription: (desc: string) => void;

  // Scenarios
  scenarios: Scenario[];
  selectedScenarios: Set<string>;
  scenariosLoading: boolean;
  filteredScenarios: Scenario[];
  scenarioFilter: string;
  setScenarioFilter: (value: string) => void;
  handleScenarioToggle: (path: string) => void;
  handleSelectAllScenarios: () => void;
  handleDeselectAllScenarios: () => void;

  // Actions
  handleRunTests: () => Promise<void>;
  clearError: () => void;
}

export function usePrepareTestsState(): UsePrepareTestsStateReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rerunSuiteId = searchParams.get('rerunSuiteId');

  // Ref do śledzenia poprzedniej wartości agenta (dla wykrywania ręcznej zmiany)
  const prevAgentRef = useRef<AgentType | null>(null);

  // Flaga inicjalizacji - kluczowa dla rozdzielenia ścieżek
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);

  // Stan formularza
  const [systemPrompt, setSystemPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [systemPromptMode, setSystemPromptMode] = useState<SystemPromptMode>('append');
  const [agent, setAgent] = useState<AgentType>('montage');
  const [model, setModel] = useState<ModelType>('sonnet');
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('think');

  // Narzędzia
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set());
  const [toolDescriptions, setToolDescriptions] = useState<Record<string, string>>({});
  const [toolParameterDescriptions, setToolParameterDescriptions] =
    useState<Record<string, Record<string, string>>>({});
  const [toolsLoading, setToolsLoading] = useState(false);

  // Dialog edycji opisu narzędzia
  const [editingTool, setEditingTool] = useState<ToolInfo | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [editingParameterDescriptions, setEditingParameterDescriptions] =
    useState<Record<string, string>>({});

  // Scenariusze
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set());
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [scenarioFilter, setScenarioFilter] = useState('');

  // Status
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // INICJALIZACJA - uruchamia się RAZ przy mount
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);

      try {
        if (rerunSuiteId) {
          // === ŚCIEŻKA RERUN ===
          const [suiteData, scenariosData] = await Promise.all([
            api.getSuite(rerunSuiteId),
            api.getSuiteScenarios(rerunSuiteId),
          ]);

          // Wyciągnij agenta z pierwszego scenarioId
          const firstScenarioId = scenariosData[0]?.id || '';
          const agentFromScenario = firstScenarioId.split('/')[0] as AgentType;
          const validAgent = (agentFromScenario === 'montage' || agentFromScenario === 'script')
            ? agentFromScenario
            : 'montage';

          // Pobierz dane agenta (prompt i tools)
          const [promptResponse, toolsResponse, allScenarios] = await Promise.all([
            api.getAgentPrompt(validAgent),
            api.getTools(validAgent),
            api.getScenarios(),
          ]);

          // Ustaw WSZYSTKO naraz
          setAgent(validAgent);
          setModel((suiteData.configSnapshot?.model as ModelType) || 'sonnet');
          setThinkingMode((suiteData.configSnapshot?.thinkingMode as ThinkingMode) || 'think');

          // Prompt
          setDefaultPrompt(promptResponse.prompt);
          const rerunPrompt = suiteData.results?.[0]?.systemPromptInfo?.content;
          setSystemPrompt(rerunPrompt || promptResponse.prompt);
          setSystemPromptMode((suiteData.configSnapshot?.systemPromptMode as SystemPromptMode) || 'append');

          // Tools
          setTools(toolsResponse.tools);
          const rerunEnabledTools = suiteData.configSnapshot?.enabledTools;
          if (rerunEnabledTools) {
            setEnabledTools(new Set(rerunEnabledTools));
          } else {
            setEnabledTools(new Set(toolsResponse.tools.filter(t => t.enabledByDefault).map(t => t.name)));
          }

          // Tool descriptions z configSnapshot
          if (suiteData.configSnapshot?.toolDescriptions) {
            setToolDescriptions(suiteData.configSnapshot.toolDescriptions);
          }
          if (suiteData.configSnapshot?.toolParameterDescriptions) {
            setToolParameterDescriptions(suiteData.configSnapshot.toolParameterDescriptions);
          }

          // Scenarios
          const filteredScenarios = allScenarios.filter(s => s.agent === validAgent && s.available);
          setScenarios(filteredScenarios);

          // Mapuj scenario.id -> scenario.path (id i path to różne wartości!)
          const idToPath = new Map(filteredScenarios.map(s => [s.id, s.path]));
          const rerunScenarioIds = scenariosData.map(s => s.id);
          const validPaths = rerunScenarioIds
            .map(id => idToPath.get(id))
            .filter((p): p is string => p !== undefined);
          setSelectedScenarios(new Set(validPaths));

        } else {
          // === ŚCIEŻKA DOMYŚLNA ===
          const defaultAgent: AgentType = 'montage';

          const [promptResponse, toolsResponse, allScenarios] = await Promise.all([
            api.getAgentPrompt(defaultAgent),
            api.getTools(defaultAgent),
            api.getScenarios(),
          ]);

          setAgent(defaultAgent);
          setDefaultPrompt(promptResponse.prompt);
          setSystemPrompt(promptResponse.prompt);

          setTools(toolsResponse.tools);
          setEnabledTools(new Set(toolsResponse.tools.filter(t => t.enabledByDefault).map(t => t.name)));

          const filteredScenarios = allScenarios.filter(s => s.agent === defaultAgent && s.available);
          setScenarios(filteredScenarios);
          setSelectedScenarios(new Set(filteredScenarios.map(s => s.path)));
        }
      } catch (e) {
        setError(rerunSuiteId
          ? 'Nie udało się załadować konfiguracji z poprzedniego testu'
          : 'Nie udało się załadować danych');
        console.error(e);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Puste deps = tylko na mount

  // REAKCJA NA ZMIANĘ AGENTA - tylko gdy użytkownik zmieni ręcznie
  useEffect(() => {
    // Pomiń jeśli nie zainicjalizowano
    if (!initialized) return;

    // Pomiń pierwsze uruchomienie po inicjalizacji (agent nie zmienił się)
    if (prevAgentRef.current === null) {
      prevAgentRef.current = agent;
      return;
    }

    // Pomiń jeśli agent się nie zmienił
    if (prevAgentRef.current === agent) return;

    prevAgentRef.current = agent;

    const loadAgentData = async () => {
      setToolsLoading(true);
      setScenariosLoading(true);

      try {
        const [promptResponse, toolsResponse, allScenarios] = await Promise.all([
          api.getAgentPrompt(agent),
          api.getTools(agent),
          api.getScenarios(),
        ]);

        // Prompt
        setDefaultPrompt(promptResponse.prompt);
        setSystemPrompt(promptResponse.prompt);
        setSystemPromptMode('append'); // Reset do domyślnego

        // Tools
        setTools(toolsResponse.tools);
        setEnabledTools(new Set(toolsResponse.tools.filter(t => t.enabledByDefault).map(t => t.name)));
        setToolDescriptions({}); // Reset custom opisów
        setToolParameterDescriptions({}); // Reset custom opisów parametrów

        // Scenarios
        const filteredScenarios = allScenarios.filter(s => s.agent === agent && s.available);
        setScenarios(filteredScenarios);
        setSelectedScenarios(new Set(filteredScenarios.map(s => s.path)));

      } catch (e) {
        setError(e instanceof Error ? e.message : 'Nie udało się załadować danych agenta');
      } finally {
        setToolsLoading(false);
        setScenariosLoading(false);
      }
    };

    loadAgentData();
  }, [agent, initialized]);

  // Filtrowane scenariusze
  const filteredScenarios = useMemo(() => {
    if (!scenarioFilter) return scenarios;
    const lower = scenarioFilter.toLowerCase();
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.id.toLowerCase().includes(lower) ||
        s.tags?.some((t) => t.toLowerCase().includes(lower))
    );
  }, [scenarios, scenarioFilter]);

  // Grupowanie narzędzi po kategorii
  const toolsByCategory = useMemo(() => {
    const grouped: Record<string, ToolInfo[]> = {};
    for (const tool of tools) {
      if (!grouped[tool.category]) {
        grouped[tool.category] = [];
      }
      grouped[tool.category].push(tool);
    }
    return grouped;
  }, [tools]);

  // Handlery
  const handleToolToggle = (toolName: string) => {
    setEnabledTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  const handleSelectAllTools = () => {
    setEnabledTools(new Set(tools.map((t) => t.name)));
  };

  const handleDeselectAllTools = () => {
    setEnabledTools(new Set());
  };

  const handleScenarioToggle = (path: string) => {
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectAllScenarios = () => {
    setSelectedScenarios(new Set(filteredScenarios.map((s) => s.path)));
  };

  const handleDeselectAllScenarios = () => {
    setSelectedScenarios(new Set());
  };

  const handleResetPrompt = () => {
    setSystemPrompt(defaultPrompt);
  };

  const handleOpenToolEdit = (tool: ToolInfo) => {
    setEditingTool(tool);
    setEditingDescription(toolDescriptions[tool.name] || tool.description);
    setEditingParameterDescriptions(toolParameterDescriptions[tool.name] || {});
  };

  const handleSaveToolDescription = () => {
    if (!editingTool) return;

    // Zapisz opis narzędzia
    const newDescriptions = { ...toolDescriptions };
    if (editingDescription === editingTool.description) {
      // Jeśli opis jest taki sam jak domyślny, usuń custom opis
      delete newDescriptions[editingTool.name];
    } else {
      newDescriptions[editingTool.name] = editingDescription;
    }
    setToolDescriptions(newDescriptions);

    // Zapisz opisy parametrów
    const newParamDescriptions = { ...toolParameterDescriptions };
    // Filtruj tylko te opisy, które różnią się od domyślnych
    const customParamDescs: Record<string, string> = {};
    for (const [paramName, customDesc] of Object.entries(editingParameterDescriptions)) {
      const defaultParam = editingTool.parameters.find(p => p.name === paramName);
      if (defaultParam && customDesc !== defaultParam.description && customDesc.trim() !== '') {
        customParamDescs[paramName] = customDesc;
      }
    }

    if (Object.keys(customParamDescs).length > 0) {
      newParamDescriptions[editingTool.name] = customParamDescs;
    } else {
      delete newParamDescriptions[editingTool.name];
    }
    setToolParameterDescriptions(newParamDescriptions);

    setEditingTool(null);
  };

  const handleResetToolDescription = () => {
    if (!editingTool) return;
    setEditingDescription(editingTool.description);
    setEditingParameterDescriptions({});
  };

  const handleParameterDescriptionChange = (paramName: string, value: string) => {
    setEditingParameterDescriptions(prev => ({
      ...prev,
      [paramName]: value,
    }));
  };

  const handleRunTests = async () => {
    if (selectedScenarios.size === 0) {
      setError('Wybierz przynajmniej jeden scenariusz');
      return;
    }

    setRunning(true);
    setError(null);

    try {
      // Przygotuj parametry
      const params: Parameters<typeof api.runSuite>[0] = {
        scenarioIds: Array.from(selectedScenarios),
        verbose: true,
        model,
        thinkingMode,
      };

      // Diagnostyka - do usunięcia po zdiagnozowaniu problemu
      console.log('[PrepareTests] systemPrompt length:', systemPrompt.length);
      console.log('[PrepareTests] defaultPrompt length:', defaultPrompt.length);
      console.log('[PrepareTests] Are equal?:', systemPrompt === defaultPrompt);
      console.log('[PrepareTests] Mode:', systemPromptMode);

      // Zawsze wysyłaj systemPrompt jeśli nie jest pusty (tymczasowa naprawa dla diagnostyki)
      if (systemPrompt.trim()) {
        params.systemPrompt = { raw: systemPrompt, mode: systemPromptMode };
        console.log('[PrepareTests] Sending systemPrompt with mode:', systemPromptMode);
      }

      // Dodaj enabled tools jeśli są inne niż domyślne
      const defaultEnabledCount = tools.filter((t) => t.enabledByDefault).length;
      if (enabledTools.size !== defaultEnabledCount) {
        params.enabledTools = Array.from(enabledTools);
      }

      // Dodaj custom opisy narzędzi jeśli są
      if (Object.keys(toolDescriptions).length > 0) {
        params.toolDescriptions = toolDescriptions;
      }

      // Dodaj custom opisy parametrów narzędzi jeśli są
      if (Object.keys(toolParameterDescriptions).length > 0) {
        params.toolParameterDescriptions = toolParameterDescriptions;
      }

      const { suiteId } = await api.runSuite(params);
      navigate(`/results/${suiteId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się uruchomić testów');
    } finally {
      setRunning(false);
    }
  };

  const clearError = () => setError(null);

  return {
    // Inicjalizacja
    loading,
    initialized,
    error,
    running,
    rerunSuiteId,

    // Config
    agent,
    model,
    thinkingMode,
    setAgent,
    setModel,
    setThinkingMode,

    // Prompt
    systemPrompt,
    defaultPrompt,
    systemPromptMode,
    setSystemPrompt,
    setSystemPromptMode,
    handleResetPrompt,

    // Tools
    tools,
    enabledTools,
    toolDescriptions,
    toolParameterDescriptions,
    toolsLoading,
    toolsByCategory,
    handleToolToggle,
    handleSelectAllTools,
    handleDeselectAllTools,

    // Tool edit
    editingTool,
    editingDescription,
    editingParameterDescriptions,
    handleOpenToolEdit,
    handleSaveToolDescription,
    handleResetToolDescription,
    handleParameterDescriptionChange,
    setEditingTool,
    setEditingDescription,

    // Scenarios
    scenarios,
    selectedScenarios,
    scenariosLoading,
    filteredScenarios,
    scenarioFilter,
    setScenarioFilter,
    handleScenarioToggle,
    handleSelectAllScenarios,
    handleDeselectAllScenarios,

    // Actions
    handleRunTests,
    clearError,
  };
}
