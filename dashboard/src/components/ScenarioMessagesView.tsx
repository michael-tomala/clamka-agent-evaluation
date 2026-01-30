import type { RawMessage } from '../api/client';
import { TransAgentMessagesView } from './TransAgentMessagesView';

interface ScenarioMessagesViewProps {
  messages: RawMessage[];
  liveMode?: boolean;
}

/**
 * Komponent do wyswietlania historii wiadomosci scenariusza
 *
 * Deleguje do TransAgentMessagesView ktory obsluguje hierarchiczne
 * grupowanie wiadomosci trans agentow.
 */
export function ScenarioMessagesView({ messages, liveMode = false }: ScenarioMessagesViewProps) {
  return <TransAgentMessagesView messages={messages} liveMode={liveMode} />;
}
