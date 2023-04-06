using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Text;

namespace EngagementHub.Models
{
    public class Escalation
    {
        public Escalation() { }

        public Escalation(EscalationTableEntity escalationTableEntity)
        {
            ThreadId = escalationTableEntity.ThreadId;
            HandoffContext = escalationTableEntity.HandoffContext;
            Status = (EscalationStatus)escalationTableEntity.Status;
            AgentId = escalationTableEntity.AgentId;
            AgentName = escalationTableEntity.AgentName;
            Disposition = (Disposition)escalationTableEntity.Disposition;
            DateCreated = escalationTableEntity.DateCreated;
        }

        /// <summary>
        /// The thread Id of the ACS ChatThread
        /// </summary>
        public string ThreadId { get; set; }

        public string HandoffContext { get; set; }

        public EscalationStatus Status { get; set; }

        public string AgentId { get; set; }

        public string AgentName { get; set; }

        public Disposition Disposition { get; set; }

        public string DateCreated { get; set; }
    }

}
