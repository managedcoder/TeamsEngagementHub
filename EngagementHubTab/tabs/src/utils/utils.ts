import { appsettings } from '../settings/appsettings';

/**
 * Gets the base address of the Engagement Hub
 */
export function getEngagementHubBaseAddress(service: string): string {
    var isSlashNeeded = appsettings.engagementHubBaseAddress.length > 0 && appsettings.engagementHubBaseAddress[appsettings.engagementHubBaseAddress.length - 1] !== '/';
    var fullServiceUrl = null;

    if (isSlashNeeded) {
        fullServiceUrl = appsettings.engagementHubBaseAddress + "/" + service;
    }
    else {
        fullServiceUrl = appsettings.engagementHubBaseAddress + service;
    }

    return fullServiceUrl;
}

export function parseHandoffContext(handoffContext: string) {
    // Remove the leading and trailing " character that PVA added
    let handoffString = handoffContext.slice(1, handoffContext.length - 1);
    // Clean up PVA quoting of the " character
    handoffString = handoffString.replaceAll('\\"', '"');
    // Clean up excessive quoting
    handoffString = handoffString.replaceAll('\\\\', '\\');
    // if all the above clean up is not done then parse will fail
    return JSON.parse(handoffString);

}