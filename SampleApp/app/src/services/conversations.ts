import { getEngagementHubBaseAddress } from '../utils/utils';
import {
    ACSConversationContext
} from '../components/AgentChat';

/**
 * Creates a new Engagement Hub conversation that connects a end user to a PVA bot or a human agent, if need be
 */
export async function createConversation(handoffContext: string): Promise<ACSConversationContext> {
    return await fetch(getEngagementHubBaseAddress("api/escalateToAgent"), {
        body: handoffContext,
        method: 'POST'
    }).then(data => data.json())
}

/**
 * This is more of a test API and not sure it's going to be needed once we add Job Router
 */
export async function acceptChatRequest(acsConversationContext: ACSConversationContext): Promise<void> {
    return await fetch(getEngagementHubBaseAddress("api/acceptChatRequest"), {
        method: 'POST',
        body: JSON.stringify(acsConversationContext),
        headers: { 'Content-type': 'application/json' }
    }).then(data => data.json())
}
