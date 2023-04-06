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
using ACSAgentHub.Utils;
using System.Collections.Generic;
using EngagementHub.Models;

namespace EngagementHub.APIs
{
    public class GetEscalations
    {
        IConfiguration _config;
        public GetEscalations(IConfiguration config)
        {
            _config = config;
        }

        [FunctionName("GetEscalations")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "escalations")]
            HttpRequest req,
            ILogger log)
        {
            IActionResult result = null;

            try
            {
                StorageHelper storageHelper = new StorageHelper(_config["agentHubStorageConnectionString"]);

                List<Escalation> escalations = await storageHelper.GetEscalations();

                return new OkObjectResult(escalations);
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
