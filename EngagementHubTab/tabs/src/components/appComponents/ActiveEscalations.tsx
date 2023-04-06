import { useContext, useState, useMemo, useEffect, CSSProperties, useRef } from "react";
import { useData } from "@microsoft/teamsfx-react";
import { ensureInitialized } from '@microsoft/teams-js';
import { TeamsFxContext } from "../Context";
import { EngagementHubContext, EngagementHubContextType } from "./../App";
import { hoistMethods } from "@uifabric/utilities";
import { Escalation, acceptChatRequest, endChatRequest, closeChatRequest, ConversationStatus } from "../../services/services";
import { parseHandoffContext } from "../../utils/utils";
import { ACSConversationContext } from "../../models/models"

import { Divider } from '@fluentui/react-components';
import { AzureCommunicationTokenCredential, CommunicationUserKind } from '@azure/communication-common';
import { ChatClient, ChatThreadClient, ChatMessage as ChatMessage_2 } from '@azure/communication-chat';
import {
  FluentThemeProvider,
  SystemMessage,
  CustomMessage,
  ChatMessage,
  ContentSystemMessage,
  MessageThread,
  MessageProps,
  MessageRenderer,
  SendBox,
  ChatAdapter,
  ChatComposite,
  createAzureCommunicationChatAdapter
} from '@azure/communication-react';

import "./ActiveEscalations.css";

type ChatMessages = (SystemMessage | CustomMessage | ChatMessage)[];
const AGENT_SERVICE_DISPLAY_NAME = "Agent Service";

// Renders custom messages like a Divider.
const onRenderMessage = (messageProps: MessageProps, defaultOnRender?: MessageRenderer): JSX.Element => {
  if (messageProps.message.messageType === 'custom') {
      //return <Separator styles={separatorStyles} >{messageProps.message.content}!</Separator>;
      return <Divider>{messageProps.message.content}$</Divider>
  }

  return defaultOnRender ? defaultOnRender(messageProps) : <></>;
};

// Fetch any messages written to the thread before we've accessed it in this React component
// Note - ChatThreadClient uses async iterator to return messages last-in-first-out
// so we need to reverse the order and because it's an async iterator, we can't just
// achieve that with indexing tricks, we have to actually iterate to grab them
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

export function ActiveEscalations() {
  const chatThreadClientRef = useRef<ChatThreadClient>();
  const msgsRef = useRef([] as ChatMessages);
  const[msgs, setMsgs] = useState([] as ChatMessages);

  const engagementHubContext = useContext(EngagementHubContext);
  const { teamsfx } = useContext(TeamsFxContext);
  const { loading, data, error } = useData(async () => {
    if (teamsfx) {
      const userInfo = await teamsfx.getUserInfo();
      return userInfo;
    }
  });
  const agentName = (loading || error) ? "" : data!.displayName;
  const agentPreferredName = (loading || error) ? "" : data!.preferredUserName;
  const agentId = (loading || error) ? "" : data!.objectId;
  // Creating an adapter requires a credential which itself requires a access token and
  // creating each of those is asychronous.  To accomplish this, each depends on the others
  // and when the token is created (as part of the conversation context), it triggers the
  // construction of the credential and it in turn triggers the creation of the adapter
  // which finally triggers a re-render of the ChatComposite
  const [adapter, setAdapter] = useState<ChatAdapter>();

  // Add message to the array of messages that MessageThread uses to render it's canvas.
  // Note - MessageThread is a UI control and ChatMessage is a chat messaging control and have no
  // relationship with each other.  MessageThread renders messages and ChatMessage transmits them.
  const addMessage = (msg: SystemMessage | CustomMessage | ChatMessage) : (SystemMessage | CustomMessage | ChatMessage)[] => {
    // Append new msg to msgsRef which is a React global variable
    msgsRef.current = [...msgsRef.current, msg];
    setMsgs(msgsRef.current);

    return msgs;
  };
    
  function getClassList(isSelected: boolean): string {
    return isSelected ? "list-group-item list-group-item-action active" : "list-group-item list-group-item-action"
  }

  async function onAcceptChatRequest(escalation: Escalation, conversationStatus: ConversationStatus) {
    engagementHubContext!.setACSConversationContext(await acceptChatRequest({...escalation, agentName: agentName, agentId: agentId}));
    updateContext(escalation.threadId, agentId, conversationStatus);
  }

  async function onEndChatRequest(escalation: Escalation, conversationStatus: ConversationStatus) {
    updateContext(escalation.threadId, agentId, conversationStatus);
    await endChatRequest(escalation);
    engagementHubContext!.setThreadId(undefined);
  }

  async function onCloseChatRequest(escalation: Escalation, conversationStatus: ConversationStatus) {
    updateContext(escalation.threadId, agentId, conversationStatus);
    await closeChatRequest(escalation);
    engagementHubContext!.setThreadId(undefined);
  }

  function filterEscalations(escalations: Escalation[], agentId: string): Escalation[] {
    // Filter escalations to include only ones owned by agentId or escalations that are unassigned
    return escalations.filter((escalation) => { return (escalation.agentId === agentId || !escalation.agentId || escalation.agentId === undefined) });
  }

  function updateLocalActiveEscalations(activeEscalations: Escalation[], threadId: string | undefined, conversationStatus: ConversationStatus): Escalation[] {
    // Update the active escalation's conversationStatus
    return activeEscalations.map(escalation => { let result = escalation.threadId === threadId ? { ...escalation, status: conversationStatus, agentName: agentName, agentId: agentId } : escalation; return result; });
  }

  function updateContext(threadId: string | undefined, agentId: string, conversationStatus?: ConversationStatus) {
    // Update the pubsub context so it will be available to event handler which will be on different thread
    engagementHubContext!.pubSubContextUpdateCallback(threadId!, agentId);
    // Update the current threadId in the application context
    engagementHubContext!.setThreadId(threadId!);
    if (conversationStatus) {
      // Update the state of the current active escalation.  The corresponding persisted version of this
      // active escalation will have been updated by the Engagement Hub API as a part of acceptChatRequest
      if (conversationStatus === ConversationStatus.Accepted) {
        engagementHubContext!.setActiveEscalations(updateLocalActiveEscalations(engagementHubContext!.activeEscalations!, threadId, conversationStatus));
      }
      else if (conversationStatus === ConversationStatus.Closed) {
        const conversationEndedFlag = "The agent has ended the conversation. Returning focus to digital assistant...";
        // Signal conversation ended by sending a special message that the end user's chat client is watching for
        chatThreadClientRef.current?.sendMessage({content: conversationEndedFlag}, {senderDisplayName: AGENT_SERVICE_DISPLAY_NAME});
        engagementHubContext!.setActiveEscalations(engagementHubContext!.activeEscalations!.filter(escalation => escalation.threadId !== threadId));
      }
    }
  }

  const credential = useMemo(() => {
    try {
      return new AzureCommunicationTokenCredential(engagementHubContext!.acsConversationContext!.acsAgentAccessToken);
    } catch {
      console.error('Failed to construct token credential');
      return undefined;
    }
  }, [engagementHubContext!.acsConversationContext]);

  const containerStyle: CSSProperties = {
    border: 'solid 0.125rem gray',
    margin: '0.5rem',
    width: '50vw',
    backgroundColor: "white",
    padding: '1em'
  };

  useEffect(() => {
    // If you have an ACS credential but haven't yet created the ChatThreadClient then create it
    if (!!credential && chatThreadClientRef.current === undefined) {
      const createChatThreadClient = async (credential: AzureCommunicationTokenCredential): Promise<void> => {
        let chatClient = new ChatClient(engagementHubContext!.acsConversationContext!.acsEndpointUrl, credential );
        let chatThreadClient = chatClient.getChatThreadClient(engagementHubContext!.threadId!);

        // Save chatThreadClient in a global varialbe - note: I tried saving in a useState and
        // ran into issues so had to move to a global which is fine since it's a UI property
        // that would benefit from useState to trigger rerenders
        chatThreadClientRef.current = chatThreadClient;

        // Load any messages that may have been written to the thread before we joined it
        msgsRef.current = await fetchPreviousMessages(chatThreadClientRef.current, engagementHubContext!.acsConversationContext!.acsAgentId);
        setMsgs(msgsRef.current);

        // Must be called before subscribing to any ChatClient events
        await chatClient.startRealtimeNotifications();

        // Subscribe to message received events
        chatClient.on('chatMessageReceived', (msg) => {
            // Indicates which side of the MessageThread canvas a message should be rendered so that
            // messaged from the current user can be right-justified and without avatar
            const isMine = engagementHubContext!.acsConversationContext!.acsAgentId === (msg.sender as CommunicationUserKind).communicationUserId;

            // Messages should be rendered "attached" to one another if new message is from same 
            // sender as last message so they are visually grouped
            const shouldAttach = msgsRef.current.length !== 0 && (msgsRef.current[msgsRef.current.length-1] as ChatMessage).senderDisplayName === msg.senderDisplayName;

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
        });

        const chatAdapter = await createAzureCommunicationChatAdapter({
          endpoint: engagementHubContext!.acsConversationContext!.acsEndpointUrl,
          userId: { "communicationUserId": engagementHubContext!.acsConversationContext!.acsAgentId },
          displayName: agentName,
          credential,
          threadId: engagementHubContext!.threadId!
        });

        setAdapter(chatAdapter);
      };
      createChatThreadClient(credential);
    }
    return () => {
      // Runs when unmount
    }
  }, [credential]);

  const activeEscalations = engagementHubContext!.activeEscalations ? filterEscalations(engagementHubContext!.activeEscalations, agentId) : [];

  return (
    <FluentThemeProvider>
      <div style={{ height: '100vh', display: 'flex' }}>
        <div style={containerStyle}>
          {!engagementHubContext!.activeEscalations && <h2>Loading active escalations...</h2>}
          {engagementHubContext!.activeEscalations && <h2 style={{marginTop: 0}}>Active Escalations</h2>}
          <div style={{ fontSize: "small", marginTop: -13, marginBottom: 10 }}>Agent: {agentName}</div>

          {/* Use Bootstrap list group to create a selectable list of active escalations */}
          {activeEscalations.length !== 0 && <div className="list-group">
            {filterEscalations(engagementHubContext!.activeEscalations!, agentId).map((item, index) => {
              let handoffContext = parseHandoffContext(item.handoffContext);

              return <a style={{ margin: 0, padding: 0 }}
                href="#"
                className={getClassList(engagementHubContext!.threadId === engagementHubContext!.activeEscalations![index].threadId)}
                onClick={() => updateContext(engagementHubContext!.activeEscalations![index].threadId, agentId)}>
                <div className="grid-container" style={{marginLeft: 10, marginRight: 10}}>
                  <div className="name" style={{ fontWeight: "bold", fontSize: "x-large", marginBottom: -5 }}>{handoffContext.customerName}</div>
                  <div className="type" style={{ fontWeight: "bold", fontSize: "x-small" }}>{handoffContext.customerType.toUpperCase()}</div>
                  <div className="why" style={{ fontSize: "medium", marginBottom: 3, fontStyle: "italic" }}>{handoffContext.whyTheyNeedHelp}</div>
                  {item.status === ConversationStatus.Queued &&
                    <div className="icon"><img src="AnswerIcon.png" style={{ width: 40, float: "right" }} onClick={async () => await onAcceptChatRequest(engagementHubContext!.activeEscalations![index], ConversationStatus.Accepted)} /></div>
                  }
                  {item.status === ConversationStatus.Accepted &&
                    <div className="icon"><img src="HangUpIcon.png" style={{ width: 40, float: "right" }} onClick={async () => await onEndChatRequest(engagementHubContext!.activeEscalations![index], ConversationStatus.Closed)} /></div>
                  }
                  {item.status === ConversationStatus.Closed &&
                    <div className="icon"><img src="ClosedIcon.png" style={{ width: 40, float: "right" }} onClick={async () => await onCloseChatRequest(engagementHubContext!.activeEscalations![index], ConversationStatus.Closed)} /></div>
                  }
                </div>
              </a>
            })}
          </div>}
          {activeEscalations.length === 0 && <div style={{marginTop: 30, textAlign: "center", fontSize: "large", fontStyle: "italic", fontWeight: "bold"}}>You have no active escalations at this time</div>}
        </div>
        <div style={containerStyle}>
          {!!adapter && engagementHubContext?.threadId! !== undefined &&
            <div >
              <div className='mymtdiv' style={{height: '96%'}}>
                <MessageThread 
                  messages={msgs}
                  userId={engagementHubContext!.acsConversationContext!.acsAgentId}
                  showMessageDate={true}
                  showMessageStatus={true}
                  onRenderMessage={onRenderMessage} 
                />
              </div>

              <SendBox
                onSendMessage={async (content: string) => {
                  chatThreadClientRef.current?.sendMessage({content: content}, {senderDisplayName: agentName})

                  return;
                }}
                onTyping={async () => {
                  return;
                }}
              />
            </div>
          }
          {engagementHubContext?.threadId! === undefined && activeEscalations.length !== 0 &&
            <div style={{marginTop: 10, fontWeight: "bold", fontSize: "large", fontStyle: "italic", textAlign: "center" }} >Select an escalation from the list to chat with user</div>
          }
          {engagementHubContext?.threadId! === undefined && activeEscalations.length === 0 &&
            <div></div>
          }
        </div>
      </div>
    </FluentThemeProvider>
  );
}
