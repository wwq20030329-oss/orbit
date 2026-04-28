export function shouldReportSessionStartToDaemon(options: {
    startedBy?: 'daemon' | 'terminal';
    startingMode?: 'local' | 'remote';
}): boolean {
    if (options.startedBy !== 'daemon') {
        return false;
    }

    if (options.startingMode === 'local') {
        return false;
    }

    return true;
}
