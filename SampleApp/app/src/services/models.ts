import { DirectLine } from 'botframework-directlinejs';

export interface PVAConversationContext {
    pvaConversationId: string,
    pvaAccessToken: string,
    pvaWatermark: string | undefined,
    isEscalation: string
}

export interface ACSConversationContext {
    acsUserId: string,
    acsBotId: string,
    acsAgentId: string,
    acsUserAccessToken: string,
    acsAgentAccessToken: string,
    acsBotAccessToken: string,
    acsUserDisplayName: string,
    acsBotDisplayName: string,
    acsAgentDisplayName: string,
    acsEndpointUrl: string,
    acsThreadId: string
}

export interface ACSEngagementHubContext {
    pvaConversationContext: PVAConversationContext,
    acsConversationContext: ACSConversationContext
}

export type ChatContainerProps = {
    acsEngagementHubContext: ACSEngagementHubContext,
    errorBar?: boolean;
    participants?: boolean;
    topic?: boolean;
    locale?: any;
};
