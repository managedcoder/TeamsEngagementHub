import './App.css';
import { createContext, useState } from 'react';

import { EngagementHub } from './components/EngagementHub'
import { DirectLine } from 'botframework-directlinejs';
import { appsettings } from './settings/appsettings';
import { getEndUserID } from './services/Identity'

import { ACSConversationContext } from './components/AgentChat'

export interface EngagementHubContextType {
  isEscalated: boolean,
  navigateToAgentChat: boolean,
  acsConversationContext?: ACSConversationContext,
  processedEscalationRequests?: string[],
  handoffContext?: string,
  directLineAccessToken?: string,
  setEngagementHubContext: (state: EngagementHubContextType) => void,
}
export const EngagementHubContext = createContext<EngagementHubContextType | undefined>(undefined);

function App() {
  const [engagementHubContext, setEngagementHubContext] = useState<EngagementHubContextType>({
    isEscalated: false,
    navigateToAgentChat: false,
    acsConversationContext: undefined,
    processedEscalationRequests: [],
    handoffContext: undefined,
    directLineAccessToken: undefined,
    setEngagementHubContext: (ec) => {setEngagementHubContext(ec)}}
  );
  const endUserId = getEndUserID();

  return (
    <EngagementHubContext.Provider value={engagementHubContext}>
      <EngagementHub botId={appsettings.botId} endUserId={endUserId} width={350} height={550} />
    </EngagementHubContext.Provider>
  );
}

export default App;
