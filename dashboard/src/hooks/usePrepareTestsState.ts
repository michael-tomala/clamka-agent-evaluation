import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, Scenario, ToolInfo, TransAgentPromptConfig, SubagentPromptConfig } from '../api/client';
import { AgentType, ModelType, ThinkingMode, SystemPromptMode } from '../pages/prepareTestsTypes';

/** Dostępne typy trans agentów */
const TRANS_AGENT_TYPES = ['media-scout'] as const;
export type TransAgentType = (typeof TRANS_AGENT_TYPES)[number];

/** Dostępne typy subagentów (Task tool) */
const SUBAGENT_TYPES = ['chapter-explorator', 'web-researcher', 'script-segments-editor', 'executor'] as const;
export type SubagentType = (typeof SUBAGENT_TYPES)[number];

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

  // Trans Agent Prompts
  transAgentPrompts: Record<TransAgentType, TransAgentPromptConfig>;
  defaultTransAgentPrompts: Record<TransAgentType, string>;
  setTransAgentPrompt: (type: TransAgentType, config: TransAgentPromptConfig) => void;
  resetTransAgentPrompt: (type: TransAgentType) => void;

  // Trans Agent Tools
  transAgentTools: Record<TransAgentType, string[]>;
  transAgentEnabledTools: Record<TransAgentType, Set<string>>;
  transAgentToolsLoading: boolean;
  handleTransAgentToolToggle: (type: TransAgentType, toolName: string) => void;
  handleSelectAllTransAgentTools: (type: TransAgentType) => void;
  handleDeselectAllTransAgentTools: (type: TransAgentType) => void;

  // Subagent Prompts (Task tool)
  subagentPrompts: Record<SubagentType, SubagentPromptConfig>;
  defaultSubagentPrompts: Record<SubagentType, string>;
  setSubagentPrompt: (type: SubagentType, config: SubagentPromptConfig) => void;
  resetSubagentPrompt: (type: SubagentType) => void;

  // Subagent Tools (Task tool)
  subagentTools: Record<SubagentType, string[]>;
  subagentEnabledTools: Record<SubagentType, Set<string>>;
  subagentToolsLoading: boolean;
  handleSubagentToolToggle: (type: SubagentType, toolName: string) => void;
  handleSelectAllSubagentTools: (type: SubagentType) => void;
  handleDeselectAllSubagentTools: (type: SubagentType) => void;

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

  // Trans Agent Prompts
  const [transAgentPrompts, setTransAgentPrompts] = useState<Record<TransAgentType, TransAgentPromptConfig>>(
    {} as Record<TransAgentType, TransAgentPromptConfig>
  );
  const [defaultTransAgentPrompts, setDefaultTransAgentPrompts] = useState<Record<TransAgentType, string>>(
    {} as Record<TransAgentType, string>
  );

  // Trans Agent Tools
  const [transAgentTools, setTransAgentTools] = useState<Record<TransAgentType, string[]>>(
    {} as Record<TransAgentType, string[]>
  );
  const [transAgentEnabledTools, setTransAgentEnabledTools] = useState<Record<TransAgentType, Set<string>>>(
    {} as Record<TransAgentType, Set<string>>
  );
  const [transAgentToolsLoading, setTransAgentToolsLoading] = useState(false);

  // Subagent Prompts (Task tool)
  const [subagentPrompts, setSubagentPrompts] = useState<Record<SubagentType, SubagentPromptConfig>>(
    {} as Record<SubagentType, SubagentPromptConfig>
  );
  const [defaultSubagentPrompts, setDefaultSubagentPrompts] = useState<Record<SubagentType, string>>(
    {} as Record<SubagentType, string>
  );

  // Subagent Tools (Task tool)
  const [subagentTools, setSubagentTools] = useState<Record<SubagentType, string[]>>(
    {} as Record<SubagentType, string[]>
  );
  const [subagentEnabledTools, setSubagentEnabledTools] = useState<Record<SubagentType, Set<string>>>(
    {} as Record<SubagentType, Set<string>>
  );
  const [subagentToolsLoading, setSubagentToolsLoading] = useState(false);

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

  /**
   * Ładuje domyślne prompty dla wszystkich trans agentów
   */
  const loadDefaultTransAgentPrompts = async () => {
    const defaults: Record<TransAgentType, string> = {} as Record<TransAgentType, string>;

    for (const type of TRANS_AGENT_TYPES) {
      try {
        const response = await api.getTransAgentPrompt(type);
        defaults[type] = response.prompt;
      } catch (e) {
        console.warn(`[usePrepareTestsState] Failed to load trans agent prompt for ${type}:`, e);
        defaults[type] = '';
      }
    }

    setDefaultTransAgentPrompts(defaults);
    // Zainicjuj transAgentPrompts z domyślnymi wartościami (raw = domyślny prompt, mode = append)
    const initial: Record<TransAgentType, TransAgentPromptConfig> = {} as Record<TransAgentType, TransAgentPromptConfig>;
    for (const type of TRANS_AGENT_TYPES) {
      initial[type] = { raw: defaults[type], mode: 'append' };
    }
    setTransAgentPrompts(initial);
  };

  /**
   * Ładuje narzędzia dla wszystkich trans agentów
   */
  const loadTransAgentTools = async () => {
    setTransAgentToolsLoading(true);
    const toolsMap: Record<TransAgentType, string[]> = {} as Record<TransAgentType, string[]>;
    const enabledMap: Record<TransAgentType, Set<string>> = {} as Record<TransAgentType, Set<string>>;

    for (const type of TRANS_AGENT_TYPES) {
      try {
        const response = await api.getTransAgentTools(type);
        toolsMap[type] = response.tools;
        // Domyślnie wszystkie narzędzia włączone
        enabledMap[type] = new Set(response.tools);
      } catch (e) {
        console.warn(`[usePrepareTestsState] Failed to load trans agent tools for ${type}:`, e);
        toolsMap[type] = [];
        enabledMap[type] = new Set();
      }
    }

    setTransAgentTools(toolsMap);
    setTransAgentEnabledTools(enabledMap);
    setTransAgentToolsLoading(false);
  };

  /**
   * Ładuje domyślne prompty dla wszystkich subagentów (Task tool)
   */
  const loadDefaultSubagentPrompts = async () => {
    const defaults: Record<SubagentType, string> = {} as Record<SubagentType, string>;

    for (const type of SUBAGENT_TYPES) {
      try {
        const response = await api.getSubagentPrompt(type);
        defaults[type] = response.prompt;
      } catch (e) {
        console.warn(`[usePrepareTestsState] Failed to load subagent prompt for ${type}:`, e);
        defaults[type] = '';
      }
    }

    setDefaultSubagentPrompts(defaults);
    // Zainicjuj subagentPrompts z domyślnymi wartościami
    const initial: Record<SubagentType, SubagentPromptConfig> = {} as Record<SubagentType, SubagentPromptConfig>;
    for (const type of SUBAGENT_TYPES) {
      initial[type] = { prompt: defaults[type] };
    }
    setSubagentPrompts(initial);
  };

  /**
   * Ładuje narzędzia dla wszystkich subagentów (Task tool)
   */
  const loadSubagentTools = async () => {
    setSubagentToolsLoading(true);
    const toolsMap: Record<SubagentType, string[]> = {} as Record<SubagentType, string[]>;
    const enabledMap: Record<SubagentType, Set<string>> = {} as Record<SubagentType, Set<string>>;

    for (const type of SUBAGENT_TYPES) {
      try {
        const response = await api.getSubagentTools(type);
        toolsMap[type] = response.tools;
        // Domyślnie wszystkie narzędzia włączone
        enabledMap[type] = new Set(response.tools);
      } catch (e) {
        console.warn(`[usePrepareTestsState] Failed to load subagent tools for ${type}:`, e);
        toolsMap[type] = [];
        enabledMap[type] = new Set();
      }
    }

    setSubagentTools(toolsMap);
    setSubagentEnabledTools(enabledMap);
    setSubagentToolsLoading(false);
  };

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

          // Ładowanie domyślnych promptów i narzędzi trans agentów i subagentów
          await Promise.all([
            loadDefaultTransAgentPrompts(),
            loadTransAgentTools(),
            loadDefaultSubagentPrompts(),
            loadSubagentTools(),
          ]);

          // Nadpisz custom promptami z configSnapshot (rerun)
          if (suiteData.configSnapshot?.transAgentPrompts) {
            setTransAgentPrompts(prev => ({
              ...prev,
              ...suiteData.configSnapshot!.transAgentPrompts as Record<TransAgentType, TransAgentPromptConfig>,
            }));
          }

          // Nadpisz enabled tools dla trans agentów z configSnapshot (rerun)
          if (suiteData.configSnapshot?.transAgentEnabledTools) {
            const enabledMap: Record<TransAgentType, Set<string>> = {} as Record<TransAgentType, Set<string>>;
            for (const [type, tools] of Object.entries(suiteData.configSnapshot.transAgentEnabledTools)) {
              enabledMap[type as TransAgentType] = new Set(tools);
            }
            setTransAgentEnabledTools(prev => ({
              ...prev,
              ...enabledMap,
            }));
          }

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

          // Ładowanie domyślnych promptów i narzędzi trans agentów i subagentów
          await Promise.all([
            loadDefaultTransAgentPrompts(),
            loadTransAgentTools(),
            loadDefaultSubagentPrompts(),
            loadSubagentTools(),
          ]);
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

  const handleSetTransAgentPrompt = (type: TransAgentType, config: TransAgentPromptConfig) => {
    setTransAgentPrompts(prev => ({
      ...prev,
      [type]: config,
    }));
  };

  const handleResetTransAgentPrompt = (type: TransAgentType) => {
    const defaultValue = defaultTransAgentPrompts[type] || '';
    setTransAgentPrompts(prev => ({
      ...prev,
      [type]: { raw: defaultValue, mode: 'append' },
    }));
  };

  const handleTransAgentToolToggle = (type: TransAgentType, toolName: string) => {
    setTransAgentEnabledTools(prev => {
      const current = prev[type] || new Set<string>();
      const next = new Set(current);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return { ...prev, [type]: next };
    });
  };

  const handleSelectAllTransAgentTools = (type: TransAgentType) => {
    const allTools = transAgentTools[type] || [];
    setTransAgentEnabledTools(prev => ({
      ...prev,
      [type]: new Set(allTools),
    }));
  };

  const handleDeselectAllTransAgentTools = (type: TransAgentType) => {
    setTransAgentEnabledTools(prev => ({
      ...prev,
      [type]: new Set(),
    }));
  };

  const handleSetSubagentPrompt = (type: SubagentType, config: SubagentPromptConfig) => {
    setSubagentPrompts(prev => ({
      ...prev,
      [type]: config,
    }));
  };

  const handleResetSubagentPrompt = (type: SubagentType) => {
    const defaultValue = defaultSubagentPrompts[type] || '';
    setSubagentPrompts(prev => ({
      ...prev,
      [type]: { prompt: defaultValue },
    }));
  };

  const handleSubagentToolToggle = (type: SubagentType, toolName: string) => {
    setSubagentEnabledTools(prev => {
      const current = prev[type] || new Set<string>();
      const next = new Set(current);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return { ...prev, [type]: next };
    });
  };

  const handleSelectAllSubagentTools = (type: SubagentType) => {
    const allTools = subagentTools[type] || [];
    setSubagentEnabledTools(prev => ({
      ...prev,
      [type]: new Set(allTools),
    }));
  };

  const handleDeselectAllSubagentTools = (type: SubagentType) => {
    setSubagentEnabledTools(prev => ({
      ...prev,
      [type]: new Set(),
    }));
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

      // Dodaj custom prompty trans agentów jeśli różnią się od domyślnych
      const modifiedTransAgentPrompts: Record<string, TransAgentPromptConfig> = {};
      for (const type of TRANS_AGENT_TYPES) {
        const config = transAgentPrompts[type];
        const defaultVal = defaultTransAgentPrompts[type] || '';
        // Dodaj tylko jeśli prompt jest zmodyfikowany lub mode !== 'append'
        if (config && (config.raw !== defaultVal || config.mode !== 'append')) {
          modifiedTransAgentPrompts[type] = config;
        }
      }
      if (Object.keys(modifiedTransAgentPrompts).length > 0) {
        params.transAgentPrompts = modifiedTransAgentPrompts;
        console.log('[PrepareTests] Sending transAgentPrompts:', Object.keys(modifiedTransAgentPrompts));
      }

      // Dodaj trans agent enabled tools jeśli różnią się od domyślnych
      const modifiedTransAgentEnabledTools: Record<string, string[]> = {};
      for (const type of TRANS_AGENT_TYPES) {
        const allTools = transAgentTools[type] || [];
        const enabledToolsSet = transAgentEnabledTools[type] || new Set<string>();
        // Dodaj tylko jeśli nie wszystkie narzędzia są włączone
        if (enabledToolsSet.size !== allTools.length) {
          modifiedTransAgentEnabledTools[type] = Array.from(enabledToolsSet);
        }
      }
      if (Object.keys(modifiedTransAgentEnabledTools).length > 0) {
        params.transAgentEnabledTools = modifiedTransAgentEnabledTools;
        console.log('[PrepareTests] Sending transAgentEnabledTools:', modifiedTransAgentEnabledTools);
      }

      // Dodaj custom konfigurację subagentów (Task tool) jeśli różnią się od domyślnych
      const modifiedSubagentPrompts: Record<string, SubagentPromptConfig> = {};
      for (const type of SUBAGENT_TYPES) {
        const config = subagentPrompts[type];
        const defaultVal = defaultSubagentPrompts[type] || '';
        const enabledToolsSet = subagentEnabledTools[type] || new Set<string>();
        const allTools = subagentTools[type] || [];

        // Sprawdź czy prompt jest zmodyfikowany
        const isPromptModified = config && config.prompt !== defaultVal;
        // Sprawdź czy tools są zmodyfikowane (nie wszystkie włączone)
        const isToolsModified = enabledToolsSet.size !== allTools.length;

        if (isPromptModified || isToolsModified) {
          modifiedSubagentPrompts[type] = {
            prompt: isPromptModified ? config.prompt : undefined,
            tools: isToolsModified ? Array.from(enabledToolsSet) : undefined,
          };
        }
      }
      if (Object.keys(modifiedSubagentPrompts).length > 0) {
        params.subagentPrompts = modifiedSubagentPrompts;
        console.log('[PrepareTests] Sending subagentPrompts:', Object.keys(modifiedSubagentPrompts));
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

    // Trans Agent Prompts
    transAgentPrompts,
    defaultTransAgentPrompts,
    setTransAgentPrompt: handleSetTransAgentPrompt,
    resetTransAgentPrompt: handleResetTransAgentPrompt,

    // Trans Agent Tools
    transAgentTools,
    transAgentEnabledTools,
    transAgentToolsLoading,
    handleTransAgentToolToggle,
    handleSelectAllTransAgentTools,
    handleDeselectAllTransAgentTools,

    // Subagent Prompts (Task tool)
    subagentPrompts,
    defaultSubagentPrompts,
    setSubagentPrompt: handleSetSubagentPrompt,
    resetSubagentPrompt: handleResetSubagentPrompt,

    // Subagent Tools (Task tool)
    subagentTools,
    subagentEnabledTools,
    subagentToolsLoading,
    handleSubagentToolToggle,
    handleSelectAllSubagentTools,
    handleDeselectAllSubagentTools,

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
