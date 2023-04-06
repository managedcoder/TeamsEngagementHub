using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Extensions.Configuration;
using EngagementHub.Utils;
using EngagementHub.Models;
using ACSAgentHub.Utils;
using Azure.Communication.Chat;
using System.Linq;

namespace EngagementHub.APIs
{
    public class EscalateToAgent
    {
        IConfiguration _config;
        public EscalateToAgent(IConfiguration config)
        {
            _config = config;
        }

        [FunctionName("EscalateToAgent")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = "escalateToAgent")] HttpRequest req,
            ILogger log)
        {
            IActionResult result = null;

            try
            {
                string handoffContext = await new StreamReader(req.Body).ReadToEndAsync();

                // Clean up handoffContext by removing all whitespace 
                //handoffContext = handoffContext.Trim();

                StorageHelper storageHelper = new StorageHelper(_config["agentHubStorageConnectionString"]);
                ACSConversationContext acsConversationContext = new ACSConversationContext();

                // Create a ACS Conversation via a ChatThread
                acsConversationContext = await ACSHelper.StartConversation(_config);

                await storageHelper.AddToEscalations(new Escalation()
                {
                    ThreadId = acsConversationContext.acsThreadId,
                    HandoffContext = JsonConvert.SerializeObject(JsonConvert.DeserializeObject(handoffContext)),
                    Status = EscalationStatus.Queued,
                    Disposition = Disposition.Pending,
                    DateCreated = DateTime.Now.ToString("s"),
                });

                // Force other agent-hub instances to refresh their application context and effectively sync all clients with updated state
                await ACSHelper.PublishRefreshEvent(_config);

                // Return the engagement hub context that now holds the new conversation contexts
                result = new OkObjectResult(acsConversationContext);
            }
            catch (Exception e)
            {
                log.LogError($"HTTP {req.Method} on {req.Path.Value} failed: {e.Message}");

                result = new ContentResult() { Content = $"Unexpected exception occurred in {req.Method} to {req.Path.Value}: {e.Message}", StatusCode = StatusCodes.Status500InternalServerError };
            }

            return result;
        }
    }
}
