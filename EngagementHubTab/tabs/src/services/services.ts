import { getEngagementHubBaseAddress } from '../utils/utils';
import { ACSConversationContext } from "../models/models"

export enum ConversationStatus {
    Queued,
    Accepted,
    Closed
}

export enum Disposition {
    Pending,
    AgentClosed,
    UserClosed
}

export type Escalation = {
    threadId: string,
    handoffContext: string,
    status: ConversationStatus,
    agentId: string, // Used to filter escalations that belong to current agent
    agentName: string,
    disposition: Disposition,
    dateCreated: string
};

export type HandoffContext = {
    skill: string,
    customerName: string,    
    phone: string,    
    customerType: string,    
    whyTheyNeedHelp: string
};

/**
 * Creates a new Engagement Hub conversation that connects a end user to a PVA bot or a human agent, if need be
 */
export async function getEscalations(): Promise<Escalation[]> {
    return await fetch(getEngagementHubBaseAddress("api/escalations"), {
        method: 'GET'
    }).then(data => data.json())
}

export async function acceptChatRequest(escalation: Escalation): Promise<ACSConversationContext> {
    return await fetch(getEngagementHubBaseAddress("api/acceptChatRequest"), {
        body: JSON.stringify(escalation),
        method: 'POST'
    }).then(data => data.json())
}

export async function endChatRequest(escalation: Escalation): Promise<void> {
    await fetch(getEngagementHubBaseAddress("api/endChatRequest"), {
        body: JSON.stringify(escalation),
        method: 'POST'
    })
}

export async function closeChatRequest(escalation: Escalation): Promise<void> {
    await fetch(getEngagementHubBaseAddress("api/closeChatRequest"), {
        body: JSON.stringify(escalation),
        method: 'POST'
    })
}