import { useContext, useEffect, useMemo, useState } from 'react';
import { DirectLine, EventActivity } from 'botframework-directlinejs';
import ReactWebChat, { createDirectLine, createStore } from 'botframework-webchat';
import { stringify } from 'querystring';
import { EngagementHubContext } from '../App';
import { create } from 'domain';
import { act } from 'react-dom/test-utils';
import { parseJsonText } from 'typescript';

export const ChatBot = (props: { botId: string, endUserId: string, width: number, height: number }): JSX.Element => {
    var tokenAPI = "https://powerva.microsoft.com/api/botmanagement/v1/directline/directlinetoken?botId=" + props.botId;
    const engagementHubContext = useContext(EngagementHubContext);
    // new DirectLine({ token: 'YOUR_DIRECT_LINE_TOKEN' })
    //const directLine = useMemo(() => createDirectLine({ token: engagementHubContext!.directLineAccessToken }), [engagementHubContext!.directLineAccessToken]);
    const store = createStore(
        {},
        EscalationMiddleware()
    );

    useEffect(() => {
        if (!engagementHubContext?.directLineAccessToken) {
            fetch(tokenAPI)
                .then(response => response.json())
                .then(conversationInfo => {
                    engagementHubContext?.setEngagementHubContext({
                        ...engagementHubContext,
                        directLineAccessToken: conversationInfo.token,
                    })
                })
                .catch(err => console.error("An error occurred: " + err));
        }

        return () => {
            // run any unmount/clean up code here
        };
    });

    if (engagementHubContext!.directLineAccessToken) {
        var directLine = new DirectLine({ token: engagementHubContext!.directLineAccessToken });

        return (
            <div style={{ height: props.height - 150, maxHeight: props.height - 45, minHeight: props.height - 45 }}>
                <ReactWebChat directLine={directLine} store={store} />
            </div>
        );
    }
    return <p>Initializing web chat</p>;
};

export function EscalationMiddleware(): () => (next: any) => (action: any) => any {
    const engagementHubContext = useContext(EngagementHubContext);

    return () => next => action => {
        // Trigger Greeting system topic if in PVA-v1 or ConversationStart if PVA-v2
        if (action.type === "DIRECT_LINE/CONNECT_FULFILLED") {
            var directLine = new DirectLine({ token: engagementHubContext!.directLineAccessToken });

            directLine.postActivity({
                from: { id: "myUserId", name: "myUserName" }, // required (from.name is optional)
                type: "event",
                name: "startConversation",
                value: undefined
            }).subscribe(
                id => console.log("Posted activity, assigned ID ", id),
                error => console.log("Error posting activity", error)
            );
        }

        if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
            const { activity } = action.payload;

            if (activity.type === 'event' && 
                activity.name === 'handoff.initiate' &&
                engagementHubContext!.processedEscalationRequests !== undefined &&
                !engagementHubContext!.processedEscalationRequests!.includes(activity.id)) {
                console.log(`Saw new escalation request - activity.id: ${activity.id} escalation payload: ${activity.value.va_AgentMessage}`);

                // Mark this handoff activity as processed
                engagementHubContext!.processedEscalationRequests!.push(activity.id);

                // Signal an escalation has been detected and update hub context with handoff context
                engagementHubContext?.setEngagementHubContext({
                    ...engagementHubContext,
                    isEscalated: true,
                    handoffContext: activity.value.va_AgentMessage,
                    navigateToAgentChat: true,
                });
            }

            if (activity.type === 'event' && 
            activity.name === 'handoff.initiate') {
                if (engagementHubContext!.processedEscalationRequests === undefined) {
                    console.log(`engagementHubContext!.processedEscalationRequests is undefined`);
                } else if (engagementHubContext!.processedEscalationRequests!.includes(activity.id)) {
                    console.log(`engagementHubContext!.processedEscalationRequests!.includes(activity.id): ${engagementHubContext!.processedEscalationRequests!.includes(activity.id)}`);
                }                
            }

        }

        return next(action);
    };
}

export default ChatBot;
