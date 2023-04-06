import { AzureCommunicationTokenCredential, CommunicationUserKind } from '@azure/communication-common';
import { ChatClient, ChatThreadClient, ChatMessage as ChatMessage_2  } from '@azure/communication-chat';
import {
    FluentThemeProvider,
    SystemMessage,
    CustomMessage,
    ContentSystemMessage,
    ChatMessage,
    MessageThread,
    MessageProps,
    MessageRenderer,
    SendBox,
    CompositeLocale
} from '@azure/communication-react';

import React, { useEffect, useMemo, useState, useContext, useRef } from 'react';
import { createConversation } from '../services/conversations'
import { EngagementHubContext } from '../App';
import { Divider } from '@fluentui/react-components';

export interface ACSConversationContext {
    acsUserId: string,
    acsAgentId: string,
    acsUserAccessToken: string,
    acsAgentAccessToken: string,
    acsUserDisplayName: string,
    acsAgentDisplayName: string,
    acsEndpointUrl: string,
    acsThreadId: string
}

export type ChatContainerProps = {
    width: number,
    height: number,
    setIndex: (index: number) => void,
    errorBar?: boolean;
    participants?: boolean;
    topic?: boolean;
    locale?: CompositeLocale;
};

type ChatMessages = (SystemMessage | CustomMessage | ChatMessage)[];

// Fetch any messages written to the thread before we've accessed it in this React component
async function fetchPreviousMessages(chatThreadClient: ChatThreadClient, displayName: string) : Promise<ChatMessages> {
    const previousMessagesLIFO = chatThreadClient.listMessages();
    let previousMessages: ChatMessage_2[] = [];
    let result: ChatMessages = [];
    
    // Fetch previous messages and reverse their order
    // Note - ChatThreadClient uses async iterator to return messages last-in-first-out
    // so we need to reverse the order and because it's an async iterator, we can't just
    // achieve that with indexing tricks, we have to actually iterate to grab them
    let index = 0;
    for await (const lifoMessage of previousMessagesLIFO) {
        // There are different types of messages so make sure this is chat message and
        // not one of the other ChatMessageType types (i.e., "html", "topicUpdated", 
        // "participantAdded", or "participantRemoved")
        if (lifoMessage.type === "text") {
            // Convert LIFO to FIFO
            previousMessages = [lifoMessage, ...previousMessages];
        }
    }

    // Create an array of ChatMessages from previous messages
    // Note - Both communication-react and communication-chat declare ChatMessage types so
    // we'll do the required conversation as we add them
    previousMessages.forEach((message, i) => {
        // Determines if this message was sent by the current ACS user
        const isMine = displayName === (message.sender as CommunicationUserKind).communicationUserId;
        // Determins if message should be render as "attached" to previous message (i.e., closer to previous message
        // and without avatar, etc.). Consecutive messages from same sender "shouldAttach" 
        const shouldAttach = i > 0 && previousMessages[i-1].senderDisplayName === message.senderDisplayName;

        const isWaitMessage = message.content!.message == "Please wait, an agent will be with you shortly";

        // The ACS SendMessageAsync can only send ChatMessageType which does not allow
        // custom events, so we have to craft our own "custom event message" and check
        // for it and, if found, convert that chat message to system chat message and
        // then add it to the message array
        if (isWaitMessage) {
            const waitMsgAsSystemMessage = {
                messageType: 'system',
                createdOn: message.createdOn,
                systemMessageType: 'content',
                messageId: message.id,
                iconName: 'PeopleAdd',
                content: message.content?.message,
              } as ContentSystemMessage;

            // Add system message to the message array
            result.push(waitMsgAsSystemMessage);
        }
        else {
            result.push({
                messageType: "chat",
                senderId: (message.sender as CommunicationUserKind).communicationUserId,
                senderDisplayName: message.senderDisplayName,
                messageId: message.id,
                content: message.content?.message,
                createdOn: message.createdOn,
                mine: isMine,
                attached: shouldAttach,
                contentType: "text",
            });
        }
    });

    return result;
}

// Renders custom messages like a Divider.
const onRenderMessage = (messageProps: MessageProps, defaultOnRender?: MessageRenderer): JSX.Element => {
    if (messageProps.message.messageType === 'custom') {
        //return <Separator styles={separatorStyles} >{messageProps.message.content}!</Separator>;
        return <Divider>{messageProps.message.content}$</Divider>
    }

    return defaultOnRender ? defaultOnRender(messageProps) : <></>;
};

export const AgentChat = (props: ChatContainerProps): JSX.Element => {
    const engagementHubContext = useContext(EngagementHubContext);
    const msgsRef = useRef([] as ChatMessages);
    const chatThreadClientRef = useRef<ChatThreadClient>();
    const[msgs, setMsgs] = useState([] as ChatMessages);

    const credential = useMemo(() => {
        try {
            return new AzureCommunicationTokenCredential(engagementHubContext!.acsConversationContext!.acsUserAccessToken);
        } catch {
            console.error('Failed to construct token credential');
            return undefined;
        }
    }, [engagementHubContext!.acsConversationContext]);

    // Add message to the array of messages that MessageThread uses to render it's canvas.
    // Note - MessageThread is a UI control and ChatMessage is a chat messaging control and have no
    // relationship with each other.  MessageThread renders messages and ChatMessage transmits them.
    const addMessage = (msg: SystemMessage | CustomMessage | ChatMessage) : (SystemMessage | CustomMessage | ChatMessage)[] => {
        // Append new msg to msgsRef which is a React global variable
        msgsRef.current = [...msgsRef.current, msg];
        setMsgs(msgsRef.current);

        return msgs;
      };

    function endConversation(): void {
        // End the conversation by resetting the acs aspects of context to their initial settings
        engagementHubContext?.setEngagementHubContext({
            ...engagementHubContext,
            isEscalated: false,
            navigateToAgentChat: false,
            acsConversationContext: undefined,
            handoffContext: undefined,
        });

        // Force EngagementHub back to the chat tab
        props.setIndex(0);
    }

    useEffect(() => {
        if (!engagementHubContext!.acsConversationContext) {
            createConversation(engagementHubContext!.handoffContext!)
                .then(ctx => {
                    // Set the ACS conversation context
                    engagementHubContext?.setEngagementHubContext({
                        ...engagementHubContext,
                        acsConversationContext: ctx,
                    });
                });
        }

        // If credential has been created
        // Note - this syntax coerces credential to a boolean which means it will be either true (was 
        // created) or false (not create), but not undefined)
        if (!!credential) {
            const createChatThreadClient = async (credential: AzureCommunicationTokenCredential): Promise<void> => {
                let chatClient = new ChatClient(engagementHubContext!.acsConversationContext!.acsEndpointUrl, credential );
                let chatThreadClient = chatClient.getChatThreadClient(engagementHubContext!.acsConversationContext!.acsThreadId);

                // Save chatThreadClient in a global varialbe - note: I tried saving in a useState and
                // ran into issues so had to move to a global which is fine since it's a UI property
                // that would benefit from useState to trigger rerenders
                chatThreadClientRef.current = chatThreadClient;

                // Load any messages that may have been written to the thread before we joined it
                msgsRef.current = await fetchPreviousMessages(chatThreadClientRef.current, engagementHubContext!.acsConversationContext!.acsUserId);
                setMsgs(msgsRef.current);

                const conversationEndedFlag = "The agent has ended the conversation. Returning focus to digital assistant...";

                // Must be called before subscribing to any ChatClient events
                await chatClient.startRealtimeNotifications();

                // Subscribe to message received events
                chatClient.on('chatMessageReceived', (msg) => {
                    // Indicates which side of the MessageThread canvas a message should be rendered so that
                    // messaged from the current user can be right-justified and without avatar
                    const isMine = engagementHubContext!.acsConversationContext!.acsUserId === (msg.sender as CommunicationUserKind).communicationUserId;

                    // Messages should be rendered "attached" to one another if new message is from same 
                    // sender as last message so they are visually grouped
                    const shouldAttach = msgsRef.current.length !== 0 && (msgsRef.current[msgsRef.current.length-1] as ChatMessage).senderDisplayName === msg.senderDisplayName;

                    // ToDo: Find a better way of detecting the end of the conversation
                    if (msg.message !== conversationEndedFlag) {
                        // Add message to MessageThread state variable which will cause it to rerender
                        // Note - Because communication-react and communication-chat both declare ChatMessage types,
                        // we have to convert msg into a communication-react ChatMessage in order to pass it in
                        addMessage({
                            messageType: "chat",
                            senderId: (msg.sender as CommunicationUserKind).communicationUserId,
                            senderDisplayName: msg.senderDisplayName,
                            messageId: msg.id,
                            content: msg.message,
                            createdOn: msg.createdOn,
                            mine: isMine,
                            attached: shouldAttach,
                            contentType: "text",
                        });
                    }
                    else {
                        addMessage({
                            messageType: 'system',
                            createdOn: msg.createdOn,
                            systemMessageType: 'content',
                            messageId: msg.id,
                            iconName: 'PeopleAdd',
                            content: msg.message
                        });

                        // ToDo: Find a better way of detecting the end of the conversation
                        // Let user see message we just rendered before ending the conversation and closing
                        // the tab
                        setTimeout(() => {
                            endConversation();
                        }, 5000);
                    }
                });
            };

            createChatThreadClient(credential);
        }
    }, [credential]);

    if (chatThreadClientRef.current) {
        return (
            <FluentThemeProvider>
                <div style={{ height: props.height - 50, width: props.width - 10 }}>
                    <div style={{ height: props.height - 100 }}>
                        <MessageThread 
                            messages={msgs}
                            userId={engagementHubContext!.acsConversationContext!.acsUserId}
                            showMessageDate={true}
                            showMessageStatus={true}
                            onRenderMessage={onRenderMessage} />
                    </div>

                    <SendBox
                        onSendMessage={async (content: string) => {
                            chatThreadClientRef.current?.sendMessage({content: content}, {senderDisplayName: "Customer"})

                            return;
                        }}
                        onTyping={async () => {
                        return;
                        }}
                    />
                </div>
            </FluentThemeProvider>
        );
    }

    return <div>Initializing...</div>;
};

export default AgentChat;