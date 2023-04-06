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