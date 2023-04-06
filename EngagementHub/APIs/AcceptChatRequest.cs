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

namespace EngagementHub.APIs
{
    public class AcceptChatRequest
    {
        IConfiguration _config;
        public AcceptChatRequest(IConfiguration config)
        {
            _config = config;
        }

        /// <summary>
        /// This should be viewed as a test API at the moment.  When we add Job Router to EH I am
        /// not sure this API will be needed since we'll probably be able to get every thing we
        /// need to plug the agent into the chat thread from the context save in the work item and
        /// if so, this API won't be needed.  I used it to prove out that an Agent could join the
        /// user's thread.
        /// </summary>
        /// <param name="req"></param>
        /// <param name="log"></param>
        /// <returns></returns>
        [FunctionName("acceptChatRequest")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            IActionResult result = null;

            try
            {
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                Escalation data = JsonConvert.DeserializeObject<Escalation>(requestBody);

                ACSConversationContext acsConversationContext = await ACSHelper.AcceptChatRequest(_config, data);

                // Force other agent-hub instances to refresh their application context and effectively sync all clients with updated state
                await ACSHelper.PublishRefreshEvent(_config);

                result = new OkObjectResult(acsConversationContext);
            }
            catch (Exception e)
            {
                log.LogError($"HTTP {req.Method} on {req.Path.Value} failed: {e.Message}");

                result = new ContentResult() { Content = $"Unexpected exception occurred in {req.Method} to {req.Path.Value}: {e.Message}", StatusCode = StatusCodes.Status500InternalServerError };
            };

            return result;
        }
    }
}
