// https://fluentsite.z22.web.core.windows.net/quick-start
import React from "react";
import { useRef, useState, useEffect, createContext } from "react";
import { ActiveEscalations } from "./appComponents/ActiveEscalations";
import { Provider, teamsTheme, Loader } from "@fluentui/react-northstar";
import { HashRouter as Router, Redirect, Route } from "react-router-dom";
import { useTeamsFx } from "@microsoft/teamsfx-react";
import Privacy from "./Privacy";
import TermsOfUse from "./TermsOfUse";
import Tab from "./Tab";
import "./App.css";
import TabConfig from "./TabConfig";
import { TeamsFxContext } from "./Context";
import { getEscalations, Escalation } from "../services/services";
// import { subscribeToRefreshEvents } from '../utils/pubsub';
import { appsettings } from '../settings/appsettings';
import { ACSConversationContext } from "../models/models";

async function escalationsChanged(): Promise<boolean> {
  return true;
}

// Because we could not get Web PubSub or WebSockets to work in a Teams Toolkit app, I had
// to resort to polling until I can figure out how to get Web PubSub working
setInterval(async function () {
  if (await escalationsChanged()) {
    // Get latest escalation state
    var escalations = await getEscalations();
    // Update the application context to reflect new state
    pubSubContext.appContextUpdate(escalations);
  }
}, 5000);

// This interface defines the values that need to be available during Web Socket event handling
export interface PubSubContextType {
  appContextUpdate(activeEscalations: Escalation[]): void,
  threadId: string,
  agentId: string,
}
// We need to use a global context variable for a Web Socket event handler since it runs on a separate
// thread so all local App variables will be null (including threadId useState). This global is kept
// synched by the pubSubContextUpdateCallback function
export var pubSubContext: PubSubContextType;

export interface EngagementHubContextType {
  pubSubContextUpdateCallback(threadId: string, agentId: string): void,
  activeEscalations?: Escalation[],
  threadId?: string,
  setThreadId(threadId: string | undefined): void,
  acsConversationContext?: ACSConversationContext,
  setACSConversationContext(context: ACSConversationContext): void,
  setActiveEscalations(escalations: Escalation[]): void,
}
export const EngagementHubContext = React.createContext<EngagementHubContextType | undefined>(undefined);

/**
 * The main app which handles the initialization and routing
 * of the app.
 */
export default function App() {
  // This function is called during Web Socket event handling to update whatever application
  // state the Web Socket event handler changes which in this application's case is just
  // the active escalations
  const appContextUpdate = (activeEscalations: Escalation[]): void => {
    setActiveEscalations(activeEscalations);
  };

  const pubSubContextUpdate = (threadId: string, agentId: string): void => {
    pubSubContext.threadId = threadId;
    pubSubContext.agentId = agentId;
  }

  const { loading, theme, themeString, teamsfx } = useTeamsFx();
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [acsConversationContext, setACSConversationContext] = useState<ACSConversationContext | undefined>(undefined);
  const [activeEscalations, setActiveEscalations] = useState<Escalation[] | undefined>();

  // Set context update callback
  pubSubContext = { appContextUpdate: appContextUpdate, threadId: "", agentId: "" };

  useEffect(() => {
    // Sort dates from oldest to newest so the oldest escalation will be at top of list
    function sortOnDateCreated(a: Escalation, b: Escalation) {
      if (a.dateCreated < b.dateCreated) { return 1; }
      if (a.dateCreated > b.dateCreated) { return -1; }
      return 0;
    }

    getEscalations()
      .then(escalations => {
        console.log("Escalations fetched: " + escalations.length);

        setActiveEscalations(escalations.sort(sortOnDateCreated));
      });

    // Subscribe to Web Socket events that will be published by the engagement hub when the
    // conversation status changes.  This provides real-time UX refreshes to happen as multiple end users
    // escalate and interact with agents or agent status changes.
    // subscribeToRefreshEvents(
    //   appsettings.webPubSubConnectionString,
    //   appsettings.webPubSubHubName,
    //   async function (messageEvent): Promise<void> {
    //     var wsEvent = JSON.parse(messageEvent.data);
    //     console.log(`wsMsgJson: ${wsEvent}`);

    //     console.log(`wsMsgJson.eventType: ${wsEvent.eventType} wsMsgJson.threadId: ${wsEvent.threadId}`);

    //     console.log(`Received this WebSocket message on ${appsettings.webPubSubHubName}: ${JSON.stringify(wsEvent)} at ${Date.now}`);

    //     // If this is not the EngagementHubTab app that published the event, then update this
    //     // apps context, otherwise the apps context is already up to date    
    //     if (wsEvent.threadId !== pubSubContext.threadId) {
    //       var escalations = await getEscalations();


    //       // Update the application context to reflect new state
    //       pubSubContext.appContextUpdate(escalations);

    //       if (messageEvent.data.indexOf("error") > 0) {
    //         console.log(`error: ${messageEvent.data.error}`);
    //       }
    //     }
    //   });

    return () => {
      // Run on unmount
    }
  }, []);

  return (
    <EngagementHubContext.Provider value={{ pubSubContextUpdateCallback: pubSubContextUpdate, activeEscalations, threadId, setThreadId, acsConversationContext, setACSConversationContext, setActiveEscalations }}>
      <TeamsFxContext.Provider value={{ theme, themeString, teamsfx }}>
        <Provider theme={theme || teamsTheme} styles={{ backgroundColor: "#eeeeee" }}>
          <Router>
            <Route exact path="/">
              <Redirect to="/tab" />
            </Route>
            {loading ? (
              <Loader style={{ margin: 100 }} />
            ) : (
              <>
                <Route exact path="/privacy" component={Privacy} />
                <Route exact path="/termsofuse" component={TermsOfUse} />
                <Route exact path="/tab" component={Tab} />
                <Route exact path="/config" component={TabConfig} />
              </>
            )}
          </Router>
        </Provider>
      </TeamsFxContext.Provider>
    </EngagementHubContext.Provider>
  );
}
