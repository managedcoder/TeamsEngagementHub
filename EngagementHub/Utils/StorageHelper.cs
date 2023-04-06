using EngagementHub.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos.Table;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace ACSAgentHub.Utils
{
    public class StorageHelper
    {
        string _connectionString;
        CloudStorageAccount _storageAccount;
        CloudTableClient _tableClient;

        public StorageHelper(string connectionString)
        {
            _connectionString = connectionString;
            _storageAccount = CloudStorageAccount.Parse(connectionString);
            _tableClient = _storageAccount.CreateCloudTableClient();
        }

        #region General Methods
        public async Task<CloudTable> GetTable(string tableName)
        {
            CloudTable table = _tableClient.GetTableReference(tableName);

            if (await table.CreateIfNotExistsAsync())
            {
                Console.WriteLine("Created Table named: {0}", tableName);
            }
            else
            {
                Console.WriteLine("Table {0} already exists", tableName);
            }

            Console.WriteLine();
            return table;
        }

        #endregion

        #region Service User Methods

        public async Task<ACSAgentUser> SaveAgentUser(string id)
        {
            if (id == null)
            {
                throw new ArgumentNullException("id");
            }

            CloudTable serviceUserTable = await GetTable(ACSAgentUser.AGENT_USER_TABLE_NAME);

            // Save the new service user to table storage
            TableOperation insertOrMergeOperation = TableOperation.InsertOrMerge(new ACSAgentUser(id));

            // Execute the operation.
            TableResult result = await serviceUserTable.ExecuteAsync(insertOrMergeOperation);

            return result.Result as ACSAgentUser;
        }

        public async Task<ACSEndUser> SaveEndUser(string id)
        {
            if (id == null)
            {
                throw new ArgumentNullException("id");
            }

            CloudTable endUserTable = await GetTable(ACSEndUser.END_USER_TABLE_NAME);

            // Save the new service user to table storage
            TableOperation insertOrMergeOperation = TableOperation.InsertOrMerge(new ACSEndUser(id));

            // Execute the operation.
            TableResult result = await endUserTable.ExecuteAsync(insertOrMergeOperation);

            return result.Result as ACSEndUser;
        }

        public async Task<string> GetAgentUserId()
        {
            CloudTable serviceUserTable = await GetTable(ACSAgentUser.AGENT_USER_TABLE_NAME);

            TableOperation retrieveOperation = TableOperation.Retrieve<ACSAgentUser>(ACSAgentUser.AGENT_USER_PARTITION_KEY, ACSAgentUser.AGENT_USER_ROW_KEY);
            TableResult result = await serviceUserTable.ExecuteAsync(retrieveOperation);
            ACSAgentUser serviceUser = result.Result as ACSAgentUser;

            return serviceUser?.ACS_Id;
        }

        public async Task<string> GetEndUserId()
        {
            CloudTable endUserTable = await GetTable(ACSEndUser.END_USER_TABLE_NAME);

            TableOperation retrieveOperation = TableOperation.Retrieve<ACSEndUser>(ACSEndUser.END_USER_PARTITION_KEY, ACSEndUser.END_USER_ROW_KEY);
            TableResult result = await endUserTable.ExecuteAsync(retrieveOperation);
            ACSEndUser botUser = result.Result as ACSEndUser;

            return botUser?.ACS_Id;
        }


        #endregion

        #region Conversation Methods

        public async Task<EscalationTableEntity> AddToEscalations(Escalation escalation)
        {
            CloudTable escalationTable = await GetTable(EscalationTableEntity.ESCALATION_TABLE_NAME);

            // Add the conversation to the table storage
            TableOperation insertOrMergeOperation = TableOperation.InsertOrMerge(new EscalationTableEntity(escalation));

            // Execute the operation.
            TableResult result = await escalationTable.ExecuteAsync(insertOrMergeOperation);

            return result.Result as EscalationTableEntity;
        }

        async public Task<List<Escalation>> GetEscalations()
        {
            CloudTable escalationTable = await GetTable(EscalationTableEntity.ESCALATION_TABLE_NAME);
            TableContinuationToken continuationToken = null;
            List<EscalationTableEntity> escalationTableEntities = new List<EscalationTableEntity>();
            List<Escalation> escalations = new List<Escalation>();

            // Get all agent conversations 
            do
            {
                var queryResult = await escalationTable.ExecuteQuerySegmentedAsync(new TableQuery<EscalationTableEntity>(), continuationToken);

                escalationTableEntities.AddRange(queryResult.Results);

                continuationToken = queryResult.ContinuationToken;
            } while (continuationToken != null);

            // Convert from table entity to object
            foreach (EscalationTableEntity escalationTableEntity in escalationTableEntities)
            {
                escalations.Add(new Escalation(escalationTableEntity));
            }

            return escalations.OrderBy(o => o.DateCreated).ToList();
        }


        public async Task<EscalationTableEntity> GetEscalation(string acsThreadId)
        {
            CloudTable escalationTable = await GetTable(EscalationTableEntity.ESCALATION_TABLE_NAME);

            TableOperation retrieveOperation = TableOperation.Retrieve<EscalationTableEntity>(EscalationTableEntity.ESCALATION_PARTITION_KEY, acsThreadId);
            TableResult result = await escalationTable.ExecuteAsync(retrieveOperation);
            EscalationTableEntity escalation = result.Result as EscalationTableEntity;

            return escalation;
        }

        public async Task<EscalationTableEntity> DeleteEscalationRecord(string acsThreadId)
        {
            CloudTable escalationTable = await GetTable(EscalationTableEntity.ESCALATION_TABLE_NAME);
            EscalationTableEntity escalation = await GetEscalation(acsThreadId);

            if (escalation != null)
            {
                TableOperation deleteOperation = TableOperation.Delete(escalation);
                TableResult result = await escalationTable.ExecuteAsync(deleteOperation);
            }

            return escalation;
        }

        public async Task<EscalationTableEntity> UpdateEscalation(string acsThreadId, EscalationStatus status)
        {
            // ToDo: Add error handling in this method
            CloudTable escalationTable = await GetTable(EscalationTableEntity.ESCALATION_TABLE_NAME);

            TableOperation tableOperation = TableOperation.Retrieve<EscalationTableEntity>(EscalationTableEntity.ESCALATION_PARTITION_KEY, acsThreadId);
            TableResult tableResult = await escalationTable.ExecuteAsync(tableOperation);
            EscalationTableEntity escalationEntity = null;

            if (tableResult.HttpStatusCode >= 200 && tableResult.HttpStatusCode <= 299)
            {
                escalationEntity = tableResult.Result as EscalationTableEntity;

                escalationEntity.Status = (int)status;

                tableOperation = TableOperation.Replace(escalationEntity);
                tableResult = await escalationTable.ExecuteAsync(tableOperation);
            }

            return escalationEntity;
        }

        public async Task<EscalationTableEntity> UpdateEscalation(string threadId, string agentId, string agentName, EscalationStatus status, Disposition disposition)
        {
            // ToDo: Add error handling in this method
            CloudTable escalationTable = await GetTable(EscalationTableEntity.ESCALATION_TABLE_NAME);

            TableOperation tableOperation = TableOperation.Retrieve<EscalationTableEntity>(EscalationTableEntity.ESCALATION_PARTITION_KEY, threadId);
            TableResult tableResult = await escalationTable.ExecuteAsync(tableOperation);
            EscalationTableEntity escalationEntity = null;

            if (tableResult.HttpStatusCode >= 200 && tableResult.HttpStatusCode <= 299)
            {
                escalationEntity = tableResult.Result as EscalationTableEntity;

                escalationEntity.AgentId = agentId;
                escalationEntity.AgentName = agentName;
                escalationEntity.Status = (int) status;
                escalationEntity.Disposition = (int) disposition;

                tableOperation = TableOperation.Replace(escalationEntity);
                tableResult = await escalationTable.ExecuteAsync(tableOperation);
            }

            return escalationEntity;
        }

        /// <summary>
        /// Update the conversation identified by conversation.ThreadId using the values of conversation
        /// </summary>
        /// <param name="escalation"></param>
        /// <returns></returns>
        public async Task<IActionResult> UpdateEscalation(Escalation escalation)
        {
            // ToDo: Add error handling in this method
            CloudTable escalationTable = await GetTable(EscalationTableEntity.ESCALATION_TABLE_NAME);

            TableOperation tableOperation = TableOperation.Retrieve<EscalationTableEntity>(EscalationTableEntity.ESCALATION_PARTITION_KEY, escalation.ThreadId);
            TableResult tableResult = await escalationTable.ExecuteAsync(tableOperation);
            EscalationTableEntity escalationEntity = tableResult.Result as EscalationTableEntity;

            escalationEntity.Update(escalation);

            tableOperation = TableOperation.Replace(escalationEntity);
            tableResult = await escalationTable.ExecuteAsync(tableOperation);

            return new ContentResult() { StatusCode = tableResult.HttpStatusCode };
        }

        #endregion

    }
}
