using System;
using System.Collections.Generic;
using System.Text;

namespace EngagementHub.Models
{
    public class ACSConversationContext
    {
        public ACSConversationContext() { }

        public ACSConversationContext(dynamic ctx)
        {
            acsUserId = ctx.acsUserId;
            acsAgentId = ctx.acsAgentId;
            acsUserAccessToken = ctx.acsUserAccessToken;
            acsAgentAccessToken = ctx.acsAgentAccessToken;
            acsUserDisplayName = ctx.acsUserDisplayName;
            acsAgentDisplayName = ctx.acsAgentDisplayName;
            acsEndpointUrl = ctx.acsEndpointUrl;
            acsThreadId = ctx.acsThreadId;
        }

        public string acsUserId { get; set; }
        public string acsAgentId { get; set; }
        public string acsUserAccessToken { get; set; }
        public string acsAgentAccessToken { get; set; }
        public string acsUserDisplayName { get; set; }
        public string acsAgentDisplayName { get; set; }
        public string acsEndpointUrl { get; set; }
        public string acsThreadId { get; set; }
    }
}
