import { useState, useContext, useEffect } from 'react';
import './EngagementHub.css';

import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';

import ChatIcon from './ChatIcon';
import {
    AgentChat,
    ChatContainerProps,
    ACSConversationContext,
} from './AgentChat';
import { createConversation } from '../services/conversations';
import ChatBot from './ChatBot';
import { EngagementHubContext } from '../App';

export const EngagementHub = (props: { botId: string, endUserId: string, width: number, height: number }): JSX.Element => {
    const [showEngagementHub, setShowEngagementHub] = useState<boolean>(false);
    const [chatProps, setChatProps] = useState<ChatContainerProps | undefined>(undefined);
    const engagementHubContext = useContext(EngagementHubContext);
    const [tabIndex, setTabIndex] = useState<number>(0);

    useEffect(() => {
        if (engagementHubContext!.navigateToAgentChat) {
            // Reset navigation flag
            engagementHubContext?.setEngagementHubContext({
                ...engagementHubContext,
                navigateToAgentChat: false,
            });

            // Force navigation to the AgentChat tab
            setTabIndex(1);
        }
    });

    if (showEngagementHub) {
        if (!chatProps) {
            return (
                <div style={{ position: 'fixed', paddingTop: 5, paddingLeft: 5, marginRight: 10, width: props.width, height: props.height, maxHeight: props.height, right: 0, bottom: 0, backgroundColor: 'white', border: '#aaaaaa', borderWidth: 1.5, borderStyle: 'solid' }}>
                    <button onClick={() => setShowEngagementHub(false)} style={{ float: 'right', marginTop: 7, marginRight: 7, fontWeight: 'bold', border: '#aaaaaa', borderWidth: 1.5, borderStyle: 'solid', paddingLeft: 5, paddingRight: 5, paddingTop: 2 }}>X</button>
                    <Tabs selectedIndex={tabIndex} onSelect={(index: number) => {
                        setTabIndex(index)
                    }}>
                        <TabList>
                            <Tab>Chat</Tab>
                            {engagementHubContext!.isEscalated &&
                                <Tab>Agent</Tab>
                            }
                        </TabList>

                        <TabPanel>
                            <ChatBot botId={props.botId} endUserId={props.endUserId} width={props.width} height={props.height} />
                        </TabPanel>
                        {engagementHubContext!.isEscalated &&
                            <TabPanel>
                                <AgentChat width={props.width} height={props.height} setIndex={(index: number) => setTabIndex(index)} />
                            </TabPanel>
                        }
                    </Tabs>
                </div>
            );
        } else {
            return <h3>Initializing acs conversation...</h3>;
        }
    } else {
        return (
            <div style={{ position: 'fixed', right: 15, bottom: 10 }}>
                <ChatIcon onClick={() => setShowEngagementHub(true)} />
            </div>
        )
    }
}

export default EngagementHub;
