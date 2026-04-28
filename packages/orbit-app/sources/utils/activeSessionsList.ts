import type { Machine, Session } from '@/sync/storageTypes';
import { formatPathRelativeToHome } from '@/utils/sessionUtils';

export interface ActiveSessionMachineGroup {
    machine: Machine | null;
    machineId: string;
    machineName: string;
    sessions: Session[];
    containsSelectedSession: boolean;
    latestUpdatedAt: number;
}

export interface ActiveSessionProjectGroup {
    path: string;
    displayPath: string;
    machines: ActiveSessionMachineGroup[];
    containsSelectedSession: boolean;
    latestUpdatedAt: number;
}

export function buildActiveSessionProjectGroups(
    sessions: Session[],
    machinesMap: Record<string, Machine>,
    selectedSessionId?: string,
): ActiveSessionProjectGroup[] {
    const groups = new Map<string, {
        path: string;
        displayPath: string;
        latestUpdatedAt: number;
        containsSelectedSession: boolean;
        machines: Map<string, ActiveSessionMachineGroup>;
    }>();

    for (const session of sessions) {
        const projectPath = session.metadata?.path || '';
        const machineId = session.metadata?.machineId || 'unknown';
        const machine = machineId !== 'unknown' ? machinesMap[machineId] ?? null : null;
        const machineName = machine?.metadata?.displayName
            || machine?.metadata?.host
            || (machineId !== 'unknown' ? machineId : '<unknown>');
        const isSelected = session.id === selectedSessionId;

        let projectGroup = groups.get(projectPath);
        if (!projectGroup) {
            projectGroup = {
                path: projectPath,
                displayPath: formatPathRelativeToHome(projectPath, session.metadata?.homeDir),
                latestUpdatedAt: session.updatedAt,
                containsSelectedSession: isSelected,
                machines: new Map(),
            };
            groups.set(projectPath, projectGroup);
        } else {
            projectGroup.latestUpdatedAt = Math.max(projectGroup.latestUpdatedAt, session.updatedAt);
            projectGroup.containsSelectedSession ||= isSelected;
        }

        let machineGroup = projectGroup.machines.get(machineId);
        if (!machineGroup) {
            machineGroup = {
                machine,
                machineId,
                machineName,
                sessions: [],
                containsSelectedSession: isSelected,
                latestUpdatedAt: session.updatedAt,
            };
            projectGroup.machines.set(machineId, machineGroup);
        } else {
            machineGroup.latestUpdatedAt = Math.max(machineGroup.latestUpdatedAt, session.updatedAt);
            machineGroup.containsSelectedSession ||= isSelected;
        }

        machineGroup.sessions.push(session);
    }

    const projectGroups = Array.from(groups.values()).map((projectGroup) => ({
        path: projectGroup.path,
        displayPath: projectGroup.displayPath,
        containsSelectedSession: projectGroup.containsSelectedSession,
        latestUpdatedAt: projectGroup.latestUpdatedAt,
        machines: Array.from(projectGroup.machines.values())
            .map((machineGroup) => ({
                ...machineGroup,
                sessions: [...machineGroup.sessions].sort((left, right) => {
                    const selectedDelta = sessionSelectedWeight(right, selectedSessionId) - sessionSelectedWeight(left, selectedSessionId);
                    if (selectedDelta !== 0) {
                        return selectedDelta;
                    }

                    return right.updatedAt - left.updatedAt;
                }),
            }))
            .sort((left, right) => {
                if (left.containsSelectedSession !== right.containsSelectedSession) {
                    return left.containsSelectedSession ? -1 : 1;
                }

                if (left.latestUpdatedAt !== right.latestUpdatedAt) {
                    return right.latestUpdatedAt - left.latestUpdatedAt;
                }

                return left.machineName.localeCompare(right.machineName);
            }),
    }));

    return projectGroups.sort((left, right) => {
        if (left.containsSelectedSession !== right.containsSelectedSession) {
            return left.containsSelectedSession ? -1 : 1;
        }

        if (left.latestUpdatedAt !== right.latestUpdatedAt) {
            return right.latestUpdatedAt - left.latestUpdatedAt;
        }

        return left.displayPath.localeCompare(right.displayPath);
    });
}

function sessionSelectedWeight(session: Session, selectedSessionId?: string): number {
    return session.id === selectedSessionId ? 1 : 0;
}
