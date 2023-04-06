using EngagementHub.Models;
using Azure;
using Azure.Communication;
using Azure.Communication.Chat;
using Azure.Communication.Identity;
//using Azure.Messaging.WebPubSub;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Threading.Tasks;
using ACSAgentHub.Utils;
using System.Numerics;

namespace EngagementHub.Utils
{
    /// <summary>
    /// Summary description for ACSHelper
    /// </summary>
    public class ACSHelper
    {
        const string AGENT_SERVICE_DISPLAY_NAME = "Agent Service";
        const string WAIT_FOR_AGENT_PROMPT = "Please wait, an agent will be with you shortly";

        async public static Task<ACSConversationContext> StartConversation(IConfiguration config)
        {
            var endUserAndToken = await ACSHelper.GetACSEndUserAccessToken(config);
            var agentUserAndToken = await ACSHelper.GetACSAgentUserAndAccessToken(config);

            ChatClient endUserChatClient = new ChatClient(new Uri(ACSHelper.ExtractEndpoint(config["acsConnectionString"])), new CommunicationTokenCredential(endUserAndToken.token));
            ChatClient agentUserChatClient = new ChatClient(new Uri(ACSHelper.ExtractEndpoint(config["acsConnectionString"])), new CommunicationTokenCredential(agentUserAndToken.token));

            var endUser = new ChatParticipant(endUserAndToken.user)
            {
                //DisplayName = context.handoffContext.Name
                DisplayName = "You"
            };

            var agentUser = new ChatParticipant(agentUserAndToken.user)
            {
                //DisplayName = context.handoffContext.Name
                DisplayName = AGENT_SERVICE_DISPLAY_NAME
            };

            // Create the thread that the user and agent will use to chat.  Apparently, through trial and error
            // I learned that you have to add both user and agent service accounts to thread when created or you
            // won't have permission to add agent later when request is accepted
            CreateChatThreadResult createEndUserChatThreadResult = await endUserChatClient.CreateChatThreadAsync(topic: $"Conversation with {endUser.DisplayName}", participants: new[] { endUser, agentUser });
            // Create an agent chat client and thread client so we can write a "be right with you" message to thread
            // using the agent's identity
            ChatClient agentChatClient = new ChatClient(new Uri(ACSHelper.ExtractEndpoint(config["acsConnectionString"])), new CommunicationTokenCredential(agentUserAndToken.token));
            ChatThreadClient chatThreadClient = agentChatClient.GetChatThreadClient(threadId: createEndUserChatThreadResult.ChatThread.Id);

            var messageId = await chatThreadClient.SendMessageAsync(WAIT_FOR_AGENT_PROMPT, ChatMessageType.Text, AGENT_SERVICE_DISPLAY_NAME);

            return new ACSConversationContext
            {
                acsUserDisplayName = string.IsNullOrWhiteSpace(endUser.DisplayName) ? "You" : endUser.DisplayName,
                acsEndpointUrl = ExtractEndpoint(config["acsConnectionString"]),
                acsThreadId = createEndUserChatThreadResult.ChatThread.Id,
                acsUserAccessToken = endUserAndToken.token,
                acsUserId = endUserAndToken.user.Id,
                acsAgentAccessToken = agentUserAndToken.token,
                acsAgentId = agentUserAndToken.user.Id,
            };
        }

        async public static Task<ACSConversationContext> AcceptChatRequest(IConfiguration config, Escalation escalation)
        {
            var agentUserAndToken = await ACSHelper.GetACSAgentUserAndAccessToken(config);
            ChatClient agentChatClient = new ChatClient(new Uri(ACSHelper.ExtractEndpoint(config["acsConnectionString"])), new CommunicationTokenCredential(agentUserAndToken.token));
            ChatThreadClient chatThreadClient = agentChatClient.GetChatThreadClient(threadId: escalation.ThreadId);
            StorageHelper storageHelper = new StorageHelper(config["agentHubStorageConnectionString"]);

            var agentUser = new ChatParticipant(agentUserAndToken.user)
            {
                DisplayName = escalation.AgentName
            };

            await chatThreadClient.AddParticipantAsync(agentUser);

            //var messageId = await chatThreadClient.SendMessageAsync($"Hi, I'm {escalation.AgentName}, how can I help??", ChatMessageType.Text, escalation.AgentName);

            await storageHelper.UpdateEscalation(escalation.ThreadId, escalation.AgentId, escalation.AgentName, EscalationStatus.Accepted, escalation.Disposition);

            return new ACSConversationContext() { acsAgentAccessToken = agentUserAndToken.token, acsEndpointUrl = ExtractEndpoint(config["acsConnectionString"]), acsAgentId = agentUserAndToken.user.Id };
        }

        async public static Task EndChatRequest(IConfiguration config, Escalation escalation)
        {
            var agentUserAndToken = await ACSHelper.GetACSAgentUserAndAccessToken(config);
            ChatClient agentChatClient = new ChatClient(new Uri(ACSHelper.ExtractEndpoint(config["acsConnectionString"])), new CommunicationTokenCredential(agentUserAndToken.token));
            StorageHelper storageHelper = new StorageHelper(config["agentHubStorageConnectionString"]);

            // Delete the ACS chat thread associated with this threadID
            await agentChatClient.DeleteChatThreadAsync(escalation.ThreadId);
            // Delete the escalation record in the Azure Storage Table
            await storageHelper.DeleteEscalationRecord(escalation.ThreadId);
        }

        #region Identity Methods
        /// <summary>
        /// Creates an ACS User to represent the end user in ACS conversations
        /// </summary>
        /// <param name="config"></param>
        /// <returns></returns>
        /// <remarks>
        /// Note: Creating an ACS user from an id is not as secure as creating an ACS user from a managed identity.
        /// Anyone with ACS access key, endpoint and user id can get access to the conversation threads.
        /// 
        /// If the ACS user has not been created yet or it was deleted from Azure Storage, a new ACS user will be created and
        /// the Id for that generated user will be saved to Azure Storage.  Think of this ACS user as a "service" user which
        /// we'll use in all ACS chat operations where the end user is speaking rather than have a separate user for each 
        /// end user. The actual name associated with the end user is provided separately which allows us to use this one user
        /// account for all end users and assign the name later when we use it.
        /// 
        /// To fully participate in a thread the application only needs to know:
        /// - Endpoint of ACS Service
        /// - ACS access key (needed to create an access token)
        /// - User Id of a valid and previously created ACS User
        /// - Access token (generated using endpoint, access key, and user Id) 
        /// 
        /// </remarks>
        internal static async Task<(CommunicationUserIdentifier user, string token)> GetACSEndUserAccessToken(IConfiguration config)
        {
            StorageHelper storageHelper = new StorageHelper(config["agentHubStorageConnectionString"]);

            // Get agent user, if one exists
            string endUserId = await storageHelper.GetEndUserId();

            // Creates agent user from saved agentUserId or creates new service user if agentUserId is null
            var userAndAccessToken = await ACSHelper.GetUserAndAccessToken(config["acsConnectionString"], endUserId);

            // If agentUserId has not been saved yet (i.e. GetUserAndAccessToken just created it) then save it
            if (endUserId == null)
            {
                // Save the newly created end user Id
                await storageHelper.SaveEndUser(userAndAccessToken.user.Id);
            }

            return userAndAccessToken;
        }

        /// <summary>
        /// Creates an ACS User to represent the agent in ACS conversations
        /// </summary>
        /// <param name="config"></param>
        /// <returns></returns>
        /// <remarks>
        /// Note: Creating an ACS user from an id is not as secure as creating an ACS user from a managed identity.
        /// Anyone with ACS access key, endpoint and user id can get access to the conversation threads.
        /// 
        /// If the ACS user has not been created yet or it was deleted from Azure Storage, a new ACS user will be created and
        /// the Id for that generated user will be saved to Azure Storage.  Think of this ACS user as a "service" user which
        /// we'll use in all ACS chat operations where the agent is speaking rather than have a separate user for each agent. The
        /// actual name associated with the agent is provided separately which allows us to use this one user account for all
        /// agents and assign the name later when we use it.
        /// 
        /// To fully participate in a thread the application only needs to know:
        /// - Endpoint of ACS Service
        /// - ACS access key (needed to create an access token)
        /// - User Id of a valid and previously created ACS User
        /// - Access token (generated using endpoint, access key, and user Id) 
        /// 
        /// </remarks>
        public static async Task<(CommunicationUserIdentifier user, string token)> GetACSAgentUserAndAccessToken(IConfiguration config)
        {
            StorageHelper storageHelper = new StorageHelper(config["agentHubStorageConnectionString"]);

            // Get agent user, if one exists
            string agentUserId = await storageHelper.GetAgentUserId();

            // Creates agent user from saved agentUserId or creates new service user if agentUserId is null
            var userAndAccessToken = await ACSHelper.GetUserAndAccessToken(config["acsConnectionString"], agentUserId);

            // If agentUserId has not been saved yet (i.e. GetUserAndAccessToken just created it) then save it
            if (agentUserId == null)
            {
                // Save the newly created agent user Id
                await storageHelper.SaveAgentUser(userAndAccessToken.user.Id);
            }

            return userAndAccessToken;
        }

        /// <summary>
        /// Get the ACS user that the service created
        /// </summary>
        /// <param name="acsConnectionString">The ACS connection string from Azure portal</param>
        /// <param name="serviceUserId">The ACS user id.  If id is null, a new ACS user will be created and returned</param>
        /// <returns>Returns the ACS user and a ACS user access token</returns>
        public static async Task<(CommunicationUserIdentifier user, string token)> GetUserAndAccessToken(string acsConnectionString, string serviceUserId)
        {

            CommunicationIdentityClient identityClient = new CommunicationIdentityClient(new Uri(ACSHelper.ExtractEndpoint(acsConnectionString)), new AzureKeyCredential(ACSHelper.ExtractAccessKey(acsConnectionString)));
            CommunicationUserIdentifier serviceUser;
            Azure.Core.AccessToken tokenResponse;

            // If service user does not exist, then create one
            if (serviceUserId == null)
            {
                // Create service user
                serviceUser = identityClient.CreateUser();

                Console.WriteLine($"\nCreated new service user: {serviceUser.Id}");
            }
            else
            {
                Console.WriteLine($"\nRestored service user: {serviceUserId}");

                // Create service user based on id passed in
                serviceUser = new CommunicationUserIdentifier(serviceUserId);
            }

            // Get user access token with the "chat" scope for an identity
            tokenResponse = await identityClient.GetTokenAsync(serviceUser, scopes: new[] { CommunicationTokenScope.Chat });

            return (serviceUser, tokenResponse.Token);
        }

        #endregion

        #region UtilityMethods

        static public string ExtractAccessKey(string acsConnectionString)
        {
            return acsConnectionString.Substring(acsConnectionString.ToLower().IndexOf("accesskey=") + 10);
        }

        static public string ExtractEndpoint(string connectionString)
        {
            return connectionString.Replace("endpoint=", "").Split(';')[0];
        }

        #endregion

        #region Web PubSub methods

        async public static Task PublishRefreshEvent(IConfiguration config, string threadId = null)
        {
            // ToDo: When you figure out how to get WebPuSub working in a Teams Tab app then uncomment this code
            // Create a Web PubSub client so that we can notify agent-hub clients to refresh conversations
            //var serviceClient = new WebPubSubServiceClient(config["webPusSubConnectionString"], config["webPubSubHubName"]);

            // Broadcast "refresh event" (note: currently, agent-hub clients don't use the string "refresh"
            // but its a required argument so we have to pass something.  Agent-hubs subscribe to
            // _config["hub"] messages and merely receiving a message is the signal to refresh conversations
            dynamic obj = new JObject();
            obj.eventType = "refresh";
            obj.threadId = threadId;
            string refreshEvent = JsonConvert.SerializeObject(obj);

            // ToDo: When you figure out how to get WebPuSub working in a Teams Tab app then uncomment this code
            //await serviceClient.SendToAllAsync(refreshEvent);

            Console.WriteLine($"Published a Web PubSub 'Refresh' event {refreshEvent} at: {DateTime.Now}");
        }

        #endregion

    }
}