/*
** Returns the user ID of the end user
**
** Remarks - There are two personas in this engagement hub solution: agents and end users.
** This method returns the user ID for the end user.  Replace this code with whatever
** approach is appropriate for your end users or leave it as is if your end users are
** anonymous.  Agent users will have their identities provided by Teams via single sign-on
** logic that lives in the EngagementHubTab solution.
*/
export function getEndUserID(): string {
    return 'anonymous'
}