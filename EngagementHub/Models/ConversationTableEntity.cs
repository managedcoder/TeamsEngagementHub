using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Text;
using Microsoft.Azure.Cosmos.Table;
using Microsoft.WindowsAzure.Storage.Blob.Protocol;

namespace EngagementHub.Models
{
    /// <summary>
    /// Conversation table entity
    /// </summary>
    /// <remarks>
    /// The purpose of this class is to define the persistance model for an Azure Storage Table entity
    /// given the fact that Azure Storage Tables only support basic data types (strings, int, bool, etc.).
    /// 
    /// The idea is to provide support for the converstion to and from a fully typed object via the
    /// constructor and the ToObject() methods.  This allows the entity object to be express in basic
    /// data types but then be converted to and from a fully type object to program against. 
    /// </remarks>
    public class EscalationTableEntity : TableEntity
    {
        public static string ESCALATION_TABLE_NAME = "Escalation";
        public static string ESCALATION_PARTITION_KEY = "EscalationPartition";

        public EscalationTableEntity() { }

        // Need parameterless constructor for Table SDK deserialization to work when retrieving entities from table
        public EscalationTableEntity(Escalation escalation)
        {
            // Initialize values from conversation
            Update(escalation);
        }

        /// <summary>
        /// The thread Id of the ACS ChatThread
        /// </summary>
        /// <remarks>
        /// This property is the RowKey value of the TableEntity
        /// </remarks>
        public string ThreadId { get { return RowKey; } set { RowKey = value; } }

        public string HandoffContext { get; set; }

        public int Status { get; set; }

        public string AgentId { get; set; }

        public string AgentName { get; set; }

        public int Disposition { get; set; }

        public string DateCreated { get; set; }

        public Escalation ToObject() { return new Escalation(this); }

        public void Update(Escalation escalation)
        {
            PartitionKey = ESCALATION_PARTITION_KEY;
            ThreadId = escalation.ThreadId;
            HandoffContext = JsonConvert.SerializeObject(escalation.HandoffContext);
            Status = (int)escalation.Status;
            AgentId = escalation.AgentId;
            AgentName = escalation.AgentName;
            Disposition = (int)escalation.Disposition;
            DateCreated = escalation.DateCreated;
        }
    }

}
